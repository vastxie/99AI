import type { RouteRecordRaw } from 'vue-router';
import { defineAdminPack } from '@/core/packs/defineAdminPack';
import { packEnabled } from '@/utils/packs';
import manifest from './pack.json';
import securityGroup from './nav-group';

/**
 * 内容安全包（管理端）：内容审核 / 白名单 / 违规记录。
 * VITE_CONTENT_SAFETY_ENABLED=false 时整包不装载（对应后端 CONTENT_SAFETY_PACK_ENABLED）。
 */
export const CONTENT_SAFETY_ENABLED = packEnabled(import.meta.env.VITE_CONTENT_SAFETY_ENABLED);

/** 侧栏分组「安全风控」 */
export const contentSafetyNavGroups: RouteRecordRaw[] = CONTENT_SAFETY_ENABLED
  ? [securityGroup]
  : [];

export default defineAdminPack({
  id: manifest.id,
  tier: 'feature',
  enabled: CONTENT_SAFETY_ENABLED,
  navGroups: contentSafetyNavGroups,
  userDetailSections: [
    {
      id: 'contentSafety',
      title: '内容安全',
      component: () => import('./user/UserProfileSection.vue'),
    },
  ],
});
