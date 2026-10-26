import { HttpException } from '@nestjs/common';
import { createMockQueryBuilder, createMockRepository } from '../../../test/mocks/repository.mock';
import { AuthIdentityService } from './auth-identity.service';
import { AUTH_IDENTITY_STATUS } from './auth-identity.types';
import { UserAuthIdentityEntity } from './user-auth-identity.entity';
import { UserEntity } from '../../user/user.entity';
import type { CaptchaLoginAdapter } from '../providers/login-provider.types';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/** 单测里模拟已装载邮箱 / 手机号包：只回答联系方式对应的列，不参与身份补建 */
const CONTACT_FIELDS: Record<string, 'email' | 'phone'> = {
  demo_email: 'email',
  demo_phone: 'phone',
};
/** 解绑判断里「当前可用」的渠道：各用例按需调整 */
const usableProviders = new Set<string>();
const loginProviderRegistryStub = {
  listCaptcha: (): CaptchaLoginAdapter[] => [],
  getCaptcha: (provider: string) =>
    CONTACT_FIELDS[provider] ? { contactField: CONTACT_FIELDS[provider] } : undefined,
  isProviderUsable: async (provider: string) => usableProviders.has(provider),
};

type StoredUser = {
  id: number;
  username: string | null;
  email: string | null;
  phone: string | null;
  password: string | null;
};
type StoredIdentity = {
  id: number;
  userId: number;
  provider: string;
  status: string;
  email?: string | null;
  phone?: string | null;
};

/**
 * 解绑用的内存替身：带 pessimistic_write 的用户行读取按用户排队，写操作在事务提交时才生效、抛错时整体丢弃；
 * 与 MySQL 一致——后到的事务在锁上等待，拿到锁之后读到前一个事务已提交的结果
 */
function createUnbindStore(seed: { users: StoredUser[]; identities: StoredIdentity[] }) {
  const users = new Map(seed.users.map(row => [row.id, { ...row }]));
  let identities = seed.identities.map(row => ({ ...row }));
  const lockTails = new Map<number, Promise<void>>();
  const events: string[] = [];
  const hooks: { beforeDelete?: () => void; userUpdateError?: Error } = {};
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const matches = (row: Record<string, any>, clause: Record<string, any>) =>
    Object.entries(clause).every(([key, value]) => row[key] === value);

  const transaction = async (callback: (manager: any) => Promise<unknown>) => {
    const deletes: number[] = [];
    const patches: Array<[number, Record<string, unknown>]> = [];
    const releases: Array<() => void> = [];
    const lockUser = async (userId: number) => {
      const previous = lockTails.get(userId) || Promise.resolve();
      let release: () => void = () => undefined;
      const current = new Promise<void>(resolve => {
        release = resolve;
      });
      lockTails.set(
        userId,
        previous.then(() => current),
      );
      await previous;
      releases.push(release);
    };
    const userRepo = {
      findOne: async ({ where, lock }: any) => {
        if (lock?.mode === 'pessimistic_write') await lockUser(where.id);
        await tick();
        const row = users.get(where.id);
        return row ? { ...row } : null;
      },
      find: async ({ where, take }: any) => {
        await tick();
        const clauses = Array.isArray(where) ? where : [where];
        return [...users.values()]
          .filter(row => clauses.some((clause: any) => matches(row, clause)))
          .slice(0, take)
          .map(row => ({ id: row.id }));
      },
      update: async (criteria: { id: number }, patch: Record<string, unknown>) => {
        await tick();
        if (hooks.userUpdateError) throw hooks.userUpdateError;
        patches.push([criteria.id, patch]);
        return { affected: 1 };
      },
    };
    const identityRepo = {
      find: async ({ where }: any) => {
        await tick();
        return identities.filter(row => matches(row, where)).map(row => ({ ...row }));
      },
      delete: async (criteria: { id: number; userId: number }) => {
        hooks.beforeDelete?.();
        await tick();
        const exists =
          identities.some(row => matches(row, criteria)) && !deletes.includes(criteria.id);
        if (exists) deletes.push(criteria.id);
        return { affected: exists ? 1 : 0 };
      },
    };
    try {
      const result = await callback({
        getRepository: (entity: unknown) => (entity === UserEntity ? userRepo : identityRepo),
      });
      identities = identities.filter(row => !deletes.includes(row.id));
      for (const [id, patch] of patches) Object.assign(users.get(id) as StoredUser, patch);
      events.push('commit');
      return result;
    } finally {
      releases.forEach(release => release());
    }
  };

  return {
    transaction,
    users,
    events,
    hooks,
    identities: () => identities,
    removeIdentity: (id: number) => {
      identities = identities.filter(row => row.id !== id);
    },
  };
}

describe('AuthIdentityService', () => {
  let identityRepository: any;
  let userRepository: any;
  let billing: any;
  let redisCacheService: any;
  let service: AuthIdentityService;

  beforeEach(() => {
    identityRepository = createMockRepository(jest.fn);
    userRepository = createMockRepository(jest.fn);
    billing = {
      onUserRegistered: jest.fn().mockResolvedValue(undefined),
    };
    redisCacheService = {
      del: jest.fn().mockResolvedValue(undefined),
    };
    identityRepository.create.mockImplementation((input: any) => input);
    identityRepository.delete = jest.fn().mockResolvedValue({ affected: 1 });
    userRepository.create.mockImplementation((input: any) => input);
    userRepository.manager = {
      transaction: jest.fn(async (callback: any) =>
        callback({
          getRepository: jest.fn((entity: any) => {
            if (entity === UserEntity) return userRepository;
            if (entity === UserAuthIdentityEntity) return identityRepository;
            throw new Error(`Unexpected repository: ${entity?.name || entity}`);
          }),
        }),
      ),
    };
    service = new AuthIdentityService(
      identityRepository as any,
      userRepository as any,
      billing as any,
      redisCacheService as any,
      loginProviderRegistryStub as any,
    );
  });

  it('logs in with an existing provider identity and touches last login', async () => {
    identityRepository.findOne.mockResolvedValueOnce({
      id: 11,
      userId: 7,
      provider: 'acme_qr',
      providerUserId: 'openid-1',
      user: { id: 7, username: 'u7', status: 1, role: 'viewer' },
    });

    const user = await service.loginOrCreateByIdentity({
      provider: 'acme_qr',
      providerUserId: 'openid-1',
      scene: 'qr',
    });

    expect(user.id).toBe(7);
    expect(identityRepository.update).toHaveBeenCalledWith(
      { id: 11 },
      expect.objectContaining({ lastLoginAt: expect.any(Date) }),
    );
  });

  it('creates a new user and identity without generating a fake email', async () => {
    identityRepository.findOne.mockResolvedValue(null);
    userRepository.save.mockResolvedValue({
      id: 9,
      username: '微信用户',
      email: null,
      status: 1,
      role: 'viewer',
    });
    identityRepository.save.mockResolvedValue({ id: 21, userId: 9 });

    await service.loginOrCreateByIdentity({
      provider: 'acme_qr',
      providerUserId: 'openid-2',
      linkKey: 'link-2',
      nickname: '微信用户',
      scene: 'oauth',
    });

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: null,
        phone: null,
        username: '微信用户',
      }),
    );
    expect(identityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        provider: 'acme_qr',
        providerUserId: 'openid-2',
        linkKey: 'link-2',
      }),
    );
    expect(userRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(billing.onUserRegistered).toHaveBeenCalledWith(9);
  });

  it('retries user creation when generated uid collides for a third-party identity', async () => {
    identityRepository.findOne.mockResolvedValue(null);
    userRepository.save.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' }).mockResolvedValueOnce({
      id: 9,
      username: '微信用户',
      email: null,
      status: 1,
      role: 'viewer',
    });
    identityRepository.save.mockResolvedValue({ id: 21, userId: 9 });

    const user = await service.loginOrCreateByIdentity({
      provider: 'acme_qr',
      providerUserId: 'openid-uid-retry',
      linkKey: 'link-uid-retry',
      nickname: '微信用户',
      scene: 'oauth',
    });

    expect(user.id).toBe(9);
    expect(userRepository.manager.transaction).toHaveBeenCalledTimes(2);
    expect(userRepository.create).toHaveBeenCalledTimes(2);
    expect(userRepository.save).toHaveBeenCalledTimes(2);
    expect(identityRepository.save).toHaveBeenCalledTimes(1);
    expect(billing.onUserRegistered).toHaveBeenCalledTimes(1);
    expect(billing.onUserRegistered).toHaveBeenCalledWith(9);
  });

  it('keeps Demo OAuth email in identity only when creating a third-party user', async () => {
    identityRepository.findOne.mockResolvedValue(null);
    userRepository.save.mockResolvedValue({
      id: 10,
      username: 'Octo User',
      email: null,
      status: 1,
      role: 'viewer',
    });
    identityRepository.save.mockResolvedValue({ id: 22, userId: 10 });

    await service.loginOrCreateByIdentity({
      provider: 'demo_oauth',
      providerUserId: '10001',
      email: 'octo@example.com',
      emailVerified: true,
      nickname: 'Octo User',
      avatar: 'https://example.com/avatar.png',
      scene: 'oauth',
    });

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: null,
        phone: null,
        username: 'Octo User',
        avatar: '',
      }),
    );
    expect(identityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'demo_oauth',
        providerUserId: '10001',
        email: 'octo@example.com',
        emailVerified: true,
        avatar: null,
      }),
    );
  });

  it('keeps username empty when Demo OAuth identity has no nickname', async () => {
    identityRepository.findOne.mockResolvedValue(null);
    userRepository.save.mockImplementation(async (user: any) => ({
      id: 11,
      status: 1,
      role: 'viewer',
      ...user,
    }));
    identityRepository.save.mockResolvedValue({ id: 23, userId: 11 });

    await service.loginOrCreateByIdentity({
      provider: 'demo_oauth',
      providerUserId: '10002',
      email: 'octo@example.com',
      emailVerified: true,
      avatar: 'https://example.com/avatar.png',
      scene: 'oauth',
    });

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: '',
        nickname: null,
        email: null,
        phone: null,
      }),
    );
  });

  it('keeps username empty when first channel identity has no nickname', async () => {
    identityRepository.findOne.mockResolvedValue(null);
    userRepository.save.mockImplementation(async (user: any) => ({
      id: 12,
      status: 1,
      role: 'viewer',
      ...user,
    }));
    identityRepository.save.mockResolvedValue({ id: 24, userId: 12 });

    await service.loginOrCreateByIdentity({
      provider: 'acme_qr',
      providerUserId: 'openid-without-nickname',
      linkKey: 'link-without-nickname',
      scene: 'oauth',
    });

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: '',
        nickname: null,
        email: null,
        phone: null,
      }),
    );
  });

  it('uses the same default username strategy for second channel without writing legacy user fields', async () => {
    identityRepository.findOne.mockResolvedValue(null);
    userRepository.save.mockImplementation(async (user: any) => ({
      id: 14,
      status: 1,
      role: 'viewer',
      ...user,
    }));
    identityRepository.save.mockResolvedValue({ id: 25, userId: 14 });

    await service.loginOrCreateByIdentity({
      provider: 'acme_web',
      providerUserId: 'open-web-openid',
      linkKey: 'shared-link-key',
      scene: 'oauth',
    });

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: '',
        nickname: null,
        email: null,
        phone: null,
      }),
    );
    const createdUser = userRepository.create.mock.calls[0][0];
    expect(createdUser).not.toHaveProperty('openId');
    expect(createdUser).not.toHaveProperty('linkKey');
    expect(identityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'acme_web',
        providerUserId: 'open-web-openid',
        linkKey: 'shared-link-key',
      }),
    );
  });

  it('merges second channel login into an existing first channel linkKey identity', async () => {
    const existingUser = {
      id: 20,
      username: 'existing',
      nickname: 'existing',
      status: 1,
      role: 'viewer',
    };
    identityRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 31,
        userId: 20,
        provider: 'acme_qr',
        providerUserId: 'official-openid',
        linkKey: 'shared-link-key',
        user: existingUser,
      })
      .mockResolvedValueOnce(null);
    identityRepository.save.mockResolvedValue({
      id: 32,
      userId: 20,
      provider: 'acme_web',
    });

    const user = await service.loginOrCreateByIdentity({
      provider: 'acme_web',
      providerUserId: 'open-web-openid',
      linkKey: 'shared-link-key',
      nickname: '开放平台用户',
      scene: 'oauth',
    });

    expect(user).toBe(existingUser);
    expect(identityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 20,
        provider: 'acme_web',
        providerUserId: 'open-web-openid',
        linkKey: 'shared-link-key',
      }),
    );
    expect(userRepository.create).not.toHaveBeenCalled();
    expect(billing.onUserRegistered).not.toHaveBeenCalled();
    expect(JSON.stringify(userRepository.update.mock.calls)).not.toContain('openId');
    expect(JSON.stringify(userRepository.update.mock.calls)).not.toContain('linkKey');
  });

  it('fills empty profile fields from a bound identity without overwriting existing profile', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 1,
      status: 1,
      username: 'existing',
      nickname: '',
      avatar: '',
    });
    identityRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    identityRepository.save.mockResolvedValue({
      id: 8,
      userId: 1,
      provider: 'demo_oauth',
    });

    await service.bindIdentity(1, {
      provider: 'demo_oauth',
      providerUserId: '10001',
      nickname: 'Octo User',
      avatar: 'https://example.com/avatar.png',
      scene: 'bind',
    });

    expect(userRepository.update).toHaveBeenCalledWith(
      { id: 1 },
      {
        nickname: 'Octo User',
      },
    );
    expect(userRepository.update).not.toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ avatar: 'https://example.com/avatar.png' }),
    );
    expect(userRepository.update).not.toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ username: 'Octo User' }),
    );
  });

  it('stores third-party avatars as public FileAsset instead of persisting raw provider URL', async () => {
    const fileAssetService = {
      createAvatarFromUrl: jest.fn().mockResolvedValue({
        fileId: 'file_ABCDEFGHIJKLMNOPQRSTUVWX',
        publicUrl: '/api/files/public/file_ABCDEFGHIJKLMNOPQRSTUVWX/preview',
        previewUrl: '/api/files/file_ABCDEFGHIJKLMNOPQRSTUVWX/preview',
      }),
    };
    service = new AuthIdentityService(
      identityRepository as any,
      userRepository as any,
      billing as any,
      redisCacheService as any,
      loginProviderRegistryStub as any,
      fileAssetService as any,
    );
    identityRepository.findOne.mockResolvedValue(null);
    userRepository.save.mockResolvedValue({
      id: 10,
      username: 'Octo User',
      email: null,
      status: 1,
      role: 'viewer',
    });
    identityRepository.save.mockResolvedValue({ id: 22, userId: 10 });
    userRepository.createQueryBuilder.mockReturnValue(
      createMockQueryBuilder({
        one: {
          id: 10,
          avatar: '',
          avatarFileId: null,
        },
      }),
    );

    await service.loginOrCreateByIdentity({
      provider: 'demo_oauth',
      providerUserId: '10001',
      email: 'octo@example.com',
      emailVerified: true,
      nickname: 'Octo User',
      avatar: 'https://example.com/avatar.png',
      scene: 'oauth',
    });

    expect(fileAssetService.createAvatarFromUrl).toHaveBeenCalledWith({
      url: 'https://example.com/avatar.png',
      userId: 10,
      provider: 'demo_oauth',
    });
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar: '',
      }),
    );
    expect(identityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar: null,
      }),
    );
    expect(userRepository.update).toHaveBeenCalledWith(
      { id: 10 },
      {
        avatarFileId: 'file_ABCDEFGHIJKLMNOPQRSTUVWX',
        avatar: '/api/files/public/file_ABCDEFGHIJKLMNOPQRSTUVWX/preview',
      },
    );
    expect(identityRepository.update).toHaveBeenCalledWith(
      { id: 22 },
      { avatar: '/api/files/public/file_ABCDEFGHIJKLMNOPQRSTUVWX/preview' },
    );
    expect(JSON.stringify(userRepository.update.mock.calls)).not.toContain(
      'https://example.com/avatar.png',
    );
  });

  it('does not block third-party login when avatar transfer fails', async () => {
    const fileAssetService = {
      createAvatarFromUrl: jest.fn().mockRejectedValue(new Error('download failed')),
    };
    service = new AuthIdentityService(
      identityRepository as any,
      userRepository as any,
      billing as any,
      redisCacheService as any,
      loginProviderRegistryStub as any,
      fileAssetService as any,
    );
    identityRepository.findOne.mockResolvedValue(null);
    userRepository.save.mockResolvedValue({
      id: 10,
      username: 'Octo User',
      email: null,
      status: 1,
      role: 'viewer',
    });
    identityRepository.save.mockResolvedValue({ id: 22, userId: 10 });
    userRepository.createQueryBuilder.mockReturnValue(
      createMockQueryBuilder({
        one: {
          id: 10,
          avatar: '',
          avatarFileId: null,
        },
      }),
    );

    await expect(
      service.loginOrCreateByIdentity({
        provider: 'demo_oauth',
        providerUserId: '10001',
        nickname: 'Octo User',
        avatar: 'https://example.com/avatar.png',
        scene: 'oauth',
      }),
    ).resolves.toMatchObject({ id: 10 });

    expect(billing.onUserRegistered).toHaveBeenCalledWith(10);
    expect(userRepository.update).not.toHaveBeenCalledWith(
      { id: 10 },
      expect.objectContaining({ avatarFileId: expect.any(String) }),
    );
  });

  it('rejects binding an identity that belongs to another user', async () => {
    userRepository.findOne.mockResolvedValue({ id: 1, status: 1 });
    identityRepository.findOne.mockResolvedValueOnce({
      id: 5,
      userId: 2,
      provider: 'acme_qr',
      providerUserId: 'openid-other',
      user: { id: 2, status: 1 },
    });

    await expect(
      service.bindIdentity(1, {
        provider: 'acme_qr',
        providerUserId: 'openid-other',
        scene: 'bind',
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  describe('unbindIdentity', () => {
    const NO_LOGIN_LEFT = '解绑后将没有可用的登录方式，请先设置密码或绑定其他登录方式。';
    const baseUser: StoredUser = {
      id: 1,
      username: 'alice',
      email: null,
      phone: null,
      password: null,
    };
    let store: ReturnType<typeof createUnbindStore>;

    const useStore = (seed: { users: StoredUser[]; identities: StoredIdentity[] }) => {
      store = createUnbindStore(seed);
      userRepository.manager = { transaction: jest.fn(store.transaction) };
      redisCacheService.del.mockImplementation(async ({ key }: { key: string }) => {
        store.events.push(`del ${key}`);
      });
    };
    const identity = (id: number, provider: string, extra: Partial<StoredIdentity> = {}) => ({
      id,
      userId: 1,
      provider,
      status: AUTH_IDENTITY_STATUS.ACTIVE as string,
      ...extra,
    });
    const rejection = async (promise: Promise<unknown>) => {
      const error = await promise.then(
        () => null,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(HttpException);
      return {
        status: (error as HttpException).getStatus(),
        message: (error as HttpException).message,
      };
    };

    beforeEach(() => {
      usableProviders.clear();
    });

    it('lets only one of two concurrent unbinds of the last two identities succeed', async () => {
      usableProviders.add('demo_oauth').add('demo_qr');
      useStore({
        users: [baseUser],
        identities: [identity(1, 'demo_oauth'), identity(2, 'demo_qr')],
      });

      const results = await Promise.allSettled([
        service.unbindIdentity(1, 1),
        service.unbindIdentity(1, 2),
      ]);

      expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(item => item.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(HttpException);
      expect(rejected.reason.getStatus()).toBe(400);
      expect(rejected.reason.message).toBe(NO_LOGIN_LEFT);
      expect(store.identities()).toHaveLength(1);
    });

    it('answers 404 to the second of two concurrent unbinds of the same identity', async () => {
      usableProviders.add('demo_oauth').add('demo_qr');
      useStore({
        users: [baseUser],
        identities: [identity(1, 'demo_oauth'), identity(2, 'demo_qr')],
      });

      const results = await Promise.allSettled([
        service.unbindIdentity(1, 1),
        service.unbindIdentity(1, 1),
      ]);

      expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(item => item.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason.getStatus()).toBe(404);
      expect(rejected.reason.message).toBe('登录身份不存在或已解绑。');
      expect(store.identities().map(row => row.id)).toEqual([2]);
    });

    it('allows unbinding the last identity when a password and an unambiguous identifier remain', async () => {
      useStore({
        users: [{ ...baseUser, password: 'bcrypt-hash' }],
        identities: [identity(1, 'demo_oauth')],
      });

      await expect(service.unbindIdentity(1, 1)).resolves.toBe('解绑成功');
      expect(store.identities()).toHaveLength(0);
    });

    it('does not count a password without an identifier that logs in to this user only', async () => {
      const cases: Array<{ users: StoredUser[] }> = [
        // 没有密码
        { users: [baseUser] },
        // 用户名与别人的用户名相同：密码登录可能命中别人
        {
          users: [
            { ...baseUser, password: 'bcrypt-hash' },
            { ...baseUser, id: 2, password: 'bcrypt-hash' },
          ],
        },
        // 用户名与别人的邮箱相同
        {
          users: [
            { ...baseUser, password: 'bcrypt-hash' },
            { ...baseUser, id: 2, username: 'carol', email: 'alice' },
          ],
        },
        // 1 个字符的用户名不符合登录输入规则
        { users: [{ ...baseUser, username: 'x', password: 'bcrypt-hash' }] },
        // 与登录 DTO 同一套计数：一个表情（两个 UTF-16 单元）、带变体选择符的符号都只算 1 个字符
        { users: [{ ...baseUser, username: '😀', password: 'bcrypt-hash' }] },
        { users: [{ ...baseUser, username: '\u263A\uFE0F', password: 'bcrypt-hash' }] },
        // 超过 50 个字符的邮箱也不符合
        {
          users: [
            {
              ...baseUser,
              username: 'x',
              email: `${'a'.repeat(39)}@example.com`,
              password: 'bcrypt-hash',
            },
          ],
        },
      ];
      for (const item of cases) {
        useStore({ users: item.users, identities: [identity(1, 'demo_oauth')] });
        await expect(rejection(service.unbindIdentity(1, 1))).resolves.toEqual({
          status: 400,
          message: NO_LOGIN_LEFT,
        });
        expect(store.identities()).toHaveLength(1);
      }
    });

    it('accepts an email identifier of exactly 50 characters', async () => {
      useStore({
        users: [
          {
            ...baseUser,
            username: 'x',
            email: `${'a'.repeat(38)}@example.com`,
            password: 'bcrypt-hash',
          },
        ],
        identities: [identity(1, 'demo_oauth')],
      });

      await expect(service.unbindIdentity(1, 1)).resolves.toBe('解绑成功');
    });

    it('counts only remaining identities whose channel is usable now', async () => {
      usableProviders.add('demo_oauth');
      useStore({
        users: [baseUser],
        identities: [identity(1, 'demo_oauth'), identity(2, 'demo_qr')],
      });

      await expect(rejection(service.unbindIdentity(1, 1))).resolves.toEqual({
        status: 400,
        message: NO_LOGIN_LEFT,
      });
      await expect(service.unbindIdentity(1, 2)).resolves.toBe('解绑成功');
      expect(store.identities().map(row => row.provider)).toEqual(['demo_oauth']);
    });

    it('clears the contact column only while it still equals the unbound identity', async () => {
      usableProviders.add('demo_oauth');
      // 同一个邮箱（大小写不同）→ 清空
      useStore({
        users: [{ ...baseUser, email: 'User@Example.com' }],
        identities: [
          identity(1, 'demo_email', { email: 'user@example.com' }),
          identity(2, 'demo_oauth'),
        ],
      });
      await expect(service.unbindIdentity(1, 1)).resolves.toBe('解绑成功');
      expect(store.users.get(1)?.email).toBeNull();

      // 手机号同理
      useStore({
        users: [{ ...baseUser, phone: '13800000000' }],
        identities: [
          identity(1, 'demo_phone', { phone: '13800000000' }),
          identity(2, 'demo_oauth'),
        ],
      });
      await expect(service.unbindIdentity(1, 1)).resolves.toBe('解绑成功');
      expect(store.users.get(1)?.phone).toBeNull();

      // users 上已经是另一个邮箱 → 不清，且它可以作为密码登录的标识让解绑通过
      usableProviders.clear();
      useStore({
        users: [{ ...baseUser, username: 'x', email: 'b@example.com', password: 'bcrypt-hash' }],
        identities: [identity(1, 'demo_email', { email: 'a@example.com' })],
      });
      await expect(service.unbindIdentity(1, 1)).resolves.toBe('解绑成功');
      expect(store.users.get(1)?.email).toBe('b@example.com');
    });

    it('judges with the contact column already cleared, exactly as it will be written', async () => {
      // 邮箱是唯一可用的密码登录标识，解绑这个邮箱身份会清掉它 → 拒绝，什么都不改
      useStore({
        users: [{ ...baseUser, username: 'x', email: 'a@example.com', password: 'bcrypt-hash' }],
        identities: [identity(1, 'demo_email', { email: 'a@example.com' })],
      });

      await expect(rejection(service.unbindIdentity(1, 1))).resolves.toEqual({
        status: 400,
        message: NO_LOGIN_LEFT,
      });
      expect(store.users.get(1)?.email).toBe('a@example.com');
      expect(store.identities()).toHaveLength(1);
    });

    it('answers 409 and changes nothing when the identity row is already gone at delete time', async () => {
      usableProviders.add('demo_oauth');
      useStore({
        users: [{ ...baseUser, email: 'a@example.com' }],
        identities: [
          identity(1, 'demo_email', { email: 'a@example.com' }),
          identity(2, 'demo_oauth'),
        ],
      });
      store.hooks.beforeDelete = () => store.removeIdentity(1);

      await expect(rejection(service.unbindIdentity(1, 1))).resolves.toEqual({
        status: 409,
        message: '登录方式已变化，请刷新后重试。',
      });
      expect(store.users.get(1)?.email).toBe('a@example.com');
      expect(store.events).toEqual([]);
    });

    it('rolls the deletion back when clearing the contact column fails', async () => {
      usableProviders.add('demo_oauth');
      useStore({
        users: [{ ...baseUser, email: 'a@example.com' }],
        identities: [
          identity(1, 'demo_email', { email: 'a@example.com' }),
          identity(2, 'demo_oauth'),
        ],
      });
      const failure = new Error('contact update failed');
      store.hooks.userUpdateError = failure;

      await expect(service.unbindIdentity(1, 1)).rejects.toBe(failure);
      expect(store.identities()).toHaveLength(2);
      expect(store.users.get(1)?.email).toBe('a@example.com');
      expect(store.events).toEqual([]);
    });

    it('answers 404 for an identity that is not an active identity of this user', async () => {
      usableProviders.add('demo_oauth');
      useStore({
        users: [baseUser],
        identities: [identity(1, 'demo_oauth'), { ...identity(2, 'demo_qr'), userId: 2 }],
      });

      await expect(rejection(service.unbindIdentity(1, 2))).resolves.toEqual({
        status: 404,
        message: '登录身份不存在或已解绑。',
      });
    });

    it('invalidates the user info and billing caches after the commit', async () => {
      usableProviders.add('demo_oauth');
      useStore({
        users: [baseUser],
        identities: [identity(1, 'demo_qr'), identity(2, 'demo_oauth')],
      });

      await expect(service.unbindIdentity(1, 1)).resolves.toBe('解绑成功');
      expect(store.events).toEqual(['commit', 'del user:info:1', 'del user:billing:1']);
    });
  });
});
