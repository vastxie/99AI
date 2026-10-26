import { Logger } from '@nestjs/common';
import axios from 'axios';
import { createMockRepository } from '@/test/mocks/repository.mock';
import { createGlobalConfigFake } from '../../test/global-config.fake';
import { createOrder } from '../../test/order.factory';
import { createPayServiceMock } from '../../test/payment.mock';
import { PaymentCallbackService } from '../payment-callback.service';
import { PaymentProvider } from '../payment.types';
import { PaypalOfficialProvider } from '../providers/paypal-official.provider';
import { PayPalService } from './paypal.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/**
 * 统一回调入口 → PayPal 渠道 → PayPalService → axios（真实的请求转换，只把最后的发送换成本地函数）：
 * 证明发给 PayPal 验签的请求体里嵌的就是收到的原文，订单按同一份原文处理
 */
describe('PayPal webhook raw body chain', () => {
  const originalAdapter = axios.defaults.adapter;
  let sent: Array<{ url: string; data: unknown }>;

  beforeEach(() => {
    sent = [];
    axios.defaults.adapter = async (config: any) => {
      sent.push({ url: config.url, data: config.data });
      const data = config.url.endsWith('/v1/oauth2/token')
        ? { access_token: 'token-1', expires_in: 32400 }
        : { verification_status: 'SUCCESS' };
      return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} };
    };
    jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'debug').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    axios.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  it('embeds the received bytes in the verification request and settles the order from them', async () => {
    // 空白、Unicode 转义、数字写法与末尾换行：任何重新序列化都会改变它们
    const raw =
      '{ "event_type" : "PAYMENT.CAPTURE.COMPLETED", "resource": { "id": "CAP1", "status": "COMPLETED",' +
      ' "custom_id": "ORDER_\\u0031", "amount": { "value": "10.50", "currency_code": "USD" },' +
      ' "supplementary_data": { "related_ids": { "order_id": "PAYPAL1" } } }, "n": 1.0e1 }\n';
    const config = createGlobalConfigFake(jest.fn, {
      payPalClientId: 'client-a',
      payPalClientSecret: 'secret-a',
      payPalMode: 'live',
      payPalWebhookId: 'WH-1',
    });
    const provider = new PaypalOfficialProvider(new PayPalService(config as any), {} as any);
    const payService = createPayServiceMock(jest.fn, {
      getProvider: jest.fn().mockReturnValue(provider),
      getOrderPaymentSnapshotAmount: () => '10.50',
      getExpectedAmountForCurrency: () => '10.50',
    });
    const orderRepository = createMockRepository(jest.fn);
    orderRepository.findOne.mockResolvedValue(
      createOrder({ orderId: 'ORDER_1', payPlatform: PaymentProvider.PAYPAL_OFFICIAL }),
    );
    const callback = new PaymentCallbackService(
      payService as any,
      orderRepository as any,
      createMockRepository(jest.fn) as any,
    );

    // 中间件解析出的对象被改写过：只认原文
    await expect(
      callback.handleNotify({
        providerHint: 'paypal',
        method: 'POST',
        rawParams: {
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          resource: { custom_id: 'ORDER_FAKE' },
        },
        headers: {
          'paypal-auth-algo': 'SHA256withRSA',
          'paypal-cert-url': 'https://api.paypal.com/cert',
          'paypal-transmission-id': 'T-"quoted"',
          'paypal-transmission-sig': 'SIG',
          'paypal-transmission-time': '2026-10-02T00:00:00Z',
        },
        rawBody: Buffer.from(raw),
      }),
    ).resolves.toBe('success');

    expect(sent.map(item => item.url)).toEqual([
      'https://api-m.paypal.com/v1/oauth2/token',
      'https://api-m.paypal.com/v1/notifications/verify-webhook-signature',
    ]);
    expect(sent[1].data).toBe(
      '{"auth_algo":"SHA256withRSA","cert_url":"https://api.paypal.com/cert",' +
        '"transmission_id":"T-\\"quoted\\"","transmission_sig":"SIG",' +
        `"transmission_time":"2026-10-02T00:00:00Z","webhook_id":"WH-1","webhook_event":${raw}}`,
    );
    expect(orderRepository.findOne).toHaveBeenCalledWith({ where: { orderId: 'ORDER_1' } });
    expect(payService.processSuccessfulOrder).toHaveBeenCalledWith('ORDER_1', {
      tradeId: 'PAYPAL1',
    });
  });
});
