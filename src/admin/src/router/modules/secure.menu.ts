import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/secure',
  component: Layout,
  redirect: '/secure/sensitive-baidu',
  name: 'SecureMenu',
  meta: {
    title: '风控管理',
    icon: 'ri:secure-payment-line',
  },
  children: [
    {
      path: 'identity-verification',
      name: 'IdentityVerification',
      component: () => import('@/views/sensitive/identityVerification.vue'),
      meta: {
        title: '风控安全配置',
        icon: 'hugeicons:identification',
      },
    },
    {
      path: 'sensitive-violation',
      name: 'SensitiveViolationLog',
      component: () => import('@/views/sensitive/violation.vue'),
      meta: {
        title: '违规检测记录',
        icon: 'tabler:ban',
      },
    },
    {
      path: 'sensitive-baidu',
      name: 'SensitiveBaiduyun',
      component: () => import('@/views/sensitive/baiduSensitive.vue'),
      meta: {
        title: '百度云敏感词',
        icon: 'ri:baidu-line',
      },
    },
    {
      path: 'sensitive-custom',
      name: 'SensitiveCuston',
      component: () => import('@/views/sensitive/custom.vue'),
      meta: {
        title: '自定义敏感词',
        icon: 'carbon:word-cloud',
      },
    },
  ],
};

export default routes;
