import type { LoginConfigTab } from '@/auth/loginConfigTabs';
import { defineAdminPack } from '@/core/packs/defineAdminPack';
import { packEnabled } from '@/utils/packs';
import manifest from './pack.json';

/**
 * 手机号包（管理端）：「登录配置」里的手机号登录页签（腾讯云短信）。
 * VITE_PHONE_ENABLED=false 时不展示（对应后端 PHONE_PACK_ENABLED）。
 */
export const PHONE_ENABLED = packEnabled(import.meta.env.VITE_PHONE_ENABLED);

export const phoneLoginConfigTabs: LoginConfigTab[] = PHONE_ENABLED
  ? [{ name: 'phone', label: '手机号登录', component: () => import('./LoginConfigTab.vue') }]
  : [];

export default defineAdminPack({
  id: manifest.id,
  tier: 'system',
  enabled: PHONE_ENABLED,
  loginConfigTabs: phoneLoginConfigTabs,
  providerLabels: { local_phone: '手机登录' },
});
