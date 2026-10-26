import type { Type } from '@nestjs/common';

/**
 * 扩展包分级。
 *
 * - system：内核已经抽象出来的某类能力的具体实现（模型协议、对象存储、登录渠道）。
 *   删掉只是少一种选择，内核自带的基线实现继续工作。
 * - feature：独立的功能域（计费商业化、内容安全、微信）。
 *   删掉即没有这项功能，内核对应端口退回空实现，主流程不受影响。
 */
export type PackTier = 'system' | 'feature';

export const PACK_TIERS: readonly PackTier[] = ['system', 'feature'];

/** 包向内核注册表 / 端口贡献的内容；装配测试按此核对运行时的注册结果 */
export interface PackContributions {
  /** GlobalConfigRegistry 的配置节名 */
  configSections?: string[];
  /** LoginProviderRegistry 的适配器，形如 `oauth:<provider>` / `captcha:<provider>` / `qr:<provider>` */
  loginProviders?: string[];
  /** ModelStreamRegistry 的协议名 */
  modelProtocols?: string[];
  /** StorageProviderRegistry 的存储名 */
  storageProviders?: string[];
  /** VerticalImportRegistry 的清单节名 */
  verticalSections?: string[];
  /** 包实现的内核端口令牌，如 BILLING_PORT / CONTENT_FILTER_PORT / CHANNEL_BINDING_PORT */
  ports?: string[];
}

/** pack.json 的内容：纯数据，评分脚本、文档与装配测试直接读取 */
export interface PackManifest {
  /** 包 id，必须等于目录名，kebab-case */
  id: string;
  tier: PackTier;
  description: string;
  /** 环境变量开关名；未设置视为启用，取值 false / 0 / off / no 时关闭 */
  flag: string;
  contributes?: PackContributions;
  /**
   * 内核源码里不得出现的标识（provider id、配置键、事件名、组件名等），
   * 评分脚本据此扫描「内核是否认识这个包」。
   */
  identifiers?: string[];
}

/** pack.json 直接导入时 tier 只是 string，由 definePack 在运行时校验 */
export type PackManifestInput = Omit<PackManifest, 'tier'> & { tier: string };

/** pack.ts 的默认导出：元数据加 Nest 模块 */
export interface PackDefinition extends PackManifest {
  module: Type<unknown>;
}

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const FLAG_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function fail(id: string, reason: string): never {
  throw new Error(`扩展包 ${id} 的清单无效：${reason}`);
}

function assertStringArray(id: string, field: string, value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    fail(id, `${field} 必须是字符串数组`);
  }
}

/** 校验清单形状；错误直接抛出，让启动在第一时间失败 */
export function assertPackDefinition(candidate: unknown): PackDefinition {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('扩展包清单无效：默认导出必须是 definePack(...) 的结果');
  }
  const pack = candidate as Record<string, unknown>;
  const id = typeof pack.id === 'string' ? pack.id : String(pack.id);
  if (!ID_PATTERN.test(id)) fail(id, 'id 必须是 kebab-case');
  if (!PACK_TIERS.includes(pack.tier as never)) fail(id, `tier 必须是 ${PACK_TIERS.join(' / ')}`);
  if (typeof pack.description !== 'string' || !pack.description.trim())
    fail(id, '缺少 description');
  if (typeof pack.flag !== 'string' || !FLAG_PATTERN.test(pack.flag)) {
    fail(id, 'flag 必须是大写环境变量名');
  }
  assertStringArray(id, 'identifiers', pack.identifiers);
  if (pack.contributes !== undefined) {
    if (!pack.contributes || typeof pack.contributes !== 'object')
      fail(id, 'contributes 必须是对象');
    for (const [key, value] of Object.entries(pack.contributes as Record<string, unknown>)) {
      assertStringArray(id, `contributes.${key}`, value);
    }
  }
  if (typeof pack.module !== 'function') fail(id, 'module 必须是 Nest 模块类');
  return candidate as PackDefinition;
}

/** 每个包的 pack.ts：`export default definePack(manifest, XxxPackModule)` */
export function definePack(manifest: PackManifestInput, module: Type<unknown>): PackDefinition {
  return assertPackDefinition({ ...manifest, module });
}
