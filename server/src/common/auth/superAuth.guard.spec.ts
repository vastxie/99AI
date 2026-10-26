import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { SuperAuthGuard } from './superAuth.guard';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

const SECRET = 'synthetic-super-guard-test-secret';
const context = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as any;
const bearer = (role: string) => ({
  headers: { authorization: `Bearer ${jwt.sign({ uid: 'SyntheticUid', role }, SECRET)}` },
});
function fixture(reflector?: any) {
  const redis = {
    getJwtSecret: jest.fn().mockResolvedValue(SECRET),
    resolveUserIdByUid: jest.fn().mockResolvedValue(42),
    resolveVisitorIdByUid: jest.fn().mockResolvedValue('visitor:synthetic'),
    checkTokenAuth: jest.fn().mockResolvedValue(true),
  };
  const auth = { validateAuthenticatedUser: jest.fn().mockResolvedValue(true) };
  return {
    guard: new SuperAuthGuard(redis as any, {} as any, auth as any, reflector),
    redis,
    auth,
  };
}

describe('SuperAuthGuard authentication before authorization', () => {
  it.each(['user', 'admin', 'visitor'])(
    'rejects authenticated %s with 403',
    async (role: string) => {
      const { guard, redis, auth } = fixture();
      await expect(guard.canActivate(context(bearer(role)))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(redis.checkTokenAuth).toHaveBeenCalledTimes(1);
      expect(auth.validateAuthenticatedUser).toHaveBeenCalledTimes(1);
    },
  );

  it('allows super only after live authentication, including on the cached path', async () => {
    const { guard, redis, auth } = fixture();
    const request = bearer('super');
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    auth.validateAuthenticatedUser.mockRejectedValueOnce(new UnauthorizedException());
    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.checkTokenAuth).toHaveBeenCalledTimes(2);
  });

  it('keeps missing credentials at 401 even if request.user was prepopulated', async () => {
    const { guard } = fixture();
    const request = { headers: {}, user: { id: 42, role: 'super' } };
    const failure = await guard.canActivate(context(request)).catch(error => error);
    expect(failure).toBeInstanceOf(HttpException);
    expect(failure.getStatus()).toBe(401);
  });

  it('keeps an invalid bearer at 401', async () => {
    const { guard } = fixture();
    const failure = await guard
      .canActivate(context({ headers: { authorization: 'Bearer invalid-synthetic-value' } }))
      .catch(error => error);
    expect(failure.getStatus()).toBe(401);
  });

  it('fails closed if a public annotation bypasses authentication without an identity', async () => {
    const { guard } = fixture({ getAllAndOverride: jest.fn().mockReturnValue(true) });
    const request = { headers: {} };
    await expect(
      guard.canActivate({ ...context(request), getHandler: () => ({}), getClass: () => ({}) }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
