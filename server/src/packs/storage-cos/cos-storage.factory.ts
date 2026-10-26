import { Injectable } from '@nestjs/common';
import { assertRequiredStorageConfig } from '@/modules/fileAsset/storage/object-storage.util';
import type {
  StorageConfigReader,
  StorageProvider,
  StorageProviderFactory,
  StorageProviderScope,
} from '@/modules/fileAsset/storage/storage-provider.interface';
import { StorageProviderRegistry } from '@/modules/fileAsset/storage/storage-provider.registry';
import { CosPrivateStorageProvider } from './cos-storage.provider';

/** 腾讯云 COS 对象存储：按 public / private 作用域读取站点配置（{prefix}Cos*）创建实例 */
@Injectable()
export class CosStorageFactory implements StorageProviderFactory {
  readonly name = 'cos';
  readonly label = '腾讯云 COS';

  constructor(registry: StorageProviderRegistry) {
    registry.register(this);
  }

  async create(scope: StorageProviderScope, reader: StorageConfigReader): Promise<StorageProvider> {
    const prefix = scope === 'public' ? 'public' : 'private';
    const configs = await reader.getConfigs([
      `${prefix}CosBucket`,
      `${prefix}CosRegion`,
      `${prefix}CosSecretId`,
      `${prefix}CosSecretKey`,
    ]);
    assertRequiredStorageConfig(configs, [
      `${prefix}CosBucket`,
      `${prefix}CosRegion`,
      `${prefix}CosSecretId`,
      `${prefix}CosSecretKey`,
    ]);
    return new CosPrivateStorageProvider({
      bucket: configs[`${prefix}CosBucket`],
      region: configs[`${prefix}CosRegion`],
      secretId: configs[`${prefix}CosSecretId`],
      secretKey: configs[`${prefix}CosSecretKey`],
    });
  }
}
