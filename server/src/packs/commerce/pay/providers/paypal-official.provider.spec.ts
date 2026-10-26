import { Logger } from '@nestjs/common';
import { PaypalOfficialProvider } from './paypal-official.provider';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('PaypalOfficialProvider webhook notify', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hands the raw body (not the parsed object) to PayPal verification and uses that event', async () => {
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
    const payPalService = {
      handleWebhook: jest.fn(async () => ({
        type: 'PAYMENT.CAPTURE.COMPLETED',
        orderId: 'ORDER_RAW',
        tradeId: 'PAYPAL1',
        status: 'COMPLETED',
        amount: '10.50',
        currency: 'USD',
      })),
    };
    const provider = new PaypalOfficialProvider(payPalService as any, {} as any);
    const rawBody =
      '{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"custom_id":"ORDER_RAW"}}';

    // 中间件改写过的解析结果与原文不同：只按原文处理
    const result = await provider.parseNotify({
      rawParams: { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { custom_id: 'ORDER_FAKE' } },
      headers: { 'paypal-transmission-id': 'T1' },
      rawBody,
    });

    expect(payPalService.handleWebhook).toHaveBeenCalledWith(
      { 'paypal-transmission-id': 'T1' },
      rawBody,
    );
    expect(result).toMatchObject({ success: true, orderId: 'ORDER_RAW', amount: '10.50' });
  });
});
