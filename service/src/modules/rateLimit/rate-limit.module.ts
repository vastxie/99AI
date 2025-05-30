import { Global, MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common';
import { RedisCacheModule } from '../redisCache/redisCache.module';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  imports: [RedisCacheModule],
  providers: [RateLimitService, RateLimitMiddleware],
  exports: [RateLimitService],
})
export class RateLimitModule implements NestModule, OnModuleInit {
  constructor(private readonly rateLimitService: RateLimitService) {}

  // 在模块初始化时检查配置
  async onModuleInit() {
    // 获取配置
    this.rateLimitService.getConfigs();
  }

  // 配置中间件
  configure(consumer: MiddlewareConsumer) {
    // 应用中间件到所有路由
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
