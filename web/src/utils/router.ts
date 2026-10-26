import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { CONVERSATION_ID_SOURCE } from '@/constants/conversation'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Chat',
    component: () => import('@/views/chat/chat.vue'),
  },
  {
    path: `/c/:workspaceId(${CONVERSATION_ID_SOURCE})`,
    name: 'ChatConversation',
    component: () => import('@/views/chat/chat.vue'),
  },
  {
    path: '/auth/callback/:provider',
    name: 'OAuthCallback',
    component: () => import('@/views/auth/OAuthCallback.vue'),
  },
  {
    path: '/:catchAll(.*)',
    redirect: '/',
  },
]

// 扩展包自己的路由（如某个登录渠道的专用回调页）由 main.ts 在挂载前 addRoute；
// 静态路径的匹配优先级本就高于 /auth/callback/:provider 这类参数路由
const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
