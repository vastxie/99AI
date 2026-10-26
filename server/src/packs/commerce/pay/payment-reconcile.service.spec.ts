import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter } from 'events';
import { Subject } from 'rxjs';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { UserEntity } from '@/modules/user/user.entity';
import { OrderEntity } from '../order/order.entity';
import { PackageEntity } from '../package/package.entity';
import { createOrder } from '../test/order.factory';
import { createPendingOrderPageFake } from '../test/payment-order-store.fake';
import { PayService } from './pay.service';
import { PaymentCallbackService } from './payment-callback.service';
import {
  PAYMENT_RECONCILE_INTERVAL_MS,
  PAYMENT_RECONCILE_QUERY_DEADLINE_MS,
  PaymentReconcileService,
} from './payment-reconcile.service';
import { PaymentProvider, PaymentQueryResult } from './payment.types';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const MINUTE = 60 * 1000;

/** 可控的 promise：用例决定何时、以什么结果结束 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** ageSeconds：数据库算出的年龄（秒），缺省 600；null 表示数据库没给出 */
type Row = Partial<OrderEntity> & { id: number; orderId: string; ageSeconds?: number | null };
type RowPatch = Partial<OrderEntity> & { ageSeconds?: number | null };

/** 订单表替身：只认补单任务的那一条查询（status = 0、id > 游标、按 id 升序、limit，年龄由数据库给出） */
function createOrderTable(rows: Row[]) {
  return { rows, ...createPendingOrderPageFake(jest.fn, () => rows) };
}

function order(id: number, patch: RowPatch = {}): Row {
  return {
    ...createOrder({
      id,
      orderId: `ORDER_${id}`,
      status: 0,
      payPlatform: PaymentProvider.EPAY,
      tradeId: null,
      createdAt: new Date(Date.now() - 10 * MINUTE),
      ...patch,
    } as any),
    id,
    orderId: `ORDER_${id}`,
  };
}

function paidResult(orderId: string): PaymentQueryResult {
  return { state: 'paid', orderId, tradeId: `T_${orderId}`, amount: '10.00', currency: 'CNY' };
}

function setup(rows: Row[], query?: (ctx: any, provider: string) => any) {
  const table = createOrderTable(rows);
  const queryOrder = jest.fn(async (ctx: any) => ({ state: 'pending', orderId: ctx.orderId }));
  const adapters = new Map<string, any>();
  const adapterFor = (provider: string) => {
    if (!adapters.has(provider)) {
      adapters.set(provider, {
        queryOrder: jest.fn((ctx: any) => (query ? query(ctx, provider) : queryOrder(ctx))),
      });
    }
    return adapters.get(provider);
  };
  const payService = {
    getProvider: jest.fn((provider: string) =>
      provider === 'no_query_channel' ? { createPayment: jest.fn() } : adapterFor(provider),
    ),
  };
  const callbackService = { processQueryResult: jest.fn(async () => 'posted') };
  const service = new PaymentReconcileService(
    payService as any,
    callbackService as any,
    table as any,
  );
  const queried = () =>
    [...adapters.values()].flatMap(adapter =>
      adapter.queryOrder.mock.calls.map((call: any[]) => call[0].orderId),
    );
  return { service, table, payService, callbackService, adapterFor, queried };
}

describe('PaymentReconcileService', () => {
  let originalEnabled: string | undefined;

  beforeEach(() => {
    originalEnabled = process.env.PAYMENT_RECONCILE_ENABLED;
    delete process.env.PAYMENT_RECONCILE_ENABLED;
    jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalEnabled === undefined) delete process.env.PAYMENT_RECONCILE_ENABLED;
    else process.env.PAYMENT_RECONCILE_ENABLED = originalEnabled;
  });

  describe('lifecycle', () => {
    const createHost = () => {
      const listen$ = new Subject<void>();
      const server = new EventEmitter();
      return {
        listen$,
        server,
        host: { listen$, httpAdapter: { getHttpServer: () => server } },
      };
    };

    it('starts only once the HTTP server is listening, and stops when the server closes', async () => {
      jest.useFakeTimers();
      const { listen$, server, host } = createHost();
      const { service } = setup([]);
      const reconcile = new PaymentReconcileService(
        (service as any).payService,
        (service as any).callbackService,
        (service as any).orderEntity,
        host as any,
      );
      const run = jest.spyOn(reconcile, 'runOnce');

      reconcile.onModuleInit();
      expect(jest.getTimerCount()).toBe(0);

      listen$.next();
      listen$.next();
      expect(jest.getTimerCount()).toBe(1);
      await jest.advanceTimersByTimeAsync(PAYMENT_RECONCILE_INTERVAL_MS);
      expect(run).toHaveBeenCalledTimes(1);

      server.emit('close');
      await Promise.resolve();
      expect(jest.getTimerCount()).toBe(0);
      await reconcile.onModuleDestroy();
    });

    it('stays off when PAYMENT_RECONCILE_ENABLED is false', () => {
      jest.useFakeTimers();
      process.env.PAYMENT_RECONCILE_ENABLED = 'false';
      const { listen$, host } = createHost();
      const { service } = setup([]);
      const reconcile = new PaymentReconcileService(
        (service as any).payService,
        (service as any).callbackService,
        (service as any).orderEntity,
        host as any,
      );

      reconcile.onModuleInit();
      listen$.next();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('treats stop() as final: it never starts again and runs nothing', async () => {
      jest.useFakeTimers();
      const { service, queried } = setup([order(1)]);

      await service.stop();
      service.start();

      expect(jest.getTimerCount()).toBe(0);
      await expect(service.runOnce()).resolves.toBe('skipped');
      expect(queried()).toEqual([]);
    });

    it('is built but never started in an application context without an HTTP server, and close() stops it', async () => {
      jest.useFakeTimers();
      const stop = jest.spyOn(PaymentReconcileService.prototype, 'stop');
      const table = createOrderTable([order(1)]);
      @Module({
        providers: [
          PaymentReconcileService,
          { provide: PayService, useValue: { getProvider: jest.fn() } },
          { provide: PaymentCallbackService, useValue: { processQueryResult: jest.fn() } },
          { provide: getRepositoryToken(OrderEntity), useValue: table },
        ],
      })
      class ReconcileOnlyModule {}

      const context = await NestFactory.createApplicationContext(ReconcileOnlyModule, {
        logger: false,
      });
      expect(context.get(PaymentReconcileService)).toBeInstanceOf(PaymentReconcileService);
      expect(jest.getTimerCount()).toBe(0);

      await context.close();
      expect(stop).toHaveBeenCalledTimes(1);
      expect(table.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('selection', () => {
    it('queries only pending orders created 5 minutes to 24 hours ago through channels that can query', async () => {
      const { service, queried, payService } = setup([
        order(1, { payPlatform: PaymentProvider.WECHAT_OFFICIAL }),
        order(2, { ageSeconds: 2 * 60 }),
        order(3, { ageSeconds: 25 * 60 * 60 }),
        order(4, { payPlatform: PaymentProvider.STRIPE_OFFICIAL, tradeId: 'cs_4' }),
        order(5, { payPlatform: 'no_query_channel' }),
        order(6, { payPlatform: null as any }),
        order(7, { status: 1 }),
      ]);

      await expect(service.runOnce()).resolves.toBe('completed');

      expect(queried().sort()).toEqual(['ORDER_1', 'ORDER_4']);
      const stripe = payService.getProvider(PaymentProvider.STRIPE_OFFICIAL);
      expect(stripe.queryOrder).toHaveBeenCalledWith({ orderId: 'ORDER_4', tradeId: 'cs_4' });
    });

    it.each(['UTC', 'Asia/Shanghai'])(
      'judges age only by the database clock (Node TZ %s), whatever createdAt looks like in Node',
      async (timeZone: string) => {
        const originalTz = process.env.TZ;
        process.env.TZ = timeZone;
        try {
          const now = Date.now();
          const { service, queried } = setup([
            // 会话时区与 Node 不一致时 createdAt 在 Node 看来可能在未来或很久以前：只认数据库给的年龄
            order(1, { ageSeconds: 10 * 60, createdAt: new Date(now + 8 * 60 * MINUTE) }),
            order(2, { ageSeconds: 2 * 60, createdAt: new Date(now - 10 * MINUTE) }),
            order(3, { ageSeconds: 25 * 60 * 60, createdAt: new Date(now - 10 * MINUTE) }),
            order(4, { ageSeconds: null }),
            // 边界：满 5 分钟与满 24 小时都算，差 1 秒不算
            order(5, { ageSeconds: 5 * 60 }),
            order(6, { ageSeconds: 24 * 60 * 60 }),
            order(7, { ageSeconds: 5 * 60 - 1 }),
            order(8, { ageSeconds: 24 * 60 * 60 + 1 }),
          ]);

          await service.runOnce();

          expect(queried()).toEqual(['ORDER_1', 'ORDER_5', 'ORDER_6']);
        } finally {
          if (originalTz === undefined) delete process.env.TZ;
          else process.env.TZ = originalTz;
        }
      },
    );

    it('posts only paid results, through the shared entry with the trusted request', async () => {
      const states: Record<string, string> = {
        ORDER_1: 'pending',
        ORDER_2: 'closed',
        ORDER_3: 'unknown',
        ORDER_4: 'paid',
      };
      const { service, callbackService } = setup(
        [order(1), order(2), order(3), order(4)],
        (ctx: any) =>
          Promise.resolve(
            states[ctx.orderId] === 'paid'
              ? paidResult(ctx.orderId)
              : { state: states[ctx.orderId], orderId: ctx.orderId },
          ),
      );

      await service.runOnce();

      expect(callbackService.processQueryResult).toHaveBeenCalledTimes(1);
      expect(callbackService.processQueryResult).toHaveBeenCalledWith(paidResult('ORDER_4'), {
        requestedOrderId: 'ORDER_4',
        provider: PaymentProvider.EPAY,
      });
    });

    it('keeps going after a failed query or a failed posting', async () => {
      const { service, callbackService, queried } = setup(
        [order(1), order(2), order(3)],
        (ctx: any) =>
          ctx.orderId === 'ORDER_1'
            ? Promise.reject(new Error('channel down'))
            : Promise.resolve(paidResult(ctx.orderId)),
      );
      callbackService.processQueryResult.mockRejectedValueOnce(new Error('posting failed'));

      await expect(service.runOnce()).resolves.toBe('completed');

      expect(queried()).toEqual(['ORDER_1', 'ORDER_2', 'ORDER_3']);
      expect(callbackService.processQueryResult).toHaveBeenCalledTimes(2);
    });
  });

  describe('page query', () => {
    it('asks MySQL for the age with its own clock, filtered by status and the primary-key cursor', async () => {
      const source = new DataSource({
        type: 'mysql',
        database: 'offline_reconcile',
        entities: [OrderEntity, UserEntity, PackageEntity],
      });
      await (source as any).buildMetadatas();
      const executed: Array<[string, unknown[]]> = [];
      jest.spyOn(SelectQueryBuilder.prototype, 'getRawAndEntities').mockImplementation(function (
        this: any,
      ) {
        executed.push(this.getQueryAndParameters());
        return Promise.resolve({
          raw: [{ pending_id: 7, reconcile_age_seconds: '600' }],
          entities: [Object.assign(new OrderEntity(), order(7))],
        });
      });
      const { service, queried } = setup([]);
      const reconcile = new PaymentReconcileService(
        (service as any).payService,
        (service as any).callbackService,
        source.getRepository(OrderEntity),
      );

      await reconcile.runOnce();
      await reconcile.runOnce();

      const [sql, parameters] = executed[0];
      expect(sql).toContain(
        'TIMESTAMPDIFF(SECOND, `pending`.`createdAt`, NOW()) AS `reconcile_age_seconds`',
      );
      expect(sql).toContain('FROM `order` `pending`');
      expect(sql).toContain('`pending`.`status` = ?');
      expect(sql).toContain('`pending`.`id` > ?');
      // 软删除列照常过滤（与原来的 find 一致）
      expect(sql).toContain('`pending`.`deletedAt` IS NULL');
      expect(sql).toMatch(/ORDER BY `pending`.`id` ASC LIMIT 100$/);
      expect(parameters).toEqual([0, 0]);
      // 只读到 1 行（不满一页）：查完回绕，下一轮游标仍从 0 开始
      expect(executed[1][1]).toEqual([0, 0]);
      expect(queried()).toEqual(['ORDER_7', 'ORDER_7']);
    });

    it('keeps the cursor on the last checked row while a full page is being read', async () => {
      const rows = Array.from({ length: 120 }, (_, index) => order(index + 1, { ageSeconds: 60 }));
      const { service, table } = setup(rows);

      await service.runOnce();
      await service.runOnce();
      await service.runOnce();

      expect(table.reads.map(read => read.params)).toEqual([
        { status: 0, cursor: 0 },
        { status: 0, cursor: 100 },
        { status: 0, cursor: 0 },
      ]);
      expect(table.reads.every(read => read.limit === 100)).toBe(true);
    });
  });

  describe('fair pagination', () => {
    it.each([
      [21, 2],
      [100, 5],
      [101, 6],
    ])(
      'reaches each of %i always-pending orders within %i rounds, at most 20 per round',
      async (count: number, rounds: number) => {
        const rows = Array.from({ length: count }, (_, index) => order(index + 1));
        const { service, queried } = setup(rows);
        const perRound: number[] = [];

        for (let round = 0; round < rounds; round += 1) {
          const before = queried().length;
          await service.runOnce();
          perRound.push(queried().length - before);
        }

        expect(new Set(queried()).size).toBe(count);
        expect(Math.max(...perRound)).toBeLessThanOrEqual(20);
        // 读到末尾才回绕：下一轮从第一笔开始
        await service.runOnce();
        expect(queried().slice(-Math.min(20, count))[0]).toBe('ORDER_1');
      },
    );

    it('moves the cursor past rows it only checked (not eligible) so they do not block the scan', async () => {
      // 前 150 笔太新（还在短轮询的 5 分钟里），超过一页；第 151 笔符合条件
      const rows = [
        ...Array.from({ length: 150 }, (_, index) => order(index + 1, { ageSeconds: 60 })),
        order(151),
      ];
      const { service, queried } = setup(rows);

      await service.runOnce();
      expect(queried()).toEqual([]);
      await service.runOnce();
      expect(queried()).toEqual(['ORDER_151']);
    });
  });

  describe('deadlines and stopping', () => {
    it('discards a result that arrives after the 15-second deadline', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      const late = deferred<PaymentQueryResult>();
      const { service, callbackService } = setup([order(1), order(2)], (ctx: any) =>
        ctx.orderId === 'ORDER_1' ? late.promise : Promise.resolve(paidResult(ctx.orderId)),
      );

      const run = service.runOnce();
      await jest.advanceTimersByTimeAsync(PAYMENT_RECONCILE_QUERY_DEADLINE_MS);
      await expect(run).resolves.toBe('completed');
      late.resolve(paidResult('ORDER_1'));
      await jest.advanceTimersByTimeAsync(1000);

      expect(callbackService.processQueryResult).toHaveBeenCalledTimes(1);
      expect(callbackService.processQueryResult).toHaveBeenCalledWith(
        paidResult('ORDER_2'),
        expect.anything(),
      );
    });

    it('discards a result that arrives after the deadline even before the deadline timer fires', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      const { service, callbackService } = setup([order(1)], (ctx: any) => {
        // 时钟越过期限，但不推进计时器：结果先于期限计时器到达，只能靠到达时的同步检查拦下
        jest.setSystemTime(Date.now() + PAYMENT_RECONCILE_QUERY_DEADLINE_MS + 1);
        return Promise.resolve(paidResult(ctx.orderId));
      });

      await expect(service.runOnce()).resolves.toBe('completed');

      expect(callbackService.processQueryResult).not.toHaveBeenCalled();
      expect((Logger.warn as any).mock.calls.map((call: any[]) => call[0])).toContain(
        '支付补单：查单超时或本轮已结束，丢弃这次结果',
      );
    });

    it('returns from stop() while the page read is still pending, and the round then queries nothing', async () => {
      const read = deferred<void>();
      const { service, table, queried } = setup([order(1), order(2)]);
      table.hooks.beforeRead = () => read.promise;

      const run = service.runOnce();
      await new Promise(resolve => setImmediate(resolve));
      expect(table.reads).toHaveLength(1);
      await service.stop();

      read.resolve();
      await expect(run).resolves.toBe('stopped');
      expect(queried()).toEqual([]);
    });

    it('discards a result that was still in flight when stop() was called', async () => {
      const pending = deferred<PaymentQueryResult>();
      const { service, callbackService, queried } = setup([order(1), order(2)], (ctx: any) =>
        ctx.orderId === 'ORDER_1' ? pending.promise : Promise.resolve(paidResult(ctx.orderId)),
      );

      const run = service.runOnce();
      await new Promise(resolve => setImmediate(resolve));
      const stopped = service.stop();
      pending.resolve(paidResult('ORDER_1'));
      await stopped;

      await expect(run).resolves.toBe('stopped');
      expect(callbackService.processQueryResult).not.toHaveBeenCalled();
      expect(queried()).toEqual(['ORDER_1']);
    });

    it('lets a posting that already started finish before stop() returns, then starts nothing new', async () => {
      const posting = deferred<string>();
      const { service, callbackService, queried } = setup([order(1), order(2)], (ctx: any) =>
        Promise.resolve(paidResult(ctx.orderId)),
      );
      callbackService.processQueryResult.mockImplementationOnce(() => posting.promise);

      const run = service.runOnce();
      while (callbackService.processQueryResult.mock.calls.length === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
      let stopReturned = false;
      const stopped = service.stop().then(() => {
        stopReturned = true;
      });
      for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve));
      expect(stopReturned).toBe(false);

      posting.resolve('posted');
      await stopped;
      expect(stopReturned).toBe(true);
      await expect(run).resolves.toBe('stopped');
      expect(queried()).toEqual(['ORDER_1']);
    });

    it('skips a timer tick that overlaps a running round', async () => {
      const pending = deferred<PaymentQueryResult>();
      const { service } = setup([order(1)], () => pending.promise);

      const first = service.runOnce();
      await expect(service.runOnce()).resolves.toBe('skipped');
      pending.resolve({ state: 'pending', orderId: 'ORDER_1' });
      await expect(first).resolves.toBe('completed');
    });

    it('drops a result from an earlier round that arrives during a later round', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      const stale = deferred<PaymentQueryResult>();
      let calls = 0;
      const { service, callbackService } = setup([order(1)], (ctx: any) => {
        calls += 1;
        return calls === 1
          ? stale.promise
          : Promise.resolve({ state: 'pending', orderId: ctx.orderId });
      });

      const first = service.runOnce();
      await jest.advanceTimersByTimeAsync(PAYMENT_RECONCILE_QUERY_DEADLINE_MS);
      await first;
      const second = service.runOnce();
      stale.resolve(paidResult('ORDER_1'));
      await second;
      await jest.advanceTimersByTimeAsync(1000);

      expect(callbackService.processQueryResult).not.toHaveBeenCalled();
    });

    it('stops starting new orders once the 5-minute round budget is spent', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      const rows = Array.from({ length: 10 }, (_, index) => order(index + 1));
      const { service, queried } = setup(rows, (ctx: any) => {
        // 每笔耗时 100 秒（查询本身仍在期限内返回，期限按调用时刻计算）
        jest.setSystemTime(Date.now() + 100_000);
        return Promise.resolve({ state: 'pending', orderId: ctx.orderId });
      });

      await expect(service.runOnce()).resolves.toBe('budget_reached');
      expect(queried()).toEqual(['ORDER_1', 'ORDER_2', 'ORDER_3']);

      // 下一轮从第 4 笔接着查
      jest.setSystemTime(Date.now());
      await service.runOnce();
      expect(queried()[3]).toBe('ORDER_4');
    });
  });

  describe('WeChat in-flight limit', () => {
    it('skips WeChat orders while three WeChat queries are still in flight, keeps other channels going, and recovers', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      const hanging = [
        deferred<PaymentQueryResult>(),
        deferred<PaymentQueryResult>(),
        deferred<PaymentQueryResult>(),
      ];
      let wechatCalls = 0;
      const rows = [
        order(1, { payPlatform: PaymentProvider.WECHAT_OFFICIAL }),
        order(2, { payPlatform: PaymentProvider.WECHAT_OFFICIAL }),
        order(3, { payPlatform: PaymentProvider.WECHAT_OFFICIAL }),
        order(4, { payPlatform: PaymentProvider.WECHAT_OFFICIAL }),
        order(5),
      ];
      const { service, queried } = setup(rows, (ctx: any, provider: string) => {
        if (provider !== PaymentProvider.WECHAT_OFFICIAL) {
          return Promise.resolve({ state: 'pending', orderId: ctx.orderId });
        }
        wechatCalls += 1;
        return wechatCalls <= 3
          ? hanging[wechatCalls - 1].promise
          : Promise.resolve({ state: 'pending', orderId: ctx.orderId });
      });

      const run = service.runOnce();
      for (let i = 0; i < 3; i += 1) {
        await jest.advanceTimersByTimeAsync(PAYMENT_RECONCILE_QUERY_DEADLINE_MS);
      }
      await expect(run).resolves.toBe('completed');

      expect(queried()).toEqual(['ORDER_1', 'ORDER_2', 'ORDER_3', 'ORDER_5']);
      expect((Logger.warn as any).mock.calls.map((call: any[]) => call[0])).toContain(
        '支付补单：微信查单在途已满，本轮跳过部分微信订单',
      );

      // 底层请求结束后名额释放，下一轮恢复查询微信订单
      hanging.forEach(item => item.resolve({ state: 'pending', orderId: 'x' }));
      await jest.advanceTimersByTimeAsync(0);
      await service.runOnce();
      expect(queried().filter(id => id === 'ORDER_4')).toHaveLength(1);
    });
  });
});
