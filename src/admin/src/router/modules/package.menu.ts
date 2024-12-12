import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/package',
  component: Layout,
  redirect: '/package/list',
  name: 'packageMenu',
  meta: {
    title: '套餐管理',
    icon: 'icon-park-outline:buy',
  },
  children: [
    {
      path: 'order-list',
      name: 'OrderMenuList',
      component: () => import('@/views/order/index.vue'),
      meta: {
        title: '订单列表',
        icon: 'lets-icons:order',
      },
    },
    {
      path: 'account-log',
      name: 'AccountLogMenu',
      component: () => import('@/views/users/accountLog.vue'),
      meta: {
        title: '账户明细',
        icon: 'carbon:account',
      },
    },
    {
      path: 'list',
      name: 'packageMenuList',
      component: () => import('@/views/package/package.vue'),
      meta: {
        title: '套餐设置',
        icon: 'icon-park-outline:commodity',
      },
    },
    {
      path: 'crami',
      name: 'cramiMenuList',
      component: () => import('@/views/package/crami.vue'),
      meta: {
        title: '卡密管理',
        icon: 'solar:passport-broken',
      },
    },
  ],
};

export default routes;
