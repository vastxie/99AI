import { HttpException } from '@nestjs/common';
import { createPackage, createOrder } from '../test/order.factory';
import { createMockQueryBuilder } from '@/test/mocks/repository.mock';
import { PaymentProvider } from '../pay/payment.types';
import { OrderService } from './order.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('OrderService payment order safety', () => {
  let orderRepository: any;
  let packageRepository: any;
  let userBalanceRepository: any;
  let service: OrderService;

  beforeEach(() => {
    orderRepository = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    packageRepository = {
      findOne: jest.fn(),
    };
    userBalanceRepository = {
      findOne: jest.fn(),
    };
    service = new OrderService(
      orderRepository,
      packageRepository,
      userBalanceRepository,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('rejects zero-price packages before creating local payment orders', async () => {
    packageRepository.findOne.mockResolvedValue(createPackage({ price: 0 }));

    await expect(
      service.createOrder(1, 1, 1, 'alipay', PaymentProvider.EPAY),
    ).rejects.toBeInstanceOf(HttpException);
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('creates orders with plan and variant snapshots for the concrete package id', async () => {
    const pkg = createPackage({
      id: 9,
      planKey: 'pro',
      planName: '专业版',
      variantName: '年付',
      planType: 'membership',
      billingCycle: 'year',
      billingCycleCount: 1,
      featureText: '权益 A',
      price: 199,
      credits: 1000,
      days: 365,
    });
    packageRepository.findOne.mockResolvedValue(pkg);
    orderRepository.save.mockImplementation(async (payload: any) => ({ id: 99, ...payload }));

    const order = await service.createOrder(1, 9, 1, 'alipay', PaymentProvider.EPAY);

    expect(packageRepository.findOne).toHaveBeenCalledWith({ where: { id: 9, status: 1 } });
    expect(order.goodsId).toBe(9);
    expect(order.pkgNameSnapshot).toBe('专业版 年付');
    expect(order.planKeySnapshot).toBe('pro');
    expect(order.planNameSnapshot).toBe('专业版');
    expect(order.variantNameSnapshot).toBe('年付');
    expect(order.planTypeSnapshot).toBe('membership');
    expect(order.weightSnapshot).toBe(1);
    expect(order.billingCycleSnapshot).toBe('year');
    expect(order.billingCycleCountSnapshot).toBe(1);
    expect(order.featureTextSnapshot).toBe('权益 A');
  });

  it('rejects batch purchase counts for membership packages', async () => {
    packageRepository.findOne.mockResolvedValue(
      createPackage({ planType: 'membership', days: 30 }),
    );

    await expect(
      service.createOrder(1, 1, 2, 'alipay', PaymentProvider.EPAY),
    ).rejects.toBeInstanceOf(HttpException);
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('rejects lower-tier membership packages while a higher membership is active', async () => {
    packageRepository.findOne
      .mockResolvedValueOnce(createPackage({ id: 2, weight: 1, planType: 'membership', days: 30 }))
      .mockResolvedValueOnce(createPackage({ id: 9, weight: 3, planType: 'membership', days: 30 }));
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      packageId: 9,
      expirationTime: new Date('2026-12-01T00:00:00.000Z'),
    });

    await expect(
      service.createOrder(1, 2, 1, 'alipay', PaymentProvider.EPAY),
    ).rejects.toBeInstanceOf(HttpException);
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('allows credit packs while a higher membership is active', async () => {
    packageRepository.findOne.mockResolvedValue(
      createPackage({ id: 8, weight: 0, planType: 'credit_pack', days: 0, price: 10 }),
    );
    orderRepository.save.mockImplementation(async (payload: any) => ({ id: 99, ...payload }));

    const order = await service.createOrder(1, 8, 1, 'alipay', PaymentProvider.EPAY);

    expect(order.goodsId).toBe(8);
    expect(userBalanceRepository.findOne).not.toHaveBeenCalled();
  });

  it('strips raw user and package relations from admin order list response', async () => {
    const order = createOrder({
      user: {
        id: 34,
        username: 'viewer',
        email: 'viewer@example.com',
        openId: 'OPEN_ID_SHOULD_NOT_LEAK',
        unionId: 'UNION_ID_SHOULD_NOT_LEAK',
        lastLoginIp: '127.0.0.1',
      } as any,
      package: createPackage({
        id: 7,
        name: 'Pro',
        coverImg: '/file/pkg.png',
        des: 'Pro package',
      } as any),
    });

    const listBuilder = createMockQueryBuilder({ manyAndCount: [[order], 1] });
    const totalBuilder = createMockQueryBuilder({ rawOne: { total_price: '10.00' } });
    orderRepository.createQueryBuilder
      .mockReturnValueOnce(listBuilder)
      .mockReturnValueOnce(totalBuilder);

    const result = await service.queryAllOrder({ page: 1, size: 10 } as any);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].user).toBeUndefined();
    expect(result.rows[0].package).toBeUndefined();
    expect(result.rows[0].userInfo).toEqual({
      id: 34,
      username: 'viewer',
      email: 'viewer@example.com',
    });
    expect(result.rows[0].goodsInfo).toEqual({
      id: 7,
      name: 'Pro',
      coverImg: '/file/pkg.png',
      des: 'Pro package',
    });
    expect(JSON.stringify(result.rows[0])).not.toContain('OPEN_ID_SHOULD_NOT_LEAK');
    expect(JSON.stringify(result.rows[0])).not.toContain('UNION_ID_SHOULD_NOT_LEAK');
  });
});

describe('OrderService registered-user boundary', () => {
  const visitorRequest = {
    user: { uid: 'visitor-uid', id: 'visitor:abc123', username: '游客', role: 'visitor' },
  } as any;

  function createBuyService() {
    const orderRepository = { findOne: jest.fn(), save: jest.fn() };
    const payService = {
      createPayment: jest.fn().mockResolvedValue({ provider: PaymentProvider.EPAY }),
      markOrderFailed: jest.fn(),
    };
    const paymentConfigService = {
      resolveProvider: jest.fn().mockResolvedValue({ provider: PaymentProvider.EPAY }),
      getAvailablePaymentMethods: jest.fn().mockResolvedValue([]),
      shouldEnablePolling: jest.fn().mockResolvedValue(false),
    };
    const service = new OrderService(
      orderRepository as any,
      {} as any,
      {} as any,
      payService as any,
      { startPolling: jest.fn() } as any,
      paymentConfigService as any,
    );
    const createOrder = jest
      .spyOn(service, 'createOrder')
      .mockResolvedValue({ orderId: 'ORDER0001', total: 10 } as any);
    return { service, orderRepository, payService, paymentConfigService, createOrder };
  }

  it('refuses visitors with 403 before resolving a payment channel or creating an order', async () => {
    const { service, paymentConfigService, createOrder } = createBuyService();

    let thrown: any;
    try {
      await service.buy({ goodsId: 9, method: 'alipay' } as any, visitorRequest);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect(thrown.getStatus()).toBe(403);
    expect(thrown.message).toBe('该功能需要登录正式账号');
    expect(paymentConfigService.resolveProvider).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('creates orders for any registered numeric id, including ids above one million', async () => {
    const { service, payService, createOrder } = createBuyService();

    await service.buy(
      { goodsId: 9, method: 'alipay' } as any,
      {
        user: { uid: 'AbC123xYz789', id: 1000001, role: 'user' },
        headers: { 'x-forwarded-for': '198.51.100.7' },
        socket: { remoteAddress: '203.0.113.9' },
      } as any,
    );

    expect(createOrder).toHaveBeenCalledWith(1000001, 9, 1, 'alipay', PaymentProvider.EPAY);
    // 下单请求的客户端 IP 传给支付渠道：直连（对端不是可信代理）时不采信转发头
    expect(payService.createPayment).toHaveBeenCalledWith(
      1000001,
      'ORDER0001',
      'alipay',
      'pc',
      PaymentProvider.EPAY,
      '203.0.113.9',
    );
  });

  it('passes the forwarded client IP when the order arrives through the local proxy', async () => {
    const { service, payService } = createBuyService();

    await service.buy(
      { goodsId: 9, method: 'alipay' } as any,
      {
        user: { uid: 'AbC123xYz789', id: 42, role: 'user' },
        headers: { 'x-forwarded-for': '198.51.100.7' },
        socket: { remoteAddress: '::ffff:127.0.0.1' },
      } as any,
    );

    expect(payService.createPayment).toHaveBeenCalledWith(
      42,
      'ORDER0001',
      'alipay',
      'pc',
      PaymentProvider.EPAY,
      '198.51.100.7',
    );
  });

  it('looks orders up by the numeric owner id and refuses visitors', async () => {
    const { service, orderRepository } = createBuyService();
    orderRepository.findOne.mockResolvedValue({ orderId: 'ORDER0001', userId: 42 });

    await expect(
      service.queryByOrderId(
        { user: { id: 42, role: 'user' } } as any,
        {
          orderId: 'ORDER0001',
        } as any,
      ),
    ).resolves.toMatchObject({ orderId: 'ORDER0001' });
    expect(orderRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 42, orderId: 'ORDER0001' },
    });

    await expect(
      service.queryByOrderId(visitorRequest, { orderId: 'ORDER0001' } as any),
    ).rejects.toMatchObject({ status: 403 });
    expect(orderRepository.findOne).toHaveBeenCalledTimes(1);
  });
});
