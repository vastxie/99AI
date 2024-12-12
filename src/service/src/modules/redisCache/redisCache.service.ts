import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { RedisClientType } from 'redis';

@Injectable()
export class RedisCacheService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType
  ) {}

  async get(body) {
    const { key } = body;
    const res = await this.redisClient.get(key);
    return await this.redisClient.get(key);
  }

  async set(body, time?: number) {
    try {
      const { key, val } = body;
      await this.redisClient.set(key, val);
      time && (await this.redisClient.expire(key, time));
      return;
    } catch (error) {
      throw new HttpException(error, HttpStatus.BAD_REQUEST);
    }
  }

  async getJwtSecret(): Promise<string> {
    const secret = await this.redisClient.get('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT secret not found in Redis');
    }

    return secret;
  }

  async ttl(key) {
    return await this.redisClient.ttl(key);
  }

  async del(body) {
    const { key } = body;
    await this.redisClient.del(key);
    return;
  }

  /* 登录记录token */
  async saveToken(userId, token) {
    const tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
    await this.invalidateTokens(userId, tokens);
    this.redisClient.set(`token:${userId}`, token);
  }

  /* 移除老的token  */
  async invalidateTokens(userId, tokens) {
    tokens.forEach((token) => {
      this.redisClient.del(`token:${userId}:${token}`);
    });
  }

  /* 检测token是否有效 */
  async checkTokenAuth(token, req) {
    const { id: userId, role } = req.user;
    if (role === 'visitor') return true;
    const storedToken = await this.redisClient.get(`token:${userId}`);

    /* first set token */
    if (storedToken === null) {
      await this.redisClient.set(`token:${userId}`, token);
      return true;
    }

    /* token invalid  */
    if (storedToken !== token) {
      /* 管理员属于白名单 */
      if (['super', 'admin'].includes(role)) return true;
      // 如果 Token 不存在或者不匹配，则认为验证失败
      throw new HttpException(
        '您已在其他设备覆盖登录、请您重新登录！',
        HttpStatus.UNAUTHORIZED
      );
      // throw new HttpException('You have been logged in on another device, please log in again!', HttpStatus.UNAUTHORIZED);
      // return true;
    }
  }
}
