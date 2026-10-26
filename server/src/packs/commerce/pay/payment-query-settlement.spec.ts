import { Logger } from '@nestjs/common';
import { createOrder } from '../test/order.factory';
import { createPaymentProviderMock } from '../test/payment.mock';
import {
  createPaymentOrderStore,
  createPendingOrderPageFake,
  tick,
} from '../test/payment-order-store.fake';
import { PaymentCallbackService } from './payment-callback.service';
import { PaymentReconcileService } from './payment-reconcile.service';
import { PaymentProvider, PaymentQueryResult } from './payment.types';
import { StripeOfficialProvider } from './providers/stripe-official.provider';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

type Row = Record<string, any>;

const pendingOrder = (patch: Row = {}) =>
  createOrder({ id: 1, orderId: 'ORDER_1', status: 0, tradeId: null, ...patch } as any);

const paidResult = (patch: Partial<PaymentQueryResult> = {}): PaymentQueryResult => ({
  state: 'paid',
  orderId: 'ORDER_1',
  tradeId: 'TRADE_1',
  amount: '10.00',
  currency: 'CNY',
  ...patch,
});

const epayRequest = { requestedOrderId: 'ORDER_1', provider: PaymentProvider.EPAY };

/** 真实的 PaymentCallbackService + PayService；订单表与事务用可重复读替身，只替换渠道 */
function setupChain(orders: Row[], adapters: Partial<Record<PaymentProvider, unknown>> = {}) {
  const store = createPaymentOrderStore(jest.fn, orders);
  jest
    .spyOn(store.service, 'getProvider')
    .mockImplementation((provider: PaymentProvider) => adapters[provider] as any);
  const callback = new PaymentCallbackService(
    store.service,
    store.orderEntity as any,
    { findOne: jest.fn() } as any,
  );
  const reconcile = new PaymentReconcileService(
    store.service,
    callback,
    createPendingOrderPageFake(jest.fn, () => [...store.rows.values()]) as any,
  );
  return { ...store, callback, reconcile };
}

/**
 * 先拿到行锁的一方在发货前等另一方的条件更新也开始排队：两边都在对方提交前读到状态 0，
 * 竞争失败方必须经过「条件更新落空 → 加锁读到已提交的 1」这条路
 */
function holdWinnerUntilLoserQueues(chain: ReturnType<typeof setupChain>) {
  const loserQueued = deferred<void>();
  let updates = 0;
  chain.hooks.beforeUpdate = () => {
    updates += 1;
    if (updates === 2) loserQueued.resolve();
  };
  chain.userBalanceService.addBalanceToOrder.mockImplementationOnce(
    async (order: Row, manager: any) => {
      await loserQueued.promise;
      await tick();
      manager.ships.push(order.orderId);
    },
  );
  return () => updates;
}

describe('query settlement through the real posting chain', () => {
  beforeEach(() => {
    jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'debug').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts once when two query entries race: one reports posted, the other already paid', async () => {
    const chain = setupChain([pendingOrder()]);
    const updates = holdWinnerUntilLoserQueues(chain);

    const outcomes = await Promise.all([
      chain.callback.processQueryResult(paidResult(), epayRequest),
      chain.callback.processQueryResult(paidResult(), epayRequest),
    ]);

    expect(outcomes.sort()).toEqual(['already_paid', 'posted']);
    expect(updates()).toBe(2);
    expect(chain.shipped).toEqual(['ORDER_1']);
    expect(chain.rows.get('ORDER_1')).toMatchObject({ status: 1, tradeId: 'TRADE_1' });
  });

  it.each([['notification'], ['query']])(
    'posts once when a query entry and a payment notification race and the %s wins',
    async (winner: string) => {
      const epay: any = createPaymentProviderMock(jest.fn, { provider: PaymentProvider.EPAY });
      epay.parseNotify.mockResolvedValue({
        success: true,
        status: 'paid',
        orderId: 'ORDER_1',
        tradeId: 'TRADE_1',
        amount: '10.00',
        currency: 'CNY',
        responseText: 'success',
      });
      const chain = setupChain([pendingOrder()], { [PaymentProvider.EPAY]: epay });
      const updates = holdWinnerUntilLoserQueues(chain);
      const notify = () =>
        chain.callback.handleNotify({
          param: 'epay',
          pid: '1000',
          trade_no: 'TRADE_1',
          out_trade_no: 'ORDER_1',
        });
      const query = () => chain.callback.processQueryResult(paidResult(), epayRequest);

      // 胜方先进入条件更新，败方随后开始：败方读到的仍是未提交前的 0
      const first: Promise<string> = winner === 'notification' ? notify() : query();
      while (updates() < 1) await tick();
      const second: Promise<string> = winner === 'notification' ? query() : notify();
      const [winnerOutcome, loserOutcome] = await Promise.all([first, second]);

      if (winner === 'notification') {
        expect(winnerOutcome).toBe('success');
        expect(loserOutcome).toBe('already_paid');
      } else {
        expect(winnerOutcome).toBe('posted');
        expect(loserOutcome).toBe('success');
      }
      expect(updates()).toBe(2);
      expect(chain.shipped).toEqual(['ORDER_1']);
      expect(chain.rows.get('ORDER_1')).toMatchObject({ status: 1, tradeId: 'TRADE_1' });
    },
  );

  it('settles a Stripe order whose first card failed, once the reconcile query finds it paid', async () => {
    const stripeService = {
      handleWebhook: jest.fn().mockResolvedValue({
        type: 'payment_intent.payment_failed',
        orderId: 'ORDER_1',
        tradeId: 'pi_1',
        status: 'failed',
        amount: 1.39,
        currency: 'usd',
      }),
      retrieveSessionForQuery: jest.fn().mockResolvedValue({
        id: 'cs_1',
        status: 'complete',
        payment_status: 'paid',
        metadata: { orderId: 'ORDER_1' },
        amount_total: 139,
        currency: 'usd',
        payment_intent: {
          id: 'pi_2',
          latest_charge: { id: 'ch_2', amount_refunded: 0, refunded: false, disputed: false },
        },
      }),
    };
    const stripe = new StripeOfficialProvider(stripeService as any, {} as any);
    const chain = setupChain(
      [
        pendingOrder({
          payPlatform: PaymentProvider.STRIPE_OFFICIAL,
          tradeId: 'cs_1',
          payCurrencySnapshot: 'USD',
          payAmountSnapshot: 1.39,
        }),
      ],
      { [PaymentProvider.STRIPE_OFFICIAL]: stripe },
    );

    // 第一张卡失败：Webhook 映射为 pending，订单仍待支付、不标失败
    await expect(
      chain.callback.handleNotify({
        providerHint: 'stripe',
        rawParams: {},
        headers: { 'stripe-signature': 'sig' },
        rawBody: '{}',
      }),
    ).resolves.toBe('success');
    expect(chain.rows.get('ORDER_1')).toMatchObject({ status: 0, tradeId: 'cs_1' });

    // 换卡付款成功、成功通知丢失：补单按保存的 Session ID 查到 paid，经真实链路入账
    await expect(chain.reconcile.runOnce()).resolves.toBe('completed');

    expect(stripeService.retrieveSessionForQuery).toHaveBeenCalledWith('cs_1');
    expect(chain.shipped).toEqual(['ORDER_1']);
    expect(chain.rows.get('ORDER_1')).toMatchObject({ status: 1, tradeId: 'cs_1' });
    expect(Logger.log).toHaveBeenCalledWith(
      '支付补单：查到已付款，已入账',
      'PaymentReconcileService',
    );
  });

  it('settles a Stripe order through the success notification after an earlier card failed', async () => {
    const completed = {
      type: 'checkout.session.completed',
      orderId: 'ORDER_1',
      tradeId: 'cs_1',
      status: 'paid',
      amount: 1.39,
      currency: 'usd',
    };
    const stripeService = {
      handleWebhook: jest
        .fn()
        .mockResolvedValueOnce({
          type: 'payment_intent.payment_failed',
          orderId: 'ORDER_1',
          tradeId: 'pi_1',
          status: 'failed',
          amount: 1.39,
          currency: 'usd',
        })
        .mockResolvedValueOnce(completed)
        .mockResolvedValueOnce(completed),
    };
    const stripe = new StripeOfficialProvider(stripeService as any, {} as any);
    const chain = setupChain(
      [
        pendingOrder({
          payPlatform: PaymentProvider.STRIPE_OFFICIAL,
          tradeId: 'cs_1',
          payCurrencySnapshot: 'USD',
          payAmountSnapshot: 1.39,
        }),
      ],
      { [PaymentProvider.STRIPE_OFFICIAL]: stripe },
    );
    const webhook = () =>
      chain.callback.handleNotify({
        providerHint: 'stripe',
        rawParams: {},
        headers: { 'stripe-signature': 'sig' },
        rawBody: '{}',
      });

    // 第一张卡失败：不当终态，订单仍待支付、Session ID 不丢
    await expect(webhook()).resolves.toBe('success');
    expect(chain.rows.get('ORDER_1')).toMatchObject({ status: 0, tradeId: 'cs_1' });

    // 换卡成功：Checkout 完成通知经真实渠道包、回调与入账，订单 0 → 1、只发货一次、仍是 Session ID
    await expect(webhook()).resolves.toBe('success');
    expect(chain.rows.get('ORDER_1')).toMatchObject({ status: 1, tradeId: 'cs_1' });
    expect(chain.shipped).toEqual(['ORDER_1']);

    // 重复送达的成功通知不再发货
    await expect(webhook()).resolves.toBe('success');
    expect(chain.shipped).toEqual(['ORDER_1']);
    expect(stripeService.handleWebhook).toHaveBeenCalledTimes(3);
  });

  it('lets stop() wait while the posting is still reading the order, then queries nothing new', async () => {
    const epay: any = createPaymentProviderMock(jest.fn, { provider: PaymentProvider.EPAY });
    epay.queryOrder.mockImplementation(async (ctx: any) =>
      paidResult({ orderId: ctx.orderId, tradeId: `TRADE_${ctx.orderId}` }),
    );
    const chain = setupChain([pendingOrder(), pendingOrder({ id: 2, orderId: 'ORDER_2' })], {
      [PaymentProvider.EPAY]: epay,
    });
    // 入账入口的第一次读订单挂起（补单读页用的是另一个替身，这里的第一次调用就是入账段里的读取）
    const readStarted = deferred<void>();
    const readGate = deferred<void>();
    const plainRead = chain.orderEntity.findOne.getMockImplementation();
    chain.orderEntity.findOne.mockImplementationOnce(async (args: any) => {
      readStarted.resolve();
      await readGate.promise;
      return plainRead(args);
    });

    const run = chain.reconcile.runOnce();
    await readStarted.promise;
    let stopReturned = false;
    const stopped = chain.reconcile.stop().then(() => {
      stopReturned = true;
    });
    for (let i = 0; i < 5; i += 1) await tick();
    expect(stopReturned).toBe(false);
    expect(chain.rows.get('ORDER_1')?.status).toBe(0);

    readGate.resolve();
    await stopped;

    // stop() 返回时这笔入账已经提交，第二笔没有开始
    expect(chain.rows.get('ORDER_1')).toMatchObject({ status: 1, tradeId: 'TRADE_ORDER_1' });
    expect(chain.shipped).toEqual(['ORDER_1']);
    await expect(run).resolves.toBe('stopped');
    expect(epay.queryOrder).toHaveBeenCalledTimes(1);
    expect(chain.rows.get('ORDER_2')?.status).toBe(0);
  });

  it('lets stop() wait for a conditional update that already started, then queries nothing new', async () => {
    const epay: any = createPaymentProviderMock(jest.fn, { provider: PaymentProvider.EPAY });
    epay.queryOrder.mockImplementation(async (ctx: any) =>
      paidResult({ orderId: ctx.orderId, tradeId: `TRADE_${ctx.orderId}` }),
    );
    const chain = setupChain([pendingOrder(), pendingOrder({ id: 2, orderId: 'ORDER_2' })], {
      [PaymentProvider.EPAY]: epay,
    });
    const updateStarted = deferred<void>();
    const updateGate = deferred<void>();
    chain.hooks.beforeUpdate = async () => {
      updateStarted.resolve();
      await updateGate.promise;
    };

    const run = chain.reconcile.runOnce();
    await updateStarted.promise;
    let stopReturned = false;
    const stopped = chain.reconcile.stop().then(() => {
      stopReturned = true;
    });
    for (let i = 0; i < 5; i += 1) await tick();
    expect(stopReturned).toBe(false);
    expect(chain.rows.get('ORDER_1')?.status).toBe(0);

    updateGate.resolve();
    await stopped;

    // stop() 返回时这笔入账已经提交
    expect(chain.rows.get('ORDER_1')).toMatchObject({ status: 1, tradeId: 'TRADE_ORDER_1' });
    expect(chain.shipped).toEqual(['ORDER_1']);
    await expect(run).resolves.toBe('stopped');
    expect(epay.queryOrder).toHaveBeenCalledTimes(1);
    expect(chain.rows.get('ORDER_2')?.status).toBe(0);
  });
});
