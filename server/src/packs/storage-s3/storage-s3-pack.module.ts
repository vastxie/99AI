import { Module } from '@nestjs/common';
import { FileAssetModule } from '@/modules/fileAsset/fileAsset.module';
import { S3StorageFactory } from './s3-storage.factory';
import { StorageS3ConfigSection } from './storage-s3-config.section';

/**
 * 存储包：S3 兼容对象存储（Amazon S3、MinIO、Cloudflare R2 等）。
 * 工厂在构造时向内核 StorageProviderRegistry 登记；由 STORAGE_S3_PACK_ENABLED 决定是否装载。
 */
@Module({
  imports: [FileAssetModule],
  providers: [S3StorageFactory, StorageS3ConfigSection],
})
export class StorageS3PackModule {}
