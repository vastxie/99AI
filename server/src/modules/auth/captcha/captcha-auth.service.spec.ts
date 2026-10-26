import { AllExceptionsFilter } from '@/common/filters/allExceptions.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { HttpException, Logger } from '@nestjs/common';
import { firstValueFrom, throwError } from 'rxjs';
import { AuthIdentityService } from '../identity/auth-identity.service';
import { LoginProviderRegistry } from '../providers/login-provider.registry';
import type { CaptchaLoginAdapter } from '../providers/login-provider.types';
import { CaptchaAuthService } from './captcha-auth.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/** 合成的联系方式与用户 ID：日志、异常里都不能出现它们（含大小写变体） */
const CONTACT = 'dedup-synthetic@example.test';
const USER_ID = 4242;

function emailAdapter(overrides: Partial<CaptchaLoginAdapter> = {}): CaptchaLoginAdapter {
  return {
    provider: 'demo_email',
    kind: 'captcha',
    contactField: 'email',
    matches: (contact: string) => contact.includes('@'),
    normalizeContact: (contact: string) => contact.trim().toLowerCase(),
    sendCode: jest.fn(),
    toIdentity: (contact: string, scene: any) => ({
      provider: 'demo_email',
      providerUserId: contact,
      email: contact,
      scene,
      contactField: 'email',
    }),
    listEntries: async () => [],
    ...overrides,
  };
}

/** 数据库驱动错误的样子：多行消息里带联系方式、用户 ID 与伪装成栈帧的行 */
function rawDatabaseError() {
  return Object.assign(
    new Error(
      `Duplicate entry '${CONTACT}' for user ${USER_ID}\n    at ${CONTACT.toUpperCase()} (fake frame)`,
    ),
    { code: 'ER_LOCK_WAIT_TIMEOUT', errno: 1205 },
  );
}

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

describe('CaptchaAuthService', () => {
  let registry: LoginProviderRegistry;
  let codes: { issue: any; discard: any; verify: any };
  let userService: { updateUserPassword: any };
  let identity: {
    findContactOwner: any;
    registerContactUser: any;
    bindContactIdentity: any;
    assertContactBindable: any;
    ensureContactIdentitiesForUser: any;
    assertUserCanLogin: any;
  };
  let tokens: { issueLoginToken: any };
  let redis: { set: any; getDel: any; incrByWithInitialExpire: any };
  let service: CaptchaAuthService;
  let logged: unknown[][];
  const req = {} as any;

  beforeEach(() => {
    registry = new LoginProviderRegistry();
    codes = {
      issue: jest.fn().mockResolvedValue({ code: '123456', requestId: 'synthetic-request' }),
      discard: jest.fn(),
      verify: jest.fn(),
    };
    userService = { updateUserPassword: jest.fn() };
    identity = {
      findContactOwner: jest.fn().mockResolvedValue({ kind: 'none' }),
      registerContactUser: jest.fn(),
      bindContactIdentity: jest.fn(),
      assertContactBindable: jest.fn().mockResolvedValue(null),
      ensureContactIdentitiesForUser: jest.fn(),
      // 账号状态校验用真实实现：只看 status，不依赖服务的其他状态
      assertUserCanLogin: AuthIdentityService.prototype.assertUserCanLogin,
    };
    tokens = { issueLoginToken: jest.fn().mockResolvedValue('token') };
    redis = {
      set: jest.fn(),
      getDel: jest.fn(),
      incrByWithInitialExpire: jest.fn().mockResolvedValue(1),
    };
    service = new CaptchaAuthService(
      registry,
      codes as any,
      userService as any,
      identity as any,
      tokens as any,
      redis as any,
    );
    logged = [];
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(Logger, level).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }
  });

  afterEach(() => jest.restoreAllMocks());

  /** Logger 各级别的全部参数都不含合成联系方式（及大小写变体）与用户 ID */
  function expectLogsClean() {
    const text = JSON.stringify(logged).toLowerCase();
    expect(text).not.toContain(CONTACT);
    expect(text).not.toContain('dedup-synthetic');
    expect(text).not.toContain(String(USER_ID));
  }

  it('rejects contacts no loaded pack recognises', async () => {
    await expect(service.sendCode('13800138000', 'login')).rejects.toThrow('请提供有效的联系方式');
    await expect(service.login('13800138000', '123456', req)).rejects.toThrow(
      '请提供有效的联系方式',
    );
  });

  it('issues a code and sends it through the matching adapter', async () => {
    const adapter = emailAdapter();
    registry.register(adapter);

    await expect(service.sendCode(' User@Example.com ', 'login')).resolves.toContain('登录');

    expect(codes.issue).toHaveBeenCalledWith('login', 'user@example.com');
    expect(adapter.sendCode).toHaveBeenCalledWith('user@example.com', '123456', 'login');
  });

  it('discards the code when delivery fails', async () => {
    const adapter = emailAdapter({ sendCode: jest.fn().mockRejectedValue(new Error('smtp down')) });
    registry.register(adapter);

    await expect(service.sendCode('user@example.com', 'login')).rejects.toThrow('验证码发送失败');
    expect(codes.discard).toHaveBeenCalledWith('login', 'user@example.com', 'synthetic-request');
  });

  it('answers reset requests for unregistered, disabled and conflicting contacts exactly like registered ones, without sending', async () => {
    const adapter = emailAdapter();
    registry.register(adapter);
    identity.findContactOwner.mockResolvedValueOnce({
      kind: 'owner',
      user: { id: USER_ID, status: 1 },
    });
    const registered = await service.sendCode(CONTACT, 'reset');
    expect(adapter.sendCode).toHaveBeenCalledTimes(1);

    for (const kind of ['none', 'disabled', 'conflict']) {
      identity.findContactOwner.mockResolvedValueOnce({ kind });
      await expect(service.sendCode(CONTACT, 'reset')).resolves.toBe(registered);
    }
    expect(codes.issue).toHaveBeenCalledTimes(1);
    expect(adapter.sendCode).toHaveBeenCalledTimes(1);
    expectLogsClean();
  });

  it('throttles code sending per client IP', async () => {
    registry.register(emailAdapter());
    redis.incrByWithInitialExpire.mockResolvedValueOnce(21);

    await expect(service.sendCode('user@example.com', 'login', '203.0.113.5')).rejects.toThrow(
      '过于频繁',
    );
    expect(redis.incrByWithInitialExpire).toHaveBeenCalledWith(
      'auth:captcha:send:ip:203.0.113.5',
      1,
      3600,
    );
    expect(codes.issue).not.toHaveBeenCalled();
  });

  it('registers a passwordless user on first captcha login and issues a token', async () => {
    registry.register(emailAdapter());
    identity.registerContactUser.mockResolvedValue({ id: USER_ID, email: CONTACT });

    await expect(service.login(CONTACT, '123456', req)).resolves.toBe('token');

    expect(codes.verify).toHaveBeenCalledWith('login', CONTACT, '123456');
    expect(identity.registerContactUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'demo_email',
        providerUserId: CONTACT,
        scene: 'captcha',
        contactField: 'email',
      }),
    );
    expect(identity.ensureContactIdentitiesForUser).not.toHaveBeenCalled();
    expect(tokens.issueLoginToken).toHaveBeenCalledWith({ id: USER_ID, email: CONTACT }, req);
    expectLogsClean();
  });

  it('logs an existing owner in after backfilling legacy identities', async () => {
    registry.register(emailAdapter());
    const owner = { id: USER_ID, email: CONTACT, status: 1 };
    identity.findContactOwner.mockResolvedValue({ kind: 'owner', user: owner });

    await expect(service.login(CONTACT, '123456', req)).resolves.toBe('token');

    expect(identity.ensureContactIdentitiesForUser).toHaveBeenCalledWith(owner);
    expect(identity.registerContactUser).not.toHaveBeenCalled();
    expect(tokens.issueLoginToken).toHaveBeenCalledWith(owner, req);
  });

  it.each([
    [2, '当前账户已锁定'],
    [3, '当前账户已被永久封禁'],
  ])(
    'refuses an owner whose account status is %s without backfilling or issuing a token',
    async (status: number, text: string) => {
      registry.register(emailAdapter());
      identity.findContactOwner.mockResolvedValue({
        kind: 'owner',
        user: { id: USER_ID, email: CONTACT, status },
      });

      await expect(service.login(CONTACT, '123456', req)).rejects.toThrow(text);
      expect(identity.ensureContactIdentitiesForUser).not.toHaveBeenCalled();
      expect(identity.registerContactUser).not.toHaveBeenCalled();
      expect(tokens.issueLoginToken).not.toHaveBeenCalled();
      expectLogsClean();
    },
  );

  it('logs in to the account that won a concurrent registration instead of creating another', async () => {
    registry.register(emailAdapter());
    const winner = { id: USER_ID, email: CONTACT, status: 1 };
    identity.findContactOwner
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'owner', user: winner });
    identity.registerContactUser.mockResolvedValueOnce(null);

    await expect(service.login(CONTACT, '123456', req)).resolves.toBe('token');

    expect(identity.registerContactUser).toHaveBeenCalledTimes(1);
    expect(tokens.issueLoginToken).toHaveBeenCalledWith(winner, req);
  });

  it('gives up with a conflict after losing the registration race twice', async () => {
    registry.register(emailAdapter());
    identity.registerContactUser.mockResolvedValue(null);

    await expect(service.login(CONTACT, '123456', req)).rejects.toMatchObject({ status: 409 });
    expect(identity.registerContactUser).toHaveBeenCalledTimes(2);
    expect(tokens.issueLoginToken).not.toHaveBeenCalled();
  });

  it.each([
    ['disabled', '已停用'],
    ['conflict', '归属存在冲突'],
  ])(
    'refuses login and reset for %s contacts without registering',
    async (kind: string, text: string) => {
      registry.register(emailAdapter());
      identity.findContactOwner.mockResolvedValue({ kind });

      await expect(service.login(CONTACT, '123456', req)).rejects.toThrow(text);
      await expect(service.verifyResetCode(CONTACT, '123456')).rejects.toThrow(text);
      redis.getDel.mockResolvedValueOnce(CONTACT);
      await expect(service.resetPassword(CONTACT, 'x'.repeat(48), 'new-secret')).rejects.toThrow(
        text,
      );
      expect(identity.registerContactUser).not.toHaveBeenCalled();
      expect(userService.updateUserPassword).not.toHaveBeenCalled();
      expectLogsClean();
    },
  );

  it('binds a verified contact through the identity service', async () => {
    const adapter = emailAdapter();
    registry.register(adapter);

    await expect(service.bind(3, CONTACT, '123456')).resolves.toBe('绑定成功');

    expect(codes.verify).toHaveBeenCalledWith('bind', CONTACT, '123456');
    expect(identity.bindContactIdentity).toHaveBeenCalledWith(3, adapter, CONTACT);
  });

  it('refuses to send a bind code for a contact that cannot be bound', async () => {
    registry.register(emailAdapter());
    identity.assertContactBindable.mockRejectedValue(
      new HttpException('该联系方式已被其他账号绑定！', 400),
    );

    await expect(service.sendBindCode(3, CONTACT)).rejects.toThrow('已被其他账号绑定');
    expect(redis.incrByWithInitialExpire).not.toHaveBeenCalled();
    expect(codes.issue).not.toHaveBeenCalled();
  });

  it('shares the binding quota across contacts and channels without affecting other accounts', async () => {
    const email = emailAdapter();
    const phone = emailAdapter({
      provider: 'demo_phone',
      contactField: 'phone',
      matches: contact => /^\d+$/.test(contact),
      normalizeContact: contact => contact,
    });
    registry.register(email);
    registry.register(phone);
    const counts = new Map<string, number>();
    redis.incrByWithInitialExpire.mockImplementation(async (key: string) => {
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      return count;
    });
    const results = await Promise.allSettled(
      Array.from({ length: 21 }, (_, index) =>
        service.sendBindCode(
          3,
          index % 2 ? `synthetic${index}@example.com` : String(100000 + index),
        ),
      ),
    );
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(20);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.getStatus()).toBe(429);
    expect(codes.issue).toHaveBeenCalledTimes(20);
    expect(
      (email.sendCode as any).mock.calls.length + (phone.sendCode as any).mock.calls.length,
    ).toBe(20);
    expect(redis.incrByWithInitialExpire).toHaveBeenCalledWith(
      'auth:captcha:send:bind:user:3',
      1,
      3600,
    );
    await expect(service.sendBindCode(4, 'another@example.com')).resolves.toContain('绑定');
    expect(counts.get('auth:captcha:send:bind:user:4')).toBe(1);
  });

  it('does not issue or send when the user binding quota is exhausted or unavailable', async () => {
    const adapter = emailAdapter();
    registry.register(adapter);
    redis.incrByWithInitialExpire
      .mockResolvedValueOnce(21)
      .mockRejectedValueOnce(new Error('synthetic redis outage'));
    await expect(service.sendBindCode(3, 'user@example.com')).rejects.toMatchObject({
      status: 429,
    });
    await expect(service.sendBindCode(3, 'user@example.com')).rejects.toMatchObject({
      status: 500,
      message: '操作失败，请稍后重试',
    });
    expect(codes.issue).not.toHaveBeenCalled();
    expect(adapter.sendCode).not.toHaveBeenCalled();
  });

  it('keeps contact cooldown and charges attempts after the contact ownership check', async () => {
    const adapter = emailAdapter();
    registry.register(adapter);
    identity.assertContactBindable
      .mockRejectedValueOnce(new HttpException('该联系方式已被其他账号绑定！', 400))
      .mockResolvedValue(null);
    await expect(service.sendBindCode(3, 'occupied@example.com')).rejects.toThrow(
      '已被其他账号绑定',
    );
    expect(redis.incrByWithInitialExpire).not.toHaveBeenCalled();
    codes.issue.mockRejectedValueOnce(new HttpException('60秒内不得重复发送验证码！', 400));
    await expect(service.sendBindCode(3, ' User@Example.com ')).rejects.toThrow('不得重复发送');
    expect(codes.issue).toHaveBeenCalledWith('bind', 'user@example.com');
    expect(adapter.sendCode).not.toHaveBeenCalled();
    expect(redis.incrByWithInitialExpire).toHaveBeenCalledTimes(1);
    (adapter.sendCode as any).mockRejectedValueOnce(new Error('synthetic sender failure'));
    await expect(service.sendBindCode(3, 'second@example.com')).rejects.toThrow('验证码发送失败');
    expect(redis.incrByWithInitialExpire).toHaveBeenCalledTimes(2);
    expect(codes.discard).toHaveBeenCalledWith('bind', 'second@example.com', 'synthetic-request');
  });

  it('exchanges a reset code for a one-time token and consumes it on reset', async () => {
    registry.register(emailAdapter());
    identity.findContactOwner.mockResolvedValue({
      kind: 'owner',
      user: { id: USER_ID, status: 1 },
    });

    const result = await service.verifyResetCode(CONTACT, '123456');
    expect(result.resetToken).toEqual(expect.any(String));
    expect(redis.set).toHaveBeenCalledWith(
      { key: `resetPasswordToken:${result.resetToken}`, val: CONTACT },
      600,
    );

    redis.getDel.mockResolvedValueOnce(CONTACT).mockResolvedValueOnce(null);
    await expect(
      service.resetPassword(CONTACT, result.resetToken, 'new-secret'),
    ).resolves.toMatchObject({ success: true });
    expect(userService.updateUserPassword).toHaveBeenCalledWith(USER_ID, 'new-secret');

    await expect(
      service.resetPassword(CONTACT, result.resetToken, 'new-secret'),
    ).rejects.toBeInstanceOf(HttpException);
    expectLogsClean();
  });

  it('rejects an unregistered contact after the reset code is verified', async () => {
    registry.register(emailAdapter());
    await expect(service.verifyResetCode(CONTACT, '123456')).rejects.toThrow('该联系方式未注册');
  });

  it('rejects a reset token issued for a different contact', async () => {
    registry.register(emailAdapter());
    redis.getDel.mockResolvedValue('other@example.com');

    await expect(service.resetPassword(CONTACT, 'x'.repeat(48), 'new-secret')).rejects.toThrow(
      '重置密码凭证错误',
    );
    expect(userService.updateUserPassword).not.toHaveBeenCalled();
    expectLogsClean();
  });

  describe('database failures', () => {
    const cases: Array<
      [string, () => void, (svc: CaptchaAuthService) => Promise<unknown>, number, string]
    > = [
      [
        'owner lookup during login',
        () => identity.findContactOwner.mockRejectedValue(rawDatabaseError()),
        svc => svc.login(CONTACT, '123456', req),
        500,
        '操作失败，请稍后重新获取验证码再试',
      ],
      [
        'registration during login',
        () => identity.registerContactUser.mockRejectedValue(rawDatabaseError()),
        svc => svc.login(CONTACT, '123456', req),
        500,
        '操作失败，请稍后重新获取验证码再试',
      ],
      [
        'token issuing (uid / login ip writes)',
        () => {
          identity.findContactOwner.mockResolvedValue({
            kind: 'owner',
            user: { id: USER_ID, status: 1 },
          });
          tokens.issueLoginToken.mockRejectedValue(rawDatabaseError());
        },
        svc => svc.login(CONTACT, '123456', req),
        500,
        '操作失败，请稍后重新获取验证码再试',
      ],
      [
        'binding',
        () => identity.bindContactIdentity.mockRejectedValue(rawDatabaseError()),
        svc => svc.bind(3, CONTACT, '123456'),
        400,
        '绑定失败，请稍后重试',
      ],
      [
        'the bind-code ownership check',
        () => identity.assertContactBindable.mockRejectedValue(rawDatabaseError()),
        svc => svc.sendBindCode(3, CONTACT),
        500,
        '操作失败，请稍后重试',
      ],
      [
        'the reset-code ownership check',
        () => identity.findContactOwner.mockRejectedValue(rawDatabaseError()),
        svc => svc.sendCode(CONTACT, 'reset'),
        500,
        '操作失败，请稍后重试',
      ],
      [
        'the reset-code verification',
        () => identity.findContactOwner.mockRejectedValue(rawDatabaseError()),
        svc => svc.verifyResetCode(CONTACT, '123456'),
        500,
        '操作失败，请稍后重新获取验证码再试',
      ],
      [
        'the password update',
        () => {
          redis.getDel.mockResolvedValue(CONTACT);
          identity.findContactOwner.mockResolvedValue({
            kind: 'owner',
            user: { id: USER_ID, status: 1 },
          });
          userService.updateUserPassword.mockRejectedValue(rawDatabaseError());
        },
        svc => svc.resetPassword(CONTACT, 'x'.repeat(48), 'new-secret'),
        500,
        '操作失败，请稍后重新获取验证码再试',
      ],
      [
        'code verification during login (Redis)',
        () => codes.verify.mockRejectedValue(rawDatabaseError()),
        svc => svc.login(CONTACT, '123456', req),
        500,
        '操作失败，请稍后重新获取验证码再试',
      ],
      [
        'code verification during binding (Redis)',
        () => codes.verify.mockRejectedValue(rawDatabaseError()),
        svc => svc.bind(3, CONTACT, '123456'),
        400,
        '绑定失败，请稍后重试',
      ],
      [
        'code issuing (Redis)',
        () => codes.issue.mockRejectedValue(rawDatabaseError()),
        svc => svc.sendCode(CONTACT, 'login'),
        500,
        '操作失败，请稍后重试',
      ],
      [
        'code discarding after a delivery failure (Redis)',
        () => {
          codes.discard.mockRejectedValue(rawDatabaseError());
          const failing = emailAdapter({
            sendCode: jest.fn().mockRejectedValue(new Error(CONTACT)),
          });
          registry.captchaForContact = () => failing;
        },
        svc => svc.sendCode(CONTACT, 'login'),
        500,
        '操作失败，请稍后重试',
      ],
      [
        'the per-IP send quota (Redis)',
        () => redis.incrByWithInitialExpire.mockRejectedValue(rawDatabaseError()),
        svc => svc.sendCode(CONTACT, 'reset', '203.0.113.5'),
        500,
        '操作失败，请稍后重试',
      ],
      [
        'the bind send quota (Redis)',
        () => redis.incrByWithInitialExpire.mockRejectedValue(rawDatabaseError()),
        svc => svc.sendBindCode(3, CONTACT),
        500,
        '操作失败，请稍后重试',
      ],
      [
        'storing the reset token (Redis)',
        () => {
          identity.findContactOwner.mockResolvedValue({
            kind: 'owner',
            user: { id: USER_ID, status: 1 },
          });
          redis.set.mockRejectedValue(rawDatabaseError());
        },
        svc => svc.verifyResetCode(CONTACT, '123456'),
        500,
        '操作失败，请稍后重新获取验证码再试',
      ],
      [
        'consuming the reset token (Redis)',
        () => redis.getDel.mockRejectedValue(rawDatabaseError()),
        svc => svc.resetPassword(CONTACT, 'x'.repeat(48), 'new-secret'),
        500,
        '操作失败，请稍后重新获取验证码再试',
      ],
    ];

    it.each(cases)(
      'replaces a raw error in %s with a static exception and logs only a safe summary',
      async (
        _title: string,
        arrange: () => void,
        act: (svc: CaptchaAuthService) => Promise<unknown>,
        status: number,
        message: string,
      ) => {
        registry.register(emailAdapter());
        arrange();
        let thrown: unknown;
        try {
          await act(service);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(HttpException);
        expect((thrown as HttpException).getStatus()).toBe(status);
        expect((thrown as HttpException).message).toBe(message);
        expect(logged).toContainEqual([
          '验证码流程的数据读写失败',
          'Error code=ER_LOCK_WAIT_TIMEOUT errno=1205',
          'CaptchaAuthService',
        ]);

        const response = await throughGlobalErrorChain(thrown);
        expect(response.status).toBe(status);
        expect(response.body.message).toBe(message);
        expectLogsClean();
        expect(JSON.stringify(response.body).toLowerCase()).not.toContain('dedup-synthetic');
      },
    );
  });
});
