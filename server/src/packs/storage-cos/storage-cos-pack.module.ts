import { Module } from '@nestjs/common';
import { FileAssetModule } from '@/modules/fileAsset/fileAsset.module';
import { CosStorageFactory } from './cos-storage.factory';
import { StorageCosConfigSection } from './storage-cos-config.section';

/**
 * 存储包：腾讯云 COS 对象存储。
 * 工厂在构造时向内核 StorageProviderRegistry 登记；由 STORAGE_COS_PACK_ENABLED 决定是否装载。
 */
@Module({
  imports: [FileAssetModule],
  providers: [CosStorageFactory, StorageCosConfigSection],
})
export class StorageCosPackModule {}
