/**
 * 垂直包清单（Vertical Manifest）v1
 *
 * 垂直包住在基座仓库之外，只通过四个接触面接入：MCP 服务器、沙箱镜像与技能、配置导入、
 * 工具调用里透传的用户身份。本文件是清单的公开合同；后端用
 * `node dist/main vertical:import <manifest.json> [--dry-run]` 导入。
 *
 * 清单里的相对路径（如 sandbox.skills）都相对清单文件所在目录解析。
 */
export const VERTICAL_MANIFEST_VERSION = 1;
export type VerticalManifestVersion = typeof VERTICAL_MANIFEST_VERSION;

/** 站点级配置：写入内核的全局配置表（config） */
export interface VerticalManifestSite {
  siteName?: string;
  siteDescription?: string;
  /** 全局头部提示词（systemPreMessage） */
  systemPrompt?: string;
  /** 其它全局配置键值；键只允许字母、数字、下划线 */
  configs?: Record<string, string | number | boolean>;
}

/** 与 MCP_SERVERS_JSON 里的单个服务器同形；按 name 合并进全局配置 mcpServers */
export interface VerticalManifestMcpServer {
  name: string;
  transport?: 'http' | 'stdio';
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  tools?: { allow?: string[]; deny?: string[] };
  /** 是否在 _meta["99agent/caller"] 透传用户身份，默认 true */
  passIdentity?: boolean;
  /** 身份签名密钥；垂直包服务端用同一密钥校验 */
  identitySecret?: string;
  timeoutMs?: number;
  toolsCacheTtlMs?: number;
  description?: string;
  enabled?: boolean;
}

export interface VerticalManifestSandbox {
  /** 基于 99agent/sandbox 构建的镜像标签；导入命令只提示设置 SANDBOX_IMAGE，不改环境变量 */
  image?: string;
  /** 技能目录（相对清单文件），每个目录含 SKILL.md；导入后复制到 SANDBOX_SITE_SKILLS_DIR，首次进入沙箱时种入用户工作区 */
  skills?: string[];
}

/** 商业包的套餐预设（extensions.packages）；商业包关闭时导入命令只提示，不写入 */
export interface VerticalPackagePreset {
  planKey: string;
  planName: string;
  planType?: 'membership' | 'credit_pack';
  variantName: string;
  billingCycle?: 'day' | 'week' | 'month' | 'year' | 'one_time';
  billingCycleCount?: number;
  price: number;
  priceUsd?: number;
  credits: number;
  days?: number;
  name?: string;
  des?: string;
  planDescription?: string;
  featureText?: string;
  badgeText?: string;
  weight?: number;
  order?: number;
  status?: number;
  isDefaultVariant?: number;
}

/** 扩展包专属段：键是段名，由装载的扩展包在 VerticalImportRegistry 注册处理器 */
export interface VerticalManifestExtensions {
  packages?: VerticalPackagePreset[];
  [section: string]: unknown;
}

export interface VerticalManifestV1 {
  manifestVersion: VerticalManifestVersion;
  /** 小写字母 / 数字 / 短横线，2-64 位 */
  name: string;
  displayName?: string;
  version?: string;
  description?: string;
  site?: VerticalManifestSite;
  mcpServers?: VerticalManifestMcpServer[];
  sandbox?: VerticalManifestSandbox;
  extensions?: VerticalManifestExtensions;
}
