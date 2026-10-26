import type { RouteRecordRaw } from 'vue-router';
import { packNavPages } from '@/packs';

/** 侧栏分组「平台设置」 */
const systemGroup: RouteRecordRaw = {
  path: '/system',
  name: 'SystemGroup',
  redirect: '/system/base',
  meta: { title: '平台设置', icon: 'i-lucide:sliders-horizontal' },
  children: [
    {
      path: 'base',
      name: 'SystemBase',
      component: () => import('@/views/system/baseConfiguration.vue'),
      meta: { title: '基础信息', icon: 'i-lucide:settings' },
    },
    {
      path: 'display',
      name: 'SystemDisplay',
      component: () => import('@/views/system/displaySettings.vue'),
      meta: { title: '界面外观', icon: 'i-lucide:eye' },
    },
    {
      path: 'notice',
      name: 'SystemNotice',
      component: () => import('@/views/system/contentManagement.vue'),
      meta: { title: '公告协议', icon: 'i-lucide:megaphone' },
    },
    {
      path: 'storage',
      name: 'StorageConfig',
      component: () => import('@/views/storage/config.vue'),
      meta: { title: '文件存储', icon: 'i-lucide:hard-drive' },
    },
    ...packNavPages('SystemGroup'),
  ],
};

export default systemGroup;
