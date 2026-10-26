import type { EntityMetadata } from 'typeorm';
import { discoverPacks, isPackEnabled } from './modules/packs/pack.loader';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

/**
 * 启动布线特征测试：不连数据库、不连 Redis，只把 AppModule 的依赖注入图完整实例化一遍
 * （等价于 NestFactory 启动时的扫描 + 实例化，但不触发 onModuleInit 等生命周期钩子）。
 * 这是 NestJS 启动时最先失败的一环；tsc 与单元测试都覆盖不到。
 *
 * 期望值全部来自各包的 pack.json（contributes），内核不认识任何具体的包：
 * 删掉一个包目录，期望随之收缩；包声明了贡献却没注册、或注册了没声明的东西，这里都会失败。
 * 各扩展包开关在模块装饰器求值时读取，因此每个变体都在 jest.isolateModules 里重新加载整棵模块树。
 */
const noop = async (): Promise<void> => undefined;
const fakeRepository = new Proxy(
  {},
  { get: (_target, key) => (key === 'then' ? undefined : noop) },
);
const fakeDataSource = {
  options: { type: 'mysql' },
  entityMetadatas: [] as EntityMetadata[],
  manager: {},
  isInitialized: false,
  getRepository: () => fakeRepository,
  getTreeRepository: () => fakeRepository,
  destroy: noop,
};
// main.ts 启动前会把 JWT_SECRET 写进 Redis；这里给 AuthModule 的异步工厂一个占位值。
const fakeRedisClient = new Proxy(
  { get: async (key: string) => (key === 'JWT_SECRET' ? 'wiring-test-secret' : null) },
  { get: (target, key) => (key === 'then' ? undefined : ((target as any)[key] ?? noop)) },
);

const KERNEL_SERVICES = [
  'AgentLoopService',
  'PrimitiveToolProvider',
  'ChatService',
  'SandboxService',
  'VerticalImportService',
  'ChannelGatewayService',
  'FileAssetCleanupScheduler',
];

/** 内核端口与没有任何包时的空实现 */
const KERNEL_PORT_FALLBACKS: Record<string, string> = {
  BILLING_PORT: 'NoopBillingService',
  CONTENT_FILTER_PORT: 'PassthroughContentFilter',
  CHANNEL_BINDING_PORT: 'NoChannelBindings',
};
/** 内核自带的基线协议 */
const KERNEL_MODEL_PROTOCOLS = ['openai_chat_completions'];
/** 内核自己登记的配置段（MCP 服务器配置含密钥，需脱敏回显） */
const KERNEL_CONFIG_SECTIONS = ['mcp'];

const allPacks = discoverPacks();
const disableAll: Record<string, string> = {};
for (const pack of allPacks) {
  disableAll[pack.flag] = 'false';
}

const VARIANTS: Array<{ name: string; env: Record<string, string> }> = [
  { name: 'default packs enabled', env: {} },
  { name: 'all packs disabled', env: disableAll },
];

type Compiled = {
  container: any;
  portInstance: (token: string) => any;
  byName: (name: string) => any;
  moduleNames: () => string[];
  entityNames: string[];
};

function loadIsolated(): () => Promise<Compiled> {
  let compile!: () => Promise<Compiled>;
  jest.isolateModules(() => {
    const { ApplicationConfig } = require('@nestjs/core/application-config');
    const { NestContainer } = require('@nestjs/core/injector/container');
    const { Injector } = require('@nestjs/core/injector/injector');
    const { InstanceLoader } = require('@nestjs/core/injector/instance-loader');
    const { NoopGraphInspector } = require('@nestjs/core/inspector/noop-graph-inspector');
    const { MetadataScanner } = require('@nestjs/core/metadata-scanner');
    const { DependenciesScanner } = require('@nestjs/core/scanner');
    const { getDataSourceToken } = require('@nestjs/typeorm');
    const { DataSource } = require('typeorm');
    const { AppModule } = require('./app.module');
    const { resolveDatabaseEntities } = require('./modules/database/database-entities');
    const { assertCurrentSchemaManifest } = require('./modules/database/schema-manifest');

    compile = async () => {
      const applicationConfig = new ApplicationConfig();
      const container = new NestContainer(applicationConfig);
      const scanner = new DependenciesScanner(
        container,
        new MetadataScanner(),
        NoopGraphInspector,
        applicationConfig,
      );
      await scanner.scan(AppModule);
      for (const [token, value] of [
        [getDataSourceToken(), fakeDataSource],
        ['REDIS_CLIENT', fakeRedisClient],
      ] as Array<[unknown, unknown]>) {
        container.replace(token, { useValue: value, isProvider: true });
      }
      const loader = new InstanceLoader(
        container,
        new Injector({ preview: false }),
        NoopGraphInspector,
      );
      await loader.createInstancesOfDependencies(container.getModules());
      scanner.applyApplicationProviders();

      // Check the entities actually registered by AppModule, not just entities found on disk.
      const entities = await resolveDatabaseEntities(AppModule);
      const source = new DataSource({ type: 'mysql', database: 'wiring_metadata', entities });
      await source.buildMetadatas();
      assertCurrentSchemaManifest(source);

      const wrappers = () =>
        [...container.getModules().values()].flatMap((moduleRef: any) => [
          ...moduleRef.providers.values(),
        ]);
      return {
        container,
        portInstance: (token: string) => wrappers().find((w: any) => w.name === token)?.instance,
        byName: (name: string) =>
          wrappers().find((w: any) => w.metatype?.name === name || w.name === name)?.instance,
        moduleNames: () =>
          [...container.getModules().values()].map((moduleRef: any) => moduleRef.metatype?.name),
        entityNames: entities.map((entity: Function) => entity.name),
      };
    };
  });
  return compile;
}

function withEnv<T>(env: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    process.env[key] = env[key];
  }
  return fn().finally(() => {
    for (const key of Object.keys(env)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
}

async function withIsolatedEntityMetadata<T>(fn: () => Promise<T>): Promise<T> {
  // TypeORM stores decorators on globalThis, outside Jest's isolated module cache.
  // Give each AppModule variant its own registry and restore the outer pack discovery state.
  const scope = globalThis as typeof globalThis & { typeormMetadataArgsStorage?: unknown };
  const saved = scope.typeormMetadataArgsStorage;
  delete scope.typeormMetadataArgsStorage;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete scope.typeormMetadataArgsStorage;
    else scope.typeormMetadataArgsStorage = saved;
  }
}

const union = (
  packs: typeof allPacks,
  key: keyof NonNullable<(typeof allPacks)[number]['contributes']>,
) => packs.flatMap(pack => pack.contributes?.[key] ?? []).sort();

jest.setTimeout(180000);

describe('AppModule wiring', () => {
  it('discovers every pack directory and every pack is enabled by default', () => {
    expect(allPacks.length).toBeGreaterThan(0);
    for (const pack of allPacks) expect(isPackEnabled(pack, {})).toBe(true);
  });

  for (const variant of VARIANTS) {
    it(`instantiates the full module graph without external services (${variant.name})`, async () => {
      const enabled = allPacks.filter(pack => isPackEnabled(pack, variant.env));
      const compiled = await withEnv(variant.env, () =>
        withIsolatedEntityMetadata(async () => loadIsolated()()),
      );

      for (const name of KERNEL_SERVICES) {
        expect(compiled.byName(name)).toBeDefined();
      }

      // These consumers include @Optional injections: missing providers must not pass silently.
      for (const [serviceName, consumers] of [
        [
          'ChatLiveSyncService',
          [
            ['ChatService', 'chatLiveSyncService'],
            ['ChatGateway', 'chatLiveSyncService'],
            ['ChatGroupService', 'chatLiveSync'],
            ['ChatTitleService', 'chatLiveSyncService'],
          ],
        ],
        [
          'AgentContextCheckpointStore',
          [
            ['ContextCheckpointCoordinator', 'checkpointStore'],
            ['ChatLogService', 'contextCheckpointStore'],
            ['ChatGroupService', 'contextCheckpointStore'],
          ],
        ],
      ] as Array<[string, Array<[string, string]>]>) {
        const service = compiled.byName(serviceName);
        expect(service).toBeDefined();
        for (const [consumer, property] of consumers) {
          expect(compiled.byName(consumer)?.[property]).toBe(service);
        }
        const providers = [...compiled.container.getModules().values()]
          .flatMap((moduleRef: any) => [...moduleRef.providers.values()])
          .filter((wrapper: any) => wrapper.metatype?.name === serviceName);
        expect(providers).toHaveLength(1);
      }
      for (const entityName of [
        'AgentContextCheckpointEntity',
        'AgentOperationEntity',
        'AgentEffectEntity',
        'AgentContinuationEntity',
      ]) {
        expect(compiled.entityNames.filter(name => name === entityName)).toHaveLength(1);
      }

      // 只有已启用的包模块进入容器
      const moduleNames = compiled.moduleNames();
      for (const pack of allPacks) {
        expect([pack.id, moduleNames.includes(pack.module.name)]).toEqual([
          pack.id,
          enabled.includes(pack),
        ]);
      }

      // 端口：有包实现就不是空实现，没有就退回空实现
      for (const [token, fallback] of Object.entries(KERNEL_PORT_FALLBACKS)) {
        const instance = compiled.portInstance(token);
        expect(instance).toBeDefined();
        const implemented = enabled.some(pack => pack.contributes?.ports?.includes(token));
        expect([token, instance.constructor.name === fallback]).toEqual([token, !implemented]);
      }
      for (const pack of enabled) {
        for (const token of pack.contributes?.ports ?? []) {
          expect(compiled.portInstance(token)).toBeDefined();
        }
      }

      // 注册表：运行时登记的内容必须与各包 pack.json 声明的完全一致
      expect(compiled.byName('GlobalConfigRegistry').listSections().sort()).toEqual(
        [...KERNEL_CONFIG_SECTIONS, ...union(enabled, 'configSections')].sort(),
      );
      expect(
        compiled
          .byName('LoginProviderRegistry')
          .list()
          .map((adapter: any) => `${adapter.kind}:${adapter.provider}`)
          .sort(),
      ).toEqual(union(enabled, 'loginProviders'));
      expect(compiled.byName('ModelStreamRegistry').getProtocols().sort()).toEqual(
        [...KERNEL_MODEL_PROTOCOLS, ...union(enabled, 'modelProtocols')].sort(),
      );
      expect(compiled.byName('StorageProviderRegistry').names().sort()).toEqual(
        union(enabled, 'storageProviders'),
      );
      expect(compiled.byName('VerticalImportRegistry').sections().sort()).toEqual(
        union(enabled, 'verticalSections'),
      );
      compiled.byName('SandboxService')?.onModuleDestroy?.();
    });
  }
});
