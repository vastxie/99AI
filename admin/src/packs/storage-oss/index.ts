import type { StorageProviderContribution, StorageScope } from '@/storage/storageConfigFields';
import { defineAdminPack } from '@/core/packs/defineAdminPack';
import { packEnabled } from '@/utils/packs';
import manifest from './pack.json';

/**
 * 阿里云 OSS 存储包（管理端）：「文件存储」公共 / 私有存储下拉里的 OSS 选项与配置字段。
 * VITE_STORAGE_OSS_ENABLED=false 时不展示（对应后端 STORAGE_OSS_PACK_ENABLED）。
 */
export const STORAGE_OSS_ENABLED = packEnabled(import.meta.env.VITE_STORAGE_OSS_ENABLED);

const only = (scope: StorageScope) => (settings: any) =>
  settings[`${scope}StorageProvider`] === 'oss';

export const ossStorageProviders: StorageProviderContribution[] = STORAGE_OSS_ENABLED
  ? [
      {
        value: 'oss',
        label: '阿里云 OSS',
        fields: (scope) => [
          {
            key: `${scope}OssBucket`,
            label: 'OSS 存储桶',
            type: 'input',
            required: true,
            placeholder: '存储桶名称',
            showCondition: only(scope),
          },
          {
            key: `${scope}OssRegion`,
            label: 'OSS 地域',
            type: 'input',
            required: true,
            placeholder: 'oss-cn-shanghai',
            showCondition: only(scope),
            helpText: '填 OSS Region（如 oss-cn-shanghai），不是普通地域名。',
          },
          {
            key: `${scope}OssAccessKeyId`,
            label: 'OSS AccessKeyId',
            type: 'password',
            required: true,
            placeholder: 'AccessKeyId',
            showCondition: only(scope),
          },
          {
            key: `${scope}OssAccessKeySecret`,
            label: 'OSS AccessKeySecret',
            type: 'password',
            required: true,
            placeholder: 'AccessKeySecret',
            showCondition: only(scope),
          },
        ],
      },
    ]
  : [];

export default defineAdminPack({
  id: manifest.id,
  tier: 'system',
  enabled: STORAGE_OSS_ENABLED,
  storageProviders: ossStorageProviders,
});
