import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/ai',
  component: Layout,
  redirect: '/ai/chat-key-list',
  name: 'AiMenu',
  meta: {
    title: '模型管理',
    icon: 'hugeicons:ai-book',
  },
  children: [
    {
      path: 'model',
      name: 'AiMenuInterface',
      component: () => import('@/views/models/interface.vue'),
      meta: {
        title: '全局配置',
        icon: 'tabler:box-model',
      },
    },
    {
      path: 'keys',
      name: 'AiMenuKeys',
      component: () => import('@/views/models/key.vue'),
      meta: { title: '模型设置', icon: 'ph:open-ai-logo-light' },
    },
  ],
};

export default routes;
