import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { RedisClientType } from 'redis';
import { AuthConfig } from '@/common/config/auth.config';
import { getErrorStack } from '@/common/utils/error-stack.util';

interface SaveTokenMetadata {
  uid?: string;
  username?: string;
  role?: string;
}

interface VisitorSessionMetadata {
  visitorId: string;
  fingerprintHash?: string;
  ip?: string;
  userAgentHash?: string;
  createdAt?: string;
}

interface RedisKeyInput {
  key: string;
}

interface RedisKeyValueInput extends RedisKeyInput {
  val: string;
}

/** 会话校验只读取请求上已解析的用户身份（守卫 / WebSocket / 绑定流程都传入解析后的用户）；WebSocket 侧传入同构的最小对象 */
interface TokenAuthRequestLike {
  user: { id: number | string; role: string; uid?: string };
  headers?: unknown;
}

/**
 * 把用户的会话集合原子裁剪到上限，返回被移出的 token：按最近活跃时间从旧到新移出，
 * 刚签发的 ARGV[2] 不移出（同一毫秒的多个会话分数相同，按 token 字符串排序时它可能排在前面）
 */
const TRIM_SESSIONS_SCRIPT = `
local limit = tonumber(ARGV[1])
local excess = redis.call('ZCARD', KEYS[1]) - limit
local removed = {}
if excess <= 0 then
  return removed
end
-- 只取最旧的 excess + 1 个候选：刚签发的会话最多占其中一个位置，大集合也不用整个读出
for _, member in ipairs(redis.call('ZRANGE', KEYS[1], 0, excess)) do
  if excess <= 0 then
    break
  end
  if member ~= ARGV[2] then
    redis.call('ZREM', KEYS[1], member)
    table.insert(removed, member)
    excess = excess - 1
  end
end
return removed
`;

@Injectable()
export class RedisCacheService {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType) {}

  async runAtomicScript(script: string, keys: string[], args: string[]): Promise<number> {
    const result = await this.redisClient.eval(script, { keys, arguments: args });
    if (typeof result !== 'number' || !Number.isSafeInteger(result)) {
      throw new Error('Redis atomic operation returned an invalid result');
    }
    return result;
  }

  async get(body: RedisKeyInput) {
    const { key } = body;
    return await this.redisClient.get(key);
  }

  async getDel(body: RedisKeyInput) {
    const { key } = body;
    return await this.redisClient.getDel(key);
  }

  async incrByWithInitialExpire(key: string, amount: number, ttlSeconds: number): Promise<number> {
    const result = await this.redisClient.eval(
      `
      local count = redis.call("INCRBY", KEYS[1], ARGV[1])
      if count == tonumber(ARGV[1]) then
        redis.call("EXPIRE", KEYS[1], ARGV[2])
      end
      return count
      `,
      {
        keys: [key],
        arguments: [String(amount), String(ttlSeconds)],
      },
    );
    return Number(result);
  }

  async set(body: RedisKeyValueInput, timeout = 3600) {
    const { key, val } = body;
    if (timeout && timeout > 0) {
      return await this.redisClient.set(key, val, { EX: timeout });
    }
    return await this.redisClient.set(key, val);
  }

  async getJwtSecret(): Promise<string> {
    const secret = await this.redisClient.get('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT secret not found in Redis');
    }

    return secret;
  }

  async del(body: RedisKeyInput) {
    const { key } = body;
    await this.redisClient.del(key);
    return;
  }

  async saveToken(
    userId: number | string,
    token: string,
    refreshToken?: string,
    maxDevices?: number,
    metadata?: SaveTokenMetadata,
  ) {
    const tokenKey = `${AuthConfig.redis.tokenPrefix}${userId}`;

    // 使用传入的maxDevices参数，如果没有传入则使用默认配置
    const deviceLimit = Math.max(1, Math.floor(maxDevices || AuthConfig.device.maxDevices));

    // 使用事务添加新token和相关数据
    const multi = this.redisClient.multi();

    // 添加token到用户的token集合
    multi.zAdd(tokenKey, [
      {
        score: Date.now(),
        value: token,
      },
    ]);

    // 保存token数据
    multi.setEx(
      `${AuthConfig.redis.tokenDataPrefix}${token}`,
      AuthConfig.redis.tokenTTL,
      JSON.stringify({
        userId,
        uid: metadata?.uid,
        username: metadata?.username,
        role: metadata?.role,
        createdAt: Date.now(),
        expiresAt: Date.now() + AuthConfig.redis.tokenTTL * 1000,
      }),
    );

    // 如果有刷新token，保存刷新token
    if (refreshToken) {
      multi.setEx(
        `${AuthConfig.redis.tokenDataPrefix}${token}:refresh`,
        AuthConfig.redis.refreshTokenTTL,
        refreshToken,
      );

      multi.setEx(
        `${AuthConfig.redis.refreshTokenPrefix}${refreshToken}`,
        AuthConfig.redis.refreshTokenTTL,
        JSON.stringify({
          userId,
          accessToken: token,
          createdAt: Date.now(),
          expiresAt: Date.now() + AuthConfig.redis.refreshTokenTTL * 1000,
        }),
      );
    }

    // 设置用户token集合的过期时间
    multi.expire(tokenKey, AuthConfig.redis.tokenTTL);

    if (metadata?.uid) {
      multi.setEx(
        this.getUidMapKey(metadata.uid),
        AuthConfig.redis.tokenTTL,
        JSON.stringify({
          id: userId,
          uid: metadata.uid,
          username: metadata.username,
          role: metadata.role,
        }),
      );
    }

    await multi.exec();

    // 加入后再原子裁剪到设备上限：同时登录的多个请求也不会让超出上限的会话留下来。
    // 按最近活跃时间（鉴权时刷新的分数）挑出最久未活动的设备下线，并撤销它们的 access / refresh
    const removed = await this.redisClient.eval(TRIM_SESSIONS_SCRIPT, {
      keys: [tokenKey],
      arguments: [String(deviceLimit), token],
    });
    if (Array.isArray(removed) && removed.length) {
      await this.invalidateTokens(userId, removed.map(String));
    }
  }

  async saveVisitorSession(uid: string, metadata: VisitorSessionMetadata): Promise<void> {
    await this.redisClient.setEx(
      this.getVisitorUidMapKey(uid),
      AuthConfig.redis.visitorSessionTTL,
      JSON.stringify({
        ...metadata,
        createdAt: metadata.createdAt || new Date().toISOString(),
      }),
    );
  }

  async resolveUserIdByUid(uid: string): Promise<number | null> {
    if (!uid) return null;
    const raw = await this.redisClient.get(this.getUidMapKey(uid));
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      const id = Number(parsed?.id ?? parsed?.userId ?? parsed);
      return Number.isInteger(id) && id > 0 ? id : null;
    } catch {
      const id = Number(raw);
      return Number.isInteger(id) && id > 0 ? id : null;
    }
  }

  async resolveVisitorIdByUid(uid: string | undefined): Promise<string | null> {
    if (!uid) return null;
    const raw = await this.redisClient.get(this.getVisitorUidMapKey(uid));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const id = String(parsed?.visitorId ?? parsed?.id ?? parsed ?? '');
      return id.startsWith('visitor:') ? id : null;
    } catch {
      const id = String(raw);
      return id.startsWith('visitor:') ? id : null;
    }
  }

  private getUidMapKey(uid: string): string {
    return `auth:uid:${uid}`;
  }

  private getVisitorUidMapKey(uid: string): string {
    return `auth:visitor_uid:${uid}`;
  }

  /* 移除老的token  */
  async invalidateTokens(userId: number | string, tokens: string[]) {
    if (!tokens?.length) return;

    const multi = this.redisClient.multi();
    const tokenKey = `${AuthConfig.redis.tokenPrefix}${userId}`;
    const refreshTokens = await this.redisClient.mGet(
      tokens.map(token => `${AuthConfig.redis.tokenDataPrefix}${token}:refresh`),
    );

    tokens.forEach((token, index) => {
      multi.zRem(tokenKey, token);
      multi.del(`${AuthConfig.redis.tokenDataPrefix}${token}`);
      multi.del(`${AuthConfig.redis.tokenDataPrefix}${token}:refresh`);
      if (refreshTokens[index]) {
        multi.del(`${AuthConfig.redis.refreshTokenPrefix}${refreshTokens[index]}`);
      }
    });

    await multi.exec();
  }

  /** 账号安全状态变化后撤销该用户的全部 access/refresh session。 */
  async invalidateUserSessions(userId: number): Promise<void> {
    const tokenKey = `${AuthConfig.redis.tokenPrefix}${userId}`;
    const tokens = await this.redisClient.zRange(tokenKey, 0, -1);
    await this.invalidateTokens(userId, tokens);
    await this.redisClient.del(tokenKey);
  }

  async checkTokenAuth(token: string, req: TokenAuthRequestLike) {
    const { id: userId, role, uid } = req.user;

    // 访客不写登录 token 集合，但必须能通过短期 uid 映射还原服务端签发的 visitorId。
    if (role === 'visitor') {
      const visitorId = await this.resolveVisitorIdByUid(uid);
      if (visitorId && String(visitorId) === String(userId)) return true;
      throw new HttpException('游客登录状态已失效，请刷新后重试。', HttpStatus.UNAUTHORIZED);
    }

    if (AuthConfig.device.checkWhitelistRoles.includes(role)) return true;

    const tokenKey = `${AuthConfig.redis.tokenPrefix}${userId}`;
    const tokenDataKey = `${AuthConfig.redis.tokenDataPrefix}${token}`;

    // 使用事务批量获取数据
    const multi = this.redisClient.multi();
    multi.zScore(tokenKey, token);
    multi.get(tokenDataKey);
    multi.ttl(tokenDataKey);

    const results = await multi.exec();
    const tokenScore = results[0];
    const tokenData = results[1];
    const ttl = results[2];

    // 检查token是否存在
    if (!tokenScore || !tokenData) {
      Logger.error('当前token不在redis中或已过期，需要重新登录', 'RedisCacheService');
      throw new HttpException(
        '您的登录已失效（可能由于token过期或在其他设备登录），请重新登录！',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 检查token是否即将过期（少于7天），如果是则延长过期时间
    const ttlSeconds = Number(ttl);
    if (ttlSeconds > 0 && ttlSeconds < 7 * 24 * 60 * 60) {
      await this.redisClient.expire(tokenDataKey, AuthConfig.redis.tokenTTL);
    }

    // 更新token最后活跃时间（登录时按它挑出最久未活动的设备下线）。只更新仍在集合里的会话（XX）：
    // 读到会话之后、写回之前，它可能刚被新登录挤下线并撤销，不能把它重新加回集合
    await this.redisClient.zAdd(
      tokenKey,
      [
        {
          score: Date.now(),
          value: token,
        },
      ],
      { condition: 'XX' },
    );

    // 设备数只在签发时按后台「最大登录设备数」裁剪（saveToken）：这里拿不到后台配置，
    // 按默认值裁剪会把配置成 3 台以上的账号每次请求都裁回 3 台
    return true;
  }

  /**
   * 批量获取多个键的值
   * @param keys 要获取的键数组
   */
  async mget(keys: string[]): Promise<Array<string | null>> {
    try {
      return await this.redisClient.mGet(keys);
    } catch (error) {
      Logger.error(`批量获取 keys 失败`, getErrorStack(error), 'RedisCacheService');
      return new Array(keys.length).fill(null);
    }
  }
}
