import { Global, Logger, Module } from '@nestjs/common';
import { createClient } from 'redis';
import { RedisCacheController } from './redisCache.controller';
import { RedisCacheService } from './redisCache.service';

@Global()
@Module({
  imports: [],
  controllers: [RedisCacheController],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const host = process.env.REDIS_HOST;
        const port = parseInt(process.env.REDIS_PORT, 10);
        const password = process.env.REDIS_PASSWORD;
        const username = process.env.REDIS_USER;
        const database = parseInt(process.env.REDIS_DB, 10) || 0;

        if (!host || !port) {
          Logger.error(
            `Please configure Redis config | 未配置 Redis 配置信息，请确认配置 Redis 服务以获得更好的体验`,
            'RedisCacheModule'
          );
          return;
        }

        const client = createClient({
          socket: {
            host,
            port,
          },
          username,
          password,
          database,
        });

        client.on('ready', () => {
          Logger.log(`Redis connection successful`, 'RedisCacheModule');
        });

        client.on('error', (err) => {
          Logger.error(`Redis connection failed: ${err}`, 'RedisCacheModule');
        });

        await client.connect();
        return client;
      },
    },
    RedisCacheService,
  ],
  exports: ['REDIS_CLIENT', RedisCacheService],
})
export class RedisCacheModule {}
