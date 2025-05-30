import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { RedisClientType } from 'redis';

@Injectable()
export class RedisCacheService {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType) {}

  async get(body) {
    const { key } = body;
    const res = await this.redisClient.get(key);
    return await this.redisClient.get(key);
  }

  async set(body, timeout = 3600) {
    const { key, val } = body;
    return await this.redisClient.set(key, val, { EX: timeout });
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

  // /* 登录记录token */
  // async saveToken(userId, token) {
  //   const tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
  //   await this.invalidateTokens(userId, tokens);
  //   this.redisClient.set(`token:${userId}`, token);
  // }

  async saveToken(userId, token) {
    const maxDevices = 2;
    let tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);

    // 如果当前token已存在，先删除它（避免重复）
    if (tokens.includes(token)) {
      await this.redisClient.zRem(`tokens:${userId}`, token);
      tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
    }

    // 循环清理，直到设备数小于限制
    while (tokens.length >= maxDevices) {
      const oldestToken = await this.redisClient.zRange(`tokens:${userId}`, 0, 0);
      if (oldestToken.length > 0) {
        await this.redisClient.zRem(`tokens:${userId}`, oldestToken[0]);
        tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
      } else {
        break;
      }
    }

    // 添加新token
    await this.redisClient.zAdd(`tokens:${userId}`, [
      {
        score: Date.now(),
        value: token,
      },
    ]);
  }

  /* 移除老的token  */
  async invalidateTokens(userId, tokens) {
    tokens.forEach(token => {
      this.redisClient.del(`token:${userId}:${token}`);
      this.redisClient.zRem(`tokens:${userId}`, token);
    });
  }

  // /* 检测token是否有效 */
  // async checkTokenAuth(token, req) {
  //   const { id: userId, role } = req.user;
  //   if (role === 'visitor') return true;
  //   const storedToken = await this.redisClient.get(`token:${userId}`);

  //   /* first set token */
  //   if (storedToken === null) {
  //     await this.redisClient.set(`token:${userId}`, token);
  //     return true;
  //   }

  //   /* token invalid  */
  //   // if (storedToken !== token) {
  //   //   /* 管理员属于白名单 */
  //   //   if (['super', 'admin'].includes(role)) return true;
  //   //   // 如果 Token 不存在或者不匹配，则认为验证失败
  //   //   throw new HttpException(
  //   //     '您已在其他设备覆盖登录、请您重新登录！',
  //   //     HttpStatus.UNAUTHORIZED
  //   //   );
  //   //   // throw new HttpException('You have been logged in on another device, please log in again!', HttpStatus.UNAUTHORIZED);
  //   //   // return true;
  //   // }
  // }

  async checkTokenAuth(token, req) {
    const { id: userId, role } = req.user;
    const maxDevices = 2;

    if (role === 'visitor') return true;
    if (['super', 'admin'].includes(role)) return true;

    let tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);

    // 如果token不在列表中，说明是被挤掉的旧设备
    if (!tokens.includes(token)) {
      throw new HttpException(
        '您的登录已失效（可能由于其他设备登录），请重新登录！',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 如果设备数超出限制，清理最早的设备（不包括当前设备）
    while (tokens.length > maxDevices) {
      const oldestToken = await this.redisClient.zRange(`tokens:${userId}`, 0, 0);

      if (oldestToken.length > 0 && oldestToken[0] !== token) {
        await this.redisClient.zRem(`tokens:${userId}`, oldestToken[0]);
        tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
      } else {
        break;
      }
    }

    return true;
  }

  async keys(pattern) {
    try {
      const keys = await this.redisClient.keys(pattern);
      return keys;
    } catch (error) {
      console.error(`Error getting keys with pattern ${pattern}:`, error);
      return [];
    }
  }
}
