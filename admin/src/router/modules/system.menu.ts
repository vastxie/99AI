import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/system',
  component: Layout,
  redirect: '/system/base',
  name: 'systemMenu',
  meta: {
    title: '系统管理',
    icon: 'tdesign:system-2',
  },
  children: [
    {
      path: 'base-configuration',
      name: 'ClientBaseConfig',
      component: () => import('@/views/system/baseConfiguration.vue'),
      meta: {
        title: '基础配置',
        icon: 'uil:setting',
      },
    },
    {
      path: 'points',
      name: 'PointsDisplay',
      component: () => import('@/views/package/points.vue'),
      meta: {
        title: '显示设置',
        icon: 'mdi:show-outline',
      },
    },
    {
      path: 'notice',
      name: 'systemMenuNotice',
      component: () => import('@/views/system/notice.vue'),
      meta: {
        title: '公告设置',
        icon: 'mdi:notice-board',
      },
    },
    {
      path: 'user-agreement',
      name: 'userAgreement',
      component: () => import('@/views/users/userAgreement.vue'),
      meta: {
        title: '用户协议',
        icon: 'hugeicons:access',
      },
    },
    {
      path: 'baidu',
      name: 'systemMenuBase',
      component: () => import('@/views/system/baiduStatistics.vue'),
      meta: {
        title: '统计设置',
        icon: 'wpf:statistics',
      },
    },
  ],
};

export default routes;
