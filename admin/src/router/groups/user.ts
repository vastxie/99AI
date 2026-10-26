import type { RouteRecordRaw } from 'vue-router';
import { packNavPages } from '@/packs';

/** 侧栏分组「用户运营」 */
const userGroup: RouteRecordRaw = {
  path: '/user',
  name: 'UserGroup',
  redirect: '/user/dashboard',
  meta: { title: '用户运营', icon: 'i-lucide:users' },
  children: [
    {
      path: 'dashboard',
      name: 'UserDashboard',
      component: () => import('@/views/user/list.vue'),
      meta: { title: '用户管理', icon: 'i-lucide:list' },
    },
    {
      path: 'detail/:id',
      name: 'UserDetail',
      component: () => import('@/views/user/detail.vue'),
      meta: {
        title: '用户详情',
        icon: 'i-lucide:circle-user-round',
        roles: ['super'],
        hidden: true,
        activeNav: '/user/dashboard',
      },
    },
    {
      path: 'list',
      name: 'UserList',
      component: () => import('@/views/userData/chat.vue'),
      meta: { title: '对话记录', icon: 'i-lucide:message-square' },
    },
    // 扩展包挂在本组的页面（如账户明细的旧链接跳转）
    ...packNavPages('UserGroup'),
    {
      path: 'settings',
      name: 'UserSettings',
      component: () => import('@/views/userData/userSettings.vue'),
      meta: { title: '用户策略', icon: 'i-lucide:user-cog' },
    },
  ],
};

export default userGroup;
