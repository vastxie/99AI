import type { RouteRecordRaw } from 'vue-router';

/** 侧栏分组「安全风控」 */
const securityGroup: RouteRecordRaw = {
  path: '/security',
  name: 'SecurityGroup',
  redirect: '/security/sensitive',
  meta: { title: '安全风控', icon: 'i-lucide:shield' },
  children: [
    {
      path: 'sensitive',
      name: 'SecuritySensitive',
      component: () => import('./views/contentSafety.vue'),
      meta: { title: '内容审核', icon: 'i-lucide:shield-alert' },
    },
    {
      path: 'whitelist',
      name: 'SecurityWhitelist',
      component: () => import('./views/whitelist.vue'),
      meta: { title: '白名单', icon: 'i-lucide:shield-check' },
    },
    {
      path: 'violation',
      name: 'SecurityViolation',
      component: () => import('./views/violation.vue'),
      meta: { title: '违规记录', icon: 'i-lucide:ban' },
    },
  ],
};

export default securityGroup;
