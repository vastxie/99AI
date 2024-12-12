import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/user',
  component: Layout,
  redirect: '/user/dashboard',
  name: 'userMenu',
  meta: {
    title: '访问管理',
    icon: 'mdi:user-outline',
  },
  children: [
    {
      path: 'register',
      name: 'systemMenuRegister',
      component: () => import('@/views/users/register.vue'),
      meta: {
        title: '访问配置',
        icon: 'hugeicons:access',
      },
    },
    {
      path: 'useragreement',
      name: 'userAgreement',
      component: () => import('@/views/users/userAgreement.vue'),
      meta: {
        title: '用户协议配置',
        icon: 'hugeicons:access',
      },
    },
    {
      path: 'email',
      name: 'systemMenuEmail',
      component: () => import('@/views/users/email.vue'),
      meta: {
        title: '邮件登录配置',
        icon: 'material-symbols:mail-outline',
      },
    },
    {
      path: 'wechat',
      name: 'systemMenuWechat',
      component: () => import('@/views/users/wechat.vue'),
      meta: {
        title: '微信登录配置',
        icon: 'la:weixin',
      },
    },
    {
      path: 'ali-phone',
      name: 'AliPhoneMenu',
      component: () => import('@/views/users/phone.vue'),
      meta: {
        title: '短信登录配置',
        icon: 'tabler:message',
      },
    },
  ],
};

export default routes;
