import { Logger } from '@nestjs/common';
import { PaymentPollingService } from './payment-polling.service';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createService(
  overrides: {
    orderEntity?: { findOne: any };
    payService?: { getProvider: any };
    callbackService?: { processQueryResult: any };
  } = {},
) {
  const orderEntity = overrides.orderEntity ?? {
    findOne: jest.fn(),
  };
  const payService = overrides.payService ?? {
    getProvider: jest.fn(),
  };
  const callbackService = overrides.callbackService ?? {
    processQueryResult: jest.fn(),
  };

  const service = new PaymentPollingService(
    payService as any,
    callbackService as any,
    orderEntity as any,
  );

  return {
    service,
    orderEntity,
    payService,
    callbackService,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('PaymentPollingService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps initial polling non-blocking and schedules a retry after query failure', async () => {
    jest.useFakeTimers();
    const orderEntity = {
      findOne: jest.fn().mockRejectedValue(new Error('query failed')),
    };
    const { service } = createService({ orderEntity });
    const errorSpy = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);

    expect(() => service.startPolling('order_12345678')).not.toThrow();
    await flushMicrotasks();

    expect(orderEntity.findOne).toHaveBeenCalledWith({ where: { orderId: 'order_12345678' } });
    expect(errorSpy).toHaveBeenCalledWith(
      '订单轮询查询失败',
      expect.any(String),
      'PaymentPollingService',
    );
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('5678');
    expect(jest.getTimerCount()).toBe(1);

    service.stopPolling('order_12345678');

    expect(jest.getTimerCount()).toBe(0);
  });

  describe('query results', () => {
    const pendingOrder = {
      orderId: 'order_12345678',
      status: 0,
      payPlatform: 'paypal_official',
      tradeId: 'PAYPAL_ORDER',
    };
    const setup = (state: string) => {
      const queryOrder = jest.fn().mockResolvedValue({
        state,
        orderId: 'order_12345678',
        tradeId: 'PAYPAL_ORDER',
        amount: '1.39',
        currency: 'USD',
      });
      const created = createService({
        orderEntity: { findOne: jest.fn().mockResolvedValue(pendingOrder) },
        payService: { getProvider: jest.fn(() => ({ queryOrder })) },
        callbackService: { processQueryResult: jest.fn().mockResolvedValue('posted') },
      });
      return { ...created, queryOrder };
    };

    it('passes the saved channel order id and posts a paid result through the shared entry', async () => {
      jest.useFakeTimers();
      const { service, queryOrder, callbackService } = setup('paid');

      service.startPolling('order_12345678');
      await flushMicrotasks();
      await flushMicrotasks();

      expect(queryOrder).toHaveBeenCalledWith({
        orderId: 'order_12345678',
        tradeId: 'PAYPAL_ORDER',
      });
      expect(callbackService.processQueryResult).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'paid' }),
        { requestedOrderId: 'order_12345678', provider: 'paypal_official' },
      );
      expect(jest.getTimerCount()).toBe(0);
    });

    it.each(['already_paid', 'not_pending'])(
      'stops polling when posting a paid result reports %s',
      async (outcome: string) => {
        jest.useFakeTimers();
        const { service, callbackService } = setup('paid');
        callbackService.processQueryResult.mockResolvedValueOnce(outcome);

        service.startPolling('order_12345678');
        await flushMicrotasks();
        await flushMicrotasks();

        expect(callbackService.processQueryResult).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
      },
    );

    it('keeps polling when a paid result is rejected, and stops once a later one posts', async () => {
      jest.useFakeTimers();
      const { service, queryOrder, callbackService } = setup('paid');
      callbackService.processQueryResult
        .mockResolvedValueOnce('rejected')
        .mockResolvedValueOnce('posted');

      service.startPolling('order_12345678');
      await flushMicrotasks();
      await flushMicrotasks();

      // 字段或订单不符按无法确认处理：不停，按间隔继续查
      expect(callbackService.processQueryResult).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(1);

      await jest.advanceTimersByTimeAsync(1000);

      expect(queryOrder).toHaveBeenCalledTimes(2);
      expect(callbackService.processQueryResult).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('stops polling on a closed result without changing the order', async () => {
      jest.useFakeTimers();
      jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
      const { service, callbackService } = setup('closed');

      service.startPolling('order_12345678');
      await flushMicrotasks();
      await flushMicrotasks();

      expect(callbackService.processQueryResult).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

    it.each(['pending', 'unknown'])('keeps polling on a %s result', async (state: string) => {
      jest.useFakeTimers();
      const { service, callbackService } = setup(state);

      service.startPolling('order_12345678');
      await flushMicrotasks();
      await flushMicrotasks();

      expect(callbackService.processQueryResult).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(1);
      service.stopPolling('order_12345678');
    });
  });
});
