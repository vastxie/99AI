import { Global, Module } from '@nestjs/common';
import { ModelsController } from './models.controller';
import { ModelsService } from './models.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelsEntity } from './models.entity';
import { ModelGatewayModule } from '../modelGateway/model-gateway.module';
import { RedisCacheModule } from '../redisCache/redisCache.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ModelsEntity]), ModelGatewayModule, RedisCacheModule],
  controllers: [ModelsController],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
