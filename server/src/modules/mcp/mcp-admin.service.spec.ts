import { HttpException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from '@/common/filters/allExceptions.filter';
import { SaveMcpServersDto } from './dto/mcp-admin.dto';
import { GlobalConfigRegistry } from '../globalConfig/global-config.registry';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { McpAdminService } from './mcp-admin.service';
import { MCP_SERVERS_GLOBAL_CONFIG_KEY } from './mcp-client.service';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;
declare const beforeEach: any;
declare const afterEach: any;

const STORED = JSON.stringify({
  servers: [
    {
      name: 'docs',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer secret-token-123456' },
      identitySecret: 'identity-secret-abcdef',
    },
    {
      name: 'local',
      transport: 'stdio',
      command: '/usr/local/bin/mcp-local',
      env: { API_KEY: 'k' },
    },
  ],
});

function setup(stored: string | null = STORED) {
  const registry = new GlobalConfigRegistry();
  const saved: string[] = [];
  const globalConfigService = {
    // 进程缓存不该再被读：管理端读写都以数据库为准
    getConfigs: jest.fn(async () => {
      throw new Error('should read the database, not the process cache');
    }),
    readStoredValue: jest.fn(async () => stored),
    // 与真实实现同一套语义：修订号不一致 409，build 拿数据库当前值，写前跑注册的校验
    compareAndSetConfig: jest.fn(async (configKey: string, expected: string, build: any) => {
      if (GlobalConfigService.revisionOf(stored) !== expected) {
        throw new HttpException('配置已被其他人修改，请刷新后重试', HttpStatus.CONFLICT);
      }
      const configVal = await build(stored);
      await registry.validate({ configKey, configVal });
      saved.push(configVal);
      stored = configVal;
      return { revision: GlobalConfigService.revisionOf(configVal) };
    }),
    setStored: (value: string | null) => {
      stored = value;
    },
  };
  const mcpClient = {
    resolveServers: jest.fn(),
    listTools: jest.fn(),
  };
  const service = new McpAdminService(globalConfigService as any, mcpClient as any, registry);
  return { service, registry, globalConfigService, mcpClient, saved };
}

const input = (overrides: Record<string, unknown> = {}) => ({
  name: 'docs',
  transport: 'http' as const,
  url: 'https://mcp.example.com/mcp',
  enabled: true,
  passIdentity: true,
  ...overrides,
});

describe('McpAdminService', () => {
  const originalEnv = process.env.MCP_SERVERS_JSON;
  const originalStdio = process.env.MCP_STDIO_ENABLED;
  const originalAllow = process.env.MCP_STDIO_COMMAND_ALLOWLIST;

  beforeEach(() => {
    process.env.MCP_SERVERS_JSON = JSON.stringify({
      servers: [{ name: 'search', url: 'https://search.example.com/mcp' }],
    });
    process.env.MCP_STDIO_ENABLED = 'true';
    process.env.MCP_STDIO_COMMAND_ALLOWLIST = '/usr/local/bin/mcp-local';
  });

  afterEach(() => {
    process.env.MCP_SERVERS_JSON = originalEnv;
    process.env.MCP_STDIO_ENABLED = originalStdio;
    process.env.MCP_STDIO_COMMAND_ALLOWLIST = originalAllow;
  });

  it('registers mcpServers as a secret config key with a validator', async () => {
    const { registry } = setup();
    expect(registry.listSections()).toContain('mcp');
    expect(registry.secretKeys().has(MCP_SERVERS_GLOBAL_CONFIG_KEY)).toBe(true);
    await expect(
      registry.validate({
        configKey: MCP_SERVERS_GLOBAL_CONFIG_KEY,
        configVal: JSON.stringify({ servers: [{ name: 'bad', url: 'http://169.254.169.254/' }] }),
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('lists env servers read-only and config servers with every secret masked', async () => {
    const { service } = setup();
    const view = await service.listServers();

    expect(view.servers.map((server: any) => [server.name, server.source])).toEqual([
      ['search', 'env'],
      ['docs', 'config'],
      ['local', 'config'],
    ]);
    const docs = view.servers.find((server: any) => server.name === 'docs') as any;
    expect(docs.headers.Authorization).toContain('****');
    expect(docs.identitySecret).toContain('****');
    expect(JSON.stringify(view)).not.toContain('secret-token-123456');
    expect(JSON.stringify(view)).not.toContain('identity-secret-abcdef');
    const local = view.servers.find((server: any) => server.name === 'local') as any;
    expect(local.env.API_KEY).toContain('****');
    expect(local.stdioAllowed).toBe(true);
    expect(view.stdio).toEqual({ enabled: true, allowlist: ['/usr/local/bin/mcp-local'] });
  });

  it('keeps masked secrets on save and writes the { servers } format', async () => {
    const { service, saved } = setup();
    const view = await service.listServers();
    const masked = view.servers.find((s: any) => s.name === 'docs') as any;

    await service.saveServers(
      [
        input({
          headers: masked.headers,
          identitySecret: masked.identitySecret,
          description: '文档',
        }),
      ] as any,
      { revision: view.revision },
    );

    const written = JSON.parse(saved[0]);
    expect(written.servers).toHaveLength(1);
    expect(written.servers[0]).toMatchObject({
      name: 'docs',
      headers: { Authorization: 'Bearer secret-token-123456' },
      identitySecret: 'identity-secret-abcdef',
      description: '文档',
    });
  });

  it('clears the identity secret when an empty value is saved', async () => {
    const { service, saved } = setup();
    const { revision } = await service.listServers();
    await service.saveServers([input({ identitySecret: '' })] as any, { revision });
    expect(JSON.parse(saved[0]).servers[0].identitySecret).toBeUndefined();
  });

  it('refuses masked placeholders for secrets that have no stored value', async () => {
    const { service, saved } = setup();
    const { revision } = await service.listServers();
    await expect(
      service.saveServers(
        [input({ name: 'fresh', headers: { Authorization: 'abc****wxyz' } })] as any,
        { revision },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(saved).toEqual([]);
  });

  it('refuses names owned by MCP_SERVERS_JSON, duplicates and invalid servers', async () => {
    const { service } = setup();
    const { revision } = await service.listServers();
    await expect(
      service.saveServers([input({ name: 'search' })] as any, { revision }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.saveServers([input(), input()] as any, { revision }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.saveServers([input({ url: 'http://169.254.169.254/latest' })] as any, { revision }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.saveServers([input({ headers: { Authorization: 42 } })] as any, { revision }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('marks overrides of environment servers and restores the environment one on delete', async () => {
    // 后台把环境变量里的 search 覆盖成停用；删除覆盖后回到环境变量里的（启用）配置
    const stored = JSON.stringify({
      servers: [{ name: 'search', url: 'https://search.example.com/mcp', enabled: false }],
    });
    const { service, saved } = setup(stored);
    expect((await service.listServers()).servers).toEqual([
      expect.objectContaining({
        name: 'search',
        source: 'config',
        enabled: false,
        overridesEnv: true,
      }),
    ]);

    const first = await service.saveServers(
      [
        input({ name: 'search', url: 'https://override.example.com/v2/mcp', enabled: false }),
      ] as any,
      { revision: (await service.listServers()).revision },
    );
    expect(JSON.parse(saved[0]).servers[0]).toMatchObject({
      name: 'search',
      url: 'https://override.example.com/v2/mcp',
      enabled: false,
    });

    // 连续保存：用上一次保存返回的修订号；删掉最后一个也合法
    await service.saveServers([], { revision: first.revision });
    expect(JSON.parse(saved[1]).servers).toEqual([]);
    const restored = (await service.listServers()).servers;
    expect(restored).toEqual([
      expect.objectContaining({ name: 'search', source: 'env', enabled: true }),
    ]);
    expect(restored[0]).not.toHaveProperty('overridesEnv');
  });

  it('does not mark servers that only exist in the admin configuration', async () => {
    const { service } = setup();
    const docs = (await service.listServers()).servers.find((s: any) => s.name === 'docs');
    expect(docs).not.toHaveProperty('overridesEnv');
  });

  it('lists tools of a working server with their model-visible names', async () => {
    const { service, mcpClient } = setup();
    const server = { name: 'docs', tools: { deny: ['drop_*'] } };
    mcpClient.resolveServers.mockResolvedValue({ servers: [server], errors: [] });
    mcpClient.listTools.mockResolvedValue([
      { name: 'search_docs', description: '搜索文档' },
      { name: 'drop_index' },
    ]);

    await expect(service.testServer('docs')).resolves.toEqual({
      ok: true,
      tools: [
        {
          name: 'search_docs',
          description: '搜索文档',
          exposedName: 'mcp__docs__search_docs',
          allowed: true,
        },
        {
          name: 'drop_index',
          description: '',
          exposedName: 'mcp__docs__drop_index',
          allowed: false,
        },
      ],
    });
    expect(mcpClient.listTools).toHaveBeenCalledWith(server, { refresh: true });
  });

  it('reports failures with fixed messages instead of remote errors', async () => {
    const { service, mcpClient } = setup();
    mcpClient.resolveServers.mockRejectedValueOnce(new Error('internal detail'));
    await expect(service.testServer('docs')).resolves.toMatchObject({ ok: false });

    mcpClient.resolveServers.mockResolvedValue({ servers: [], errors: [] });
    await expect(service.testServer('docs')).resolves.toMatchObject({ ok: false });

    mcpClient.resolveServers.mockResolvedValue({ servers: [{ name: 'docs' }], errors: [] });
    mcpClient.listTools.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.8:443 token=abc'));
    const result = await service.testServer('docs');
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED');
  });

  describe('修订号与存储里无法解析的条目', () => {
    it('缺修订号、修订号过期都是 409，且不写入', async () => {
      const { service, saved, globalConfigService } = setup();
      await expect(service.saveServers([input()] as any)).rejects.toMatchObject({ status: 409 });
      const { revision } = await service.listServers();
      // 读取之后别处（另一个管理员、命令行导入）改了配置
      globalConfigService.setStored(JSON.stringify({ servers: [] }));
      await expect(service.saveServers([input()] as any, { revision })).rejects.toMatchObject({
        status: 409,
      });
      expect(saved).toEqual([]);
    });

    it('首次保存：没有配置行时修订号是 none', async () => {
      const { service, saved } = setup(null);
      const view = await service.listServers();
      expect(view.revision).toBe('none');
      await service.saveServers([input({ name: 'fresh' })] as any, { revision: 'none' });
      expect(JSON.parse(saved[0]).servers.map((server: any) => server.name)).toEqual(['fresh']);
    });

    it('存储里有无法解析的条目：列出说明；不确认丢弃就 409，确认后只保存有效的', async () => {
      const broken = JSON.stringify({
        servers: [
          { name: 'docs', url: 'https://mcp.example.com/mcp' },
          { name: 'bad', url: 'http://169.254.169.254/' },
        ],
      });
      const { service, saved } = setup(broken);
      const view = await service.listServers();
      expect(view.storedErrors.length).toBeGreaterThan(0);
      await expect(
        service.saveServers([input()] as any, { revision: view.revision }),
      ).rejects.toMatchObject({ status: 409 });
      await service.saveServers([input()] as any, {
        revision: view.revision,
        discardInvalid: true,
      });
      expect(JSON.parse(saved[0]).servers.map((server: any) => server.name)).toEqual(['docs']);
    });

    it('脱敏密钥按数据库当前值恢复（命令行刚更新过的新密钥），不读进程缓存', async () => {
      const updated = JSON.stringify({
        servers: [
          {
            name: 'docs',
            url: 'https://mcp.example.com/mcp',
            headers: { Authorization: 'Bearer rotated-token-987654' },
          },
        ],
      });
      const { service, saved, globalConfigService } = setup(updated);
      const view = await service.listServers();
      const masked = view.servers.find((s: any) => s.name === 'docs') as any;
      await service.saveServers(
        [input({ headers: masked.headers, description: '只改说明' })] as any,
        {
          revision: view.revision,
        },
      );
      expect(JSON.parse(saved[0]).servers[0].headers).toEqual({
        Authorization: 'Bearer rotated-token-987654',
      });
      expect(globalConfigService.getConfigs).not.toHaveBeenCalled();
    });

    it('登记为专用键：通用配置接口不能写 mcpServers', () => {
      const { registry } = setup();
      expect(registry.dedicatedKeys().has(MCP_SERVERS_GLOBAL_CONFIG_KEY)).toBe(true);
    });
  });

  describe('缺修订号经校验管道与全局过滤器', () => {
    function projectThroughFilter(exception: unknown) {
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({ headersSent: false, writableEnded: false, status }),
          getRequest: () => ({ path: '/api/mcp/servers' }),
        }),
      };
      new AllExceptionsFilter().catch(exception, host as any);
      return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
    }

    it('DTO 允许缺省 revision（不被校验层变成 400），服务层回 409 与中文文案', async () => {
      // 与 main.ts 的全局管道同一设置
      const pipe = new ValidationPipe({ transform: true, whitelist: false });
      const body = await pipe.transform({ servers: [] }, {
        type: 'body',
        metatype: SaveMcpServersDto,
      } as any);
      expect(body.revision).toBeUndefined();
      const { service } = setup();
      const error = await service
        .saveServers(body.servers, { revision: body.revision })
        .catch(e => e);
      expect(projectThroughFilter(error)).toEqual({
        status: 409,
        body: expect.objectContaining({ code: 409, message: '页面已更新，请刷新后重试' }),
      });
    });

    it('revision 类型不对仍由校验层拒绝', async () => {
      const pipe = new ValidationPipe({ transform: true, whitelist: false });
      await expect(
        pipe.transform({ servers: [], revision: 42 }, {
          type: 'body',
          metatype: SaveMcpServersDto,
        } as any),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });
});
