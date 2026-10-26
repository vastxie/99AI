/**
 * R21 真实 MySQL 验收：两个数据源（两条连接）并发调用真实的 AuthIdentityService.unbindIdentity。
 * 由 r21-unbind-concurrency.mjs 启动；目标库必须是空的隔离测试库（见该脚本说明）。
 */
import { HttpException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuthIdentityService } from '../../src/modules/auth/identity/auth-identity.service';
import { UserAuthIdentityEntity } from '../../src/modules/auth/identity/user-auth-identity.entity';
import { UserEntity } from '../../src/modules/user/user.entity';

declare const afterAll: any;
declare const beforeAll: any;
declare const describe: any;
declare const expect: any;
declare const it: any;

const ROUNDS = 10;
/** 判断渠道是否可用时停一下：持锁的一方停住，另一条连接一定会撞上这把锁 */
const HOLD_MS = 150;
const TIMEOUT_MS = 120_000;
const FAKE_HASH = `$2a$10$${'r'.repeat(53)}`;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const report = (line: string) => process.stdout.write(`[R21] ${line}\n`);

const usable = new Set(['demo_a', 'demo_b']);
const registry = {
  listCaptcha: () => [],
  getCaptcha: (provider: string) =>
    provider === 'demo_mail' ? { contactField: 'email' as const } : undefined,
  isProviderUsable: async (provider: string) => {
    await sleep(HOLD_MS);
    return usable.has(provider);
  },
};

const dataSource = () =>
  new DataSource({
    type: 'mysql',
    url: process.env.R21_MYSQL_URL,
    entities: [UserEntity, UserAuthIdentityEntity],
    synchronize: false,
    poolSize: 2,
  });

const serviceOn = (source: DataSource) =>
  new AuthIdentityService(
    source.getRepository(UserAuthIdentityEntity),
    source.getRepository(UserEntity),
    { onUserRegistered: async () => undefined } as any,
    { del: async () => undefined } as any,
    registry as any,
  );

/** 失败结果归类：HttpException 取状态码，其他记为 error */
const outcome = (result: PromiseSettledResult<unknown>) =>
  result.status === 'fulfilled'
    ? 'ok'
    : result.reason instanceof HttpException
      ? result.reason.getStatus()
      : 'error';

describe('R21 unbind on a real MySQL with two connections', () => {
  const sourceA = dataSource();
  const sourceB = dataSource();
  /** 确认是空库之后才置位：只有这时才允许建表、写数据与清理（误指向已有库时什么都不写） */
  let ownsDatabase = false;
  let ready = false;
  const assertReady = () => {
    if (!ready) throw new Error('前置检查没有通过：本用例不对数据库做任何写入');
  };
  let serviceA: AuthIdentityService;
  let serviceB: AuthIdentityService;
  let seq = 0;

  const seedUser = async (input: {
    password?: string | null;
    email?: string | null;
    username?: string;
    providers: string[];
  }) => {
    seq += 1;
    const users = sourceA.getRepository(UserEntity);
    const identities = sourceA.getRepository(UserAuthIdentityEntity);
    // 可空列写 null：实体属性没有标 | null，这里用 Object.assign 收口
    const user = await users.save(
      Object.assign(users.create(), {
        username: input.username || `r21_${seq}`,
        password: input.password ?? null,
        email: input.email ?? null,
        status: 1,
      }),
    );
    const ids: number[] = [];
    for (const provider of input.providers) {
      const saved = await identities.save(
        Object.assign(identities.create(), {
          userId: user.id,
          provider,
          providerUserId: `r21-${provider}-${user.id}`,
          email: provider === 'demo_mail' ? input.email : null,
          status: 'active' as const,
        }),
      );
      ids.push(saved.id);
    }
    return { userId: user.id, ids };
  };
  const identitiesLeft = (userId: number) =>
    sourceA.getRepository(UserAuthIdentityEntity).count({ where: { userId } });

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
    await sourceB.initialize();
    serviceA = serviceOn(sourceA);
    serviceB = serviceOn(sourceB);
    ready = true;
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (ownsDatabase && sourceA.isInitialized) {
      await sourceA.query('DROP TABLE IF EXISTS `user_auth_identities`, `users`');
      report('已删除本验收建的两张表');
    }
    if (sourceB.isInitialized) await sourceB.destroy();
    if (sourceA.isInitialized) await sourceA.destroy();
  }, TIMEOUT_MS);

  it(
    'reads the password column under the lock and checks the identifier against the real table',
    async () => {
      assertReady();
      const withPassword = await seedUser({ password: FAKE_HASH, providers: ['demo_c'] });
      const settledA = await Promise.allSettled([
        serviceA.unbindIdentity(withPassword.userId, withPassword.ids[0]),
      ]);
      const withoutPassword = await seedUser({ providers: ['demo_c'] });
      const settledB = await Promise.allSettled([
        serviceA.unbindIdentity(withoutPassword.userId, withoutPassword.ids[0]),
      ]);
      const owner = await seedUser({ password: FAKE_HASH, providers: ['demo_c'] });
      await seedUser({ username: 'r21_other', email: `r21_${owner.userId}`, providers: [] });
      // 别人的邮箱等于本用户名 → 有歧义，不算
      await sourceA
        .getRepository(UserEntity)
        .update({ id: owner.userId }, { username: `r21_${owner.userId}` });
      const settledC = await Promise.allSettled([
        serviceA.unbindIdentity(owner.userId, owner.ids[0]),
      ]);
      report(
        `密码兜底：有密码 ${outcome(settledA[0])}，没有密码 ${outcome(settledB[0])}，标识有歧义 ${outcome(settledC[0])}`,
      );
      expect([outcome(settledA[0]), outcome(settledB[0]), outcome(settledC[0])]).toEqual([
        'ok',
        400,
        400,
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    'lets only one of two concurrent unbinds of the last two identities succeed',
    async () => {
      assertReady();
      const tally: Record<string, number> = {};
      for (let round = 0; round < ROUNDS; round += 1) {
        const { userId, ids } = await seedUser({ providers: ['demo_a', 'demo_b'] });
        const settled = await Promise.allSettled([
          serviceA.unbindIdentity(userId, ids[0]),
          serviceB.unbindIdentity(userId, ids[1]),
        ]);
        const key = `${settled.map(outcome).sort().join('+')} 剩 ${await identitiesLeft(userId)}`;
        tally[key] = (tally[key] || 0) + 1;
      }
      report(`不同身份并发 ${ROUNDS} 轮：${JSON.stringify(tally)}`);
      expect(tally).toEqual({ ['400+ok 剩 1']: ROUNDS });
    },
    TIMEOUT_MS,
  );

  it(
    'answers 404 to the second of two concurrent unbinds of the same identity',
    async () => {
      assertReady();
      const tally: Record<string, number> = {};
      for (let round = 0; round < ROUNDS; round += 1) {
        const { userId, ids } = await seedUser({ providers: ['demo_a', 'demo_b'] });
        const settled = await Promise.allSettled([
          serviceA.unbindIdentity(userId, ids[0]),
          serviceB.unbindIdentity(userId, ids[0]),
        ]);
        const key = `${settled.map(outcome).sort().join('+')} 剩 ${await identitiesLeft(userId)}`;
        tally[key] = (tally[key] || 0) + 1;
      }
      report(`同一身份并发 ${ROUNDS} 轮：${JSON.stringify(tally)}`);
      expect(tally).toEqual({ ['404+ok 剩 1']: ROUNDS });
    },
    TIMEOUT_MS,
  );

  it(
    'rolls the deletion back when clearing the contact column fails',
    async () => {
      assertReady();
      const email = `r21-${Date.now()}@example.com`;
      const { userId, ids } = await seedUser({ email, providers: ['demo_mail', 'demo_a'] });
      const original = Repository.prototype.update;
      Repository.prototype.update = function (this: Repository<any>, ...args: any[]) {
        if (this.metadata?.target === UserEntity) {
          return Promise.reject(new Error('r21 forced contact update failure'));
        }
        return (original as any).apply(this, args);
      } as any;
      let settled: PromiseSettledResult<unknown>;
      try {
        [settled] = await Promise.allSettled([serviceA.unbindIdentity(userId, ids[0])]);
      } finally {
        Repository.prototype.update = original;
      }
      const left = await identitiesLeft(userId);
      const user = await sourceA.getRepository(UserEntity).findOne({ where: { id: userId } });
      report(
        `清空联系方式失败：结果 ${outcome(settled)}，身份剩 ${left}，邮箱仍在 ${user?.email === email}`,
      );
      expect([outcome(settled), left, user?.email === email]).toEqual(['error', 2, true]);
    },
    TIMEOUT_MS,
  );
});
