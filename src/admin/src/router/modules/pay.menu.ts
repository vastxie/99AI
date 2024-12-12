import type { RouteRecordRaw } from 'vue-router'

function Layout() {
  return import('@/layouts/index.vue')
}

const routes: RouteRecordRaw = {
  path: '/pay',
  component: Layout,
  redirect: '/pay/hupijiao',
  name: 'PayMenu',
  meta: {
    title: '支付管理',
    icon: 'mingcute:card-pay-line',
  },
  children: [
    {
      path: 'wechat',
      name: 'WechatConfig',
      component: () => import('@/views/pay/wechat.vue'),
      meta: {
        title: '微信支付',
        icon: 'ic:baseline-wechat',
      },
    },
    {
      path: 'epay',
      name: 'EpayConfig',
      component: () => import('@/views/pay/epay.vue'),
      meta: {
        title: '易支付',
        icon: 'uiw:pay',
      },
    },
    {
      path: 'mpay',
      name: 'MpayConfig',
      component: () => import('@/views/pay/mpay.vue'),
      meta: {
        title: '码支付',
        icon: 'ant-design:pay-circle-outlined',
      },
    },
    {
      path: 'hupi',
      name: 'HupioConfig',
      component: () => import('@/views/pay/hupijiao.vue'),
      meta: {
        title: '虎皮椒支付',
        icon: 'token:pay',
      },
    },
    {
      path: 'ltzf',
      name: 'LtzfConfig',
      component: () => import('@/views/pay/ltzf.vue'),
      meta: {
        title: '蓝兔支付',
        icon: 'ph:rabbit',
      },
    },
  ],
}

export default routes
