import { Logger } from '@nestjs/common';
import { AlipayOfficialProvider } from './alipay-official.provider';
import { PaypalOfficialProvider } from './paypal-official.provider';
import { StripeOfficialProvider } from './stripe-official.provider';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/** 补单查单的四态映射：只有 paid 会入账，其余不改订单（unknown 含字段不符、退款、争议与渠道报错） */
describe('payment query providers', () => {
  beforeEach(() => {
    jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Alipay', () => {
    const query = (response: unknown) => {
      const alipayService = {
        queryOrder:
          response instanceof Error
            ? jest.fn().mockRejectedValue(response)
            : jest.fn().mockResolvedValue(response),
      };
      const provider = new AlipayOfficialProvider(alipayService as any, async () => ({}) as any);
      return provider.queryOrder({ orderId: 'ORDER_1' });
    };
    const ok = (patch: Record<string, unknown>) => ({
      code: '10000',
      outTradeNo: 'ORDER_1',
      tradeNo: 'ALI_T1',
      totalAmount: '10.00',
      ...patch,
    });

    it.each([
      ['TRADE_SUCCESS', 'paid'],
      ['TRADE_FINISHED', 'paid'],
      ['WAIT_BUYER_PAY', 'pending'],
      ['TRADE_CLOSED', 'closed'],
      ['SOMETHING_ELSE', 'unknown'],
    ])('maps %s to %s', async (tradeStatus: string, state: string) => {
      await expect(query(ok({ tradeStatus }))).resolves.toMatchObject({
        state,
        orderId: 'ORDER_1',
      });
    });

    it('returns the trade number and amount of a paid order', async () => {
      await expect(query(ok({ tradeStatus: 'TRADE_SUCCESS' }))).resolves.toEqual({
        state: 'paid',
        orderId: 'ORDER_1',
        tradeId: 'ALI_T1',
        amount: '10.00',
        currency: 'CNY',
      });
    });

    it.each([
      [
        'a trade that does not exist yet',
        { code: '40004', subCode: 'ACQ.TRADE_NOT_EXIST' },
        'pending',
      ],
      ['another 40004', { code: '40004', subCode: 'ACQ.SYSTEM_ERROR' }, 'unknown'],
      ['another code', { code: '20000' }, 'unknown'],
      ['another order', ok({ tradeStatus: 'TRADE_SUCCESS', outTradeNo: 'ORDER_2' }), 'unknown'],
      [
        'a missing order number',
        ok({ tradeStatus: 'TRADE_CLOSED', outTradeNo: undefined }),
        'unknown',
      ],
      ['a failed signature check or request', new Error('sign check failed'), 'unknown'],
    ])('maps %s to %s', async (_name: string, response: unknown, state: string) => {
      await expect(query(response)).resolves.toEqual({ state, orderId: 'ORDER_1' });
    });
  });

  describe('PayPal', () => {
    const query = (order: unknown, tradeId: string | null = 'PAYPAL_1') => {
      const payPalService = {
        getOrder:
          order instanceof Error
            ? jest.fn().mockRejectedValue(order)
            : jest.fn().mockResolvedValue(order),
      };
      const provider = new PaypalOfficialProvider(payPalService as any, {} as any);
      return { result: provider.queryOrder({ orderId: 'ORDER_1', tradeId }), payPalService };
    };
    const order = (
      status: string,
      captures: unknown[] = [],
      patch: Record<string, unknown> = {},
    ) => ({
      id: 'PAYPAL_1',
      status,
      purchase_units: [{ reference_id: 'ORDER_1', custom_id: 'ORDER_1', payments: { captures } }],
      ...patch,
    });
    const capture = (status: string) => ({
      id: 'CAPTURE_1',
      status,
      amount: { value: '1.39', currency_code: 'USD' },
    });

    it('returns a completed capture as paid with its own amount and the PayPal order id', async () => {
      const { result, payPalService } = query(order('COMPLETED', [capture('COMPLETED')]));
      await expect(result).resolves.toEqual({
        state: 'paid',
        orderId: 'ORDER_1',
        tradeId: 'PAYPAL_1',
        amount: '1.39',
        currency: 'USD',
      });
      expect(payPalService.getOrder).toHaveBeenCalledWith('PAYPAL_1');
    });

    it.each([
      ['CREATED', [], 'pending'],
      ['SAVED', [], 'pending'],
      ['APPROVED', [], 'pending'],
      ['PAYER_ACTION_REQUIRED', [], 'pending'],
      ['VOIDED', [], 'closed'],
      ['COMPLETED', [capture('PENDING')], 'pending'],
      ['COMPLETED', [capture('REFUNDED')], 'unknown'],
      ['COMPLETED', [capture('PARTIALLY_REFUNDED')], 'unknown'],
      ['COMPLETED', [capture('DECLINED')], 'unknown'],
      ['COMPLETED', [], 'unknown'],
      ['COMPLETED', [capture('COMPLETED'), capture('COMPLETED')], 'unknown'],
      ['SOMETHING_ELSE', [], 'unknown'],
    ])(
      'maps an order %s with captures %j to %s',
      async (status: string, captures: unknown[], state: string) => {
        await expect(query(order(status, captures)).result).resolves.toEqual({
          state,
          orderId: 'ORDER_1',
        });
      },
    );

    it.each([
      [
        'another custom_id',
        // capture 完整，只有 custom_id 不是本单
        order('COMPLETED', [capture('COMPLETED')], {
          purchase_units: [
            {
              reference_id: 'ORDER_1',
              custom_id: 'ORDER_2',
              payments: { captures: [capture('COMPLETED')] },
            },
          ],
        }),
      ],
      ['another PayPal order', order('COMPLETED', [capture('COMPLETED')], { id: 'PAYPAL_2' })],
      ['a capture without an amount', order('COMPLETED', [{ status: 'COMPLETED' }])],
    ])('treats %s as unknown', async (_name: string, response: unknown) => {
      await expect(query(response).result).resolves.toEqual({
        state: 'unknown',
        orderId: 'ORDER_1',
      });
    });

    it('cannot query without the PayPal order id saved at checkout', async () => {
      const { result, payPalService } = query(order('COMPLETED', [capture('COMPLETED')]), null);
      await expect(result).resolves.toEqual({ state: 'unknown', orderId: 'ORDER_1' });
      expect(payPalService.getOrder).not.toHaveBeenCalled();
    });

    it('lets request errors surface for the caller to treat as unknown', async () => {
      await expect(query(new Error('404')).result).rejects.toThrow('404');
    });
  });

  describe('Stripe', () => {
    const query = (session: unknown, tradeId: string | null = 'cs_1') => {
      const stripeService = {
        retrieveSessionForQuery:
          session instanceof Error
            ? jest.fn().mockRejectedValue(session)
            : jest.fn().mockResolvedValue(session),
      };
      const provider = new StripeOfficialProvider(stripeService as any, {} as any);
      return {
        result: provider.queryOrder({ orderId: 'ORDER_1', tradeId }),
        stripeService,
      };
    };
    const charge = (patch: Record<string, unknown> = {}) => ({
      id: 'ch_1',
      amount_refunded: 0,
      refunded: false,
      disputed: false,
      ...patch,
    });
    const session = (patch: Record<string, unknown> = {}) => ({
      id: 'cs_1',
      status: 'complete',
      payment_status: 'paid',
      metadata: { orderId: 'ORDER_1' },
      amount_total: 139,
      currency: 'usd',
      payment_intent: { id: 'pi_1', latest_charge: charge() },
      ...patch,
    });

    it('returns a complete, paid session without refunds or disputes as paid', async () => {
      const { result, stripeService } = query(session());
      await expect(result).resolves.toEqual({
        state: 'paid',
        orderId: 'ORDER_1',
        tradeId: 'cs_1',
        amount: '1.39',
        currency: 'usd',
      });
      expect(stripeService.retrieveSessionForQuery).toHaveBeenCalledWith('cs_1');
    });

    it.each([
      ['an open session', session({ status: 'open', payment_status: 'unpaid' }), 'pending'],
      ['a complete but unpaid session', session({ payment_status: 'unpaid' }), 'pending'],
      ['an expired session', session({ status: 'expired', payment_status: 'unpaid' }), 'closed'],
      ['no_payment_required', session({ payment_status: 'no_payment_required' }), 'unknown'],
      [
        'a partial refund',
        session({ payment_intent: { latest_charge: charge({ amount_refunded: 50 }) } }),
        'unknown',
      ],
      [
        'a full refund',
        session({
          payment_intent: { latest_charge: charge({ refunded: true, amount_refunded: 139 }) },
        }),
        'unknown',
      ],
      [
        'a dispute',
        session({ payment_intent: { latest_charge: charge({ disputed: true }) } }),
        'unknown',
      ],
      ['an unexpanded charge', session({ payment_intent: { latest_charge: 'ch_1' } }), 'unknown'],
      ['an unexpanded payment intent', session({ payment_intent: 'pi_1' }), 'unknown'],
      ['another order', session({ metadata: { orderId: 'ORDER_2' } }), 'unknown'],
      ['another session', session({ id: 'cs_2' }), 'unknown'],
      ['a missing amount', session({ amount_total: null }), 'unknown'],
    ])('maps %s to %s', async (_name: string, response: unknown, state: string) => {
      await expect(query(response).result).resolves.toEqual({ state, orderId: 'ORDER_1' });
    });

    it('cannot query without the Checkout Session id saved at checkout', async () => {
      const { result, stripeService } = query(session(), '');
      await expect(result).resolves.toEqual({ state: 'unknown', orderId: 'ORDER_1' });
      expect(stripeService.retrieveSessionForQuery).not.toHaveBeenCalled();
    });

    it('treats a failed card payment as still pending so a later success can settle', async () => {
      const stripeService = {
        handleWebhook: jest.fn().mockResolvedValue({
          type: 'payment_intent.payment_failed',
          orderId: 'ORDER_1',
          tradeId: 'pi_1',
          status: 'failed',
          amount: 1.39,
          currency: 'usd',
        }),
      };
      const provider = new StripeOfficialProvider(stripeService as any, {} as any);
      await expect(
        provider.parseNotify({
          rawParams: {},
          headers: { 'stripe-signature': 'sig' },
          rawBody: '{}',
        }),
      ).resolves.toMatchObject({ success: false, status: 'pending', orderId: 'ORDER_1' });
    });
  });
});
