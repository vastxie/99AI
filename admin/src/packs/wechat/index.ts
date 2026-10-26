import type { RouteRecordRaw } from 'vue-router';
import { defineAdminPack } from '@/core/packs/defineAdminPack';
import { packEnabled } from '@/utils/packs';
import manifest from './pack.json';

/**
 * 微信包（管理端）：微信公众号 / 开放平台配置、微信 Bot 通道。
 * VITE_WECHAT_ENABLED=false 时不装载（对应后端 WECHAT_PACK_ENABLED）。
 */
export const WECHAT_ENABLED = packEnabled(import.meta.env.VITE_WECHAT_ENABLED);

/** 挂在「登录接入」下的微信页面 */
export const wechatChannelPages: RouteRecordRaw[] = WECHAT_ENABLED
  ? [
      {
        path: 'wechat',
        name: 'ChannelWechat',
        component: () => import('./views/wechatConfig.vue'),
        meta: {
          title: '微信配置',
          icon: 'i-simple-icons:wechat',
        },
      },
      {
        path: 'bot',
        name: 'ChannelBot',
        component: () => import('./views/botChannel.vue'),
        meta: {
          title: 'Bot 通道',
          icon: 'i-lucide:bot',
        },
      },
    ]
  : [];

export default defineAdminPack({
  id: manifest.id,
  tier: 'feature',
  enabled: WECHAT_ENABLED,
  navPages: { ChannelGroup: wechatChannelPages },
  providerLabels: { wechat_official: '微信公众号', wechat_open_web: '微信开放平台' },
  channelLabels: { weixin: '微信 Bot' },
});
