import { HttpException } from '@nestjs/common';
import { RedisCacheService } from './redisCache.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createRedisClientMock(execResult: any[] = []) {
  const multi = {
    zScore: jest.fn().mockReturnThis(),
    zRem: jest.fn().mockReturnThis(),
    get: jest.fn().mockReturnThis(),
    ttl: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(execResult),
  };

  return {
    multi: jest.fn(() => multi),
    eval: jest.fn(),
    get: jest.fn(),
    mGet: jest.fn().mockResolvedValue([]),
    del: jest.fn(),
    expire: jest.fn(),
    zAdd: jest.fn(),
    zRange: jest.fn().mockResolvedValue([]),
    __multi: multi,
  };
}

describe('RedisCacheService.checkTokenAuth', () => {
  it('keeps visitor tokens out of session sets but still requires uid mapping', async () => {
    const redisClient = createRedisClientMock();
    redisClient.get.mockResolvedValue(JSON.stringify({ visitorId: 'visitor:visitorUid001' }));
    const service = new RedisCacheService(redisClient as any);

    await expect(
      service.checkTokenAuth('visitor-token', {
        user: { uid: 'visitorUid001', id: 'visitor:visitorUid001', role: 'visitor' },
      }),
    ).resolves.toBe(true);

    expect(redisClient.get).toHaveBeenCalledWith('auth:visitor_uid:visitorUid001');
    expect(redisClient.multi).not.toHaveBeenCalled();
  });

  it('rejects visitor tokens when uid mapping is gone', async () => {
    const redisClient = createRedisClientMock();
    redisClient.get.mockResolvedValue(null);
    const service = new RedisCacheService(redisClient as any);

    await expect(
      service.checkTokenAuth('visitor-token', {
        user: { uid: 'visitorUid002', id: 2000000001, role: 'visitor' },
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(redisClient.multi).not.toHaveBeenCalled();
  });

  it('rejects super tokens that are no longer present in Redis', async () => {
    const redisClient = createRedisClientMock([null, null, -2]);
    const service = new RedisCacheService(redisClient as any);

    await expect(
      service.checkTokenAuth('leaked-super-token', {
        user: { id: 1, role: 'super' },
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(redisClient.__multi.zScore).toHaveBeenCalledWith('tokens:1', 'leaked-super-token');
    expect(redisClient.__multi.get).toHaveBeenCalledWith('token:data:leaked-super-token');
  });

  it('does not keep legacy admin role in the token-check bypass', async () => {
    const redisClient = createRedisClientMock([null, null, -2]);
    const service = new RedisCacheService(redisClient as any);

    await expect(
      service.checkTokenAuth('legacy-admin-token', {
        user: { id: 2, role: 'admin' },
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(redisClient.__multi.zScore).toHaveBeenCalledWith('tokens:2', 'legacy-admin-token');
  });

  it('does not trim sessions on every request (the configured device limit applies at sign-in)', async () => {
    // 后台把最大登录设备数设成 5：第 4、5 台设备的请求不能把较早的设备踢下线
    const redisClient = createRedisClientMock([1, '{"userId":3}', 3600 * 24 * 30]);
    redisClient.zRange.mockResolvedValue(['t1', 't2', 't3', 't4', 't5']);
    const service = new RedisCacheService(redisClient as any);

    await expect(
      service.checkTokenAuth('t5', {
        user: { id: 3, role: 'viewer' },
      }),
    ).resolves.toBe(true);

    // 只刷新仍在集合里的会话（XX）：刚被挤下线撤销的会话不能被写回
    expect(redisClient.zAdd).toHaveBeenCalledWith(
      'tokens:3',
      [{ score: expect.any(Number), value: 't5' }],
      { condition: 'XX' },
    );
    expect(redisClient.__multi.zRem).not.toHaveBeenCalled();
    expect(redisClient.__multi.del).not.toHaveBeenCalled();
  });
});

describe('RedisCacheService.saveToken', () => {
  function createIssuingClient(trimmed: string[]) {
    const redisClient = createRedisClientMock();
    (redisClient.__multi as any).zAdd = jest.fn().mockReturnThis();
    (redisClient.__multi as any).setEx = jest.fn().mockReturnThis();
    (redisClient.__multi as any).expire = jest.fn().mockReturnThis();
    redisClient.eval.mockResolvedValue(trimmed);
    return redisClient;
  }

  it('adds the session first, then trims atomically to the configured device limit', async () => {
    const redisClient = createIssuingClient(['t1']);
    const service = new RedisCacheService(redisClient as any);
    const invalidate = jest.spyOn(service as any, 'invalidateTokens').mockResolvedValue(undefined);

    await service.saveToken(3, 't6', 'refresh-6', 5);

    expect((redisClient.__multi as any).zAdd).toHaveBeenCalledWith('tokens:3', [
      { score: expect.any(Number), value: 't6' },
    ]);
    // 裁剪在加入之后、以单个脚本执行：并发登录各自加入后，脚本串行把集合收回上限
    expect(redisClient.__multi.exec.mock.invocationCallOrder[0]).toBeLessThan(
      redisClient.eval.mock.invocationCallOrder[0],
    );
    expect(redisClient.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('ZREM'"), {
      keys: ['tokens:3'],
      arguments: ['5', 't6'],
    });
    // 被挤下线的会话连同 access / refresh 一并撤销
    expect(invalidate).toHaveBeenCalledWith(3, ['t1']);
  });

  it('does not revoke anything while the user stays within the limit', async () => {
    const redisClient = createIssuingClient([]);
    const service = new RedisCacheService(redisClient as any);
    const invalidate = jest.spyOn(service as any, 'invalidateTokens').mockResolvedValue(undefined);

    await service.saveToken(3, 't2', undefined, undefined);

    expect(redisClient.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['tokens:3'],
      arguments: ['3', 't2'],
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('RedisCacheService.incrByWithInitialExpire', () => {
  it('increments atomically and only sets expiry inside the initial Lua branch', async () => {
    const redisClient = createRedisClientMock();
    redisClient.eval.mockResolvedValue(3);
    const service = new RedisCacheService(redisClient as any);

    await expect(
      service.incrByWithInitialExpire('rate-limit:/api/test:127.0.0.1', 1, 3600),
    ).resolves.toBe(3);

    expect(redisClient.eval).toHaveBeenCalledWith(expect.stringContaining('INCRBY'), {
      keys: ['rate-limit:/api/test:127.0.0.1'],
      arguments: ['1', '3600'],
    });
    expect(redisClient.expire).not.toHaveBeenCalled();
  });
});

describe('RedisCacheService.invalidateUserSessions', () => {
  it('removes access sessions and both refresh-token indexes', async () => {
    const redisClient = createRedisClientMock();
    redisClient.zRange.mockResolvedValue(['access-1', 'access-2']);
    redisClient.mGet.mockResolvedValue(['refresh-1', 'refresh-2']);
    const service = new RedisCacheService(redisClient as any);

    await service.invalidateUserSessions(42);

    expect(redisClient.mGet).toHaveBeenCalledWith([
      'token:data:access-1:refresh',
      'token:data:access-2:refresh',
    ]);
    expect(redisClient.__multi.del).toHaveBeenCalledWith('refresh:token:refresh-1');
    expect(redisClient.__multi.del).toHaveBeenCalledWith('refresh:token:refresh-2');
    expect(redisClient.__multi.del).toHaveBeenCalledWith('token:data:access-1');
    expect(redisClient.__multi.del).toHaveBeenCalledWith('token:data:access-2');
    expect(redisClient.del).toHaveBeenCalledWith('tokens:42');
  });
});
