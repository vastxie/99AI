import { HttpException } from '@nestjs/common';
import { firstValueFrom, throwError } from 'rxjs';
import * as jwt from 'jsonwebtoken';
import { AllExceptionsFilter } from '@/common/filters/allExceptions.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { AuthTokenService } from './auth-token.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('AuthTokenService', () => {
  it('signs login JWT with uid and without internal id', async () => {
    const jwtService = {
      sign: jest.fn((payload: any) => `token:${payload.uid}`),
    };
    const userService = {
      ensureUserUid: jest.fn().mockResolvedValue({
        id: 12,
        uid: 'UserUid12345',
        username: 'viewer',
        email: 'viewer@example.com',
        phone: null,
        role: 'user',
      }),
      savaLoginIp: jest.fn(),
    };
    const redisCacheService = {
      saveToken: jest.fn(),
    };
    const globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue('3'),
    };
    const service = new AuthTokenService(
      jwtService as any,
      userService as any,
      redisCacheService as any,
      globalConfigService as any,
    );

    const token = await service.issueLoginToken(
      { id: 12 } as any,
      {
        header: jest.fn(),
        headers: {},
        connection: { remoteAddress: '127.0.0.1' },
        socket: { remoteAddress: '127.0.0.1' },
      } as any,
    );

    expect(token).toBe('token:UserUid12345');
    expect(jwtService.sign).toHaveBeenCalledWith({
      uid: 'UserUid12345',
      username: 'viewer',
      email: 'viewer@example.com',
      phone: undefined,
      role: 'user',
    });
    expect(redisCacheService.saveToken).toHaveBeenCalledWith(
      12,
      'token:UserUid12345',
      expect.any(String),
      3,
      {
        uid: 'UserUid12345',
        username: 'viewer',
        role: 'user',
      },
    );
  });

  it('signs visitor JWT with a random uid and stores server-issued visitor session metadata', async () => {
    const jwtService = {
      sign: jest.fn((payload: any) => payload),
    };
    const redisCacheService = {
      saveVisitorSession: jest.fn(),
    };
    const service = new AuthTokenService(
      jwtService as any,
      {} as any,
      redisCacheService as any,
      {} as any,
    );

    const payload = (await service.createVisitorToken({
      deviceId: 'anonymous-device-id',
      ip: '198.51.100.7',
      userAgent: 'Unit Test',
    })) as any;

    expect(payload).toEqual({
      uid: expect.any(String),
      username: '游客',
      role: 'visitor',
    });
    expect(payload.uid).toHaveLength(12);
    expect(JSON.stringify(payload)).not.toContain('2000000001');
    expect(redisCacheService.saveVisitorSession).toHaveBeenCalledWith(payload.uid, {
      visitorId: `visitor:${payload.uid}`,
      fingerprintHash: expect.any(String),
      ip: '198.51.100.7',
      userAgentHash: expect.any(String),
    });
  });

  describe('绑定账号时解析登录身份：确定失效与暂时故障', () => {
    function serviceWith(redis: Record<string, unknown>) {
      return new AuthTokenService(
        {} as any,
        {} as any,
        {
          getJwtSecret: jest.fn().mockResolvedValue('secret'),
          resolveUserIdByUid: jest.fn().mockResolvedValue(42),
          checkTokenAuth: jest.fn().mockResolvedValue(true),
          ...redis,
        } as any,
        {} as any,
      );
    }
    const requestWith = (token: string) =>
      ({ headers: { authorization: `Bearer ${token}` } }) as any;
    const userToken = () =>
      jwt.sign({ uid: 'AbC123xYz789', username: 'viewer', role: 'user' }, 'secret');
    async function rejectionOf(service: AuthTokenService, token: string) {
      try {
        await service.resolveLoginPayloadFromRequest(requestWith(token));
      } catch (error) {
        return error as HttpException;
      }
      throw new Error('expected rejection');
    }
    /** 服务里的异常先经过 TransformInterceptor，再到全局异常过滤器 */
    async function projectThroughErrorChain(exception: unknown) {
      class TestController {}
      function handler() {}
      let transformed: unknown;
      try {
        await firstValueFrom(
          new TransformInterceptor().intercept(
            {
              getType: () => 'http',
              getHandler: () => handler,
              getClass: () => TestController,
              switchToHttp: () => ({ getResponse: () => ({}), getRequest: () => ({}) }),
            } as any,
            { handle: () => throwError(() => exception) },
          ),
        );
      } catch (error) {
        transformed = error;
      }
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      new AllExceptionsFilter().catch(transformed, {
        switchToHttp: () => ({
          getResponse: () => ({ headersSent: false, writableEnded: false, status }),
          getRequest: () => ({}),
        }),
      } as any);
      return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
    }

    it('读密钥或 Redis 校验会话时出错：503，经拦截器与过滤器后文案保留', async () => {
      const secretError = await rejectionOf(
        serviceWith({ getJwtSecret: jest.fn().mockRejectedValue(new Error('redis down')) }),
        userToken(),
      );
      const sessionError = await rejectionOf(
        serviceWith({ checkTokenAuth: jest.fn().mockRejectedValue(new Error('redis down')) }),
        userToken(),
      );
      expect(secretError.getStatus()).toBe(503);
      expect(sessionError.getStatus()).toBe(503);
      expect(await projectThroughErrorChain(sessionError)).toEqual({
        status: 503,
        body: expect.objectContaining({ code: 503, message: '服务暂时不可用，请稍后重试' }),
      });
    });

    it('签名不对、会话已不在：401', async () => {
      const badSignature = await rejectionOf(
        serviceWith({}),
        jwt.sign({ uid: 'AbC123xYz789', role: 'user' }, 'other-secret'),
      );
      const revoked = await rejectionOf(
        serviceWith({
          checkTokenAuth: jest
            .fn()
            .mockRejectedValue(new HttpException('您的登录已失效，请重新登录！', 401)),
        }),
        userToken(),
      );
      expect(badSignature.getStatus()).toBe(401);
      expect(badSignature.message).toBe('登录状态已失效，请重新登录。');
      expect(revoked.getStatus()).toBe(401);
    });
  });
});
