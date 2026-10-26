/**
 * 支付补单与入账竞争的真实 MySQL 验收：由 fb-reconcile-mysql.mjs 启动；目标库必须是空的隔离测试库（见该脚本说明）。
 */
import { DataSource, QueryRunner } from 'typeorm';
import { UserEntity } from '../../src/modules/user/user.entity';
import { OrderEntity } from '../../src/packs/commerce/order/order.entity';
import { PackageEntity } from '../../src/packs/commerce/package/package.entity';
import { PayService } from '../../src/packs/commerce/pay/pay.service';
import { PaymentReconcileService } from '../../src/packs/commerce/pay/payment-reconcile.service';

declare const afterAll: any;
declare const beforeAll: any;
declare const describe: any;
declare const expect: any;
declare const it: any;

const ROUNDS = 8;
/** 发货时停一下：持锁的一方停住，另一条连接的条件更新一定排在它后面 */
const HOLD_MS = 200;
const TIMEOUT_MS = 120_000;
const SHIPMENTS = 'fb_check_shipments';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const report = (line: string) => process.stdout.write(`[F-b] ${line}\n`);

/** 与生产数据源相同的日期换算（timezone '+08:00'）；只开一条连接，会话时区设置对之后的查询都有效 */
const dataSource = () =>
  new DataSource({
    type: 'mysql',
    url: process.env.FB_MYSQL_URL,
    entities: [OrderEntity, UserEntity, PackageEntity],
    synchronize: false,
    charset: 'utf8mb4',
    timezone: '+08:00',
    poolSize: 1,
  });

/** 真实的 PayService：发货改为在同一事务里写一行发货记录（随事务提交或回滚） */
const payServiceOn = (source: DataSource) =>
  new PayService(
    source.getRepository(PackageEntity),
    source.getRepository(OrderEntity),
    source,
    {
      addBalanceToOrder: async (order: OrderEntity, manager: any) => {
        await sleep(HOLD_MS);
        await manager.query(`INSERT INTO \`${SHIPMENTS}\` (orderId) VALUES (?)`, [order.orderId]);
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

describe('F-b on a real MySQL', () => {
  const sourceA = dataSource();
  const sourceB = dataSource();
  /** 确认是空库之后才置位：只有这时才允许建表、写数据与清理（误指向已有库时什么都不写） */
  let ownsDatabase = false;
  let ready = false;
  let createdTables: string[] = [];
  const assertReady = () => {
    if (!ready) throw new Error('前置检查没有通过：本用例不对数据库做任何写入');
  };

  const seedOrder = async (source: DataSource, orderId: string, ageSeconds = 0) => {
    const orders = source.getRepository(OrderEntity);
    // 可空列写 null：实体属性没有标 | null，这里用 Object.assign 收口；createdAt 用数据库默认值
    const entity: OrderEntity = Object.assign(orders.create(), {
      orderId,
      payPlatform: 'epay',
      price: 10,
      total: 10,
      payCurrencySnapshot: 'CNY',
      payAmountSnapshot: 10,
      status: 0,
      tradeId: null,
    });
    const saved = await orders.save(entity);
    if (ageSeconds > 0) {
      await source.query(
        'UPDATE `order` SET createdAt = createdAt - INTERVAL ? SECOND WHERE id = ?',
        [ageSeconds, saved.id],
      );
    }
    return saved.id;
  };

  beforeAll(async () => {
    await sourceA.initialize();
    const [{ total }] = await sourceA.query(
      'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    if (Number(total) !== 0) {
      throw new Error('目标库里已有表：为避免误伤，本验收只在空的隔离测试库上执行');
    }
    ownsDatabase = true;
    await sourceA.synchronize();
    await sourceA.query(
      `CREATE TABLE \`${SHIPMENTS}\` (id INT AUTO_INCREMENT PRIMARY KEY, orderId VARCHAR(64) NOT NULL)`,
    );
    createdTables = (
      await sourceA.query(
        'SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
      )
    ).map((row: { name: string }) => row.name);
    await sourceB.initialize();
    const [{ isolation }] = await sourceA.query('SELECT @@transaction_isolation AS isolation');
    report(`事务隔离级别：${isolation}；建表 ${createdTables.length} 张`);
    ready = true;
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (ownsDatabase && sourceA.isInitialized && createdTables.length) {
      await sourceA.query(
        `DROP TABLE IF EXISTS ${createdTables.map(name => `\`${name}\``).join(', ')}`,
      );
      report(`已删除本验收建的 ${createdTables.length} 张表`);
    }
    if (sourceB.isInitialized) await sourceB.destroy();
    if (sourceA.isInitialized) await sourceA.destroy();
  }, TIMEOUT_MS);

  it(
    'shows why the lost race must re-read with a lock: a plain read still sees the snapshot',
    async () => {
      assertReady();
      await seedOrder(sourceA, 'FB_RR_DEMO');
      const runnerA: QueryRunner = sourceA.createQueryRunner();
      const runnerB: QueryRunner = sourceB.createQueryRunner();
      try {
        await runnerB.startTransaction();
        const [before] = await runnerB.query('SELECT status FROM `order` WHERE orderId = ?', [
          'FB_RR_DEMO',
        ]);
        await runnerA.startTransaction();
        const updateA = await runnerA.query(
          'UPDATE `order` SET status = 1 WHERE orderId = ? AND status = 0',
          ['FB_RR_DEMO'],
        );
        const updateB = runnerB.query(
          'UPDATE `order` SET status = 1 WHERE orderId = ? AND status = 0',
          ['FB_RR_DEMO'],
        );
        await sleep(HOLD_MS);
        await runnerA.commitTransaction();
        const lost = await updateB;
        const [plain] = await runnerB.query('SELECT status FROM `order` WHERE orderId = ?', [
          'FB_RR_DEMO',
        ]);
        const [locked] = await runnerB.query(
          'SELECT status FROM `order` WHERE orderId = ? FOR UPDATE',
          ['FB_RR_DEMO'],
        );
        await runnerB.commitTransaction();

        report(
          `竞争：先读 ${before.status}；A 更新 ${updateA.affectedRows} 行；B 更新 ${lost.affectedRows} 行；B 普通读 ${plain.status}，加锁读 ${locked.status}`,
        );
        expect(Number(before.status)).toBe(0);
        expect(updateA.affectedRows).toBe(1);
        expect(lost.affectedRows).toBe(0);
        expect(Number(plain.status)).toBe(0);
        expect(Number(locked.status)).toBe(1);
      } finally {
        if (runnerA.isTransactionActive) await runnerA.rollbackTransaction();
        if (runnerB.isTransactionActive) await runnerB.rollbackTransaction();
        await runnerA.release();
        await runnerB.release();
      }
    },
    TIMEOUT_MS,
  );

  it(
    'posts once when two connections settle the same order: one posts, the other reports already processed',
    async () => {
      assertReady();
      const serviceA = payServiceOn(sourceA);
      const serviceB = payServiceOn(sourceB);
      const tally = { fulfilled: 0, rejected: 0, posted: 0, alreadyProcessed: 0 };
      for (let round = 1; round <= ROUNDS; round += 1) {
        const orderId = `FB_RACE_${round}`;
        await seedOrder(sourceA, orderId);
        const settled = await Promise.allSettled([
          serviceA.processSuccessfulOrder(orderId, { tradeId: `FB_TRADE_${round}` }),
          serviceB.processSuccessfulOrder(orderId, { tradeId: `FB_TRADE_${round}` }),
        ]);
        for (const item of settled) {
          if (item.status === 'rejected') {
            tally.rejected += 1;
            continue;
          }
          tally.fulfilled += 1;
          if (item.value.alreadyProcessed) tally.alreadyProcessed += 1;
          else tally.posted += 1;
        }
        const [{ shipments }] = await sourceA.query(
          `SELECT COUNT(*) AS shipments FROM \`${SHIPMENTS}\` WHERE orderId = ?`,
          [orderId],
        );
        const [{ status }] = await sourceA.query('SELECT status FROM `order` WHERE orderId = ?', [
          orderId,
        ]);
        expect(Number(shipments)).toBe(1);
        expect(Number(status)).toBe(1);
      }
      report(
        `并发入账 ${ROUNDS} 轮：成功返回 ${tally.fulfilled}，报错 ${tally.rejected}；入账 ${tally.posted}，已处理 ${tally.alreadyProcessed}；每笔只发货一次`,
      );
      expect(tally).toEqual({
        fulfilled: ROUNDS * 2,
        rejected: 0,
        posted: ROUNDS,
        alreadyProcessed: ROUNDS,
      });
    },
    TIMEOUT_MS,
  );

  it.each([['+00:00'], ['+08:00']])(
    'picks the same orders by database age when the session time zone is %s',
    async (timeZone: string) => {
      assertReady();
      await sourceA.query('DELETE FROM `order`');
      await sourceA.query('SET time_zone = ?', [timeZone]);
      const ages: Array<[string, number]> = [
        ['FB_TZ_A', 10 * 60],
        ['FB_TZ_B', 2 * 60],
        ['FB_TZ_C', 25 * 60 * 60],
        ['FB_TZ_D', 17 * 60 * 60],
        ['FB_TZ_E', 23 * 60 * 60 + 50 * 60],
      ];
      for (const [orderId, age] of ages) await seedOrder(sourceA, orderId, age);

      const queried: string[] = [];
      const reconcile = new PaymentReconcileService(
        {
          getProvider: () => ({
            queryOrder: async (ctx: { orderId: string }) => {
              queried.push(ctx.orderId);
              return { state: 'pending', orderId: ctx.orderId };
            },
          }),
        } as any,
        { processQueryResult: async () => 'not_paid' } as any,
        sourceA.getRepository(OrderEntity),
      );
      await expect(reconcile.runOnce()).resolves.toBe('completed');

      // 对照：Node 侧按 createdAt（驱动按 +08:00 换算）算出的年龄与数据库年龄差多少
      const [{ session }] = await sourceA.query('SELECT @@session.time_zone AS session');
      const sample = await sourceA
        .getRepository(OrderEntity)
        .findOne({ where: { orderId: 'FB_TZ_A' } });
      const nodeAgeHours = (Date.now() - new Date(sample!.createdAt).getTime()) / 3_600_000;
      report(
        `会话时区 ${session}：补单查了 ${queried.join(', ')}；10 分钟的订单在 Node 侧看起来是 ${nodeAgeHours.toFixed(2)} 小时前创建的`,
      );
      expect(session).toBe(timeZone);
      expect(queried).toEqual(['FB_TZ_A', 'FB_TZ_D', 'FB_TZ_E']);
      await sourceA.query('SET time_zone = DEFAULT');
    },
    TIMEOUT_MS,
  );
});
