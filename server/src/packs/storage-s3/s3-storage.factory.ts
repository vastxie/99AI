import { Injectable } from '@nestjs/common';
import { assertRequiredStorageConfig } from '@/modules/fileAsset/storage/object-storage.util';
import type {
  StorageConfigReader,
  StorageProvider,
  StorageProviderFactory,
  StorageProviderScope,
} from '@/modules/fileAsset/storage/storage-provider.interface';
import { StorageProviderRegistry } from '@/modules/fileAsset/storage/storage-provider.registry';
import { S3PrivateStorageProvider } from './s3-storage.provider';

/** S3 兼容对象存储（Amazon S3、MinIO、Cloudflare R2 等）：按 public / private 作用域读取站点配置（{prefix}S3*）创建实例 */
@Injectable()
export class S3StorageFactory implements StorageProviderFactory {
  readonly name = 's3';
  readonly label = 'S3 兼容存储';

  constructor(registry: StorageProviderRegistry) {
    registry.register(this);
  }

  async create(scope: StorageProviderScope, reader: StorageConfigReader): Promise<StorageProvider> {
    const prefix = scope === 'public' ? 'public' : 'private';
    const configs = await reader.getConfigs([
      `${prefix}S3Region`,
      `${prefix}S3Bucket`,
      `${prefix}S3AccessKeyId`,
      `${prefix}S3SecretAccessKey`,
      `${prefix}S3Endpoint`,
    ]);
    assertRequiredStorageConfig(configs, [
      `${prefix}S3Bucket`,
      `${prefix}S3AccessKeyId`,
      `${prefix}S3SecretAccessKey`,
    ]);
    return new S3PrivateStorageProvider({
      region: configs[`${prefix}S3Region`] || 'us-east-1',
      bucket: configs[`${prefix}S3Bucket`],
      accessKeyId: configs[`${prefix}S3AccessKeyId`],
      secretAccessKey: configs[`${prefix}S3SecretAccessKey`],
      endpoint: configs[`${prefix}S3Endpoint`] || undefined,
    });
  }
}
