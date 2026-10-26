import type { StorageProviderContribution, StorageScope } from '@/storage/storageConfigFields';
import { defineAdminPack } from '@/core/packs/defineAdminPack';
import { packEnabled } from '@/utils/packs';
import manifest from './pack.json';

/**
 * 腾讯云 COS 存储包（管理端）：「文件存储」公共 / 私有存储下拉里的 COS 选项与配置字段。
 * VITE_STORAGE_COS_ENABLED=false 时不展示（对应后端 STORAGE_COS_PACK_ENABLED）。
 */
export const STORAGE_COS_ENABLED = packEnabled(import.meta.env.VITE_STORAGE_COS_ENABLED);

const only = (scope: StorageScope) => (settings: any) =>
  settings[`${scope}StorageProvider`] === 'cos';

export const cosStorageProviders: StorageProviderContribution[] = STORAGE_COS_ENABLED
  ? [
      {
        value: 'cos',
        label: '腾讯云 COS',
        fields: (scope) => [
          {
            key: `${scope}CosBucket`,
            label: 'COS 存储桶',
            type: 'input',
            required: true,
            placeholder: '存储桶名称（含 APPID，如 agent-assets-1250000000）',
            showCondition: only(scope),
          },
          {
            key: `${scope}CosRegion`,
            label: 'COS 地域',
            type: 'input',
            required: true,
            placeholder: 'ap-guangzhou',
            showCondition: only(scope),
          },
          {
            key: `${scope}CosSecretId`,
            label: 'COS SecretId',
            type: 'password',
            required: true,
            placeholder: 'SecretId',
            showCondition: only(scope),
          },
          {
            key: `${scope}CosSecretKey`,
            label: 'COS SecretKey',
            type: 'password',
            required: true,
            placeholder: 'SecretKey',
            showCondition: only(scope),
          },
        ],
      },
    ]
  : [];

export default defineAdminPack({
  id: manifest.id,
  tier: 'system',
  enabled: STORAGE_COS_ENABLED,
  storageProviders: cosStorageProviders,
});
