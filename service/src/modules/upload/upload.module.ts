import { Global, Module } from '@nestjs/common';
import { RedisCacheModule } from '../redisCache/redisCache.module';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Global()
@Module({
  imports: [RedisCacheModule],
  providers: [UploadService],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
