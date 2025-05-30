import { Injectable, Logger, NestMiddleware, OnModuleInit } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware, OnModuleInit {
  constructor(
    private readonly redisCacheService: RedisCacheService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async onModuleInit() {
    this.rateLimitService.getConfigs();
  }

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const path = req.path;

      // 从服务获取配置
      const configs = this.rateLimitService.getConfigs();

      // 查找匹配的配置
      const matchedConfig = this.findMatchingConfig(path, configs);

      if (!matchedConfig) {
        return next();
      }

      // 生成存储限制的 Redis 键
      const ip = req.ip || req.socket.remoteAddress;
      const identifier = ip || 'unknown';
      const redisKey = `rate-limit:${matchedConfig.path}:${identifier}`;

      // 检查当前计数并递增
      const result = await this.redisCacheService.get({ key: redisKey });
      let currentCount = result ? parseInt(result, 10) : 0;
      currentCount++;

      // 为新键设置过期时间
      const windowSeconds = Math.floor(matchedConfig.windowMs / 1000);
      await this.redisCacheService.set(
        { key: redisKey, val: currentCount.toString() },
        windowSeconds,
      );

      // 设置响应头
      res.setHeader('X-RateLimit-Limit', matchedConfig.maxRequests.toString());
      res.setHeader(
        'X-RateLimit-Remaining',
        Math.max(0, matchedConfig.maxRequests - currentCount).toString(),
      );
      res.setHeader(
        'X-RateLimit-Reset',
        Math.floor(Date.now() + matchedConfig.windowMs).toString(),
      );
      res.setHeader('X-RateLimit-Config-Path', matchedConfig.path);

      // 如果超过限制，返回 429 错误
      if (currentCount > matchedConfig.maxRequests) {
        Logger.warn(
          `限流: IP=${identifier}, 路径=${path}, 计数=${currentCount}/${matchedConfig.maxRequests}`,
          'RateLimitMiddleware',
        );
        res.status(429).json({
          code: 1,
          message: '请求频率超过限制，请稍后再试',
          data: null,
        });
        return;
      }

      next();
    } catch (error) {
      Logger.error(`中间件错误: ${error.message}`, error.stack, 'RateLimitMiddleware');
      next(); // 出错时允许请求通过，避免阻止正常服务
    }
  }

  // 查找匹配请求路径的配置
  private findMatchingConfig(requestPath: string, configs: any[]) {
    for (const config of configs) {
      const isMatch = this.pathMatch(config.path, requestPath);
      if (isMatch) {
        return config;
      }
    }

    return null;
  }

  // 路径匹配逻辑
  private pathMatch(pattern: string, path: string): boolean {
    // 直接相等
    if (pattern === path) {
      return true;
    }

    // 处理通配符
    if (pattern.includes('*')) {
      try {
        // 将通配符转换为正则表达式
        const escapedPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\//g, '\\/')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^\\/]*');

        const regexPattern = new RegExp(`^${escapedPattern}$`);
        return regexPattern.test(path);
      } catch (error) {
        Logger.error(`路径匹配错误: ${error.message}`, error.stack, 'RateLimitMiddleware');
        return false;
      }
    }

    return false;
  }
}
