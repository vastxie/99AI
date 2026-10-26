import { Module } from '@nestjs/common';
import { FileAssetModule } from '@/modules/fileAsset/fileAsset.module';
import { OssStorageFactory } from './oss-storage.factory';
import { StorageOssConfigSection } from './storage-oss-config.section';

/**
 * 存储包：阿里云 OSS 对象存储。
 * 工厂在构造时向内核 StorageProviderRegistry 登记；由 STORAGE_OSS_PACK_ENABLED 决定是否装载。
 */
@Module({
  imports: [FileAssetModule],
  providers: [OssStorageFactory, StorageOssConfigSection],
})
export class StorageOssPackModule {}
