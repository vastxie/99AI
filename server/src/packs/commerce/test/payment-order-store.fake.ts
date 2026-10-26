import { PayService } from '../pay/pay.service';

type AnyFunction = (...args: any[]) => any;
/** jest.fn：传入实现，返回可断言的替身 */
type MockFactory = (implementation?: AnyFunction) => any;
type Row = Record<string, any>;

/** 让出一轮事件循环：并发的入账链路在这里交错 */
export const tick = () => new Promise(resolve => setImmediate(resolve));

const matches = (row: Row, where: Row) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

/**
 * 订单表与事务的内存替身，配真实的 PayService，按 MySQL InnoDB 默认的可重复读建模：
 * - 事务里第一次普通读时拍快照，之后的普通读都读这份快照（叠加本事务自己的更新）；
 * - 带 lock 的读与条件更新读最新已提交的行（当前读）；条件更新按订单号排队，锁持有到事务结束；
 * - 事务提交时写入更新与发货，抛错时全部丢弃（回滚）。
 * hooks.beforeUpdate 在条件更新排队之前调用，可以改行或挂起（模拟另一方抢先或数据库变慢）。
 * 适用范围：带 lock 的读只返回最新已提交的行，不取锁、不等待；事务外的 update 只等调用时已排队的事务。
 * 这足以覆盖入账的「先条件更新持锁、再加锁复查」路径；「先加锁读再更新」或事务外更新与事务交错的
 * 场景需要先补齐锁建模，不要直接用它。
 */
export function createPaymentOrderStore(fn: MockFactory, initial: Row[]) {
  const rows = new Map(initial.map(row => [row.orderId, { ...row }]));
  const shipped: string[] = [];
  const updateLocks = new Map<string, Promise<void>>();
  const hooks: { beforeUpdate?: (criteria: Row) => unknown } = {};
  const committed = (where: Row) => [...rows.values()].find(row => matches(row, where));

  const orderEntity = {
    findOne: fn(async ({ where }: any) => {
      await tick();
      const row = committed(where);
      return row ? { ...row } : null;
    }),
    /** 事务外的单条条件更新（如标记失败）：等这笔订单上排队的事务结束后按最新状态判断，自动提交 */
    update: fn(async (criteria: Row, patch: Row) => {
      await (updateLocks.get(criteria.orderId) || Promise.resolve());
      await tick();
      const row = rows.get(criteria.orderId);
      const hit = Boolean(row && matches(row, criteria));
      if (hit) Object.assign(row as Row, patch);
      return { affected: hit ? 1 : 0 };
    }),
  };

  const dataSource = {
    transaction: async (handler: (manager: any) => Promise<any>) => {
      let snapshot: Row[] | null = null;
      const patches: Array<[string, Row]> = [];
      const ships: string[] = [];
      const releases: Array<() => void> = [];
      const withOwnPatches = (row: Row) =>
        Object.assign(
          { ...row },
          ...patches.filter(([orderId]) => orderId === row.orderId).map(([, patch]) => patch),
        );
      const repository = {
        findOne: async ({ where, lock }: any) => {
          await tick();
          let row: Row | undefined;
          if (lock) {
            row = committed(where);
          } else {
            snapshot ??= [...rows.values()].map(item => ({ ...item }));
            row = snapshot.find(item => matches(item, where));
          }
          return row ? withOwnPatches(row) : null;
        },
        update: async (criteria: Row, patch: Row) => {
          await hooks.beforeUpdate?.(criteria);
          const previous = updateLocks.get(criteria.orderId) || Promise.resolve();
          let release: () => void = () => undefined;
          const current = new Promise<void>(resolve => {
            release = resolve;
          });
          updateLocks.set(
            criteria.orderId,
            previous.then(() => current),
          );
          await previous;
          releases.push(release);
          await tick();
          const row = rows.get(criteria.orderId);
          const hit = Boolean(row && matches(row, criteria));
          if (hit) patches.push([criteria.orderId, patch]);
          return { affected: hit ? 1 : 0 };
        },
      };
      const manager = { getRepository: () => repository, ships };
      try {
        const result = await handler(manager);
        for (const [orderId, patch] of patches) Object.assign(rows.get(orderId) as Row, patch);
        shipped.push(...ships);
        return result;
      } finally {
        releases.forEach(release => release());
      }
    },
  };

  const userBalanceService = {
    addBalanceToOrder: fn(async (order: Row, manager: any) => {
      await tick();
      manager.ships.push(order.orderId);
    }),
  };

  const service = new PayService(
    {} as any,
    orderEntity as any,
    dataSource as any,
    userBalanceService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, rows, shipped, hooks, orderEntity, userBalanceService };
}

/**
 * 补单任务读待支付订单的那一条查询的替身：按 createQueryBuilder 链上的参数（status、cursor、limit）
 * 从 getRows() 里取行；年龄由「数据库」给出——行上的 ageSeconds（缺省 600 秒），以字符串返回
 * （与 TypeORM 默认把 BIGINT 读成字符串一致），与行上的 createdAt 无关。
 * hooks.beforeRead 可以挂起读取（模拟数据库变慢）。
 */
export function createPendingOrderPageFake(fn: MockFactory, getRows: () => Row[]) {
  const hooks: { beforeRead?: () => void | Promise<void> } = {};
  const reads: Array<{ alias: string; selects: unknown[][]; params: Row; limit?: number }> = [];
  const createQueryBuilder = fn((alias: string) => {
    const read = {
      alias,
      selects: [] as unknown[][],
      params: {} as Row,
      limit: undefined as number | undefined,
    };
    const builder: Row = {
      addSelect: (...args: unknown[]) => {
        read.selects.push(args);
        return builder;
      },
      where: (_condition: string, params: Row = {}) => {
        Object.assign(read.params, params);
        return builder;
      },
      andWhere: (_condition: string, params: Row = {}) => {
        Object.assign(read.params, params);
        return builder;
      },
      orderBy: () => builder,
      limit: (limit: number) => {
        read.limit = limit;
        return builder;
      },
      getRawAndEntities: async () => {
        reads.push(read);
        await hooks.beforeRead?.();
        const page = getRows()
          .filter(row => row.status === read.params.status && row.id > read.params.cursor)
          .sort((a, b) => a.id - b.id)
          .slice(0, read.limit);
        return {
          entities: page.map(({ ageSeconds: _age, ...entity }) => ({ ...entity })),
          raw: page.map(row => ({
            [`${alias}_id`]: row.id,
            reconcile_age_seconds: row.ageSeconds === null ? null : String(row.ageSeconds ?? 600),
          })),
        };
      },
    };
    return builder;
  });
  return { createQueryBuilder, reads, hooks };
}
