import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  REGISTERED_USER_REQUIRED_MESSAGE,
  requireRegisteredUser,
  requireRequestUser,
} from './request-user';

declare const describe: any;
declare const expect: any;
declare const it: any;

function requestWith(user: unknown) {
  return { user } as any;
}

function captureError(run: () => unknown): any {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

describe('requireRequestUser', () => {
  it('keeps the visitorId string as the id for visitors', () => {
    const user = { uid: 'visitor-uid', id: 'visitor:abc123', username: '游客', role: 'visitor' };

    expect(requireRequestUser(requestWith(user))).toBe(user);
  });

  it('answers 401 when the route resolved no user', () => {
    expect(() => requireRequestUser(requestWith(undefined))).toThrow(UnauthorizedException);
    expect(() => requireRequestUser(requestWith({ uid: 'u1', role: 'user' }))).toThrow(
      UnauthorizedException,
    );
  });
});

describe('requireRegisteredUser', () => {
  it('returns registered users with their numeric id', () => {
    const user = { uid: 'AbC123xYz789', id: 42, username: 'viewer', role: 'user' };

    const resolved = requireRegisteredUser(requestWith(user));

    expect(resolved).toEqual(user);
    expect(typeof resolved.id).toBe('number');
  });

  it('accepts administrators, which are registered users too', () => {
    const user = { uid: 'SuperUid0001', id: 1, username: 'admin', role: 'super' };

    expect(requireRegisteredUser(requestWith(user))).toEqual(user);
  });

  it('rejects visitors with 403 and the registered-account message, not 401', () => {
    const error = captureError(() =>
      requireRegisteredUser(
        requestWith({
          uid: 'visitor-uid',
          id: 'visitor:abc123',
          username: '游客',
          role: 'visitor',
        }),
      ),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error).not.toBeInstanceOf(UnauthorizedException);
    expect(error.getStatus()).toBe(403);
    expect(error.message).toBe(REGISTERED_USER_REQUIRED_MESSAGE);
    expect(REGISTERED_USER_REQUIRED_MESSAGE).toBe('该功能需要登录正式账号');
  });

  it('rejects a visitor role even when the id looks numeric', () => {
    expect(() =>
      requireRegisteredUser(requestWith({ uid: 'visitor-uid', id: 42, role: 'visitor' })),
    ).toThrow(ForbiddenException);
  });

  it.each([
    ['a visitorId string', 'visitor:abc123'],
    ['a numeric string', '42'],
    ['zero', 0],
    ['a negative number', -3],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['an unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects a non-visitor role whose id is %s with 403', (_label: string, id: unknown) => {
    expect(() => requireRegisteredUser(requestWith({ uid: 'u1', id, role: 'user' }))).toThrow(
      ForbiddenException,
    );
  });

  it('still answers 401 when the route resolved no user at all', () => {
    expect(() => requireRegisteredUser(requestWith(undefined))).toThrow(UnauthorizedException);
  });
});
