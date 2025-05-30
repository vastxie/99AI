import { getClientIp } from '@/common/utils/getClientIp';
import { RedisCacheService } from '@/modules/redisCache/redisCache.service';
import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  UseInterceptors,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';

// 参数装饰器 - 用于手动检查
export const CheckRateLimit = createParamDecorator(
  async (
    data: { maxRequests: number; windowMs: number; keyPrefix: string },
    ctx: ExecutionContext,
  ) => {
    const { maxRequests = 1000, windowMs = 60000, keyPrefix = 'rate_limit' } = data || {};
    const request = ctx.switchToHttp().getRequest();
    const redisCacheService = request.app.get(RedisCacheService);

    // 获取IP和用户ID
    const ip = getClientIp(request);
    const userId = request.user?.id || null;

    if (!ip && !userId) return;

    // 创建唯一标识符
    const identifier = userId ? `${ip}_${userId}` : ip;

    // Redis键名
    const redisKey = `${keyPrefix}:${identifier}`;

    // 获取当前计数
    const currentCount = await redisCacheService.get({ key: redisKey });
    const count = currentCount ? parseInt(currentCount, 10) : 0;

    // 检查是否超过限制
    if (count >= maxRequests) {
      throw new HttpException('请求频率超过限制，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    // 更新计数
    const windowSeconds = Math.floor(windowMs / 1000);
    await redisCacheService.set({ key: redisKey, val: (count + 1).toString() }, windowSeconds);

    // 返回当前计数信息
    return {
      current: count + 1,
      limit: maxRequests,
      remaining: maxRequests - count - 1,
      reset: Date.now() + windowMs,
    };
  },
);

// 方法装饰器 - 可以直接应用于控制器方法
export function RateLimit(options?: {
  maxRequests?: number;
  windowMs?: number;
  keyPrefix?: string;
}) {
  return applyDecorators(
    UseInterceptors({
      intercept: async (context, next) => {
        const { maxRequests = 5, windowMs = 60000, keyPrefix = 'rate_limit' } = options || {};
        const request = context.switchToHttp().getRequest();
        const redisCacheService = request.app.get(RedisCacheService);

        // 获取IP和用户ID
        const ip = getClientIp(request);
        const userId = request.user?.id || null;

        if (!ip && !userId) {
          return next.handle();
        }

        // 创建唯一标识符
        const identifier = userId ? `${ip}_${userId}` : ip;

        // 获取控制器和方法名称，用于更精确的键名
        const controllerName = context.getClass().name;
        const handlerName = context.getHandler().name;

        // Redis键名
        const redisKey = `${keyPrefix}:${controllerName}:${handlerName}:${identifier}`;

        // 获取当前计数
        const currentCount = await redisCacheService.get({ key: redisKey });
        const count = currentCount ? parseInt(currentCount, 10) : 0;

        // 检查是否超过限制
        if (count >= maxRequests) {
          throw new HttpException('请求频率超过限制，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
        }

        // 更新计数
        const windowSeconds = Math.floor(windowMs / 1000);
        await redisCacheService.set({ key: redisKey, val: (count + 1).toString() }, windowSeconds);

        // 设置响应头
        const response = context.switchToHttp().getResponse();
        response.header('X-RateLimit-Limit', maxRequests);
        response.header('X-RateLimit-Remaining', maxRequests - count - 1);
        response.header('X-RateLimit-Reset', Date.now() + windowMs);

        return next.handle();
      },
    }),
  );
}
