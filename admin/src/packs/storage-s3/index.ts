import type { StorageProviderContribution, StorageScope } from '@/storage/storageConfigFields';
import { defineAdminPack } from '@/core/packs/defineAdminPack';
import { packEnabled } from '@/utils/packs';
import manifest from './pack.json';

/**
 * S3 兼容存储包（管理端）：「文件存储」公共 / 私有存储下拉里的 S3 选项与配置字段。
 * VITE_STORAGE_S3_ENABLED=false 时不展示（对应后端 STORAGE_S3_PACK_ENABLED）。
 */
export const STORAGE_S3_ENABLED = packEnabled(import.meta.env.VITE_STORAGE_S3_ENABLED);

const only = (scope: StorageScope) => (settings: any) =>
  settings[`${scope}StorageProvider`] === 's3';

export const s3StorageProviders: StorageProviderContribution[] = STORAGE_S3_ENABLED
  ? [
      {
        value: 's3',
        label: 'S3 兼容存储',
        fields: (scope) => [
          {
            key: `${scope}S3Endpoint`,
            label: 'S3 端点地址',
            type: 'input',
            required: false,
            placeholder: 'https://s3.amazonaws.com',
            showCondition: only(scope),
            helpText:
              'Amazon S3 可留空或填地域端点；MinIO、Cloudflare R2 等兼容服务填服务商提供的 Endpoint。',
          },
          {
            key: `${scope}S3Region`,
            label: 'S3 区域',
            type: 'input',
            required: false,
            placeholder: 'us-east-1',
            showCondition: only(scope),
          },
          {
            key: `${scope}S3Bucket`,
            label: 'S3 存储桶',
            type: 'input',
            required: true,
            placeholder: '存储桶名称',
            showCondition: only(scope),
          },
          {
            key: `${scope}S3AccessKeyId`,
            label: 'S3 Access Key ID',
            type: 'password',
            required: true,
            placeholder: 'Access Key ID',
            showCondition: only(scope),
          },
          {
            key: `${scope}S3SecretAccessKey`,
            label: 'S3 Secret Access Key',
            type: 'password',
            required: true,
            placeholder: 'Secret Access Key',
            showCondition: only(scope),
          },
        ],
      },
    ]
  : [];

export default defineAdminPack({
  id: manifest.id,
  tier: 'system',
  enabled: STORAGE_S3_ENABLED,
  storageProviders: s3StorageProviders,
});
