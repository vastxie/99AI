import { Global, Module } from '@nestjs/common';
import { FileAssetModule } from '../fileAsset/fileAsset.module';
import { RedisCacheModule } from '../redisCache/redisCache.module';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Global()
@Module({
  imports: [RedisCacheModule, FileAssetModule],
  providers: [UploadService],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
