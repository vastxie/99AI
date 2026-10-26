import { AllExceptionsFilter } from '@/common/filters/allExceptions.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { HttpException, Logger } from '@nestjs/common';
import { firstValueFrom, throwError } from 'rxjs';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import { UserEntity } from '../../user/user.entity';
import type { CaptchaLoginAdapter } from '../providers/login-provider.types';
import { AuthIdentityService } from './auth-identity.service';
import { UserAuthIdentityEntity } from './user-auth-identity.entity';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/**
 * 邮箱 / 手机号防重（U1）在身份服务里的分支：归属解析、自动注册的竞争、绑定、老账号补录、异常边界。
 * 这里只核对分支与调用顺序；事务、唯一索引与行锁的真实效果由 scripts/manual/u1-contact-dedup 在真实 MySQL 上验证
 */

/** 合成的联系方式与用户 ID：日志里不能出现 */
const CONTACT = 'dedup-synthetic@example.test';
const USER_ID = 4242;

const adapter: CaptchaLoginAdapter = {
  provider: 'demo_email',
  kind: 'captcha',
  contactField: 'email',
  matches: () => true,
  normalizeContact: (contact: string) => contact.trim().toLowerCase(),
  sendCode: async () => undefined,
  toIdentity: (contact: string, scene: any) => ({
    provider: 'demo_email',
    providerUserId: contact,
    email: contact,
    emailVerified: true,
    scene,
    contactField: 'email',
  }),
  listEntries: async () => [],
};

const duplicate = () =>
  Object.assign(new Error(`Duplicate entry '${CONTACT}'`), { code: 'ER_DUP_ENTRY', errno: 1062 });
const deadlock = () =>
  Object.assign(new Error(`Deadlock for ${CONTACT}`), { code: 'ER_LOCK_DEADLOCK', errno: 1213 });
const lockTimeout = () =>
  Object.assign(new Error(`Lock wait timeout\n    at ${CONTACT} (fake frame)`), {
    code: 'ER_LOCK_WAIT_TIMEOUT',
    errno: 1205,
  });

/** 让异常依次经过 TransformInterceptor 与 AllExceptionsFilter（与线上 HTTP 链路相同） */
async function throughGlobalErrorChain(exception: unknown) {
  const context = {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({ getResponse: () => ({}), getRequest: () => ({ path: '/api/test' }) }),
  };
  let transformed: unknown;
  try {
    await firstValueFrom(
      new TransformInterceptor().intercept(context as any, {
        handle: () => throwError(() => exception),
      }),
    );
  } catch (error) {
    transformed = error;
  }
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ headersSent: false, writableEnded: false, status }),
      getRequest: () => ({ path: '/api/test' }),
    }),
  };
  new AllExceptionsFilter().catch(transformed, host as any);
  return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
}

describe('AuthIdentityService contact dedup', () => {
  let identities: any;
  let users: any;
  let billing: any;
  let redis: any;
  let service: AuthIdentityService;
  let events: string[];
  let logged: unknown[][];

  beforeEach(() => {
    identities = createMockRepository(jest.fn);
    users = createMockRepository(jest.fn);
    identities.create.mockImplementation((input: any) => input);
    users.create.mockImplementation((input: any) => input);
    identities.findOne.mockResolvedValue(null);
    users.findOne.mockResolvedValue(null);
    users.find.mockResolvedValue([]);
    identities.save.mockImplementation(async (input: any) => {
      events.push('identity.save');
      return { id: 21, ...input };
    });
    users.update.mockImplementation(async () => {
      events.push('users.update');
      return { affected: 1 };
    });
    events = [];
    const getRepository = (entity: unknown) => {
      if (entity === UserEntity) return users;
      if (entity === UserAuthIdentityEntity) return identities;
      throw new Error('unexpected repository');
    };
    users.manager = {
      getRepository,
      transaction: jest.fn(async (callback: any) => {
        events.push('begin');
        const result = await callback({ getRepository });
        events.push('commit');
        return result;
      }),
    };
    billing = { onUserRegistered: jest.fn(async () => events.push('billing')) };
    redis = { del: jest.fn(async () => events.push('cache.clear')) };
    service = new AuthIdentityService(
      identities as any,
      users as any,
      billing as any,
      redis as any,
      { listCaptcha: () => [adapter], getCaptcha: () => adapter } as any,
    );
    logged = [];
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(Logger, level).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }
  });

  afterEach(() => {
    const text = JSON.stringify(logged).toLowerCase();
    expect(text).not.toContain('dedup-synthetic');
    expect(text).not.toContain(String(USER_ID));
    jest.restoreAllMocks();
  });

  describe('findContactOwner', () => {
    it('reads the identity regardless of status and the users column with the database comparison', async () => {
      await expect(service.findContactOwner(adapter, CONTACT)).resolves.toEqual({ kind: 'none' });
      expect(identities.findOne).toHaveBeenCalledWith({
        where: { provider: 'demo_email', providerUserId: CONTACT },
      });
      expect(users.find).toHaveBeenCalledWith({ where: { email: CONTACT }, take: 2 });
    });

    it('treats a single legacy account without an identity as the owner', async () => {
      const legacy = { id: USER_ID, email: CONTACT };
      users.find.mockResolvedValue([legacy]);
      await expect(service.findContactOwner(adapter, CONTACT)).resolves.toEqual({
        kind: 'owner',
        user: legacy,
      });
    });

    it('uses the identity owner when no other account holds the contact', async () => {
      const owner = { id: USER_ID, email: CONTACT };
      identities.findOne.mockResolvedValue({ userId: USER_ID, status: 'active' });
      users.find.mockResolvedValue([{ id: USER_ID }]);
      users.findOne.mockResolvedValue(owner);
      await expect(service.findContactOwner(adapter, CONTACT)).resolves.toEqual({
        kind: 'owner',
        user: owner,
      });
      expect(users.findOne).toHaveBeenCalledWith({ where: { id: USER_ID } });
    });

    it.each([
      [
        'another account holds the users column',
        { userId: USER_ID, status: 'active' },
        [{ id: 8 }],
        { id: USER_ID },
      ],
      ['the identity user is missing', { userId: USER_ID, status: 'active' }, [], null],
      [
        'a disabled identity while another account holds the column',
        { userId: USER_ID, status: 'disabled' },
        [{ id: 8 }],
        { id: USER_ID },
      ],
      ['several legacy accounts hold the column', null, [{ id: 8 }, { id: 9 }], null],
    ])(
      'reports a conflict when %s',
      async (_title: string, identity: any, holders: any[], owner: any) => {
        identities.findOne.mockResolvedValue(identity);
        users.find.mockResolvedValue(holders);
        users.findOne.mockResolvedValue(owner);
        await expect(service.findContactOwner(adapter, CONTACT)).resolves.toEqual({
          kind: 'conflict',
        });
      },
    );

    it('reports a disabled identity that nobody else holds', async () => {
      identities.findOne.mockResolvedValue({ userId: USER_ID, status: 'unbound' });
      users.findOne.mockResolvedValue({ id: USER_ID });
      await expect(service.findContactOwner(adapter, CONTACT)).resolves.toEqual({
        kind: 'disabled',
      });
    });
  });

  describe('registerContactUser', () => {
    const identity = () => adapter.toIdentity(CONTACT, 'captcha');

    it('creates the user and the identity in one transaction, then grants the bonus', async () => {
      users.save.mockResolvedValue({ id: USER_ID, email: CONTACT });

      await expect(service.registerContactUser(identity())).resolves.toEqual({
        id: USER_ID,
        email: CONTACT,
      });

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: CONTACT, phone: null, username: '', status: 1 }),
      );
      expect(identities.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          provider: 'demo_email',
          providerUserId: CONTACT,
          email: CONTACT,
          scene: 'captcha',
          extra: { contactField: 'email' },
        }),
      );
      expect(events).toEqual(['begin', 'identity.save', 'commit', 'billing']);
    });

    it.each([
      ['a duplicate identity', duplicate],
      ['a deadlock', deadlock],
    ])(
      'returns null without the bonus when the identity write hits %s',
      async (_title: string, error: () => Error) => {
        users.save.mockResolvedValue({ id: USER_ID });
        identities.save.mockRejectedValue(error());

        await expect(service.registerContactUser(identity())).resolves.toBeNull();
        expect(billing.onUserRegistered).not.toHaveBeenCalled();
      },
    );

    it('rethrows other errors from the creation transaction', async () => {
      users.save.mockResolvedValue({ id: USER_ID });
      identities.save.mockRejectedValue(lockTimeout());
      await expect(service.registerContactUser(identity())).rejects.toMatchObject({
        code: 'ER_LOCK_WAIT_TIMEOUT',
      });
    });

    it('does not treat a failure after commit as a lost race, even with a duplicate-key code', async () => {
      users.save.mockResolvedValue({ id: USER_ID });
      billing.onUserRegistered.mockRejectedValue(duplicate());
      await expect(service.registerContactUser(identity())).rejects.toMatchObject({
        code: 'ER_DUP_ENTRY',
      });
      expect(identities.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('bindContactIdentity', () => {
    beforeEach(() => {
      users.findOne.mockImplementation(async ({ lock }: any) => {
        if (!lock) return null;
        events.push('lock user');
        return { id: USER_ID, status: 1 };
      });
    });

    it('locks the user row first, writes the identity and the users column, and clears the cache after commit', async () => {
      await service.bindContactIdentity(USER_ID, adapter, CONTACT);

      expect(users.findOne).toHaveBeenCalledWith({
        where: { id: USER_ID },
        lock: { mode: 'pessimistic_write' },
      });
      expect(identities.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, providerUserId: CONTACT, scene: 'bind' }),
      );
      expect(users.update).toHaveBeenCalledWith({ id: USER_ID }, { email: CONTACT });
      expect(events).toEqual([
        'begin',
        'lock user',
        'identity.save',
        'users.update',
        'commit',
        'cache.clear',
        'cache.clear',
      ]);
    });

    it('re-binding the same contact writes the identity’s stored spelling into the users column', async () => {
      identities.findOne.mockImplementation(async ({ where }: any) =>
        where.providerUserId
          ? { id: 3, userId: USER_ID, status: 'active', email: 'Dedup-Synthetic@Example.test' }
          : null,
      );

      await service.bindContactIdentity(USER_ID, adapter, CONTACT);

      expect(identities.save).not.toHaveBeenCalled();
      expect(users.update).toHaveBeenCalledWith(
        { id: USER_ID },
        { email: 'Dedup-Synthetic@Example.test' },
      );
    });

    it('refuses an idempotent bind whose identity has no stored contact', async () => {
      identities.findOne.mockImplementation(async ({ where }: any) =>
        where.providerUserId ? { id: 3, userId: USER_ID, status: 'active', email: null } : null,
      );
      await expect(service.bindContactIdentity(USER_ID, adapter, CONTACT)).rejects.toThrow(
        '数据不一致',
      );
      expect(users.update).not.toHaveBeenCalled();
    });

    it.each([
      [
        'an identity of another account',
        { userId: 8, status: 'active' },
        null,
        null,
        '已被其他账号绑定',
      ],
      [
        'another account’s users column, even for an idempotent bind',
        { userId: USER_ID, status: 'active', email: CONTACT },
        { id: 8 },
        null,
        '已被其他账号绑定',
      ],
      [
        'a disabled identity of this account',
        { userId: USER_ID, status: 'disabled', email: CONTACT },
        null,
        null,
        '已停用',
      ],
      [
        'another identity of the same channel on this account',
        null,
        null,
        { id: 5 },
        '当前账号已绑定该类型登录方式',
      ],
    ])(
      'refuses %s',
      async (_title: string, taken: any, holder: any, sameProvider: any, text: string) => {
        identities.findOne.mockImplementation(async ({ where }: any) =>
          where.providerUserId ? taken : sameProvider,
        );
        users.findOne.mockImplementation(async ({ where, lock }: any) => {
          if (lock) return { id: USER_ID, status: 1 };
          return where.id ? holder : null;
        });

        await expect(service.bindContactIdentity(USER_ID, adapter, CONTACT)).rejects.toThrow(text);
        expect(identities.save).not.toHaveBeenCalled();
        expect(users.update).not.toHaveBeenCalled();
        expect(redis.del).not.toHaveBeenCalled();
      },
    );

    it('checks other holders with Not(own id)', async () => {
      await service.bindContactIdentity(USER_ID, adapter, CONTACT);
      const holderQuery = users.findOne.mock.calls.find(([options]: any) => options.where.email);
      expect(holderQuery[0].where.email).toBe(CONTACT);
      expect(holderQuery[0].where.id).toMatchObject({ _type: 'not', _value: USER_ID });
    });

    it('rejects a missing or blocked user', async () => {
      users.findOne.mockResolvedValueOnce(null);
      await expect(service.bindContactIdentity(USER_ID, adapter, CONTACT)).rejects.toThrow(
        '当前绑定用户不存在',
      );
      users.findOne.mockResolvedValueOnce({ id: USER_ID, status: 2 });
      await expect(service.bindContactIdentity(USER_ID, adapter, CONTACT)).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(identities.save).not.toHaveBeenCalled();
    });

    it('after losing a race, reports the specific conflict found on fresh reads', async () => {
      identities.save.mockRejectedValueOnce(duplicate());
      let afterRace = false;
      users.manager.transaction.mockImplementation(async (callback: any) => {
        try {
          return await callback({ getRepository: users.manager.getRepository });
        } finally {
          afterRace = true;
        }
      });
      identities.findOne.mockImplementation(async ({ where }: any) =>
        afterRace && where.providerUserId ? { userId: 8, status: 'active' } : null,
      );

      await expect(service.bindContactIdentity(USER_ID, adapter, CONTACT)).rejects.toThrow(
        '已被其他账号绑定',
      );
      expect(users.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('retries once when the race left no conflict, then gives up with 409', async () => {
      identities.save.mockRejectedValueOnce(deadlock());
      await service.bindContactIdentity(USER_ID, adapter, CONTACT);
      expect(users.manager.transaction).toHaveBeenCalledTimes(2);

      identities.save.mockRejectedValue(duplicate());
      await expect(service.bindContactIdentity(USER_ID, adapter, CONTACT)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('does not retry the transaction when a step after commit fails, even with a duplicate-key code', async () => {
      redis.del.mockRejectedValueOnce(duplicate());
      await expect(service.bindContactIdentity(USER_ID, adapter, CONTACT)).rejects.toMatchObject({
        code: 'ER_DUP_ENTRY',
      });
      expect(users.manager.transaction).toHaveBeenCalledTimes(1);
      expect(identities.save).toHaveBeenCalledTimes(1);
    });

    it('lets other errors through, including on the retry, and does not clear the cache', async () => {
      identities.save.mockRejectedValueOnce(duplicate()).mockRejectedValueOnce(lockTimeout());
      await expect(service.bindContactIdentity(USER_ID, adapter, CONTACT)).rejects.toMatchObject({
        code: 'ER_LOCK_WAIT_TIMEOUT',
      });
      users.update.mockRejectedValueOnce(lockTimeout());
      await expect(service.bindContactIdentity(USER_ID, adapter, CONTACT)).rejects.toMatchObject({
        code: 'ER_LOCK_WAIT_TIMEOUT',
      });
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe('ensureContactIdentitiesForUser', () => {
    const snapshot = { id: USER_ID, email: CONTACT, phone: null } as any;

    it('skips without a transaction when the user already has an identity of the channel', async () => {
      identities.findOne.mockResolvedValue({ id: 3 });
      await service.ensureContactIdentitiesForUser(snapshot);
      expect(identities.findOne).toHaveBeenCalledWith({
        where: { userId: USER_ID, provider: 'demo_email' },
        select: { id: true },
      });
      expect(users.manager.transaction).not.toHaveBeenCalled();
    });

    it('re-reads the column under the user row lock and writes the current value', async () => {
      users.findOne.mockImplementation(async ({ lock }: any) =>
        lock ? { id: USER_ID, email: 'current-dedup-synthetic@example.test' } : null,
      );
      await service.ensureContactIdentitiesForUser(snapshot);

      expect(users.findOne).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: { id: true, email: true, phone: true },
        lock: { mode: 'pessimistic_write' },
      });
      expect(identities.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          providerUserId: 'current-dedup-synthetic@example.test',
          email: 'current-dedup-synthetic@example.test',
          scene: 'password',
          extra: { contactField: 'email' },
        }),
      );
    });

    it('writes nothing when an unbind already cleared the column', async () => {
      users.findOne.mockResolvedValue({ id: USER_ID, email: null });
      await service.ensureContactIdentitiesForUser(snapshot);
      expect(identities.save).not.toHaveBeenCalled();
    });

    it.each([
      ['an identity of another account', { id: 3, userId: 8 }, null, true],
      ['an identity of this account', { id: 3, userId: USER_ID }, null, false],
      ['another account holding the same column', null, { id: 8 }, true],
    ])(
      'writes nothing when there is %s',
      async (_title: string, taken: any, holder: any, warns: boolean) => {
        identities.findOne.mockImplementation(async ({ where }: any) =>
          where.providerUserId ? taken : null,
        );
        users.findOne.mockImplementation(async ({ lock }: any) =>
          lock ? { id: USER_ID, email: CONTACT } : holder,
        );
        await service.ensureContactIdentitiesForUser(snapshot);
        expect(identities.save).not.toHaveBeenCalled();
        expect(logged.some(([, context]) => context === 'AuthIdentityService')).toBe(warns);
      },
    );

    it('writes nothing when another identity of the channel appears between the fast path and the lock', async () => {
      users.findOne.mockImplementation(async ({ lock }: any) =>
        lock ? { id: USER_ID, email: CONTACT } : null,
      );
      identities.findOne
        .mockResolvedValueOnce(null) // 快路径：本人还没有该渠道的身份
        .mockResolvedValueOnce(null) // 锁内：该联系方式没有身份
        .mockResolvedValueOnce({ id: 5 }); // 锁内：本人已有该渠道的其他身份
      await service.ensureContactIdentitiesForUser(snapshot);
      expect(identities.save).not.toHaveBeenCalled();
      expect(logged).toContainEqual([
        '补录登录身份时本人已有该渠道的其他身份，已跳过',
        'AuthIdentityService',
      ]);
    });

    it('skips quietly when a concurrent write wins', async () => {
      users.findOne.mockImplementation(async ({ lock }: any) =>
        lock ? { id: USER_ID, email: CONTACT } : null,
      );
      identities.save.mockRejectedValue(duplicate());
      await expect(service.ensureContactIdentitiesForUser(snapshot)).resolves.toBeUndefined();
      expect(identities.save).toHaveBeenCalledTimes(1);
    });

    it('turns other database errors into a static, controlled login failure with a safe summary', async () => {
      users.findOne.mockImplementation(async ({ lock }: any) =>
        lock ? { id: USER_ID, email: CONTACT } : null,
      );
      identities.save.mockRejectedValue(lockTimeout());

      let thrown: any;
      try {
        await service.ensureContactIdentitiesForUser(snapshot);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect(thrown.getStatus()).toBe(500);
      expect(thrown.message).toBe('登录失败，请稍后重试');
      expect(thrown.controlled).toBe(true);
      expect(logged).toContainEqual([
        '补录登录身份失败',
        'Error code=ER_LOCK_WAIT_TIMEOUT errno=1205',
        'AuthIdentityService',
      ]);
    });

    it('keeps the raw error out of the interceptor and filter logs on the password-login path', async () => {
      users.findOne.mockImplementation(async ({ lock }: any) =>
        lock ? { id: USER_ID, email: CONTACT } : null,
      );
      identities.save.mockRejectedValue(lockTimeout());
      let thrown: unknown;
      try {
        await service.ensureContactIdentitiesForUser(snapshot);
      } catch (error) {
        thrown = error;
      }
      const response = await throughGlobalErrorChain(thrown);
      expect(response.status).toBe(500);
      expect(response.body.message).toBe('登录失败，请稍后重试');
    });

    it('does nothing for users without contacts', async () => {
      await service.ensureContactIdentitiesForUser({
        id: USER_ID,
        email: null,
        phone: null,
      } as any);
      expect(identities.findOne).not.toHaveBeenCalled();
    });
  });

  describe('unbinding identities without a recorded contactField (G3b)', () => {
    it.each([
      ['the channel pack is loaded', true],
      ['the channel pack is not loaded', false],
    ])('clears the users column only when %s', async (_title: string, loaded: boolean) => {
      const registry = {
        listCaptcha: () => [],
        getCaptcha: (provider: string) =>
          loaded && provider === 'demo_email' ? adapter : undefined,
        isProviderUsable: async () => true,
      };
      const svc = new AuthIdentityService(
        identities as any,
        users as any,
        billing as any,
        redis as any,
        registry as any,
      );
      users.findOne.mockResolvedValue({
        id: USER_ID,
        username: 'u',
        email: CONTACT,
        phone: null,
        password: 'hash',
      });
      identities.find.mockResolvedValue([
        {
          id: 3,
          userId: USER_ID,
          provider: 'demo_email',
          email: CONTACT,
          status: 'active',
          extra: null,
        },
        { id: 4, userId: USER_ID, provider: 'demo_qr', status: 'active', extra: null },
      ]);
      identities.delete = jest.fn().mockResolvedValue({ affected: 1 });

      await svc.unbindIdentity(USER_ID, 3);

      expect(identities.delete).toHaveBeenCalledWith({ id: 3, userId: USER_ID });
      if (loaded) expect(users.update).toHaveBeenCalledWith({ id: USER_ID }, { email: null });
      else expect(users.update).not.toHaveBeenCalled();
    });
  });
});
