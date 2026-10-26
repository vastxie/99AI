import { ForbiddenException, HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginProviderRegistry } from './providers/login-provider.registry';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createService(overrides: Partial<Record<string, any>> = {}) {
  const userService = {
    verifyUserCredentials: jest.fn(),
    verifyUserPassword: jest.fn(),
    updateUserPassword: jest.fn(),
    checkUserStatus: jest.fn(),
    isUsernameTaken: jest.fn().mockResolvedValue(false),
    createPasswordUser: jest.fn(),
    getUserInfo: jest.fn(),
    ...(overrides.userService || {}),
  };
  const authTokenService = {
    issueLoginToken: jest.fn().mockResolvedValue('login-token'),
    createVisitorToken: jest.fn().mockResolvedValue('visitor-token'),
  };
  const authIdentityService = {
    ensureContactIdentitiesForUser: jest.fn(),
    listUserIdentities: jest.fn().mockResolvedValue([]),
    unbindIdentity: jest.fn(),
  };
  const registry = new LoginProviderRegistry();
  const billing = { onUserRegistered: jest.fn() };
  const redisCacheService = {
    incrByWithInitialExpire: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    ...(overrides.redisCacheService || {}),
  };
  const configs: Record<string, any> = overrides.configs || {};
  const globalConfigService = {
    getConfigs: jest.fn(async (keys: string[]) =>
      keys.length === 1 ? configs[keys[0]] : Object.fromEntries(keys.map(k => [k, configs[k]])),
    ),
  };
  const service = new AuthService(
    userService as any,
    authTokenService as any,
    authIdentityService as any,
    registry,
    billing as any,
    redisCacheService as any,
    globalConfigService as any,
  );
  const req = { headers: { 'x-forwarded-for': '203.0.113.9' }, ip: '203.0.113.9' } as any;
  return {
    service,
    userService,
    authTokenService,
    authIdentityService,
    registry,
    billing,
    redisCacheService,
    req,
  };
}

describe('AuthService password login', () => {
  it('verifies credentials, backfills contact identities and issues a token', async () => {
    const { service, userService, authIdentityService, authTokenService, req } = createService();
    const user = { id: 1, username: 'alice', email: 'alice@example.com' };
    userService.verifyUserCredentials.mockResolvedValue(user);

    await expect(service.login({ username: 'alice', password: 'secret1' }, req)).resolves.toBe(
      'login-token',
    );

    expect(authIdentityService.ensureContactIdentitiesForUser).toHaveBeenCalledWith(user);
    expect(authTokenService.issueLoginToken).toHaveBeenCalledWith(user, req);
  });

  it('counts failed attempts per account and per IP, then locks the account', async () => {
    const { service, userService, redisCacheService, req } = createService();
    userService.verifyUserCredentials.mockRejectedValue(new HttpException('账户或密码错误！', 400));

    await expect(service.login({ username: 'alice', password: 'wrong-pass' }, req)).rejects.toThrow(
      '账户或密码错误',
    );
    expect(redisCacheService.incrByWithInitialExpire).toHaveBeenCalledTimes(2);
    const [accountKey] = redisCacheService.incrByWithInitialExpire.mock.calls[0];
    const [ipKey] = redisCacheService.incrByWithInitialExpire.mock.calls[1];
    expect(accountKey).toMatch(/^auth:login:fail:account:[0-9a-f]{32}$/);
    expect(accountKey).not.toContain('alice');
    expect(ipKey).toMatch(/^auth:login:fail:ip:[0-9a-f]{32}$/);

    redisCacheService.get.mockImplementation(async ({ key }: { key: string }) =>
      key === accountKey ? '5' : null,
    );
    await expect(service.login({ username: 'alice', password: 'wrong-pass' }, req)).rejects.toThrow(
      '登录失败次数过多',
    );
    expect(userService.verifyUserCredentials).toHaveBeenCalledTimes(1);
  });

  it('locks by IP after too many failures across accounts and clears the account counter on success', async () => {
    const { service, userService, redisCacheService, req } = createService();
    redisCacheService.get.mockImplementation(async ({ key }: { key: string }) =>
      key.startsWith('auth:login:fail:ip:') ? '50' : null,
    );
    await expect(service.login({ username: 'bob', password: 'secret1' }, req)).rejects.toThrow(
      '登录失败次数过多',
    );

    redisCacheService.get.mockResolvedValue(null);
    userService.verifyUserCredentials.mockResolvedValue({ id: 2, username: 'bob' });
    await expect(service.login({ username: 'bob', password: 'secret1' }, req)).resolves.toBe(
      'login-token',
    );
    expect(redisCacheService.del).toHaveBeenCalledWith({
      key: expect.stringMatching(/^auth:login:fail:account:/),
    });
  });

  it('throttles visitor session creation per IP', async () => {
    const { service, authTokenService, redisCacheService, req } = createService();
    redisCacheService.incrByWithInitialExpire.mockResolvedValueOnce(1);
    await expect(service.createVisitorSession({}, req)).resolves.toBe('visitor-token');
    expect(redisCacheService.incrByWithInitialExpire).toHaveBeenCalledWith(
      'auth:visitor:ip:203.0.113.9',
      1,
      3600,
    );

    redisCacheService.incrByWithInitialExpire.mockResolvedValueOnce(31);
    await expect(service.createVisitorSession({}, req)).rejects.toThrow('游客会话创建过于频繁');
    expect(authTokenService.createVisitorToken).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService password registration', () => {
  it('creates a password user, grants the new-user balance and logs in', async () => {
    const { service, userService, billing, authTokenService, req } = createService();
    userService.createPasswordUser.mockResolvedValue({ id: 9, username: 'bob' });

    await expect(
      service.register({ username: 'bob', password: 'secret1', nickname: ' Bob ' }, req),
    ).resolves.toBe('login-token');

    expect(userService.createPasswordUser).toHaveBeenCalledWith({
      username: 'bob',
      password: 'secret1',
      nickname: 'Bob',
      status: 1,
    });
    expect(billing.onUserRegistered).toHaveBeenCalledWith(9);
    expect(authTokenService.issueLoginToken).toHaveBeenCalledWith({ id: 9, username: 'bob' }, req);
  });

  it('refuses registration when the site closed self-service sign-up', async () => {
    const { service, userService, req } = createService({
      configs: { passwordRegisterStatus: '0' },
    });

    await expect(service.register({ username: 'bob', password: 'secret1' }, req)).rejects.toThrow(
      '未开放自助注册',
    );
    expect(userService.createPasswordUser).not.toHaveBeenCalled();
  });

  it('rejects taken usernames and throttles registrations per IP', async () => {
    const { service, userService, redisCacheService, req } = createService();
    userService.isUsernameTaken.mockResolvedValue(true);
    await expect(service.register({ username: 'bob', password: 'secret1' }, req)).rejects.toThrow(
      '已被使用',
    );

    userService.isUsernameTaken.mockResolvedValue(false);
    redisCacheService.incrByWithInitialExpire.mockResolvedValue(21);
    await expect(service.register({ username: 'bob', password: 'secret1' }, req)).rejects.toThrow(
      '注册过于频繁',
    );
    expect(userService.createPasswordUser).not.toHaveBeenCalled();
  });
});

describe('AuthService listProviders', () => {
  it('always lists account/password with the register policy, plus enabled adapter entries', async () => {
    const { service, registry } = createService({ configs: { passwordRegisterStatus: '1' } });
    registry.register({
      provider: 'demo_email',
      kind: 'captcha',
      contactField: 'email',
      matches: () => true,
      normalizeContact: (value: string) => value,
      sendCode: jest.fn(),
      toIdentity: jest.fn(),
      listEntries: async () => [
        { provider: 'demo_email', displayName: '邮箱验证码', type: 'captcha', enabled: true },
      ],
    });
    registry.register({
      provider: 'demo_oauth',
      kind: 'oauth',
      createOAuthUrl: jest.fn(),
      fetchIdentityByCode: jest.fn(),
      listEntries: async () => [],
    });

    await expect(service.listProviders()).resolves.toEqual([
      {
        provider: 'local_password',
        displayName: '账号密码',
        type: 'password',
        enabled: true,
        registerEnabled: true,
      },
      {
        provider: 'demo_email',
        displayName: '邮箱验证码',
        type: 'captcha',
        enabled: true,
        contactField: 'email',
      },
    ]);
  });

  it('marks registration closed when the switch is off', async () => {
    const { service } = createService({ configs: { passwordRegisterStatus: '0' } });
    const [password] = await service.listProviders();
    expect(password.registerEnabled).toBe(false);
  });
});

describe('AuthService updatePassword', () => {
  it('rejects when the old password does not match', async () => {
    const { service, userService } = createService();
    userService.verifyUserPassword.mockResolvedValue(false);

    await expect(
      service.updatePassword({ user: { id: 1 } } as any, {
        oldPassword: 'old',
        password: 'new-secret',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(userService.updateUserPassword).not.toHaveBeenCalled();
  });

  it('propagates a failed password write', async () => {
    const { service, userService } = createService();
    userService.verifyUserPassword.mockResolvedValue(true);
    userService.updateUserPassword.mockRejectedValue(new HttpException('修改密码失败', 400));

    await expect(
      service.updatePassword({ user: { id: 1 } } as any, {
        oldPassword: 'old',
        password: 'new-secret',
      }),
    ).rejects.toThrow('修改密码失败');
  });
});

describe('AuthService registered-user boundary', () => {
  const visitorRequest = {
    user: { uid: 'visitor-uid', id: 'visitor:abc123', username: '游客', role: 'visitor' },
  } as any;

  it('refuses visitors with 403 before touching passwords or identities', async () => {
    const { service, userService, authIdentityService } = createService();

    await expect(
      service.updatePassword(visitorRequest, { oldPassword: 'old', password: 'new-secret' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(() => service.listIdentities(visitorRequest)).toThrow(ForbiddenException);
    expect(() => service.unbindIdentity(visitorRequest, 3)).toThrow(ForbiddenException);

    expect(userService.verifyUserPassword).not.toHaveBeenCalled();
    expect(userService.updateUserPassword).not.toHaveBeenCalled();
    expect(authIdentityService.listUserIdentities).not.toHaveBeenCalled();
    expect(authIdentityService.unbindIdentity).not.toHaveBeenCalled();
  });

  it('uses the numeric user id for registered users', async () => {
    const { service, authIdentityService } = createService();
    const request = { user: { uid: 'AbC123xYz789', id: 42, role: 'user' } } as any;

    await service.listIdentities(request);
    await service.unbindIdentity(request, 3);

    expect(authIdentityService.listUserIdentities).toHaveBeenCalledWith(42);
    expect(authIdentityService.unbindIdentity).toHaveBeenCalledWith(42, 3);
  });
});

describe('AuthService current account validation', () => {
  it('delegates current HTTP/WS identity checks to UserService', async () => {
    const { service, userService } = createService();
    userService.checkUserStatus.mockResolvedValue(true);

    await expect(service.validateAuthenticatedUser({ id: 1, role: 'viewer' })).resolves.toBe(true);
    expect(userService.checkUserStatus).toHaveBeenCalledWith({ id: 1, role: 'viewer' });
  });
});

describe('AuthService getInfo visitor projection', () => {
  it('returns visitor uid without listing identities', async () => {
    const { service, userService, authIdentityService } = createService();
    userService.getUserInfo.mockResolvedValue({
      userInfo: { id: 0, username: '游客', role: 'visitor' },
    });

    const result = await service.getInfo({
      user: { id: 0, uid: 'visitor-uid', role: 'visitor' },
    } as any);

    expect(result.userInfo).toEqual({
      id: 'visitor-uid',
      uid: 'visitor-uid',
      username: '游客',
      role: 'visitor',
      identities: [],
    });
    expect(authIdentityService.listUserIdentities).not.toHaveBeenCalled();
  });
});
