import type { LoginConfigTab } from '@/auth/loginConfigTabs';
import { defineAdminPack } from '@/core/packs/defineAdminPack';
import { packEnabled } from '@/utils/packs';
import manifest from './pack.json';

/**
 * GitHub 包（管理端）：「登录配置」里的 GitHub 登录页签。
 * VITE_GITHUB_ENABLED=false 时不展示（对应后端 GITHUB_PACK_ENABLED）。
 */
export const GITHUB_ENABLED = packEnabled(import.meta.env.VITE_GITHUB_ENABLED);

export const githubLoginConfigTabs: LoginConfigTab[] = GITHUB_ENABLED
  ? [{ name: 'github', label: 'GitHub 登录', component: () => import('./LoginConfigTab.vue') }]
  : [];

export default defineAdminPack({
  id: manifest.id,
  tier: 'system',
  enabled: GITHUB_ENABLED,
  loginConfigTabs: githubLoginConfigTabs,
  providerLabels: { github: 'GitHub' },
});
