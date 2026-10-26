/** 登录方式标识由各登录渠道包自行定义，内核只当作字符串 */
export type AuthProvider = string;

export type AuthIdentityScene = 'oauth' | 'qr' | 'bind' | 'password' | 'captcha';

export const AUTH_IDENTITY_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
  UNBOUND: 'unbound',
} as const;

export type AuthIdentityStatus = (typeof AUTH_IDENTITY_STATUS)[keyof typeof AUTH_IDENTITY_STATUS];

export type AuthContactField = 'email' | 'phone';

export interface NormalizedAuthIdentity {
  provider: AuthProvider;
  providerUserId: string;
  scene?: AuthIdentityScene;
  /** 跨渠道关联键（由渠道包定义，如同一生态内的联合 ID）；相同关联键的身份视为同一个人 */
  linkKey?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  phone?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  rawProfile?: Record<string, any> | null;
  extra?: Record<string, any> | null;
  /** 验证码类身份：联系方式同步到 users 表的哪一列 */
  contactField?: AuthContactField;
}
