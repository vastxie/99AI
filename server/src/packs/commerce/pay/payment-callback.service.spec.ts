import { HttpException } from '@nestjs/common';
import { createOrder, createPackage } from '../test/order.factory';
import { createPayServiceMock, createPaymentProviderMock } from '../test/payment.mock';
import { createMockRepository } from '@/test/mocks/repository.mock';
import { PaymentCallbackService } from './payment-callback.service';
import { PaymentProvider } from './payment.types';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const epayNotifyParams = {
  param: 'epay',
  pid: '1000',
  trade_no: 'TRADE_001',
  out_trade_no: 'ORDER_001',
};

describe('PaymentCallbackService', () => {
  let payService: any;
  let orderRepository: any;
  let packageRepository: any;
  let provider: any;
  let service: PaymentCallbackService;

  beforeEach(() => {
    payService = createPayServiceMock(jest.fn);
    orderRepository = createMockRepository(jest.fn);
    packageRepository = createMockRepository(jest.fn);
    provider = createPaymentProviderMock(jest.fn, {
      provider: PaymentProvider.EPAY,
    });
    payService.getProvider.mockReturnValue(provider);
    service = new PaymentCallbackService(payService, orderRepository, packageRepository);
  });

  it('processes a successful callback when provider, order, and amount match', async () => {
    provider.parseNotify.mockResolvedValue({
      success: true,
      orderId: 'ORDER_001',
      tradeId: 'TRADE_001',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder());
    packageRepository.findOne.mockResolvedValue(createPackage());

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('success');

    expect(payService.getProvider).toHaveBeenCalledWith(PaymentProvider.EPAY);
    expect(orderRepository.findOne).toHaveBeenCalledWith({
      where: { orderId: 'ORDER_001' },
    });
    expect(payService.processSuccessfulOrder).toHaveBeenCalledWith('ORDER_001', {
      tradeId: 'TRADE_001',
    });
    expect(payService.markOrderFailed).not.toHaveBeenCalled();
  });

  it('routes unified Stripe notify context with raw body and headers to the Stripe provider', async () => {
    provider = createPaymentProviderMock(jest.fn, {
      provider: PaymentProvider.STRIPE_OFFICIAL,
    });
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: true,
      status: 'paid',
      orderId: 'ORDER_001',
      tradeId: 'STRIPE_TRADE',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(
      createOrder({ payPlatform: PaymentProvider.STRIPE_OFFICIAL }),
    );

    const rawBody = Buffer.from('{"id":"evt_001"}');
    await expect(
      service.handleNotify({
        providerHint: 'stripe',
        method: 'POST',
        rawParams: {},
        headers: { 'stripe-signature': 'sig_001' },
        rawBody,
      }),
    ).resolves.toBe('success');

    expect(payService.getProvider).toHaveBeenCalledWith(PaymentProvider.STRIPE_OFFICIAL);
    expect(provider.parseNotify).toHaveBeenCalledWith({
      rawParams: {},
      headers: { 'stripe-signature': 'sig_001' },
      rawBody,
    });
  });

  it('routes unified PayPal notify context with body and headers to the PayPal provider', async () => {
    provider = createPaymentProviderMock(jest.fn, {
      provider: PaymentProvider.PAYPAL_OFFICIAL,
    });
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'pending',
      orderId: 'ORDER_001',
      tradeId: 'PAYPAL_TRADE',
      amount: '',
      currency: 'USD',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(
      createOrder({ payPlatform: PaymentProvider.PAYPAL_OFFICIAL }),
    );

    await expect(
      service.handleNotify({
        providerHint: 'paypal',
        method: 'POST',
        rawParams: { event_type: 'CHECKOUT.ORDER.APPROVED' },
        headers: { 'paypal-transmission-id': 'T_001' },
      }),
    ).resolves.toBe('success');

    expect(payService.getProvider).toHaveBeenCalledWith(PaymentProvider.PAYPAL_OFFICIAL);
    expect(provider.parseNotify).toHaveBeenCalledWith({
      rawParams: { event_type: 'CHECKOUT.ORDER.APPROVED' },
      headers: { 'paypal-transmission-id': 'T_001' },
      rawBody: undefined,
    });
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('marks an unpaid order failed when provider reports payment failure', async () => {
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'failed',
      orderId: 'ORDER_001',
      tradeId: 'TRADE_FAILED',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'failed',
    });
    orderRepository.findOne.mockResolvedValue(createOrder());

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('failed');

    expect(payService.markOrderFailed).toHaveBeenCalledWith('ORDER_001', 2, 'TRADE_FAILED');
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
    expect(packageRepository.findOne).not.toHaveBeenCalled();
  });

  it('marks a matching terminal failure callback failed even when amount and order trade id are absent', async () => {
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'closed',
      orderId: 'ORDER_001',
      tradeId: 'TRADE_001',
      amount: '',
      currency: '',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder());

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('success');

    expect(payService.markOrderFailed).toHaveBeenCalledWith('ORDER_001', 2, 'TRADE_001');
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('rejects forged failure callbacks from a mismatched provider without failing the order', async () => {
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'failed',
      orderId: 'ORDER_001',
      tradeId: 'TRADE_FORGED',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(
      createOrder({ payPlatform: PaymentProvider.ALIPAY_OFFICIAL }),
    );

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('failed');

    expect(payService.markOrderFailed).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('rejects failure callbacks whose trade id conflicts with the recorded one', async () => {
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'failed',
      orderId: 'ORDER_001',
      tradeId: 'TRADE_OTHER',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder({ tradeId: 'TRADE_EXISTING' }));

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('failed');

    expect(payService.markOrderFailed).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('rejects failure callbacks carrying a mismatched amount', async () => {
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'failed',
      orderId: 'ORDER_001',
      tradeId: 'TRADE_001',
      amount: '9.99',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder());

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('failed');

    expect(payService.markOrderFailed).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('keeps pending provider callbacks from marking the order failed', async () => {
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'pending',
      orderId: 'ORDER_001',
      tradeId: 'TRADE_PENDING',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder());

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('success');

    expect(payService.markOrderFailed).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('does not process an already paid duplicate callback again', async () => {
    provider.parseNotify.mockResolvedValue({
      success: true,
      orderId: 'ORDER_001',
      tradeId: 'TRADE_001',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder({ status: 1 }));

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('success');

    expect(orderRepository.findOne).toHaveBeenCalledWith({
      where: { orderId: 'ORDER_001' },
    });
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
    expect(payService.markOrderFailed).not.toHaveBeenCalled();
  });

  it('rejects provider mismatch before delivering order benefits', async () => {
    provider.parseNotify.mockResolvedValue({
      success: true,
      orderId: 'ORDER_001',
      tradeId: 'TRADE_001',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(
      createOrder({ payPlatform: PaymentProvider.ALIPAY_OFFICIAL }),
    );

    await expect(service.handleNotify(epayNotifyParams)).rejects.toBeInstanceOf(HttpException);

    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
    expect(packageRepository.findOne).not.toHaveBeenCalled();
  });

  it('lets a Stripe session that failed a card payment still settle on the later success', async () => {
    const stripeOrder = createOrder({
      payPlatform: PaymentProvider.STRIPE_OFFICIAL,
      tradeId: 'cs_1',
      payCurrencySnapshot: 'USD',
      payAmountSnapshot: 1.39,
    });
    payService.getOrderPaymentSnapshotAmount = jest.fn(() => '1.39');
    payService.getExpectedAmountForCurrency = jest.fn(() => '1.39');
    orderRepository.findOne.mockResolvedValue(stripeOrder);
    const stripeNotify = {
      providerHint: 'stripe',
      rawParams: {},
      headers: { 'stripe-signature': 'sig' },
      rawBody: '{}',
    };

    // 换卡前的失败事件：渠道包映射为 pending，不当终态
    provider.parseNotify.mockResolvedValueOnce({
      success: false,
      status: 'pending',
      orderId: 'ORDER_001',
      tradeId: 'pi_1',
      amount: '1.39',
      currency: 'usd',
      responseText: 'success',
    });
    await expect(service.handleNotify(stripeNotify)).resolves.toBe('success');
    expect(payService.markOrderFailed).not.toHaveBeenCalled();

    // 换卡成功：照常入账
    provider.parseNotify.mockResolvedValueOnce({
      success: true,
      status: 'paid',
      orderId: 'ORDER_001',
      tradeId: 'cs_1',
      amount: '1.39',
      currency: 'usd',
      responseText: 'success',
    });
    await expect(service.handleNotify(stripeNotify)).resolves.toBe('success');
    expect(payService.processSuccessfulOrder).toHaveBeenCalledWith('ORDER_001', {
      tradeId: 'cs_1',
    });
  });

  describe('processQueryResult', () => {
    const request = { requestedOrderId: 'ORDER_001', provider: PaymentProvider.EPAY };
    const paid = (patch: Record<string, unknown> = {}) =>
      ({
        state: 'paid',
        orderId: 'ORDER_001',
        tradeId: 'TRADE_QUERY',
        amount: '10',
        currency: 'cny',
        ...patch,
      }) as any;

    beforeEach(() => {
      // 期望金额只取支付金额快照（formatMoney 是真实实现），不回退现价或 order.total
      payService.processSuccessfulOrder.mockResolvedValue({
        success: true,
        alreadyProcessed: false,
      });
    });

    it('posts a paid result that matches the request and the order snapshot', async () => {
      orderRepository.findOne.mockResolvedValue(createOrder());

      await expect(service.processQueryResult(paid(), request)).resolves.toBe('posted');

      expect(orderRepository.findOne).toHaveBeenCalledWith({ where: { orderId: 'ORDER_001' } });
      expect(packageRepository.findOne).not.toHaveBeenCalled();
      expect(payService.processSuccessfulOrder).toHaveBeenCalledWith('ORDER_001', {
        tradeId: 'TRADE_QUERY',
      });
    });

    it('accepts a USD snapshot and the channel order id saved on the order', async () => {
      orderRepository.findOne.mockResolvedValue(
        createOrder({
          payPlatform: PaymentProvider.PAYPAL_OFFICIAL,
          tradeId: 'PAYPAL_ORDER',
          payCurrencySnapshot: 'USD',
          payAmountSnapshot: 1.39,
        }),
      );

      await expect(
        service.processQueryResult(
          paid({ tradeId: 'PAYPAL_ORDER', amount: '1.39', currency: 'USD' }),
          { requestedOrderId: 'ORDER_001', provider: PaymentProvider.PAYPAL_OFFICIAL },
        ),
      ).resolves.toBe('posted');
    });

    it.each([[''], [null]])(
      'treats a missing currency snapshot (%j) as CNY and still compares the snapshot amount',
      async (payCurrencySnapshot: string | null) => {
        orderRepository.findOne.mockResolvedValue(
          createOrder({ payCurrencySnapshot, payAmountSnapshot: 10 } as any),
        );
        await expect(service.processQueryResult(paid(), request)).resolves.toBe('posted');

        orderRepository.findOne.mockResolvedValue(
          createOrder({ payCurrencySnapshot, payAmountSnapshot: 10 } as any),
        );
        await expect(
          service.processQueryResult(paid({ amount: '10', currency: 'USD' }), request),
        ).resolves.toBe('rejected');
        expect(payService.processSuccessfulOrder).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['pending', 'closed', 'unknown'])(
      'ignores %s results without touching the order',
      async (state: string) => {
        await expect(service.processQueryResult(paid({ state }), request)).resolves.toBe(
          'not_paid',
        );
        expect(orderRepository.findOne).not.toHaveBeenCalled();
        expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
        expect(payService.markOrderFailed).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['another order in the result', paid({ orderId: 'ORDER_002' }), {}],
      ['missing trade id', paid({ tradeId: undefined }), {}],
      ['blank trade id', paid({ tradeId: '  ' }), {}],
      ['non-numeric amount', paid({ amount: 'abc' }), {}],
      ['zero amount', paid({ amount: '0' }), {}],
      ['negative amount', paid({ amount: '-10' }), {}],
      ['missing currency', paid({ currency: undefined }), {}],
      ['another channel', paid(), { payPlatform: PaymentProvider.WECHAT_OFFICIAL }],
      ['currency other than the snapshot', paid({ currency: 'USD' }), {}],
      ['amount other than the snapshot', paid({ amount: '9.99' }), {}],
      [
        'no fallback to order.total when the snapshot differs',
        paid(),
        { payAmountSnapshot: 8.88, total: 10 },
      ],
      ['missing snapshot amount', paid(), { payAmountSnapshot: null }],
      // 金额必须是正数：即使快照也是 0，也不能按 0 元入账
      [
        'a zero amount matching a zero snapshot',
        paid({ amount: '0' }),
        { payAmountSnapshot: 0, total: 0 },
      ],
      ['another existing trade id', paid(), { tradeId: 'TRADE_OTHER' }],
    ])(
      'rejects %s without posting',
      async (_name: string, result: any, orderPatch: Record<string, unknown>) => {
        orderRepository.findOne.mockResolvedValue(createOrder(orderPatch as any));

        await expect(service.processQueryResult(result, request)).resolves.toBe('rejected');
        expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
        expect(payService.markOrderFailed).not.toHaveBeenCalled();
      },
    );

    it('does not post orders that are no longer pending', async () => {
      orderRepository.findOne.mockResolvedValueOnce(createOrder({ status: 1 }));
      await expect(service.processQueryResult(paid(), request)).resolves.toBe('already_paid');
      orderRepository.findOne.mockResolvedValueOnce(createOrder({ status: 2 }));
      await expect(service.processQueryResult(paid(), request)).resolves.toBe('not_pending');
      orderRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.processQueryResult(paid(), request)).resolves.toBe('not_pending');
      expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
    });

    it('reports a lost race inside the posting transaction as already paid', async () => {
      orderRepository.findOne.mockResolvedValue(createOrder());
      payService.processSuccessfulOrder.mockResolvedValue({
        success: true,
        alreadyProcessed: true,
      });

      await expect(service.processQueryResult(paid(), request)).resolves.toBe('already_paid');
    });
  });

  it('rejects amount mismatches without delivering order benefits', async () => {
    provider.parseNotify.mockResolvedValue({
      success: true,
      orderId: 'ORDER_001',
      tradeId: 'TRADE_001',
      amount: '9.99',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder());
    packageRepository.findOne.mockResolvedValue(createPackage());

    await expect(service.handleNotify(epayNotifyParams)).rejects.toBeInstanceOf(HttpException);

    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
    expect(payService.markOrderFailed).not.toHaveBeenCalled();
  });

  it('uses the order USD payment snapshot instead of the current package price', async () => {
    payService.getOrderPaymentSnapshotAmount = jest.fn(() => '8.88');
    payService.getExpectedAmountForCurrency = jest.fn(() => '8.88');
    provider.parseNotify.mockResolvedValue({
      success: true,
      status: 'paid',
      orderId: 'ORDER_USD',
      tradeId: 'STRIPE_TRADE',
      amount: '8.88',
      currency: 'USD',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(
      createOrder({
        orderId: 'ORDER_USD',
        payPlatform: PaymentProvider.EPAY,
        payCurrencySnapshot: 'USD',
        payAmountSnapshot: 8.88,
      }),
    );

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('success');

    expect(packageRepository.findOne).not.toHaveBeenCalled();
    expect(payService.getExpectedAmountForCurrency).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ORDER_USD' }),
      null,
      'USD',
    );
    expect(payService.processSuccessfulOrder).toHaveBeenCalledWith('ORDER_USD', {
      tradeId: 'STRIPE_TRADE',
    });
  });

  it('rejects a USD callback whose order has no package id without querying packages', async () => {
    provider.parseNotify.mockResolvedValue({
      success: true,
      status: 'paid',
      orderId: 'ORDER_001',
      tradeId: 'TRADE_001',
      amount: '1.40',
      currency: 'USD',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder({ goodsId: null as any }));
    packageRepository.findOne.mockResolvedValue(createPackage());

    await expect(service.handleNotify(epayNotifyParams)).rejects.toMatchObject({
      message: '套餐不存在',
    });

    expect(packageRepository.findOne).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('skips the amount check of a USD failure callback whose order has no package id', async () => {
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'failed',
      orderId: 'ORDER_001',
      tradeId: 'TRADE_FAILED',
      amount: '1.40',
      currency: 'USD',
      responseText: 'failed',
    });
    orderRepository.findOne.mockResolvedValue(createOrder({ goodsId: null as any }));
    packageRepository.findOne.mockResolvedValue(createPackage());

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('failed');

    expect(packageRepository.findOne).not.toHaveBeenCalled();
    expect(payService.markOrderFailed).toHaveBeenCalledWith('ORDER_001', 2, 'TRADE_FAILED');
  });

  it('rejects successful callbacks for failed orders instead of treating them as processed', async () => {
    provider.parseNotify.mockResolvedValue({
      success: true,
      status: 'paid',
      orderId: 'ORDER_FAILED',
      tradeId: 'TRADE_001',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder({ orderId: 'ORDER_FAILED', status: 2 }));

    await expect(service.handleNotify(epayNotifyParams)).rejects.toBeInstanceOf(HttpException);

    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
    expect(payService.markOrderFailed).not.toHaveBeenCalled();
  });

  it('rejects trade id mismatches without delivering order benefits', async () => {
    provider.parseNotify.mockResolvedValue({
      success: true,
      orderId: 'ORDER_001',
      tradeId: 'TRADE_OTHER',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder({ tradeId: 'TRADE_EXISTING' }));
    packageRepository.findOne.mockResolvedValue(createPackage());

    await expect(service.handleNotify(epayNotifyParams)).rejects.toBeInstanceOf(HttpException);

    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
    expect(payService.markOrderFailed).not.toHaveBeenCalled();
  });

  it('returns failed for unknown orders without delivering or failing benefits', async () => {
    provider.parseNotify.mockResolvedValue({
      success: true,
      orderId: 'ORDER_MISSING',
      tradeId: 'TRADE_001',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(null);

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('failed');

    expect(orderRepository.findOne).toHaveBeenCalledWith({
      where: { orderId: 'ORDER_MISSING' },
    });
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
    expect(payService.markOrderFailed).not.toHaveBeenCalled();
  });

  it('returns failed before parsing when the notify provider is unknown', async () => {
    await expect(service.handleNotify({ unknown: 'provider' })).resolves.toBe('failed');

    expect(payService.getProvider).not.toHaveBeenCalled();
    expect(orderRepository.findOne).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('returns failed when the provider does not expose parseNotify', async () => {
    payService.getProvider.mockReturnValue({ provider: PaymentProvider.EPAY });

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('failed');

    expect(orderRepository.findOne).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('returns provider response text when parseNotify omits orderId', async () => {
    provider.parseNotify.mockResolvedValue({
      success: true,
      orderId: '',
      tradeId: 'TRADE_001',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'ignored',
    });

    await expect(service.handleNotify(epayNotifyParams)).resolves.toBe('ignored');

    expect(orderRepository.findOne).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('rejects PayPal capture when the provider is unavailable', async () => {
    payService.getProvider.mockReturnValue(null);

    await expect(service.handlePayPalCapture('PAYPAL_ORDER_001')).rejects.toBeInstanceOf(
      HttpException,
    );

    expect(orderRepository.findOne).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('routes unified PayPal browser return into capture verification', async () => {
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: true,
      status: 'paid',
      orderId: 'ORDER_001',
      tradeId: 'PAYPAL_TRADE',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(
      createOrder({ payPlatform: PaymentProvider.PAYPAL_OFFICIAL }),
    );

    await expect(
      service.handleReturn('paypal', 'success', { token: 'PAYPAL_ORDER_001' }),
    ).resolves.toEqual({
      success: true,
      message: '支付成功',
      orderId: 'ORDER_001',
    });

    expect(payService.getProvider).toHaveBeenCalledWith(PaymentProvider.PAYPAL_OFFICIAL);
    expect(provider.parseNotify).toHaveBeenCalledWith({
      rawParams: { paypalOrderId: 'PAYPAL_ORDER_001' },
    });
  });

  it('rejects PayPal capture when provider parsing does not confirm payment', async () => {
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: false,
      orderId: '',
      tradeId: '',
      amount: '',
      currency: 'USD',
      responseText: 'failed',
    });

    await expect(service.handlePayPalCapture('PAYPAL_ORDER_001')).rejects.toBeInstanceOf(
      HttpException,
    );

    expect(orderRepository.findOne).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('rejects PayPal capture for missing orders', async () => {
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: true,
      orderId: 'ORDER_MISSING',
      tradeId: 'PAYPAL_TRADE',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(null);

    await expect(service.handlePayPalCapture('PAYPAL_ORDER_001')).rejects.toBeInstanceOf(
      HttpException,
    );

    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('acknowledges already paid PayPal capture without duplicate delivery', async () => {
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: true,
      orderId: 'ORDER_001',
      tradeId: 'PAYPAL_TRADE',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder({ status: 1 }));

    await expect(service.handlePayPalCapture('PAYPAL_ORDER_001')).resolves.toEqual({
      success: true,
      message: '订单已支付',
      orderId: 'ORDER_001',
    });

    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('processes a fresh PayPal capture for an unpaid order', async () => {
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: true,
      status: 'paid',
      orderId: 'ORDER_001',
      tradeId: 'PAYPAL_TRADE',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(
      createOrder({ payPlatform: PaymentProvider.PAYPAL_OFFICIAL }),
    );

    await expect(service.handlePayPalCapture('PAYPAL_ORDER_001')).resolves.toEqual({
      success: true,
      message: '支付成功',
      orderId: 'ORDER_001',
    });

    expect(payService.processSuccessfulOrder).toHaveBeenCalledWith('ORDER_001', {
      tradeId: 'PAYPAL_TRADE',
    });
  });

  // Webhook 都经统一入口 /pay/notify：用例走 handleNotify，带上原文与请求头
  const paypalWebhook = {
    providerHint: 'paypal',
    method: 'POST',
    rawParams: { event_type: 'PAYMENT.CAPTURE.DENIED' },
    headers: { 'paypal-transmission-id': 'T1' },
    rawBody: '{"event_type":"PAYMENT.CAPTURE.DENIED"}',
  };
  const stripeWebhook = {
    providerHint: 'stripe',
    method: 'POST',
    rawParams: {},
    headers: { 'stripe-signature': 'sig' },
    rawBody: '{}',
  };

  it('marks terminal PayPal webhook failures without delivering benefits', async () => {
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'failed',
      orderId: 'ORDER_001',
      tradeId: 'PAYPAL_TRADE',
      amount: '',
      currency: 'USD',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(
      createOrder({ payPlatform: PaymentProvider.PAYPAL_OFFICIAL }),
    );

    await expect(service.handleNotify(paypalWebhook)).resolves.toBe('success');

    expect(provider.parseNotify).toHaveBeenCalledWith({
      rawParams: paypalWebhook.rawParams,
      headers: paypalWebhook.headers,
      rawBody: paypalWebhook.rawBody,
    });
    expect(payService.markOrderFailed).toHaveBeenCalledWith('ORDER_001', 2, 'PAYPAL_TRADE');
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('ignores PayPal webhook failures for orders that belong to another channel', async () => {
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'failed',
      orderId: 'ORDER_001',
      tradeId: 'PAYPAL_TRADE',
      amount: '',
      currency: 'USD',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder({ payPlatform: PaymentProvider.EPAY }));

    await expect(service.handleNotify(paypalWebhook)).resolves.toBe('failed');

    expect(payService.markOrderFailed).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('marks Stripe webhook terminal failures failed after ownership validation passes', async () => {
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'failed',
      orderId: 'ORDER_001',
      tradeId: undefined,
      amount: '',
      currency: 'usd',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(
      createOrder({
        payPlatform: PaymentProvider.STRIPE_OFFICIAL,
        tradeId: 'STRIPE_SESSION',
      }),
    );

    await expect(service.handleNotify(stripeWebhook)).resolves.toBe('success');

    expect(payService.markOrderFailed).toHaveBeenCalledWith('ORDER_001', 2, undefined);
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('ignores Stripe webhook failures for orders that belong to another channel', async () => {
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValue({
      success: false,
      status: 'failed',
      orderId: 'ORDER_001',
      tradeId: undefined,
      amount: '',
      currency: 'usd',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValue(createOrder({ payPlatform: PaymentProvider.EPAY }));

    await expect(service.handleNotify(stripeWebhook)).resolves.toBe('failed');

    expect(payService.markOrderFailed).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('returns Stripe session verification result for already paid local orders', async () => {
    payService.getProvider.mockReturnValue(provider);
    const result = {
      success: true,
      status: 'paid',
      orderId: 'ORDER_001',
      tradeId: 'STRIPE_TRADE',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    };
    provider.parseNotify.mockResolvedValue(result);
    orderRepository.findOne.mockResolvedValue(createOrder({ status: 1 }));

    await expect(service.handleStripeReturn('SESSION_001')).resolves.toBe(result);

    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('routes unified Stripe browser return into session verification', async () => {
    payService.getProvider.mockReturnValue(provider);
    const result = {
      success: true,
      status: 'paid',
      orderId: 'ORDER_001',
      tradeId: 'STRIPE_TRADE',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    };
    provider.parseNotify.mockResolvedValue(result);
    orderRepository.findOne.mockResolvedValue(createOrder({ status: 1 }));

    await expect(
      service.handleReturn('stripe', 'success', { session_id: 'SESSION_001' }),
    ).resolves.toBe(result);

    expect(payService.getProvider).toHaveBeenCalledWith(PaymentProvider.STRIPE_OFFICIAL);
    expect(provider.parseNotify).toHaveBeenCalledWith({
      rawParams: { sessionId: 'SESSION_001' },
    });
  });

  it('acknowledges unified browser return cancellations without provider calls', async () => {
    await expect(service.handleReturn('paypal', 'cancel', {})).resolves.toEqual({
      status: 'cancelled',
    });

    expect(payService.getProvider).not.toHaveBeenCalled();
    expect(orderRepository.findOne).not.toHaveBeenCalled();
  });

  it('keeps Epay and Alipay browser returns as display-only without delivering benefits', async () => {
    await expect(
      service.handleReturn('epay', 'success', { out_trade_no: 'ORDER_001' }),
    ).resolves.toEqual({
      status: 'returned',
    });
    await expect(
      service.handleReturn('alipay', 'success', { out_trade_no: 'ORDER_002' }),
    ).resolves.toEqual({
      status: 'returned',
    });

    expect(payService.getProvider).not.toHaveBeenCalled();
    expect(orderRepository.findOne).not.toHaveBeenCalled();
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();
  });

  it('handles Stripe webhook ignored, duplicate, and successful paths', async () => {
    payService.getProvider.mockReturnValue(provider);
    provider.parseNotify.mockResolvedValueOnce({
      success: false,
      orderId: '',
      tradeId: '',
      amount: '',
      currency: 'USD',
      responseText: 'ignored',
    });

    await expect(service.handleNotify(stripeWebhook)).resolves.toBe('ignored');

    provider.parseNotify.mockResolvedValueOnce({
      success: true,
      orderId: 'ORDER_DUP',
      tradeId: 'STRIPE_TRADE',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValueOnce(createOrder({ orderId: 'ORDER_DUP', status: 1 }));

    await expect(service.handleNotify(stripeWebhook)).resolves.toBe('success');
    expect(payService.processSuccessfulOrder).not.toHaveBeenCalled();

    provider.parseNotify.mockResolvedValueOnce({
      success: true,
      orderId: 'ORDER_001',
      tradeId: 'STRIPE_TRADE',
      amount: '10.00',
      currency: 'CNY',
      responseText: 'success',
    });
    orderRepository.findOne.mockResolvedValueOnce(
      createOrder({ payPlatform: PaymentProvider.STRIPE_OFFICIAL }),
    );
    packageRepository.findOne.mockResolvedValueOnce(createPackage());

    await expect(service.handleNotify(stripeWebhook)).resolves.toBe('success');

    expect(payService.processSuccessfulOrder).toHaveBeenCalledWith('ORDER_001', {
      tradeId: 'STRIPE_TRADE',
    });
  });
});
