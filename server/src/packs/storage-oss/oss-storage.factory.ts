import { Injectable } from '@nestjs/common';
import { assertRequiredStorageConfig } from '@/modules/fileAsset/storage/object-storage.util';
import type {
  StorageConfigReader,
  StorageProvider,
  StorageProviderFactory,
  StorageProviderScope,
} from '@/modules/fileAsset/storage/storage-provider.interface';
import { StorageProviderRegistry } from '@/modules/fileAsset/storage/storage-provider.registry';
import { OssPrivateStorageProvider } from './oss-storage.provider';

/** 阿里云 OSS 对象存储：按 public / private 作用域读取站点配置（{prefix}Oss*）创建实例 */
@Injectable()
export class OssStorageFactory implements StorageProviderFactory {
  readonly name = 'oss';
  readonly label = '阿里云 OSS';

  constructor(registry: StorageProviderRegistry) {
    registry.register(this);
  }

  async create(scope: StorageProviderScope, reader: StorageConfigReader): Promise<StorageProvider> {
    const prefix = scope === 'public' ? 'public' : 'private';
    const configs = await reader.getConfigs([
      `${prefix}OssRegion`,
      `${prefix}OssBucket`,
      `${prefix}OssAccessKeyId`,
      `${prefix}OssAccessKeySecret`,
    ]);
    assertRequiredStorageConfig(configs, [
      `${prefix}OssRegion`,
      `${prefix}OssBucket`,
      `${prefix}OssAccessKeyId`,
      `${prefix}OssAccessKeySecret`,
    ]);
    return new OssPrivateStorageProvider({
      region: configs[`${prefix}OssRegion`],
      bucket: configs[`${prefix}OssBucket`],
      accessKeyId: configs[`${prefix}OssAccessKeyId`],
      accessKeySecret: configs[`${prefix}OssAccessKeySecret`],
    });
  }
}
