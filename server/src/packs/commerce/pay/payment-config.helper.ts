/** 单个支付渠道涉及的配置键分组 */
export interface ChannelConfigKeyGroups {
  credentials: string[];
  callbacks: string[];
  extras?: string[];
  /** 按版本才要求、但总要读取的凭据（易支付 v1 的密钥、v2 的密钥对） */
  versionCredentials?: string[];
  optional: string[];
}

export type EpayApiVersion = 'v1' | 'v2';

/**
 * 易支付接口版本：未设置或空串按 v1；v1 / v2 有效；其他取值无效（渠道算未配置，下单、查询、回调都拒绝）。
 * 配置完整性、下单签名、查询、回调验签共用这一个解析
 */
export function resolveEpayApiVersion(raw: unknown): EpayApiVersion | null {
  const value = String(raw ?? '').trim();
  if (value === '' || value === 'v1') return 'v1';
  if (value === 'v2') return 'v2';
  return null;
}

const WECHAT_VERIFY_MODE_PUBLIC_KEY = 'wechatpay_public_key';
const WECHAT_VERIFY_MODE_AUTO_COMPAT = 'auto_compat';

function getWechatVerifyMode(configs: Record<string, any>): string {
  if (configs['payWeChatVerifyMode'] === WECHAT_VERIFY_MODE_PUBLIC_KEY) {
    return WECHAT_VERIFY_MODE_PUBLIC_KEY;
  }
  if (configs['payWeChatVerifyMode'] === WECHAT_VERIFY_MODE_AUTO_COMPAT) {
    return WECHAT_VERIFY_MODE_AUTO_COMPAT;
  }
  return 'platform_certificate';
}

function isWechatPlatformCertificate(value: any): boolean {
  return typeof value === 'string' && value.includes('BEGIN CERTIFICATE');
}

function getWechatRequiredCredentials(configs: Record<string, any>): string[] {
  const sharedKeys = ['payWeChatAppId', 'payWeChatMchId', 'payWeChatPrivateKey', 'payWeChatSecret'];
  const platformCertificateKeys = ['payWeChatPublicKey'];
  if (!isWechatPlatformCertificate(configs['payWeChatPublicKey'])) {
    platformCertificateKeys.push('payWeChatPlatformSerialNo');
  }
  const publicKeyModeKeys = ['payWeChatWechatpayPublicKeyId', 'payWeChatWechatpayPublicKey'];

  if (getWechatVerifyMode(configs) === WECHAT_VERIFY_MODE_PUBLIC_KEY) {
    return [...sharedKeys, ...publicKeyModeKeys];
  }

  if (getWechatVerifyMode(configs) === WECHAT_VERIFY_MODE_AUTO_COMPAT) {
    return [...sharedKeys, ...platformCertificateKeys, ...publicKeyModeKeys];
  }

  return [...sharedKeys, ...platformCertificateKeys];
}

function getCredentialsToCheck(channel: string, configs: Record<string, any>): string[] {
  const requiredKeys = CHANNEL_CONFIG_KEYS[channel];
  if (!requiredKeys) {
    return [];
  }

  if (channel === 'wechat_official') {
    return getWechatRequiredCredentials(configs);
  }

  const credentialsToCheck = [...requiredKeys.credentials];
  if (channel === 'epay') {
    const apiVersion = resolveEpayApiVersion(configs['payEpayApiVersion']);
    if (apiVersion === 'v2') {
      credentialsToCheck.push('payEpayPrivateKey');
      credentialsToCheck.push('payEpayPublicKey');
    } else {
      credentialsToCheck.push('payEpayKey');
    }
  }

  return credentialsToCheck;
}

/** 缺少或无效的配置项：必需凭据为空，或易支付版本不是 v1 / v2 / 未设置（无效版本记为缺 payEpayApiVersion） */
function getMissingCredentials(channel: string, configs: Record<string, any>): string[] {
  const missing = getCredentialsToCheck(channel, configs).filter(
    key => !configs[key] || configs[key] === '',
  );
  if (channel === 'epay' && resolveEpayApiVersion(configs['payEpayApiVersion']) === null) {
    missing.push('payEpayApiVersion');
  }
  return missing;
}

/**
 * 支付渠道配置键映射
 * 定义每个渠道需要的配置项
 */
export const CHANNEL_CONFIG_KEYS: Record<string, ChannelConfigKeyGroups> = {
  // 微信官方支付
  wechat_official: {
    credentials: [
      'payWeChatAppId',
      'payWeChatMchId',
      'payWeChatVerifyMode',
      'payWeChatPublicKey',
      'payWeChatPlatformSerialNo',
      'payWeChatWechatpayPublicKeyId',
      'payWeChatWechatpayPublicKey',
      'payWeChatPrivateKey',
      'payWeChatSecret',
    ],
    callbacks: ['payWeChatNotifyUrl'],
    optional: ['payWeChatH5Name', 'payWeChatH5Url'],
  },

  // 易支付：版本不再无条件必填（未设置按 v1），按版本要求的凭据在 getCredentialsToCheck 里判断
  epay: {
    credentials: ['payEpayPid', 'payEpayApiPayUrl', 'payEpayApiQueryUrl'],
    callbacks: ['payEpayNotifyUrl', 'payEpayReturnUrl'],
    extras: ['payEpayApiPayUrl', 'payEpayApiQueryUrl', 'payEpayApiVersion'],
    versionCredentials: ['payEpayKey', 'payEpayPrivateKey', 'payEpayPublicKey'],
    optional: [],
  },

  // PayPal官方支付
  paypal_official: {
    credentials: [
      'payPalClientId',
      'payPalClientSecret',
      'payPalMode', // sandbox 或 live
      'payPalWebhookId', // Webhook验证ID
    ],
    callbacks: ['payPalReturnUrl', 'payPalCancelUrl'],
    optional: [],
  },

  // Stripe官方支付
  stripe_official: {
    credentials: [
      'stripeSecretKey',
      'stripePublishableKey',
      'stripeMode', // test 或 live
      'stripeWebhookSecret', // Webhook签名密钥
    ],
    callbacks: ['stripeSuccessUrl', 'stripeCancelUrl'],
    optional: [],
  },

  // 支付宝官方支付
  alipay_official: {
    credentials: [
      'alipayAppId',
      'alipayPrivateKey', // 应用私钥
      'alipayPublicKey', // 支付宝公钥
    ],
    callbacks: ['alipayNotifyUrl', 'alipayReturnUrl'],
    optional: [],
  },
};

/**
 * 检查渠道配置是否完整
 * 回调地址已改为从 siteUrl 自动生成，不再参与完整性校验
 */
export function isChannelConfigured(channel: string, configs: Record<string, any>): boolean {
  const requiredKeys = CHANNEL_CONFIG_KEYS[channel];
  if (!requiredKeys) {
    return false;
  }

  return getMissingCredentials(channel, configs).length === 0;
}

/**
 * 获取渠道的配置状态
 * 回调地址已改为从 siteUrl 自动生成，不再参与完整性校验
 */
export function getChannelConfigStatus(
  channel: string,
  configs: Record<string, any>,
): {
  configured: boolean;
  missing: string[];
  hasOptional: boolean;
} {
  const requiredKeys = CHANNEL_CONFIG_KEYS[channel];
  if (!requiredKeys) {
    return { configured: false, missing: ['渠道不存在'], hasOptional: false };
  }

  const missing = getMissingCredentials(channel, configs);

  const hasOptional =
    requiredKeys.optional?.some(key => configs[key] && configs[key] !== '') || false;

  return {
    configured: missing.length === 0,
    missing,
    hasOptional,
  };
}
