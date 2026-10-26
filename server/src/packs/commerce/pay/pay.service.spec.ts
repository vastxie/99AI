import { HttpException, Logger } from '@nestjs/common';
import { createOrder, createPackage } from '../test/order.factory';
import { createPaymentOrderStore } from '../test/payment-order-store.fake';
import { PayService } from './pay.service';
import { PaymentProvider } from './payment.types';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('PayService payment safety', () => {
  let orderRepository: any;
  let userBalanceService: any;
  let service: PayService;

  beforeEach(() => {
    orderRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((handler: any) =>
        handler({
          getRepository: () => orderRepository,
        }),
      ),
    };
    userBalanceService = {
      addBalanceToOrder: jest.fn(),
    };

    service = new PayService(
      {} as any,
      { findOne: jest.fn() } as any,
      dataSource as any,
      userBalanceService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects successful delivery for failed or timeout orders', async () => {
    orderRepository.findOne.mockResolvedValue(createOrder({ status: 2 }));

    await expect(service.processSuccessfulOrder('ORDER_001')).rejects.toBeInstanceOf(HttpException);

    expect(orderRepository.update).not.toHaveBeenCalled();
    expect(userBalanceService.addBalanceToOrder).not.toHaveBeenCalled();
  });

  it('treats an order without a package id as a missing package without querying packages', async () => {
    const packageRepository = { findOne: jest.fn().mockResolvedValue(createPackage()) };
    orderRepository.findOne.mockResolvedValue(createOrder({ goodsId: null as any }));
    const payService = new PayService(
      packageRepository as any,
      orderRepository as any,
      {} as any,
      userBalanceService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      payService.createPayment(1, 'ORDER_001', 'alipay', 'pc', PaymentProvider.EPAY),
    ).rejects.toMatchObject({ message: '套餐不存在!' });

    expect(packageRepository.findOne).not.toHaveBeenCalled();
  });

  it('uses USD payment snapshot before falling back to current package price', () => {
    const amount = service.getExpectedUsdAmount(
      createOrder({
        payCurrencySnapshot: 'USD',
        payAmountSnapshot: 8.88,
      }),
      createPackage({ priceUsd: 99 }),
    );

    expect(amount).toBe('8.88');
  });

  it('logs static messages when a test payment step fails, keeping details in the admin result', async () => {
    const errorLog = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
    const warnLog = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    const pkg = createPackage();
    const query: any = {
      where: () => query,
      andWhere: () => query,
      orderBy: () => query,
      getOne: async () => pkg,
    };
    const orders = {
      create: jest.fn((value: any) => value),
      save: jest.fn().mockRejectedValueOnce(new Error('db-detail-1')).mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue({ tradeId: 'PAYPAL1' }),
      delete: jest.fn(),
    };
    const payPalService = { voidOrder: jest.fn().mockRejectedValue(new Error('void-detail-2')) };
    const payService = new PayService(
      { createQueryBuilder: () => query } as any,
      orders as any,
      {} as any,
      userBalanceService,
      {} as any,
      { resolveProvider: jest.fn().mockResolvedValue({ provider: 'paypal_official' }) } as any,
      {} as any,
      payPalService as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(payService, 'createPayment')
      .mockResolvedValue({ display: { type: 'redirect_url' } } as any);

    await expect(payService.testPayment(1, 'paypal')).resolves.toMatchObject({
      success: false,
      message: '测试订单创建失败: db-detail-1',
    });
    const second = await payService.testPayment(1, 'paypal');
    expect(second.detail).toContain('第三方清理失败: void-detail-2');

    const messages = [...errorLog.mock.calls, ...warnLog.mock.calls].map((call: any[]) => call[0]);
    expect(messages).toEqual(['测试订单创建失败', '测试订单第三方清理失败']);
    expect(errorLog.mock.calls[0][2]).toBe('PayService');
  });

  it('passes the client IP into the provider context', async () => {
    const packageRepository = { findOne: jest.fn().mockResolvedValue(createPackage()) };
    orderRepository.findOne.mockResolvedValue(createOrder());
    const payService = new PayService(
      packageRepository as any,
      orderRepository as any,
      {} as any,
      userBalanceService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const adapter = { createPayment: jest.fn(async () => ({ orderId: 'ORDER_001' })) };
    (payService as any).providers = new Map([[PaymentProvider.EPAY, adapter]]);

    await payService.createPayment(
      1,
      'ORDER_001',
      'alipay',
      'pc',
      PaymentProvider.EPAY,
      '203.0.113.9',
    );

    expect(adapter.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ORDER_001', clientIp: '203.0.113.9' }),
    );
  });
});

/**
 * 入账幂等：直接调用真实的 processSuccessfulOrder，只替换数据库与发货。替身按 MySQL 默认的可重复读建模
 * （普通读读事务快照；后到的条件更新等前一个事务提交后按最新状态判断），提交才生效、抛错整体丢弃
 */
describe('PayService.processSuccessfulOrder idempotency', () => {
  type Row = Record<string, any>;
  const createStore = (initial: Row[]) => createPaymentOrderStore(jest.fn, initial);

  beforeEach(() => {
    jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'debug').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const pendingOrder = (patch: Row = {}) =>
    createOrder({ orderId: 'ORDER_1', status: 0, tradeId: null, ...patch } as any);

  it('ships exactly once when the conditional update succeeds', async () => {
    const { service, rows, shipped } = createStore([pendingOrder()]);

    await expect(service.processSuccessfulOrder('ORDER_1', { tradeId: 'T1' })).resolves.toEqual({
      success: true,
      alreadyProcessed: false,
    });
    expect(shipped).toEqual(['ORDER_1']);
    expect(rows.get('ORDER_1')).toMatchObject({ status: 1, tradeId: 'T1' });
    expect(rows.get('ORDER_1')?.paydAt).toBeInstanceOf(Date);
  });

  it('ships once when a query result and a payment notification arrive together', async () => {
    const { service, shipped } = createStore([pendingOrder()]);

    const results = await Promise.all([
      service.processSuccessfulOrder('ORDER_1', { tradeId: 'T1' }),
      service.processSuccessfulOrder('ORDER_1', { tradeId: 'T1' }),
    ]);

    expect(shipped).toEqual(['ORDER_1']);
    // 两边都在对方提交前读到 0；竞争失败方的条件更新落空后用加锁读看到已提交的 1，报「已处理」而不是冲突
    expect(results.map(result => result.alreadyProcessed).sort()).toEqual([false, true]);
  });

  it('does not ship again for an order that is already paid', async () => {
    const { service, shipped, userBalanceService } = createStore([pendingOrder({ status: 1 })]);

    await expect(service.processSuccessfulOrder('ORDER_1', { tradeId: 'T1' })).resolves.toEqual({
      success: true,
      alreadyProcessed: true,
    });
    expect(shipped).toEqual([]);
    expect(userBalanceService.addBalanceToOrder).not.toHaveBeenCalled();
  });

  it('refuses to ship when the order changed to another status before the update', async () => {
    const { service, rows, shipped, hooks } = createStore([pendingOrder()]);
    hooks.beforeUpdate = () => Object.assign(rows.get('ORDER_1') as Row, { status: 2 });

    await expect(
      service.processSuccessfulOrder('ORDER_1', { tradeId: 'T1' }),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect(shipped).toEqual([]);
  });

  it('rolls the update back when shipping fails, so a later round can settle the order', async () => {
    const { service, rows, shipped, userBalanceService } = createStore([pendingOrder()]);
    userBalanceService.addBalanceToOrder.mockRejectedValueOnce(new Error('balance write failed'));

    await expect(service.processSuccessfulOrder('ORDER_1', { tradeId: 'T1' })).rejects.toThrow();
    expect(rows.get('ORDER_1')).toMatchObject({ status: 0, tradeId: null });
    expect(shipped).toEqual([]);

    await service.processSuccessfulOrder('ORDER_1', { tradeId: 'T1' });
    expect(shipped).toEqual(['ORDER_1']);
  });

  it('refuses a trade id that already belongs to another order', async () => {
    const { service, shipped } = createStore([
      pendingOrder(),
      createOrder({ orderId: 'ORDER_2', status: 1, tradeId: 'T1' } as any),
    ]);

    await expect(
      service.processSuccessfulOrder('ORDER_1', { tradeId: 'T1' }),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(shipped).toEqual([]);
  });
});

describe('PayService.markOrderFailed', () => {
  it('keeps the channel order id saved at checkout unless the callback brings one', async () => {
    const orderRepository = { update: jest.fn() };
    const service = new PayService(
      {} as any,
      orderRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.markOrderFailed('ORDER_1', 2);
    await service.markOrderFailed('ORDER_2', 2, 'TRADE_2');

    expect(orderRepository.update.mock.calls[0][0]).toEqual({ orderId: 'ORDER_1', status: 0 });
    expect(orderRepository.update.mock.calls[0][1]).not.toHaveProperty('tradeId');
    expect(orderRepository.update.mock.calls[1][1]).toMatchObject({
      tradeId: 'TRADE_2',
      status: 2,
    });
  });
});
