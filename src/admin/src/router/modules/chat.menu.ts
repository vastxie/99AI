import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/chat',
  component: Layout,
  redirect: '/chat/chat',
  name: 'chatMenu',
  meta: {
    title: '数据管理',
    icon: 'majesticons:data-line',
  },
  children: [
    {
      path: 'dashboard',
      name: 'dashboardMenu',
      component: () => import('@/views/users/index.vue'),
      meta: {
        title: '用户信息',
        icon: 'fa6-solid:list-ul',
      },
    },
    {
      path: 'list',
      name: 'chatMenuList',
      component: () => import('@/views/chat/chat.vue'),
      meta: {
        title: '对话记录',
        icon: 'material-symbols-light:chat-outline',
      },
    },
    {
      path: 'draw',
      name: 'drawMenuList',
      component: () => import('@/views/chat/draw.vue'),
      meta: {
        title: '绘画记录',
        icon: 'material-symbols:draw-outline',
      },
    },
    {
      path: 'auto-reply',
      name: 'ReplyMenuList',
      component: () => import('@/views/sensitive/autpReply.vue'),
      meta: {
        title: '内容预设',
        icon: 'ic:outline-question-answer',
      },
    },
  ],
};

export default routes;
