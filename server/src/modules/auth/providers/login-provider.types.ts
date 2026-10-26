import type { AuthIdentityScene, NormalizedAuthIdentity } from '../identity/auth-identity.types';

/** 发起授权的来源：内核内置 pc_web / mobile_web，登录渠道包可传自己的来源名（小写字母、数字、下划线） */
export type OAuthSource = string;
export const OAUTH_SOURCE_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

export interface OAuthStatePayload {
  provider: string;
  scene: string;
  source: OAuthSource;
  callbackUrl: string;
  redirectPath: string;
  createdAt: number;
  /** 发起标签页密钥的 SHA-256（小写十六进制）：回调时核对密钥原文，别的浏览器打开回调地址会被拒绝 */
  browserProof: string;
  /** 发起请求所在站点的 origin（取不到为 null）：保存前核对回调地址与它同源 */
  requestOrigin: string | null;
  userId?: number;
}

export interface CreateOAuthUrlInput {
  scene?: string;
  source?: OAuthSource;
  redirectPath?: string;
  /** web 生成的标签页密钥摘要（64 位小写十六进制） */
  browserProof?: string;
}

/** 经 OAuthStateService.normalizeCreateOAuthUrlInput 归一后的入参：scene 与校验过格式的 browserProof 必有 */
export type NormalizedCreateOAuthUrlInput = CreateOAuthUrlInput & {
  scene: string;
  browserProof: string;
  requestOrigin: string | null;
};

/** GET /auth/providers 里的一条登录方式 */
export interface AuthProviderListEntry {
  provider: string;
  displayName: string;
  type: 'captcha' | 'password' | 'qr' | 'oauth';
  scene?: string;
  enabled: boolean;
  /** 账号密码方式：是否开放自助注册 */
  registerEnabled?: boolean;
  /** 验证码方式：联系方式类型，客户端据此选择输入提示与文案 */
  contactField?: 'email' | 'phone';
}

export type LoginProviderKind = 'captcha' | 'oauth' | 'qr';

/** 验证码类登录方式的使用场景：登录（首次自动注册）/ 绑定到当前账号 / 找回密码 */
export type CaptchaScene = 'login' | 'bind' | 'reset';

interface LoginProviderAdapterBase {
  readonly provider: string;
  readonly kind: LoginProviderKind;
  /** 登录方式列表条目（只返回启用的条目；同一 provider 可有多条，如扫码 + 微信内授权） */
  listEntries(): Promise<AuthProviderListEntry[]>;
}

/**
 * 验证码类登录方式（邮箱、手机号……）：包只负责「认得联系方式」和「把验证码发出去」，
 * 验证码的生成、存储、校验、登录 / 绑定 / 找回密码流程都在内核。
 */
export interface CaptchaLoginAdapter extends LoginProviderAdapterBase {
  readonly kind: 'captcha';
  /** 联系方式同步到 users 表的哪一列 */
  readonly contactField: 'email' | 'phone';
  /** 该联系方式是否属于本渠道 */
  matches(contact: string): boolean;
  /** 规范化联系方式（去空白、小写等） */
  normalizeContact(contact: string): string;
  sendCode(contact: string, code: string, scene: CaptchaScene): Promise<void>;
  /** 联系方式 → 规范化身份（providerUserId = 联系方式） */
  toIdentity(contact: string, scene: AuthIdentityScene): NormalizedAuthIdentity;
}

/** OAuth 类登录方式（由登录渠道包实现） */
export interface OAuthLoginAdapter extends LoginProviderAdapterBase {
  readonly kind: 'oauth';
  /** 回调成功后返回 { token, redirectPath } 而不是纯 token（如微信开放平台网站登录） */
  readonly returnsRedirectPath?: boolean;
  createOAuthUrl(input: NormalizedCreateOAuthUrlInput, userId?: number): Promise<unknown>;
  /** 消费 state 之后的额外校验（可选） */
  validateState?(payload: OAuthStatePayload): void;
  fetchIdentityByCode(code: string, scene: 'oauth' | 'bind'): Promise<NormalizedAuthIdentity>;
}

export type QrScene = 'login' | 'bind';

export interface QrSceneCreated {
  sceneId: string;
  /** 二维码图片地址或 data URL */
  qrUrl: string;
  /** 场景有效期（秒） */
  expiresIn: number;
}

export type QrScenePollResult =
  | { status: 'pending' }
  | { status: 'expired' }
  /** 登录场景：userId 为扫码后登录 / 创建的用户；绑定场景：message 为提示语 */
  | { status: 'confirmed'; userId?: number; message?: string }
  | { status: 'failed'; message: string };

/** 扫码类登录方式（公众号扫码……）：包负责生成二维码与处理扫码事件，内核负责签发会话 */
export interface QrLoginAdapter extends LoginProviderAdapterBase {
  readonly kind: 'qr';
  createScene(scene: QrScene, userId?: number): Promise<QrSceneCreated>;
  pollScene(sceneId: string, scene: QrScene, userId?: number): Promise<QrScenePollResult>;
}

export type LoginProviderAdapter = CaptchaLoginAdapter | OAuthLoginAdapter | QrLoginAdapter;
