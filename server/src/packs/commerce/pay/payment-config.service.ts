import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { PaymentMethod, PaymentProvider } from './payment.types';
import { CHANNEL_CAPABILITIES, isMethodSupportedByChannel } from './payment-channel.config';
import {
  CHANNEL_CONFIG_KEYS,
  getChannelConfigStatus,
  isChannelConfigured,
} from './payment-config.helper';

type PaymentMethodKey = 'wechat' | 'alipay' | 'paypal' | 'stripe';

interface PaymentMethodConfig {
  enabled: boolean;
  channel: string;
  priority: number;
  configured: boolean;
}

/** 四种支付方式的展示名 / 图标 / 默认渠道 / 默认排序；配置键为 payment<Method>{Enabled,Channel,Priority} */
const PAYMENT_METHODS: ReadonlyArray<{
  method: PaymentMethodKey;
  configPrefix: string;
  name: string;
  icon: string;
  defaultChannel: string;
  defaultPriority: number;
}> = [
  {
    method: 'wechat',
    configPrefix: 'paymentWechat',
    name: '微信支付',
    icon: 'wechat',
    defaultChannel: 'wechat_official',
    defaultPriority: 1,
  },
  {
    method: 'alipay',
    configPrefix: 'paymentAlipay',
    name: '支付宝',
    icon: 'alipay',
    defaultChannel: 'epay',
    defaultPriority: 2,
  },
  {
    method: 'paypal',
    configPrefix: 'paymentPaypal',
    name: 'PayPal',
    icon: 'paypal',
    defaultChannel: 'paypal_official',
    defaultPriority: 3,
  },
  {
    method: 'stripe',
    configPrefix: 'paymentStripe',
    name: 'Stripe',
    icon: 'stripe',
    defaultChannel: 'stripe_official',
    defaultPriority: 4,
  },
];

/** 各渠道涉及的全部配置键（凭证 / 回调 / 附加 / 按版本的凭据 / 可选），用于判断渠道是否配置完整 */
const PAYMENT_CHANNEL_CONFIG_KEYS: string[] = [
  ...new Set(
    Object.values(CHANNEL_CONFIG_KEYS).flatMap(channel => [
      ...(channel.credentials ?? []),
      ...(channel.callbacks ?? []),
      ...(channel.extras ?? []),
      ...(channel.versionCredentials ?? []),
      ...(channel.optional ?? []),
    ]),
  ),
];

const PAYMENT_METHOD_CONFIG_KEYS: string[] = PAYMENT_METHODS.flatMap(item => [
  `${item.configPrefix}Enabled`,
  `${item.configPrefix}Channel`,
  `${item.configPrefix}Priority`,
]);

function isEnabledConfig(value: unknown): boolean {
  return value === '1' || value === 1 || value === true || value === 'true';
}

/** 支付配置的解释权在商业包：支付方式开关 / 渠道选择 / 渠道配置完整性 */
@Injectable()
export class PaymentConfigService {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  /** 各支付方式的开关、所选渠道、排序与渠道配置完整性 */
  async getPaymentConfig(): Promise<Record<PaymentMethodKey, PaymentMethodConfig>> {
    const [methodConfigs, channelConfigs] = await Promise.all([
      this.globalConfigService.getConfigs(PAYMENT_METHOD_CONFIG_KEYS),
      this.globalConfigService.getConfigs(PAYMENT_CHANNEL_CONFIG_KEYS),
    ]);
    const result = {} as Record<PaymentMethodKey, PaymentMethodConfig>;
    for (const item of PAYMENT_METHODS) {
      const channel = methodConfigs[`${item.configPrefix}Channel`] || item.defaultChannel;
      result[item.method] = {
        enabled: isEnabledConfig(methodConfigs[`${item.configPrefix}Enabled`]),
        channel,
        priority: Number(methodConfigs[`${item.configPrefix}Priority`]) || item.defaultPriority,
        configured: isChannelConfigured(channel, channelConfigs),
      };
    }
    return result;
  }

  /** 各渠道的配置完整性（管理端支付设置页） */
  async getPaymentChannelStatus() {
    const channelConfigs = await this.globalConfigService.getConfigs(PAYMENT_CHANNEL_CONFIG_KEYS);
    const status: Record<string, ReturnType<typeof getChannelConfigStatus>> = {};
    for (const channel of Object.keys(CHANNEL_CONFIG_KEYS)) {
      status[channel] = getChannelConfigStatus(channel, channelConfigs);
    }
    return status;
  }

  /** 用户端可用的支付方式：已开启且渠道配置完整，按优先级排序 */
  async getAvailablePaymentMethods() {
    const paymentConfig = await this.getPaymentConfig();
    return PAYMENT_METHODS.filter(item => {
      const config = paymentConfig[item.method];
      return config.enabled && config.configured;
    })
      .map(item => ({
        method: item.method,
        name: item.name,
        channel: paymentConfig[item.method].channel,
        priority: paymentConfig[item.method].priority,
        icon: item.icon,
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  /** method → provider 解析 */
  async resolveProvider(method: string): Promise<{
    provider: PaymentProvider;
    enabled: boolean;
    configured: boolean;
  }> {
    const config = await this.getPaymentConfig();
    const normalizedMethod = typeof method === 'string' ? method.toLowerCase() : method;

    let methodConfig: PaymentMethodConfig;
    if (normalizedMethod === PaymentMethod.WECHAT || normalizedMethod === 'wechat') {
      methodConfig = config.wechat;
    } else if (normalizedMethod === PaymentMethod.ALIPAY || normalizedMethod === 'alipay') {
      methodConfig = config.alipay;
    } else if (normalizedMethod === PaymentMethod.PAYPAL || normalizedMethod === 'paypal') {
      methodConfig = config.paypal;
    } else if (normalizedMethod === PaymentMethod.STRIPE || normalizedMethod === 'stripe') {
      methodConfig = config.stripe;
    } else {
      throw new HttpException('不支持的支付方式', HttpStatus.BAD_REQUEST);
    }

    if (!methodConfig.enabled) {
      const methodNames: Record<string, string> = {
        wechat: '微信支付',
        alipay: '支付宝支付',
        paypal: 'PayPal支付',
        stripe: 'Stripe支付',
      };
      throw new HttpException(
        `${methodNames[normalizedMethod] || normalizedMethod}未开启!`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const provider = methodConfig.channel as PaymentProvider;
    if (!CHANNEL_CAPABILITIES[provider]) {
      throw new HttpException('支付渠道配置无效', HttpStatus.BAD_REQUEST);
    }
    if (!isMethodSupportedByChannel(provider, normalizedMethod as PaymentMethod)) {
      throw new HttpException('支付渠道与支付方式不匹配', HttpStatus.BAD_REQUEST);
    }
    if (!methodConfig.configured) {
      throw new HttpException(
        '支付渠道配置不完整，请先检查管理端支付渠道配置',
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      provider,
      enabled: methodConfig.enabled,
      configured: methodConfig.configured,
    };
  }

  /** 是否需要启动轮询 */
  async shouldEnablePolling(provider: PaymentProvider): Promise<boolean> {
    const capability = CHANNEL_CAPABILITIES[provider];
    if (!capability?.supportsPolling) return false;
    if (capability.pollingConfigKey) {
      try {
        const value = await this.globalConfigService.getConfigs([capability.pollingConfigKey]);
        return value !== '0';
      } catch {
        return true;
      }
    }
    return true;
  }
}
