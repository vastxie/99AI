import { createGlobalConfigFake } from '../test/global-config.fake';
import { PaymentConfigService } from './payment-config.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createService(configs: Record<string, string>) {
  // 按真实契约：一个键返回值本身、多个键返回对象（以前的替身对一个键也返回对象，掩盖了单键误读）
  const globalConfigService = createGlobalConfigFake(jest.fn, configs);
  return { service: new PaymentConfigService(globalConfigService as any), globalConfigService };
}

const stripeConfigured = {
  stripeSecretKey: 'sk_test',
  stripePublishableKey: 'pk_test',
  stripeMode: 'test',
  stripeWebhookSecret: 'whsec',
};

describe('PaymentConfigService', () => {
  it('lists only enabled and fully configured methods, sorted by priority', async () => {
    const { service } = createService({
      ...stripeConfigured,
      paymentStripeEnabled: '1',
      paymentStripePriority: '9',
      // 微信支付开启但渠道未配置 → 不可用
      paymentWechatEnabled: '1',
      // PayPal 配置齐全但未开启 → 不可用
      paymentPaypalEnabled: '0',
      payPalClientId: 'id',
      payPalClientSecret: 'secret',
      payPalMode: 'sandbox',
      payPalWebhookId: 'wh',
    });

    await expect(service.getAvailablePaymentMethods()).resolves.toEqual([
      { method: 'stripe', name: 'Stripe', channel: 'stripe_official', priority: 9, icon: 'stripe' },
    ]);
  });

  it('falls back to default channels and priorities', async () => {
    const { service } = createService({});
    const config = await service.getPaymentConfig();

    expect(config.wechat).toEqual({
      enabled: false,
      channel: 'wechat_official',
      priority: 1,
      configured: false,
    });
    expect(config.alipay.channel).toBe('epay');
    expect(config.stripe.priority).toBe(4);
  });

  it('reports channel status for every known channel', async () => {
    const { service } = createService(stripeConfigured);
    const status = await service.getPaymentChannelStatus();

    expect(Object.keys(status).sort()).toEqual([
      'alipay_official',
      'epay',
      'paypal_official',
      'stripe_official',
      'wechat_official',
    ]);
    expect(status.stripe_official.configured).toBe(true);
    expect(status.wechat_official.configured).toBe(false);
  });

  it('rejects resolving a method whose channel is not configured', async () => {
    const { service } = createService({ paymentWechatEnabled: '1' });

    await expect(service.resolveProvider('wechat')).rejects.toThrow('支付渠道配置不完整');
    await expect(service.resolveProvider('alipay')).rejects.toThrow('支付宝支付未开启!');
  });

  it('reads the version-dependent epay credentials, so a complete epay channel is listed and resolvable', async () => {
    const epayBase = {
      paymentAlipayEnabled: '1',
      payEpayPid: 'merchant-id',
      payEpayApiPayUrl: 'https://pay.example.com/api/pay',
      payEpayApiQueryUrl: 'https://pay.example.com/api/query',
    };
    const v1 = createService({ ...epayBase, payEpayKey: 'k' });
    await expect(v1.service.resolveProvider('alipay')).resolves.toMatchObject({ provider: 'epay' });
    await expect(v1.service.getAvailablePaymentMethods()).resolves.toEqual([
      expect.objectContaining({ method: 'alipay', channel: 'epay' }),
    ]);
    const requested = v1.globalConfigService.getConfigs.mock.calls.flatMap(
      (call: any[]) => call[0],
    );
    expect(requested).toEqual(
      expect.arrayContaining(['payEpayKey', 'payEpayPrivateKey', 'payEpayPublicKey']),
    );

    const v2 = createService({
      ...epayBase,
      payEpayApiVersion: 'v2',
      payEpayPrivateKey: 'p',
      payEpayPublicKey: 'pub',
    });
    await expect(v2.service.resolveProvider('alipay')).resolves.toMatchObject({ provider: 'epay' });
    expect((await v2.service.getPaymentChannelStatus()).epay.configured).toBe(true);

    const unknown = createService({ ...epayBase, payEpayKey: 'k', payEpayApiVersion: 'v9' });
    await expect(unknown.service.resolveProvider('alipay')).rejects.toThrow('支付渠道配置不完整');
    await expect(unknown.service.getAvailablePaymentMethods()).resolves.toEqual([]);
  });
});
