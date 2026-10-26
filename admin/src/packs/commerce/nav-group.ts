import type { RouteRecordRaw } from 'vue-router';

/** 侧栏分组「支付财务」 */
const paymentGroup: RouteRecordRaw = {
  path: '/payment',
  name: 'PaymentGroup',
  redirect: '/payment/packages',
  meta: { title: '支付财务', icon: 'i-lucide:banknote' },
  children: [
    {
      path: 'packages',
      name: 'PaymentPackages',
      component: () => import('./views/package.vue'),
      meta: { title: '套餐设置', icon: 'i-lucide:package' },
    },
    {
      path: 'sandbox',
      name: 'PaymentSandbox',
      component: () => import('./views/sandboxPlans.vue'),
      meta: { title: '沙箱资源', icon: 'i-lucide:box' },
    },
    {
      path: 'order-list',
      name: 'PaymentOrders',
      component: () => import('./views/orderList.vue'),
      meta: { title: '订单管理', icon: 'i-lucide:receipt-text' },
    },
    {
      path: 'payment',
      name: 'PaymentConfig',
      component: () => import('./views/payment.vue'),
      meta: { title: '支付配置', icon: 'i-lucide:wallet' },
    },
    {
      path: 'channel',
      name: 'PaymentChannel',
      component: () => import('./views/paymentChannel.vue'),
      meta: { title: '支付参数', icon: 'i-lucide:cog' },
    },
  ],
};

export default paymentGroup;
