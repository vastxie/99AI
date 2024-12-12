import { RedisDto } from './dto/redis.dto';
import { RedisCacheService } from './redisCache.service';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';

@Controller('redisCache')
export class RedisCacheController {
  constructor(private readonly redisCacheService: RedisCacheService) {}

  @Post('set')
  set(@Body() body: RedisDto) {
    return this.redisCacheService.set(body);
  }

  @Get('get')
  get(@Query() body: RedisDto) {
    return this.redisCacheService.get(body);
  }
}
