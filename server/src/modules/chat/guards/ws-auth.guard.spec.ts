import { HttpException, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { createMockSocket } from '../../../test/mocks/socket.mock';
import { WsAuthValidator } from './ws-auth.guard';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('WsAuthValidator', () => {
  let redisCacheService: any;
  let authService: any;
  let validator: WsAuthValidator;

  beforeEach(() => {
    redisCacheService = {
      getJwtSecret: jest.fn().mockResolvedValue('test-secret'),
      checkTokenAuth: jest.fn().mockResolvedValue(true),
      resolveUserIdByUid: jest.fn().mockResolvedValue(7),
      resolveVisitorIdByUid: jest.fn().mockResolvedValue('visitor:VisitorUid01'),
    };
    authService = {
      createTokenFromFingerprint: jest.fn(),
      validateAuthenticatedUser: jest.fn().mockResolvedValue(true),
    };
    validator = new WsAuthValidator(redisCacheService, authService);
  });

  it('accepts websocket tokens only after Redis session validation passes', async () => {
    const token = jwt.sign(
      { uid: 'UserUid12345', username: 'viewer', role: 'user' },
      'test-secret',
    );
    const socket = createMockSocket(jest.fn, {
      handshake: {
        auth: { token },
        headers: { authorization: `Bearer ${token}` },
      },
    });

    const result = await validator.authenticate(socket);

    expect(result).toMatchObject({ user: { uid: 'UserUid12345', id: 7, role: 'user' } });
    expect(redisCacheService.checkTokenAuth).toHaveBeenCalledWith(token, {
      headers: socket.handshake.headers,
      user: expect.objectContaining({ uid: 'UserUid12345', id: 7, role: 'user' }),
    });
    expect(authService.validateAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, role: 'user' }),
    );
  });

  it('rejects a session that is no longer in Redis as invalid', async () => {
    const token = jwt.sign(
      { uid: 'UserUid12345', username: 'viewer', role: 'user' },
      'test-secret',
    );
    redisCacheService.checkTokenAuth.mockRejectedValue(
      new HttpException('当前token不在redis中或已过期，需要重新登录', 401),
    );
    const socket = createMockSocket(jest.fn, {
      handshake: {
        auth: { token },
        headers: {},
      },
    });

    await expect(validator.authenticate(socket)).resolves.toEqual({ code: 'SESSION_INVALID' });
  });

  it('rejects an inactive account as invalid', async () => {
    const token = jwt.sign(
      { uid: 'UserUid12345', username: 'viewer', role: 'user' },
      'test-secret',
    );
    authService.validateAuthenticatedUser.mockRejectedValue(
      new HttpException('当前账户已锁定,请联系管理员解锁！', 401),
    );
    const socket = createMockSocket(jest.fn, {
      handshake: { auth: { token }, headers: {} },
    });

    await expect(validator.authenticate(socket)).resolves.toEqual({ code: 'SESSION_INVALID' });
  });

  describe('classification', () => {
    let logged: unknown[][];
    beforeEach(() => {
      logged = [];
      for (const level of ['warn', 'error', 'log'] as const) {
        jest.spyOn(Logger, level).mockImplementation((...args: unknown[]) => {
          logged.push(args);
        });
      }
    });
    afterEach(() => jest.restoreAllMocks());

    const userToken = () =>
      jwt.sign({ uid: 'UserUid12345', username: 'viewer', role: 'user' }, 'test-secret');
    const socketWith = (token?: string) =>
      createMockSocket(jest.fn, { handshake: { auth: token ? { token } : {}, headers: {} } });

    it.each([
      ['no token', () => socketWith(), undefined],
      ['a bad signature', () => socketWith(jwt.sign({ uid: 'UserUid12345' }, 'other')), undefined],
      [
        'an expired token',
        () =>
          socketWith(
            jwt.sign(
              { uid: 'UserUid12345', role: 'user', exp: Math.floor(Date.now() / 1000) - 60 },
              'test-secret',
            ),
          ),
        undefined,
      ],
      [
        'a payload without uid',
        () => socketWith(jwt.sign({ role: 'user' }, 'test-secret')),
        undefined,
      ],
      [
        'an unmapped uid',
        () => socketWith(userToken()),
        () => redisCacheService.resolveUserIdByUid.mockResolvedValue(null),
      ],
    ])(
      'treats %s as SESSION_INVALID',
      async (_title: string, socket: () => any, arrange?: () => void) => {
        arrange?.();
        await expect(validator.authenticate(socket())).resolves.toEqual({
          code: 'SESSION_INVALID',
        });
      },
    );

    it.each([
      [
        'reading the signing secret',
        () =>
          redisCacheService.getJwtSecret.mockRejectedValue(
            new Error('redis down for UserUid12345'),
          ),
      ],
      [
        'resolving the uid',
        () => redisCacheService.resolveUserIdByUid.mockRejectedValue(new Error('redis down')),
      ],
      [
        'checking the session',
        () => redisCacheService.checkTokenAuth.mockRejectedValue(new Error('redis down')),
      ],
      [
        'checking the account status',
        () => authService.validateAuthenticatedUser.mockRejectedValue(new Error('db down')),
      ],
    ])(
      'treats a failure while %s as SESSION_UNAVAILABLE',
      async (_title: string, arrange: () => void) => {
        arrange();
        await expect(validator.authenticate(socketWith(userToken()))).resolves.toEqual({
          code: 'SESSION_UNAVAILABLE',
        });
        expect(JSON.stringify(logged)).not.toContain('redis down');
        expect(JSON.stringify(logged)).not.toContain('UserUid12345');
      },
    );
  });

  it('rejects raw fingerprint visitor auth and requires a signed visitor token', async () => {
    const token = jwt.sign({ uid: 'VisitorUid01', role: 'visitor' }, 'test-secret');
    authService.createTokenFromFingerprint.mockResolvedValue(token);
    const socket = createMockSocket(jest.fn, {
      handshake: {
        auth: { fingerprint: '2000000001' },
        headers: {},
      },
    });

    const result = await validator.authenticate(socket);

    expect(result).toEqual({ code: 'SESSION_INVALID' });
    expect(authService.createTokenFromFingerprint).not.toHaveBeenCalled();
    expect(redisCacheService.checkTokenAuth).not.toHaveBeenCalled();
  });

  it('accepts signed visitor session tokens', async () => {
    const token = jwt.sign({ uid: 'VisitorUid01', role: 'visitor' }, 'test-secret');
    const socket = createMockSocket(jest.fn, {
      handshake: {
        auth: { token },
        headers: {},
      },
    });

    const result = await validator.authenticate(socket);

    expect(result).toMatchObject({
      user: { uid: 'VisitorUid01', id: 'visitor:VisitorUid01', role: 'visitor' },
    });
    expect(redisCacheService.checkTokenAuth).toHaveBeenCalledWith(token, {
      headers: socket.handshake.headers,
      user: expect.objectContaining({
        uid: 'VisitorUid01',
        id: 'visitor:VisitorUid01',
        role: 'visitor',
      }),
    });
  });
});
