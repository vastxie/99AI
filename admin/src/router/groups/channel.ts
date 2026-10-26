import type { RouteRecordRaw } from 'vue-router';
import { packNavPages } from '@/packs';

/** 侧栏分组「登录接入」 */
const channelGroup: RouteRecordRaw = {
  path: '/channel',
  name: 'ChannelGroup',
  redirect: '/channel/login',
  meta: { title: '登录接入', icon: 'i-lucide:key-round' },
  children: [
    {
      path: 'login',
      name: 'ChannelLogin',
      component: () => import('@/views/channel/login.vue'),
      meta: { title: '登录配置', icon: 'i-lucide:log-in' },
    },
    // 扩展包挂在本组的页面（如微信配置、Bot 通道）
    ...packNavPages('ChannelGroup'),
  ],
};

export default channelGroup;
