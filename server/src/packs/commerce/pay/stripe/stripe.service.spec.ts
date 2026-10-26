import { Logger } from '@nestjs/common';
import Stripe = require('stripe');
import { createGlobalConfigFake } from '../../test/global-config.fake';
import { StripeService } from './stripe.service';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

describe('StripeService', () => {
  it('builds a real Stripe client from the configured secret key and reuses it while the key is unchanged', async () => {
    // 用真实 SDK 构造客户端：stripe 22 没有 .default，默认导入会在首笔支付时才报「不是构造函数」
    const config = createGlobalConfigFake(jest.fn, { stripeSecretKey: 'sk_test_smoke_only_a' });
    const service = new StripeService(config as any);

    const client = await (service as any).getStripeClient();

    // stripe 22 导出的是工厂式构造函数，实例不在它的原型链上，因此检查客户端能力而不是 instanceof
    expect(typeof Stripe).toBe('function');
    expect(typeof client.checkout.sessions.create).toBe('function');
    expect(typeof client.webhooks.constructEvent).toBe('function');
    expect(await (service as any).getStripeClient()).toBe(client);
  });

  it('rebuilds the client after the secret key changes (switching test and live keys)', async () => {
    const config = createGlobalConfigFake(jest.fn, { stripeSecretKey: 'sk_test_smoke_only_a' });
    const service = new StripeService(config as any);
    const first = await (service as any).getStripeClient();

    config.values.stripeSecretKey = 'sk_test_smoke_only_b';
    const second = await (service as any).getStripeClient();

    expect(second).not.toBe(first);
    expect(await (service as any).getStripeClient()).toBe(second);
  });

  it('refuses to build a client without a secret key', async () => {
    const service = new StripeService(createGlobalConfigFake(jest.fn, {}) as any);

    await expect((service as any).getStripeClient()).rejects.toThrow('Stripe配置信息不完整');
  });

  it('verifies webhooks with the configured webhook secret (a single-key read returns the value itself)', async () => {
    const config = createGlobalConfigFake(jest.fn, {
      stripeSecretKey: 'sk_test_smoke_only_a',
      stripeWebhookSecret: 'whsec_test_value',
    });
    const service = new StripeService(config as any);
    const client = await (service as any).getStripeClient();
    const logged = jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    const constructEvent = jest.spyOn(client.webhooks, 'constructEvent').mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'paid',
          amount_total: 1000,
          currency: 'usd',
          metadata: { orderId: 'ORDER_001' },
        },
      },
    });

    await expect(service.handleWebhook('sig', '{"raw":true}')).resolves.toMatchObject({
      orderId: 'ORDER_001',
      tradeId: 'cs_test_1',
    });
    expect(constructEvent).toHaveBeenCalledWith('{"raw":true}', 'sig', 'whsec_test_value');
    // 日志是静态文案，不带订单号尾号
    expect(logged).toHaveBeenCalledWith('Stripe支付成功', 'StripeService');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('_001');
    logged.mockRestore();

    config.values.stripeWebhookSecret = '';
    await expect(service.handleWebhook('sig', '{}')).rejects.toThrow('Stripe Webhook Secret未配置');
  });

  it('logs a failed webhook verification with the error stack and a static message', async () => {
    const config = createGlobalConfigFake(jest.fn, {
      stripeSecretKey: 'sk_test_smoke_only_a',
      stripeWebhookSecret: 'whsec_test_value',
    });
    const service = new StripeService(config as any);
    const client = await (service as any).getStripeClient();
    jest.spyOn(client.webhooks, 'constructEvent').mockImplementation(() => {
      throw new Error('signature-mismatch-detail');
    });
    const logged = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);

    await expect(service.handleWebhook('sig', '{}')).rejects.toBeDefined();
    expect(logged).toHaveBeenCalledWith(
      '处理Stripe Webhook失败',
      expect.stringContaining('signature-mismatch-detail'),
      'StripeService',
    );
    logged.mockRestore();
  });
});

describe('StripeService.retrieveSessionForQuery', () => {
  it('limits only the reconcile query to 10 seconds without retries', async () => {
    const service = new StripeService(
      createGlobalConfigFake(jest.fn, { stripeSecretKey: 'sk_test_smoke_only_a' }) as any,
    );
    const client = await (service as any).getStripeClient();
    const retrieve = jest
      .spyOn(client.checkout.sessions, 'retrieve')
      .mockResolvedValue({ id: 'cs_1' } as any);
    jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);

    await expect(service.retrieveSessionForQuery('cs_1')).resolves.toEqual({ id: 'cs_1' });
    expect(retrieve).toHaveBeenLastCalledWith(
      'cs_1',
      { expand: ['payment_intent.latest_charge'] },
      { timeout: 10000, maxNetworkRetries: 0 },
    );

    // 回跳验证等现有请求不带单次请求参数，沿用共享客户端的默认设置
    await service.verifyPayment('cs_1');
    expect(retrieve.mock.calls[1]).toEqual(['cs_1', { expand: ['payment_intent', 'line_items'] }]);
  });
});
