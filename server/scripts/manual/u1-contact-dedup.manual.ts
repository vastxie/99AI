/**
 * U1 真实 MySQL 验收：多个数据源（多条连接）并发调用真实的 CaptchaAuthService / AuthIdentityService 与真实的
 * 邮箱、手机渠道适配器。身份实体的 beforeInsert 订阅者做执行屏障（只在本验收的数据源上注册），
 * 固定「事务都走到写身份之前」的竞争窗口，不靠 Promise.all 碰巧并发。
 * 验证码校验、Redis、令牌签发、注册赠送换成计数桩；数据库、事务、唯一索引、行锁都是真的。
 * 由 u1-contact-dedup.mjs 启动；目标库必须是空的隔离测试库（见该脚本说明）。
 */
import { HttpException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  QueryRunner,
  Repository,
} from 'typeorm';
import { CaptchaAuthService } from '../../src/modules/auth/captcha/captcha-auth.service';
import { AuthIdentityService } from '../../src/modules/auth/identity/auth-identity.service';
import { UserAuthIdentityEntity } from '../../src/modules/auth/identity/user-auth-identity.entity';
import { LoginProviderRegistry } from '../../src/modules/auth/providers/login-provider.registry';
import { UserEntity } from '../../src/modules/user/user.entity';
import { EmailLoginProvider } from '../../src/packs/email/email-login.provider';
import { PhoneLoginProvider } from '../../src/packs/phone/phone-login.provider';

declare const afterAll: any;
declare const afterEach: any;
declare const beforeAll: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;

const ROUNDS = 5;
const TIMEOUT_MS = 120_000;
/** 屏障最长等待：等不齐就放行并让用例失败，不会挂住 */
const GATE_TIMEOUT_MS = 10_000;
const FAKE_HASH = `$2a$10$${'u'.repeat(53)}`;
const COLLATION = 'utf8mb4_unicode_ci';
const GATE_SQL = fs.readFileSync(path.join(__dirname, 'u1-contact-gate.sql'), 'utf8');

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const report = (line: string) => process.stdout.write(`[U1] ${line}\n`);

/* ---------- 执行屏障 ---------- */

type Gate = {
  expected: number;
  arrived: number;
  hold: boolean;
  filter?: (identity: Partial<UserAuthIdentityEntity>) => boolean;
  connectionIds: number[];
  timedOut: boolean;
  release: () => void;
  opened: Promise<void>;
  reached: Promise<void>;
  markReached: () => void;
};
let gate: Gate | null = null;

/** 等 expected 个事务走到写身份之前；hold 时到齐后也不放行，等调用方 release */
function armGate(
  expected: number,
  options: { hold?: boolean; filter?: Gate['filter'] } = {},
): Gate {
  let release!: () => void;
  let markReached!: () => void;
  const opened = new Promise<void>(resolve => (release = resolve));
  const reached = new Promise<void>(resolve => (markReached = resolve));
  gate = {
    expected,
    arrived: 0,
    hold: Boolean(options.hold),
    filter: options.filter,
    connectionIds: [],
    timedOut: false,
    release,
    opened,
    reached,
    markReached,
  };
  return gate;
}

/** TypeORM 只装载带 @EventSubscriber() 的订阅者类；它只在本验收的数据源（subscribers 里列出）上生效 */
@EventSubscriber()
class IdentityInsertBarrier implements EntitySubscriberInterface<UserAuthIdentityEntity> {
  listenTo() {
    return UserAuthIdentityEntity;
  }

  async beforeInsert(event: InsertEvent<UserAuthIdentityEntity>) {
    const current = gate;
    if (!current || (current.filter && !current.filter(event.entity))) return;
    const [{ id }] = await event.queryRunner.query('SELECT CONNECTION_ID() AS id');
    current.connectionIds.push(Number(id));
    current.arrived += 1;
    if (current.arrived === current.expected) {
      current.markReached();
      if (!current.hold) current.release();
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(() => {
        current.timedOut = true;
        resolve();
      }, GATE_TIMEOUT_MS);
    });
    await Promise.race([current.opened, timeout]);
    clearTimeout(timer);
  }
}

/** 屏障到齐情况：到达数、是否超时、是否来自不同的连接 */
const gateState = (barrier: Gate) =>
  `屏障 ${barrier.arrived}${barrier.timedOut ? ' 超时' : ''} 连接 ${new Set(barrier.connectionIds).size}`;

/* ---------- 数据源与服务 ---------- */

const dataSource = () =>
  new DataSource({
    type: 'mysql',
    url: process.env.U1_MYSQL_URL,
    entities: [UserEntity, UserAuthIdentityEntity],
    subscribers: [IdentityInsertBarrier],
    synchronize: false,
    poolSize: 4,
    charset: 'utf8mb4',
    // 与 database-schema.ts 的数据源一致：where 里出现 null / undefined 直接抛错
    invalidWhereValuesBehavior: { null: 'throw', undefined: 'throw' },
  });

const counters = {
  bonus: [] as number[],
  bonusError: null as Error | null,
  cacheClears: 0,
  tokens: [] as number[],
  sent: 0,
};
const billing = {
  onUserRegistered: async (userId: number) => {
    counters.bonus.push(userId);
    if (counters.bonusError) throw counters.bonusError;
  },
};
const redis = {
  del: async () => {
    counters.cacheClears += 1;
  },
  incrByWithInitialExpire: async () => 1,
  set: async () => undefined,
  getDel: async () => null,
};
const codes = {
  verify: async () => undefined,
  issue: async () => ({ code: '000000', requestId: 'u1-request' }),
  discard: async () => undefined,
};
const tokens = {
  issueLoginToken: async (user: UserEntity) => {
    counters.tokens.push(user.id);
    return `token-${user.id}`;
  },
};

function servicesOn(source: DataSource) {
  const registry = new LoginProviderRegistry();
  const config = { getConfigs: async () => '1' };
  const mail = {
    isAvailable: async () => true,
    sendMail: async () => {
      counters.sent += 1;
    },
  };
  const sms = {
    sendCode: async () => {
      counters.sent += 1;
    },
  };
  new EmailLoginProvider(config as any, mail as any, registry);
  new PhoneLoginProvider(config as any, sms as any, registry);
  const identity = new AuthIdentityService(
    source.getRepository(UserAuthIdentityEntity),
    source.getRepository(UserEntity),
    billing as any,
    redis as any,
    registry,
  );
  const captcha = new CaptchaAuthService(
    registry,
    codes as any,
    { updateUserPassword: async () => undefined } as any,
    identity,
    tokens as any,
    redis as any,
  );
  return { identity, captcha };
}

const outcome = (result: PromiseSettledResult<unknown>) =>
  result.status === 'fulfilled'
    ? 'ok'
    : result.reason instanceof HttpException
      ? `${result.reason.getStatus()} ${result.reason.message}`
      : `error ${result.reason?.code || result.reason?.message}`;

describe('U1 contact dedup on a real MySQL', () => {
  const sourceA = dataSource();
  const sourceB = dataSource();
  const sourceC = dataSource();
  let ownsDatabase = false;
  let ready = false;
  const assertReady = () => {
    if (!ready) throw new Error('前置检查没有通过：本用例不对数据库做任何写入');
  };
  let A: ReturnType<typeof servicesOn>;
  let B: ReturnType<typeof servicesOn>;
  let seq = 0;

  const users = () => sourceC.getRepository(UserEntity);
  const identities = () => sourceC.getRepository(UserAuthIdentityEntity);

  const seedUser = async (values: Record<string, unknown> = {}) => {
    seq += 1;
    return users().save(
      Object.assign(users().create(), {
        username: `u1_${seq}`,
        password: FAKE_HASH,
        status: 1,
        ...values,
      }),
    );
  };
  const seedIdentity = async (
    userId: number,
    provider: 'local_email' | 'local_phone',
    value: string,
    values: Record<string, unknown> = {},
  ) => {
    const field = provider === 'local_email' ? 'email' : 'phone';
    return identities().save(
      Object.assign(identities().create(), {
        userId,
        provider,
        providerUserId: value,
        [field]: value,
        status: 'active',
        extra: { contactField: field },
        ...values,
      }),
    );
  };
  /** 按列的排序规则计数（数据库认为相等的写法都算） */
  const usersWith = (field: 'email' | 'phone', value: string) =>
    users().count({ where: { [field]: value } });
  const identitiesOf = (provider: string, value: string) =>
    identities().find({ where: { provider, providerUserId: value } });
  const reset = async () => {
    gate = null;
    await sourceC.query('DELETE FROM `user_auth_identities`');
    await sourceC.query('DELETE FROM `users`');
    counters.bonus = [];
    counters.bonusError = null;
    counters.cacheClears = 0;
    counters.tokens = [];
    counters.sent = 0;
  };

  /** 执行 u1-contact-gate.sql 的每一条，返回 { 键: 计数 }，排序规则单独收集 */
  const runGate = async () => {
    const result: Record<string, number> = {};
    const collations: string[] = [];
    const statements = GATE_SQL.split(/;\s*\n/)
      .map(chunk => chunk.replace(/^--.*$/gm, '').trim())
      .filter(Boolean);
    for (const sql of statements) {
      for (const row of await sourceC.query(sql)) {
        if (row.k === 'collation') collations.push(String(row.v));
        else result[String(row.k)] = Number(row.v);
      }
    }
    return { result, collations };
  };
  const gateKeys = [
    'G1_email',
    'G1_phone',
    'G2_email',
    'G2_phone',
    'G3a_email',
    'G3a_phone',
    'G3b_email',
    'G3b_phone',
    'Q1_email',
    'Q1_phone',
    'Q2_email',
    'Q2_phone',
    'Q3_email',
    'Q3_phone',
    'Q5',
    'Q6_email',
    'Q6_phone',
    'Q7_email',
    'Q7_phone',
    'Q8_email',
    'Q8_phone',
  ];
  /** 除 expected 列出的键以外全部为 0 */
  const expectGate = (result: Record<string, number>, expected: Record<string, number>) => {
    const zeros = Object.fromEntries(gateKeys.map(key => [key, 0]));
    expect(result).toEqual({ ...zeros, ...expected });
  };

  beforeAll(async () => {
    await sourceC.initialize();
    const [{ total }] = await sourceC.query(
      'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    if (Number(total) !== 0) {
      throw new Error('目标库里已有表：为避免误伤，本验收只在空的隔离测试库上执行');
    }
    ownsDatabase = true;
    const [{ db }] = await sourceC.query('SELECT DATABASE() AS db');
    await sourceC.query(`ALTER DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE ${COLLATION}`);
    await sourceC.synchronize();
    await sourceA.initialize();
    await sourceB.initialize();
    A = servicesOn(sourceA);
    B = servicesOn(sourceB);
    ready = true;
  }, TIMEOUT_MS);

  beforeEach(async () => {
    if (ready) await reset();
  });

  afterEach(() => {
    gate = null;
  });

  afterAll(async () => {
    gate = null;
    if (ownsDatabase && sourceC.isInitialized) {
      await sourceC.query('DROP TABLE IF EXISTS `user_auth_identities`, `users`');
      report('已删除本验收建的两张表');
    }
    for (const source of [sourceA, sourceB, sourceC]) {
      if (source.isInitialized) await source.destroy();
    }
  }, TIMEOUT_MS);

  it(
    'runs on utf8mb4_unicode_ci where the accent variants are equal and the unique index rejects the pair',
    async () => {
      assertReady();
      const { collations } = await runGate();
      report(`列的排序规则：${collations.join('，')}`);
      expect(collations).toEqual([
        `user_auth_identities.email=${COLLATION}`,
        `user_auth_identities.phone=${COLLATION}`,
        `user_auth_identities.providerUserId=${COLLATION}`,
        `users.email=${COLLATION}`,
        `users.phone=${COLLATION}`,
      ]);
      const [{ same }] = await sourceC.query(
        `SELECT 'resume-u0@example.test' = 'résumé-u0@example.test' COLLATE ${COLLATION} AS same`,
      );
      expect(Number(same)).toBe(1);
      // 两个不同账号：重复只能来自 (provider, providerUserId)，不是 (userId, provider)
      const owner = await seedUser();
      const other = await seedUser();
      await seedIdentity(owner.id, 'local_email', 'resume-u0@example.test');
      const second = await Promise.allSettled([
        seedIdentity(other.id, 'local_email', 'résumé-u0@example.test'),
      ]);
      expect((second[0] as PromiseRejectedResult).reason?.code).toBe('ER_DUP_ENTRY');
    },
    TIMEOUT_MS,
  );

  it.each([
    ['email', 'local_email', (round: number) => `first-${round}@example.test`],
    ['phone', 'local_phone', (round: number) => `1380013${String(1000 + round)}`],
  ])(
    'creates exactly one account when two first %s logins race past the lookup',
    async (field: 'email' | 'phone', provider: string, contactOf: (round: number) => string) => {
      assertReady();
      const tally: Record<string, number> = {};
      for (let round = 0; round < ROUNDS; round += 1) {
        const contact = contactOf(round);
        const barrier = armGate(2, { filter: entity => entity.providerUserId === contact });
        const settled = await Promise.allSettled([
          A.captcha.login(contact, '000000', {} as any),
          B.captcha.login(contact, '000000', {} as any),
        ]);
        gate = null;
        const owners = await identitiesOf(provider, contact);
        const created = await users().findOne({
          where: { [field]: contact },
          select: { id: true, storageId: true },
        });
        const key = [
          settled.map(outcome).join('+'),
          `用户 ${await usersWith(field, contact)}`,
          `身份 ${owners.length}`,
          `同一账号 ${settled.every(result => result.status === 'fulfilled' && result.value === `token-${owners[0]?.userId}`)}`,
          gateState(barrier),
          `storageId ${Boolean(created?.storageId)}`,
        ].join(' / ');
        tally[key] = (tally[key] || 0) + 1;
      }
      report(
        `${field} 首次登录并发 ${ROUNDS} 轮：${JSON.stringify(tally)}；赠送 ${counters.bonus.length} 次`,
      );
      expect(tally).toEqual({
        ['ok+ok / 用户 1 / 身份 1 / 同一账号 true / 屏障 2 连接 2 / storageId true']: ROUNDS,
      });
      expect(counters.bonus).toHaveLength(ROUNDS);
    },
    TIMEOUT_MS,
  );

  it(
    'lets only one of two accounts bind the same email concurrently',
    async () => {
      assertReady();
      const tally: Record<string, number> = {};
      for (let round = 0; round < ROUNDS; round += 1) {
        const contact = `bind-${round}@example.test`;
        const first = await seedUser();
        const second = await seedUser();
        const barrier = armGate(2, { filter: entity => entity.providerUserId === contact });
        const settled = await Promise.allSettled([
          A.captcha.bind(first.id, contact, '000000'),
          B.captcha.bind(second.id, contact, '000000'),
        ]);
        gate = null;
        const owners = await identitiesOf('local_email', contact);
        const holder = await users().findOne({ where: { email: contact } });
        const key = [
          settled.map(outcome).sort().join(' + '),
          `列 ${await usersWith('email', contact)}`,
          `身份 ${owners.length}`,
          `一致 ${holder?.id === owners[0]?.userId}`,
          gateState(barrier),
        ].join(' / ');
        tally[key] = (tally[key] || 0) + 1;
      }
      report(`两个账号并发绑定同一邮箱 ${ROUNDS} 轮：${JSON.stringify(tally)}`);
      expect(tally).toEqual({
        ['400 该联系方式已被其他账号绑定！ + ok / 列 1 / 身份 1 / 一致 true / 屏障 2 连接 2']:
          ROUNDS,
      });
    },
    TIMEOUT_MS,
  );

  it(
    'keeps a single owner when a first login races a bind of the same email',
    async () => {
      assertReady();
      const tally: Record<string, number> = {};
      for (let round = 0; round < ROUNDS; round += 1) {
        const contact = `mixed-${round}@example.test`;
        const binder = await seedUser();
        const barrier = armGate(2, { filter: entity => entity.providerUserId === contact });
        const bonusBefore = counters.bonus.length;
        const [login, bind] = await Promise.allSettled([
          A.captcha.login(contact, '000000', {} as any),
          B.captcha.bind(binder.id, contact, '000000'),
        ]);
        gate = null;
        const owners = await identitiesOf('local_email', contact);
        const holder = await users().findOne({ where: { email: contact } });
        const loggedInto =
          login.status === 'fulfilled' ? Number(String(login.value).replace('token-', '')) : null;
        const key = [
          `登录 ${outcome(login)}`,
          `绑定 ${outcome(bind)}`,
          `列 ${await usersWith('email', contact)}`,
          `身份 ${owners.length}`,
          `一致 ${holder?.id === owners[0]?.userId}`,
          `登录到主人 ${loggedInto === owners[0]?.userId}`,
          `赠送 ${counters.bonus.length - bonusBefore}`,
          gateState(barrier),
        ].join(' / ');
        tally[key] = (tally[key] || 0) + 1;
      }
      report(`首次登录与绑定并发 ${ROUNDS} 轮：${JSON.stringify(tally)}`);
      for (const key of Object.keys(tally)) {
        // 绑定赢：登录到绑定的账号、没有赠送；登录赢：新建账号、赠送一次、绑定被拒
        expect(key).toMatch(
          /^登录 ok \/ 绑定 (ok \/ 列 1 \/ 身份 1 \/ 一致 true \/ 登录到主人 true \/ 赠送 0|400 该联系方式已被其他账号绑定！ \/ 列 1 \/ 身份 1 \/ 一致 true \/ 登录到主人 true \/ 赠送 1) \/ 屏障 2 连接 2$/,
        );
      }
    },
    TIMEOUT_MS,
  );

  it(
    'treats accent variants as the same contact when two first logins race',
    async () => {
      assertReady();
      const tally: Record<string, number> = {};
      for (let round = 0; round < ROUNDS; round += 1) {
        const plain = `resume-${round}@example.test`;
        const accented = `résumé-${round}@example.test`;
        const barrier = armGate(2, {
          filter: entity => entity.providerUserId === plain || entity.providerUserId === accented,
        });
        const settled = await Promise.allSettled([
          A.captcha.login(plain, '000000', {} as any),
          B.captcha.login(accented, '000000', {} as any),
        ]);
        gate = null;
        const key = [
          settled.map(outcome).join('+'),
          `用户 ${await usersWith('email', plain)}`,
          `身份 ${(await identitiesOf('local_email', plain)).length}`,
          `同一账号 ${settled[0].status === 'fulfilled' && settled[1].status === 'fulfilled' && settled[0].value === settled[1].value}`,
          gateState(barrier),
        ].join(' / ');
        tally[key] = (tally[key] || 0) + 1;
      }
      report(`重音写法并发首次登录 ${ROUNDS} 轮：${JSON.stringify(tally)}`);
      expect(tally).toEqual({
        ['ok+ok / 用户 1 / 身份 1 / 同一账号 true / 屏障 2 连接 2']: ROUNDS,
      });
      expect(counters.bonus).toHaveLength(ROUNDS);
    },
    TIMEOUT_MS,
  );

  it(
    'does not re-insert an identity from a stale snapshot after an unbind, and serializes idempotent binds with unbinds',
    async () => {
      assertReady();
      const contact = 'stale@example.test';
      const user = await seedUser({ email: contact });
      const bound = await seedIdentity(user.id, 'local_email', contact);
      const snapshot = (await users().findOne({ where: { id: user.id } })) as UserEntity;
      await A.identity.unbindIdentity(user.id, bound.id);
      await B.identity.ensureContactIdentitiesForUser(snapshot);
      const afterStale = {
        identities: (await identitiesOf('local_email', contact)).length,
        column: (await users().findOne({ where: { id: user.id } }))?.email ?? null,
      };
      report(`旧快照补录：${JSON.stringify(afterStale)}`);
      expect(afterStale).toEqual({ identities: 0, column: null });

      const tally: Record<string, number> = {};
      for (let round = 0; round < ROUNDS; round += 1) {
        const value = `serial-${round}@example.test`;
        const owner = await seedUser({ email: value });
        const identity = await seedIdentity(owner.id, 'local_email', value);
        const holder: QueryRunner = sourceC.createQueryRunner();
        await holder.connect();
        await holder.startTransaction();
        await holder.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [owner.id]);
        let finished = 0;
        const pending = Promise.allSettled([
          A.captcha.bind(owner.id, value, '000000').finally(() => (finished += 1)),
          B.identity.unbindIdentity(owner.id, identity.id).finally(() => (finished += 1)),
        ]);
        await sleep(300);
        const finishedWhileLocked = finished;
        await holder.rollbackTransaction();
        await holder.release();
        const settled = await pending;
        const rows = await identitiesOf('local_email', value);
        const column = (await users().findOne({ where: { id: owner.id } }))?.email ?? null;
        const consistent =
          (rows.length === 1 && column === value) || (rows.length === 0 && column === null);
        const key = `${settled.map(outcome).join(' + ')} / 锁住时完成 ${finishedWhileLocked} / 一致 ${consistent}`;
        tally[key] = (tally[key] || 0) + 1;
      }
      report(`幂等绑定与解绑在用户行锁上排队 ${ROUNDS} 轮：${JSON.stringify(tally)}`);
      // 两个操作都要成功，且在外部行锁释放之前都没有完成（确实在用户行锁上排队）
      expect(tally).toEqual({ ['ok + ok / 锁住时完成 0 / 一致 true']: ROUNDS });
    },
    TIMEOUT_MS,
  );

  it(
    'makes an unbind wait for a backfill that holds the user row, and ends consistent',
    async () => {
      assertReady();
      const legacy = 'legacy-held@example.test';
      const phone = '13800139000';
      const user = await seedUser({ email: legacy, phone });
      const phoneIdentity = await seedIdentity(user.id, 'local_phone', phone);
      const snapshot = (await users().findOne({ where: { id: user.id } })) as UserEntity;
      const barrier = armGate(1, {
        hold: true,
        filter: entity => entity.providerUserId === legacy,
      });
      const order: string[] = [];
      const backfill = A.identity
        .ensureContactIdentitiesForUser(snapshot)
        .then(() => order.push('backfill'));
      await barrier.reached;
      const unbind = B.identity
        .unbindIdentity(user.id, phoneIdentity.id)
        .then(() => order.push('unbind'));
      await sleep(300);
      const waitedOnLock = order.length === 0;
      barrier.release();
      await Promise.all([backfill, unbind]);
      gate = null;
      const row = await users().findOne({ where: { id: user.id } });
      const result = {
        waitedOnLock,
        order,
        email: (await identitiesOf('local_email', legacy)).map(item => item.userId === user.id),
        phoneIdentities: (await identitiesOf('local_phone', phone)).length,
        columns: [row?.email, row?.phone ?? null],
      };
      report(`补录持锁、解绑后到：${JSON.stringify(result)}`);
      expect(result).toEqual({
        waitedOnLock: true,
        order: ['backfill', 'unbind'],
        email: [true],
        phoneIdentities: 0,
        columns: [legacy, null],
      });
    },
    TIMEOUT_MS,
  );

  it(
    'rolls a registration back when its connection is killed before the identity write',
    async () => {
      assertReady();
      const contact = 'killed@example.test';
      const barrier = armGate(1, {
        hold: true,
        filter: entity => entity.providerUserId === contact,
      });
      const pending = Promise.allSettled([A.captcha.login(contact, '000000', {} as any)]);
      await barrier.reached;
      await sourceC.query(`KILL CONNECTION ${barrier.connectionIds[0]}`);
      barrier.release();
      const [killed] = await pending;
      gate = null;
      const afterKill = {
        outcome: outcome(killed),
        users: await usersWith('email', contact),
        identities: (await identitiesOf('local_email', contact)).length,
      };
      const [again] = await Promise.allSettled([A.captcha.login(contact, '000000', {} as any)]);
      const afterRetry = {
        outcome: outcome(again),
        users: await usersWith('email', contact),
        identities: (await identitiesOf('local_email', contact)).length,
      };
      report(`杀掉注册连接：${JSON.stringify(afterKill)}；再次登录：${JSON.stringify(afterRetry)}`);
      expect(afterKill).toEqual({
        outcome: '500 操作失败，请稍后重新获取验证码再试',
        users: 0,
        identities: 0,
      });
      expect(afterRetry).toEqual({ outcome: 'ok', users: 1, identities: 1 });
    },
    TIMEOUT_MS,
  );

  it(
    'refuses a second email of the same channel, disabled identities and recorded ownership conflicts',
    async () => {
      assertReady();
      const owner = await seedUser({ email: 'first@example.test' });
      await seedIdentity(owner.id, 'local_email', 'first@example.test');
      const [secondEmail] = await Promise.allSettled([
        A.captcha.bind(owner.id, 'second@example.test', '000000'),
      ]);

      const disabledOwner = await seedUser({ email: 'disabled@example.test' });
      await seedIdentity(disabledOwner.id, 'local_email', 'disabled@example.test', {
        status: 'disabled',
      });
      const other = await seedUser();
      const [disabledLogin, disabledBind] = await Promise.allSettled([
        A.captcha.login('disabled@example.test', '000000', {} as any),
        B.captcha.bind(other.id, 'disabled@example.test', '000000'),
      ]);

      const legacy = await seedUser({ email: 'conflict@example.test' });
      const identityOwner = await seedUser();
      await seedIdentity(identityOwner.id, 'local_email', 'conflict@example.test');
      const sentBefore = counters.sent;
      const [conflictLogin, conflictReset, conflictBind, conflictSend] = await Promise.allSettled([
        A.captcha.login('conflict@example.test', '000000', {} as any),
        A.captcha.verifyResetCode('conflict@example.test', '000000'),
        B.captcha.bind(identityOwner.id, 'conflict@example.test', '000000'),
        A.captcha.sendCode('conflict@example.test', 'reset'),
      ]);
      const result = {
        secondEmail: outcome(secondEmail),
        ownerColumn: (await users().findOne({ where: { id: owner.id } }))?.email,
        disabledLogin: outcome(disabledLogin),
        disabledBind: outcome(disabledBind),
        conflictLogin: outcome(conflictLogin),
        conflictReset: outcome(conflictReset),
        conflictBind: outcome(conflictBind),
        conflictSend:
          conflictSend.status === 'fulfilled' ? conflictSend.value : outcome(conflictSend),
        sentForConflict: counters.sent - sentBefore,
        conflictColumns: [
          (await users().findOne({ where: { id: legacy.id } }))?.email,
          (await users().findOne({ where: { id: identityOwner.id } }))?.email ?? null,
        ],
      };
      report(`拒绝场景：${JSON.stringify(result)}`);
      expect(result).toEqual({
        secondEmail: '400 当前账号已绑定该类型登录方式！',
        ownerColumn: 'first@example.test',
        disabledLogin: '400 该登录方式已停用，请联系管理员',
        disabledBind: '400 该联系方式已被其他账号绑定！',
        conflictLogin: '400 该联系方式的归属存在冲突，请联系管理员处理',
        conflictReset: '400 该联系方式的归属存在冲突，请联系管理员处理',
        conflictBind: '400 该联系方式已被其他账号绑定！',
        conflictSend: '验证码发送成功、请填写验证码完成密码重置！',
        sentForConflict: 0,
        conflictColumns: ['conflict@example.test', null],
      });
    },
    TIMEOUT_MS,
  );

  it(
    'rolls the new user and its identity back when a later step of the registration transaction fails',
    async () => {
      assertReady();
      const contact = 'register-rollback@example.test';
      const original = Repository.prototype.update;
      let failures = 0;
      // 注册事务里写完身份之后还会更新这条身份的最近登录时间：让这一步失败，整个事务必须回滚
      Repository.prototype.update = function (this: Repository<any>, ...args: any[]) {
        if (this.metadata?.target === UserAuthIdentityEntity && failures === 0) {
          failures += 1;
          return Promise.reject(new Error(`u1 forced identity update failure for ${contact}`));
        }
        return (original as any).apply(this, args);
      } as any;
      let settled: PromiseSettledResult<unknown>;
      try {
        [settled] = await Promise.allSettled([A.captcha.login(contact, '000000', {} as any)]);
      } finally {
        Repository.prototype.update = original;
      }
      const result = {
        outcome: outcome(settled),
        users: await usersWith('email', contact),
        identities: (await identitiesOf('local_email', contact)).length,
        bonus: counters.bonus.length,
      };
      report(`注册事务后一步失败：${JSON.stringify(result)}`);
      expect(result).toEqual({
        outcome: '500 操作失败，请稍后重新获取验证码再试',
        users: 0,
        identities: 0,
        bonus: 0,
      });
    },
    TIMEOUT_MS,
  );

  it(
    'rolls the identity back when the users column write fails inside the bind transaction',
    async () => {
      assertReady();
      const contact = 'rollback@example.test';
      const user = await seedUser();
      const original = Repository.prototype.update;
      let failures = 0;
      Repository.prototype.update = function (this: Repository<any>, ...args: any[]) {
        if (this.metadata?.target === UserEntity && failures === 0) {
          failures += 1;
          return Promise.reject(new Error(`u1 forced users update failure for ${contact}`));
        }
        return (original as any).apply(this, args);
      } as any;
      let settled: PromiseSettledResult<unknown>;
      try {
        [settled] = await Promise.allSettled([A.captcha.bind(user.id, contact, '000000')]);
      } finally {
        Repository.prototype.update = original;
      }
      const result = {
        outcome: outcome(settled),
        identities: (await identitiesOf('local_email', contact)).length,
        column: (await users().findOne({ where: { id: user.id } }))?.email ?? null,
        cacheClears: counters.cacheClears,
      };
      report(`绑定事务里写列失败：${JSON.stringify(result)}`);
      expect(result).toEqual({
        outcome: '400 绑定失败，请稍后重试',
        identities: 0,
        column: null,
        cacheClears: 0,
      });
    },
    TIMEOUT_MS,
  );

  it(
    'keeps one spelling across an accent-equivalent idempotent bind, unbind and backfill, and closes the paused-registration window',
    async () => {
      assertReady();
      const stored = 'resume-same@example.test';
      const user = await seedUser({ email: stored });
      const bound = await seedIdentity(user.id, 'local_email', stored);
      const [rebind] = await Promise.allSettled([
        A.captcha.bind(user.id, 'résumé-same@example.test', '000000'),
      ]);
      const columnAfterRebind = (await users().findOne({ where: { id: user.id } }))?.email;
      const snapshot = (await users().findOne({ where: { id: user.id } })) as UserEntity;
      await A.identity.unbindIdentity(user.id, bound.id);
      await B.identity.ensureContactIdentitiesForUser(snapshot);
      const sameSpelling = {
        rebind: outcome(rebind),
        columnAfterRebind,
        columnAfterUnbind: (await users().findOne({ where: { id: user.id } }))?.email ?? null,
        identities: (await identitiesOf('local_email', stored)).length,
      };

      const accented = 'résumé-window@example.test';
      const plain = 'resume-window@example.test';
      const binder = await seedUser();
      const barrier = armGate(1, {
        hold: true,
        filter: entity => entity.providerUserId === accented,
      });
      const registration = Promise.allSettled([A.captcha.login(accented, '000000', {} as any)]);
      await barrier.reached;
      await B.captcha.bind(binder.id, plain, '000000');
      await B.captcha.bind(binder.id, accented, '000000');
      const binderIdentity = (await identitiesOf('local_email', plain))[0];
      await B.identity.unbindIdentity(binder.id, binderIdentity.id);
      barrier.release();
      const [registered] = await registration;
      gate = null;
      const owners = await identitiesOf('local_email', plain);
      const window = {
        registration: outcome(registered),
        users: await usersWith('email', plain),
        identities: owners.length,
        ownerIsRegistrant:
          registered.status === 'fulfilled' && registered.value === `token-${owners[0]?.userId}`,
        binderColumn: (await users().findOne({ where: { id: binder.id } }))?.email ?? null,
      };
      report(`同一写法：${JSON.stringify(sameSpelling)}；暂停注册窗口：${JSON.stringify(window)}`);
      expect(sameSpelling).toEqual({
        rebind: 'ok',
        columnAfterRebind: stored,
        columnAfterUnbind: null,
        identities: 0,
      });
      expect(window).toEqual({
        registration: 'ok',
        users: 1,
        identities: 1,
        ownerIsRegistrant: true,
        binderColumn: null,
      });
    },
    TIMEOUT_MS,
  );

  it(
    'keeps the new account and does not re-resolve when the bonus fails after commit',
    async () => {
      assertReady();
      const contact = 'bonus@example.test';
      counters.bonusError = Object.assign(new Error(`bonus failed for ${contact}`), {
        code: 'ER_DUP_ENTRY',
        errno: 1062,
      });
      const [first] = await Promise.allSettled([A.captcha.login(contact, '000000', {} as any)]);
      counters.bonusError = null;
      const [second] = await Promise.allSettled([A.captcha.login(contact, '000000', {} as any)]);
      const result = {
        first: outcome(first),
        second: outcome(second),
        users: await usersWith('email', contact),
        bonus: counters.bonus.length,
      };
      report(`赠送失败：${JSON.stringify(result)}`);
      expect(result).toEqual({
        first: '500 操作失败，请稍后重新获取验证码再试',
        second: 'ok',
        users: 1,
        bonus: 1,
      });
    },
    TIMEOUT_MS,
  );

  it(
    'refuses captcha login for locked or banned owners without backfilling or issuing a token',
    async () => {
      assertReady();
      const withIdentity = await seedUser({ email: 'locked-owner@example.test', status: 2 });
      await seedIdentity(withIdentity.id, 'local_email', 'locked-owner@example.test');
      await seedUser({ email: 'banned-legacy@example.test', status: 3 });
      const tokensBefore = counters.tokens.length;
      const [lockedLogin, bannedLogin] = await Promise.allSettled([
        A.captcha.login('locked-owner@example.test', '000000', {} as any),
        A.captcha.login('banned-legacy@example.test', '000000', {} as any),
      ]);
      const result = {
        locked: outcome(lockedLogin),
        banned: outcome(bannedLogin),
        legacyBackfilled: (await identitiesOf('local_email', 'banned-legacy@example.test')).length,
        tokens: counters.tokens.length - tokensBefore,
        users: [
          await usersWith('email', 'locked-owner@example.test'),
          await usersWith('email', 'banned-legacy@example.test'),
        ],
      };
      report(`锁定 / 封禁账号的验证码登录：${JSON.stringify(result)}`);
      expect(result).toEqual({
        locked: '400 当前账户已锁定,请联系管理员解锁！',
        banned: '400 当前账户已被永久封禁！',
        legacyBackfilled: 0,
        tokens: 0,
        users: [1, 1],
      });
    },
    TIMEOUT_MS,
  );

  it(
    'keeps Q2 / Q3 / Q6 from growing when unbinding with a non-empty, NULL or empty users column',
    async () => {
      assertReady();
      const cases: Array<[string, (value: string) => string | null]> = [
        ['non-empty', value => value],
        ['null', () => null],
        ['empty', () => ''],
      ];
      const ids: Array<[string, number, number]> = [];
      for (const [name, columnOf] of cases) {
        const value = `unbind-${name}@example.test`;
        const user = await seedUser({ email: columnOf(value) });
        const identity = await seedIdentity(user.id, 'local_email', value);
        ids.push([name, user.id, identity.id]);
      }
      const pick = (result: Record<string, number>) => ({
        Q2: result.Q2_email,
        Q3: result.Q3_email,
        Q6: result.Q6_email,
      });
      const before = pick((await runGate()).result);
      for (const [, userId, identityId] of ids) await A.identity.unbindIdentity(userId, identityId);
      const after = pick((await runGate()).result);
      const columns: Record<string, string | null> = {};
      for (const [name, userId] of ids) {
        columns[name] = (await users().findOne({ where: { id: userId } }))?.email ?? null;
      }
      const left = await identities().count();
      report(
        `解绑三种列值：前 ${JSON.stringify(before)} 后 ${JSON.stringify(after)} 列 ${JSON.stringify(columns)} 剩余身份 ${left}`,
      );
      expect(before).toEqual({ Q2: 0, Q3: 2, Q6: 1 });
      expect(after).toEqual({ Q2: 0, Q3: 0, Q6: 1 });
      expect(columns).toEqual({ 'non-empty': null, null: null, empty: '' });
      expect(left).toBe(0);
    },
    TIMEOUT_MS,
  );

  describe('u1-contact-gate.sql', () => {
    it(
      'reports zero for data written by the new code paths',
      async () => {
        assertReady();
        await A.captcha.login('gate-clean@example.test', '000000', {} as any);
        await A.captcha.login('13800137000', '000000', {} as any);
        const binder = await seedUser();
        await B.captcha.bind(binder.id, 'gate-bound@example.test', '000000');
        await B.captcha.bind(binder.id, '13800137001', '000000');
        const legacy = await seedUser({ email: 'gate-legacy@example.test' });
        await A.identity.ensureContactIdentitiesForUser(legacy);
        const { result } = await runGate();
        report(`门槛（新代码写入的数据）：${JSON.stringify(result)}`);
        expectGate(result, {});
      },
      TIMEOUT_MS,
    );

    it.each([
      [
        'G1: users column differs from the identity spelling (case, tab, no-break space, dotted I)',
        async () => {
          for (const [column, stored] of [
            ['G1-Upper@example.test', 'g1-upper@example.test'],
            ['g1-tab@example.test\t', 'g1-tab@example.test'],
            ['g1-nbsp@example.test ', 'g1-nbsp@example.test'],
          ]) {
            const user = await seedUser({ email: column });
            await seedIdentity(user.id, 'local_email', stored);
          }
          const dotted = await seedUser({ email: 'İ-g1@example.test' });
          await seedIdentity(dotted.id, 'local_email', 'İ-g1@example.test', {
            email: 'i-g1@example.test',
          });
        },
        { G1_email: 4, G2_email: 1 },
      ],
      [
        'G2: identity contact differs from providerUserId (A / B counterexample)',
        async () => {
          const a = await seedUser();
          await seedIdentity(a.id, 'local_email', 'g2-x@example.test', {
            email: 'g2-y@example.test',
          });
          const b = await seedUser({ email: 'g2-y@example.test' });
          await seedIdentity(b.id, 'local_email', 'g2-y@example.test');
        },
        { G2_email: 1, Q3_email: 1 },
      ],
      [
        'G3a / G3b: wrong recorded field and every fallback form',
        async () => {
          const forms: Array<Record<string, unknown> | null> = [
            { contactField: 'phone' },
            null,
            {},
            { contactField: null },
            { contactField: 1 },
            { contactField: 'EMAIL' },
            { contactField: 'email ' },
          ];
          for (const [index, extra] of forms.entries()) {
            const value = `g3-${index}@example.test`;
            const user = await seedUser({ email: value });
            await seedIdentity(user.id, 'local_email', value, { extra });
          }
          for (const [index, extra] of forms.entries()) {
            const value = `1380013600${index}`;
            const user = await seedUser({ phone: value });
            // 手机侧把「记成另一个合法字段」换成 'email'，其余回退形式相同
            await seedIdentity(user.id, 'local_phone', value, {
              extra: index === 0 ? { contactField: 'email' } : extra,
            });
          }
        },
        { G3a_email: 1, G3b_email: 6, G3a_phone: 1, G3b_phone: 6 },
      ],
      [
        'Q1 / Q2: two legacy accounts with the same email',
        async () => {
          await seedUser({ email: 'q1@example.test' });
          await seedUser({ email: 'q1@example.test' });
        },
        { Q1_email: 1, Q2_email: 2 },
      ],
      [
        'Q5: identity of a missing user',
        async () => {
          await seedIdentity(999_999, 'local_email', 'q5@example.test');
        },
        { Q5: 1 },
      ],
      [
        'Q6: empty-string column (all-space values are not empty)',
        async () => {
          await seedUser({ email: '' });
          await seedUser({ email: ' ' });
        },
        { Q6_email: 1, Q2_email: 1 },
      ],
      [
        'Q7: identity owner and column holder differ',
        async () => {
          const owner = await seedUser();
          await seedIdentity(owner.id, 'local_email', 'q7@example.test');
          await seedUser({ email: 'q7@example.test' });
        },
        { Q7_email: 1, Q3_email: 1, Q2_email: 1 },
      ],
      [
        'Q8: identity without its contact column',
        async () => {
          const user = await seedUser({ email: 'q8@example.test' });
          await seedIdentity(user.id, 'local_email', 'q8@example.test', { email: null });
        },
        { Q8_email: 1, G1_email: 1, G2_email: 1 },
      ],
    ])(
      'detects %s',
      async (_title: string, seed: () => Promise<void>, expected: Record<string, number>) => {
        assertReady();
        await seed();
        const { result } = await runGate();
        report(
          `门槛（${_title.split(':')[0]}）：${JSON.stringify(Object.fromEntries(Object.entries(result).filter(([, v]) => v)))}`,
        );
        expectGate(result, expected);
      },
      TIMEOUT_MS,
    );
  });
});
