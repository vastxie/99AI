import type { LoginConfigTab } from '@/auth/loginConfigTabs';
import { defineAdminPack } from '@/core/packs/defineAdminPack';
import { packEnabled } from '@/utils/packs';
import manifest from './pack.json';

/**
 * 邮箱包（管理端）：「登录配置」里的邮箱登录页签（SMTP / 腾讯云邮件）。
 * VITE_EMAIL_ENABLED=false 时不展示（对应后端 EMAIL_PACK_ENABLED）。
 */
export const EMAIL_ENABLED = packEnabled(import.meta.env.VITE_EMAIL_ENABLED);

export const emailLoginConfigTabs: LoginConfigTab[] = EMAIL_ENABLED
  ? [{ name: 'email', label: '邮箱登录', component: () => import('./LoginConfigTab.vue') }]
  : [];

export default defineAdminPack({
  id: manifest.id,
  tier: 'system',
  enabled: EMAIL_ENABLED,
  loginConfigTabs: emailLoginConfigTabs,
  providerLabels: { local_email: '邮箱登录' },
});
