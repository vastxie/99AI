import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwtAuth.guard';
import { RegisteredUserAuthGuard } from './registeredUserAuth.guard';
import { REGISTERED_USER_REQUIRED_MESSAGE } from './request-user';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const SECRET = 'registered-guard-secret';

function createHttpContext(request: any) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

function bearerRequest(payload: Record<string, unknown>) {
  return {
    headers: {
      authorization: `Bearer ${jwt.sign(payload, SECRET)}`,
      host: 'example.com',
    },
  } as any;
}

function createGuard(
  overrides: { redisCacheService?: Record<string, any>; reflector?: Record<string, any> } = {},
) {
  const redisCacheService = {
    checkTokenAuth: jest.fn().mockResolvedValue(true),
    getJwtSecret: jest.fn().mockResolvedValue(SECRET),
    resolveUserIdByUid: jest.fn().mockResolvedValue(42),
    resolveVisitorIdByUid: jest.fn().mockResolvedValue('visitor:abc123'),
    ...(overrides.redisCacheService || {}),
  };
  const authService = {
    validateAuthenticatedUser: jest.fn().mockResolvedValue(true),
  };
  const guard = new RegisteredUserAuthGuard(
    redisCacheService as any,
    { get: jest.fn() } as any,
    authService as any,
    overrides.reflector as any,
  );
  return { guard, redisCacheService, authService };
}

async function captureRejection(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the guard to reject');
}

describe('RegisteredUserAuthGuard', () => {
  it('extends the login guard, so login failures keep their existing behaviour', () => {
    const { guard } = createGuard();

    expect(guard).toBeInstanceOf(JwtAuthGuard);
  });

  it('rejects a resolved visitor with 403 and the registered-account message', async () => {
    const { guard, redisCacheService } = createGuard();
    const request = bearerRequest({ uid: 'VisitorUid01', username: '游客', role: 'visitor' });

    const error = await captureRejection(guard.canActivate(createHttpContext(request) as any));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error).not.toBeInstanceOf(UnauthorizedException);
    expect(error.getStatus()).toBe(403);
    expect(error.message).toBe(REGISTERED_USER_REQUIRED_MESSAGE);
    // 先完整走完父类登录校验，再按身份拒绝
    expect(redisCacheService.resolveVisitorIdByUid).toHaveBeenCalledWith('VisitorUid01');
    expect(redisCacheService.checkTokenAuth).toHaveBeenCalled();
    expect(request.user).toMatchObject({ id: 'visitor:abc123', role: 'visitor' });
  });

  it('rejects a cached visitor session with 403 as well', async () => {
    const { guard } = createGuard();
    const token = 'cached-visitor-token';
    const request = { headers: { authorization: `Bearer ${token}` } } as any;
    (guard as any).permissionCache.set(token, {
      permissions: { uid: 'VisitorUid02', id: 'visitor:def456', role: 'visitor' },
      timestamp: Date.now(),
    });

    const error = await captureRejection(guard.canActivate(createHttpContext(request) as any));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getStatus()).toBe(403);
  });

  it('lets registered users through with their numeric id', async () => {
    const { guard, redisCacheService } = createGuard();
    const request = bearerRequest({ uid: 'AbC123xYz789', username: 'viewer', role: 'user' });

    await expect(guard.canActivate(createHttpContext(request) as any)).resolves.toBe(true);

    expect(redisCacheService.resolveUserIdByUid).toHaveBeenCalledWith('AbC123xYz789');
    expect(request.user).toMatchObject({ id: 42, role: 'user' });
  });

  it('lets administrators through', async () => {
    const { guard } = createGuard({
      redisCacheService: { resolveUserIdByUid: jest.fn().mockResolvedValue(1) },
    });
    const request = bearerRequest({ uid: 'SuperUid0001', username: 'admin', role: 'super' });

    await expect(guard.canActivate(createHttpContext(request) as any)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 1, role: 'super' });
  });

  it('rejects a non-visitor identity whose id is not a positive integer with 403', async () => {
    const { guard } = createGuard();
    const token = 'cached-odd-token';
    const request = { headers: { authorization: `Bearer ${token}` } } as any;
    (guard as any).permissionCache.set(token, {
      permissions: { uid: 'OddUid000001', id: '42', role: 'user' },
      timestamp: Date.now(),
    });

    const error = await captureRejection(guard.canActivate(createHttpContext(request) as any));

    expect(error).toBeInstanceOf(ForbiddenException);
  });

  it('keeps 401 when the login guard itself rejects (no token)', async () => {
    const { guard, redisCacheService } = createGuard();

    const error = await captureRejection(
      guard.canActivate(createHttpContext({ headers: {} }) as any),
    );

    expect(error).toBeInstanceOf(HttpException);
    expect(error).not.toBeInstanceOf(ForbiddenException);
    expect(error.getStatus()).toBe(401);
    expect(redisCacheService.checkTokenAuth).not.toHaveBeenCalled();
  });

  it('keeps 401 when an expired visitor session cannot be resolved', async () => {
    const { guard } = createGuard({
      redisCacheService: { resolveVisitorIdByUid: jest.fn().mockResolvedValue(null) },
    });
    const request = bearerRequest({ uid: 'VisitorUid03', username: '游客', role: 'visitor' });

    const error = await captureRejection(guard.canActivate(createHttpContext(request) as any));

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(401);
  });

  it('fails closed on public routes: no resolved user means 401', async () => {
    const { guard } = createGuard({
      reflector: { getAllAndOverride: jest.fn().mockReturnValue(true) },
    });
    const context = {
      ...createHttpContext({ headers: {} }),
      getHandler: () => function handler() {},
      getClass: () => class SomeController {},
    };

    const error = await captureRejection(guard.canActivate(context as any));

    expect(error).toBeInstanceOf(UnauthorizedException);
  });
});
