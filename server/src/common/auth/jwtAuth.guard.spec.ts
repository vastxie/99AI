import { HttpException, UnauthorizedException } from '@nestjs/common';
import { AllExceptionsFilter } from '@/common/filters/allExceptions.filter';
import { JwtAuthGuard } from './jwtAuth.guard';
import * as jwt from 'jsonwebtoken';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createHttpContext(request: any) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

describe('JwtAuthGuard', () => {
  it('resolves uid payload to internal user id before Redis token check and cache', async () => {
    const token = jwt.sign({ uid: 'AbC123xYz789', username: 'viewer', role: 'user' }, 'secret');
    const request: any = {
      headers: {
        authorization: `Bearer ${token}`,
        host: 'example.com',
      },
    };
    const redisCacheService = {
      checkTokenAuth: jest.fn().mockResolvedValue(true),
      getJwtSecret: jest.fn().mockResolvedValue('secret'),
      resolveUserIdByUid: jest.fn().mockResolvedValue(42),
    };
    const guard = new JwtAuthGuard(
      redisCacheService as any,
      { get: jest.fn() } as any,
      {
        createTokenFromFingerprint: jest.fn(),
        validateAuthenticatedUser: jest.fn().mockResolvedValue(true),
      } as any,
    );

    await expect(guard.canActivate(createHttpContext(request) as any)).resolves.toBe(true);

    expect(request.user).toEqual({
      uid: 'AbC123xYz789',
      username: 'viewer',
      role: 'user',
      id: 42,
    });
    expect(redisCacheService.resolveUserIdByUid).toHaveBeenCalledWith('AbC123xYz789');
    expect(redisCacheService.checkTokenAuth).toHaveBeenCalledWith(token, request);
    expect((guard as any).permissionCache.get(token).permissions).toEqual(request.user);
  });

  it('rejects legacy JWT payloads that still expose internal id', async () => {
    const token = jwt.sign(
      { uid: 'AbC123xYz789', id: 42, username: 'viewer', role: 'user' },
      'secret',
    );
    const request: any = {
      headers: {
        authorization: `Bearer ${token}`,
        host: 'example.com',
      },
    };
    const redisCacheService = {
      checkTokenAuth: jest.fn().mockResolvedValue(true),
      getJwtSecret: jest.fn().mockResolvedValue('secret'),
      resolveUserIdByUid: jest.fn().mockResolvedValue(42),
    };
    const guard = new JwtAuthGuard(
      redisCacheService as any,
      { get: jest.fn() } as any,
      {
        createTokenFromFingerprint: jest.fn(),
        validateAuthenticatedUser: jest.fn().mockResolvedValue(true),
      } as any,
    );

    await expect(guard.canActivate(createHttpContext(request) as any)).rejects.toBeInstanceOf(
      Error,
    );
    expect(redisCacheService.resolveUserIdByUid).not.toHaveBeenCalled();
    expect(redisCacheService.checkTokenAuth).not.toHaveBeenCalled();
  });

  it('checks Redis token state even when permission cache hits', async () => {
    const token = 'cached-token';
    const request: any = {
      headers: {
        authorization: `Bearer ${token}`,
        host: 'example.com',
      },
    };
    const redisCacheService = {
      checkTokenAuth: jest.fn().mockRejectedValue(new UnauthorizedException('token invalid')),
      getJwtSecret: jest.fn(),
    };
    const guard = new JwtAuthGuard(
      redisCacheService as any,
      { get: jest.fn() } as any,
      {
        createTokenFromFingerprint: jest.fn(),
        validateAuthenticatedUser: jest.fn().mockResolvedValue(true),
      } as any,
    );

    (guard as any).permissionCache.set(token, {
      permissions: { uid: 'cachedUser001', id: 7, role: 'user' },
      timestamp: Date.now(),
    });

    await expect(guard.canActivate(createHttpContext(request) as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(redisCacheService.checkTokenAuth).toHaveBeenCalledWith(token, request);
  });

  it('allows cached permissions only after Redis token check passes', async () => {
    const token = 'active-token';
    const request: any = {
      headers: {
        authorization: `Bearer ${token}`,
        host: 'example.com',
      },
    };
    const redisCacheService = {
      checkTokenAuth: jest.fn().mockResolvedValue(true),
      getJwtSecret: jest.fn(),
    };
    const guard = new JwtAuthGuard(
      redisCacheService as any,
      { get: jest.fn() } as any,
      {
        createTokenFromFingerprint: jest.fn(),
        validateAuthenticatedUser: jest.fn().mockResolvedValue(true),
      } as any,
    );

    (guard as any).permissionCache.set(token, {
      permissions: { uid: 'cachedUser002', id: 8, role: 'user' },
      timestamp: Date.now(),
    });

    await expect(guard.canActivate(createHttpContext(request) as any)).resolves.toBe(true);
    expect(request.user).toEqual({ uid: 'cachedUser002', id: 8, role: 'user' });
    expect(redisCacheService.checkTokenAuth).toHaveBeenCalledWith(token, request);
  });

  it('checks Redis token state for cached super permissions', async () => {
    const token = 'cached-super-token';
    const request: any = {
      headers: {
        authorization: `Bearer ${token}`,
        host: 'example.com',
      },
    };
    const redisCacheService = {
      checkTokenAuth: jest.fn().mockRejectedValue(new UnauthorizedException('token invalid')),
      getJwtSecret: jest.fn(),
    };
    const guard = new JwtAuthGuard(
      redisCacheService as any,
      { get: jest.fn() } as any,
      {
        createTokenFromFingerprint: jest.fn(),
        validateAuthenticatedUser: jest.fn().mockResolvedValue(true),
      } as any,
    );

    (guard as any).permissionCache.set(token, {
      permissions: { uid: 'cachedSuper01', id: 1, role: 'super' },
      timestamp: Date.now(),
    });

    await expect(guard.canActivate(createHttpContext(request) as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(redisCacheService.checkTokenAuth).toHaveBeenCalledWith(token, request);
  });

  it('does not mint visitor tokens from a raw fingerprint header', async () => {
    const request: any = {
      headers: {
        fingerprint: '2000000001',
        host: 'example.com',
      },
    };
    const authService = {
      createTokenFromFingerprint: jest.fn(),
      validateAuthenticatedUser: jest.fn().mockResolvedValue(true),
    };
    const redisCacheService = {
      checkTokenAuth: jest.fn(),
      getJwtSecret: jest.fn(),
    };
    const guard = new JwtAuthGuard(
      redisCacheService as any,
      { get: jest.fn() } as any,
      authService as any,
    );

    await expect(guard.canActivate(createHttpContext(request) as any)).rejects.toBeInstanceOf(
      Error,
    );
    expect(authService.createTokenFromFingerprint).not.toHaveBeenCalled();
    expect(redisCacheService.checkTokenAuth).not.toHaveBeenCalled();
  });

  it('skips token validation for routes marked public', async () => {
    const request: any = {
      headers: {},
    };
    const redisCacheService = {
      checkTokenAuth: jest.fn(),
      getJwtSecret: jest.fn(),
    };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    };
    const guard = new JwtAuthGuard(
      redisCacheService as any,
      { get: jest.fn() } as any,
      {
        createTokenFromFingerprint: jest.fn(),
        validateAuthenticatedUser: jest.fn().mockResolvedValue(true),
      } as any,
      reflector as any,
    );
    const context = {
      ...createHttpContext(request),
      getHandler: () => function login() {},
      getClass: () => class AuthController {},
    };

    await expect(guard.canActivate(context as any)).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalled();
    expect(redisCacheService.checkTokenAuth).not.toHaveBeenCalled();
    expect(redisCacheService.getJwtSecret).not.toHaveBeenCalled();
  });

  it('rejects cached permissions when the current account is inactive', async () => {
    const token = 'cached-inactive-token';
    const request: any = {
      headers: { authorization: `Bearer ${token}`, host: 'example.com' },
    };
    const redisCacheService = {
      checkTokenAuth: jest.fn().mockResolvedValue(true),
      getJwtSecret: jest.fn(),
    };
    const authService = {
      validateAuthenticatedUser: jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('account inactive')),
    };
    const guard = new JwtAuthGuard(
      redisCacheService as any,
      { get: jest.fn() } as any,
      authService as any,
    );
    (guard as any).permissionCache.set(token, {
      permissions: { uid: 'inactiveUser01', id: 42, role: 'user' },
      timestamp: Date.now(),
    });

    await expect(guard.canActivate(createHttpContext(request) as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.validateAuthenticatedUser).toHaveBeenCalledWith(request.user);
  });

  describe('确定失效与暂时故障', () => {
    function guardWith(redis: Record<string, unknown>) {
      return new JwtAuthGuard(
        {
          checkTokenAuth: jest.fn().mockResolvedValue(true),
          getJwtSecret: jest.fn().mockResolvedValue('secret'),
          resolveUserIdByUid: jest.fn().mockResolvedValue(42),
          resolveVisitorIdByUid: jest.fn().mockResolvedValue('visitor:VisitorUid01'),
          ...redis,
        } as any,
        { get: jest.fn() } as any,
        { validateAuthenticatedUser: jest.fn().mockResolvedValue(true) } as any,
      );
    }
    const userToken = () =>
      jwt.sign({ uid: 'AbC123xYz789', username: 'viewer', role: 'user' }, 'secret');
    const visitorToken = () =>
      jwt.sign({ uid: 'VisitorUid01', username: '游客', role: 'visitor' }, 'secret');
    const requestWith = (token: string) => ({
      headers: { authorization: `Bearer ${token}`, host: 'example.com' },
    });
    async function rejectionOf(guard: JwtAuthGuard, token: string) {
      try {
        await guard.canActivate(createHttpContext(requestWith(token)) as any);
      } catch (error) {
        return error as HttpException;
      }
      throw new Error('expected rejection');
    }
    /** 守卫里的异常不经过拦截器，直接到全局异常过滤器 */
    function projectThroughFilter(exception: unknown) {
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({ headersSent: false, writableEnded: false, status }),
          getRequest: () => ({ path: '/api/test' }),
        }),
      };
      new AllExceptionsFilter().catch(exception, host as any);
      return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
    }

    it('读不到 JWT 密钥（Redis 暂时故障）：503，不是 401，文案经过滤器保留', async () => {
      const error = await rejectionOf(
        guardWith({ getJwtSecret: jest.fn().mockRejectedValue(new Error('redis down')) }),
        userToken(),
      );
      expect(error.getStatus()).toBe(503);
      expect(projectThroughFilter(error)).toEqual({
        status: 503,
        body: expect.objectContaining({ code: 503, message: '服务暂时不可用，请稍后重试' }),
      });
    });

    it('查用户或访客会话时 Redis 出错：503', async () => {
      const userError = await rejectionOf(
        guardWith({ resolveUserIdByUid: jest.fn().mockRejectedValue(new Error('redis down')) }),
        userToken(),
      );
      const visitorError = await rejectionOf(
        guardWith({ resolveVisitorIdByUid: jest.fn().mockRejectedValue(new Error('redis down')) }),
        visitorToken(),
      );
      expect(userError.getStatus()).toBe(503);
      expect(visitorError.getStatus()).toBe(503);
    });

    it('签名不对、已过期、会话已不在：仍是 401', async () => {
      const badSignature = jwt.sign({ uid: 'AbC123xYz789', role: 'user' }, 'other-secret');
      const expired = jwt.sign({ uid: 'AbC123xYz789', role: 'user', exp: 1 }, 'secret');
      const errors = await Promise.all([
        rejectionOf(guardWith({}), badSignature),
        rejectionOf(guardWith({}), expired),
        rejectionOf(
          guardWith({ resolveUserIdByUid: jest.fn().mockResolvedValue(null) }),
          userToken(),
        ),
        rejectionOf(
          guardWith({ resolveVisitorIdByUid: jest.fn().mockResolvedValue(null) }),
          visitorToken(),
        ),
      ]);
      expect(errors.map(error => error.getStatus())).toEqual([401, 401, 401, 401]);
    });
  });
});
