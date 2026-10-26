/**
 * 支付渠道配置
 * 类型定义在 payment.types.ts，本文件只提供运行时配置和工具函数
 */

import { PaymentMethod, PaymentProvider } from './payment.types';

export { PaymentMethod, PaymentProvider };

/**
 * 支付渠道能力映射
 * 定义每个渠道支持哪些支付方式
 */
interface ChannelCapability {
  name: string;
  supportedMethods: PaymentMethod[];
  needConfig: string[];
  isOfficial: boolean;
  supportsPolling?: boolean;
  pollingConfigKey?: string;
}

export const CHANNEL_CAPABILITIES: Record<PaymentProvider, ChannelCapability> = {
  [PaymentProvider.WECHAT_OFFICIAL]: {
    name: '微信官方支付',
    supportedMethods: [PaymentMethod.WECHAT],
    needConfig: [
      'payWeChatAppId',
      'payWeChatMchId',
      'payWeChatPublicKey',
      'payWeChatPlatformSerialNo',
      'payWeChatPrivateKey',
      'payWeChatSecret',
    ],
    isOfficial: true,
    supportsPolling: true,
  },

  [PaymentProvider.ALIPAY_OFFICIAL]: {
    name: '支付宝官方支付',
    supportedMethods: [PaymentMethod.ALIPAY],
    needConfig: ['alipayAppId', 'alipayPrivateKey', 'alipayPublicKey'],
    isOfficial: true,
    supportsPolling: true,
    pollingConfigKey: 'alipayEnablePolling',
  },

  [PaymentProvider.EPAY]: {
    name: '易支付',
    supportedMethods: [PaymentMethod.WECHAT, PaymentMethod.ALIPAY, PaymentMethod.PAYPAL],
    needConfig: ['payEpayPid', 'payEpayKey', 'payEpayApiPayUrl'],
    isOfficial: false,
    supportsPolling: true,
    pollingConfigKey: 'payEpayEnablePolling',
  },

  [PaymentProvider.PAYPAL_OFFICIAL]: {
    name: 'PayPal官方支付',
    supportedMethods: [PaymentMethod.PAYPAL],
    needConfig: ['payPalClientId', 'payPalClientSecret', 'payPalMode', 'payPalWebhookId'],
    isOfficial: true,
  },

  [PaymentProvider.STRIPE_OFFICIAL]: {
    name: 'Stripe官方支付',
    supportedMethods: [PaymentMethod.STRIPE],
    needConfig: ['stripeSecretKey', 'stripePublishableKey', 'stripeMode', 'stripeWebhookSecret'],
    isOfficial: true,
  },
};

/**
 * 检查渠道是否支持指定支付方式
 */
export function isMethodSupportedByChannel(
  channel: PaymentProvider,
  method: PaymentMethod,
): boolean {
  const config = CHANNEL_CAPABILITIES[channel];
  return config && config.supportedMethods.includes(method);
}
