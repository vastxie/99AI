import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/github',
  component: () => import('@/views/ai/github-redirect.vue'), // 创建一个新的视图文件用于处理跳转逻辑
  name: 'ProjectAddressMenu',
  meta: {
    title: '开源地址', // 更改标题为 "GitHub应用"
    icon: 'mdi:github',
  },
};

export default routes;
