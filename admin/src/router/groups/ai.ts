import type { RouteRecordRaw } from 'vue-router';
import { packNavPages } from '@/packs';

/** 侧栏分组「AI 能力」 */
const aiGroup: RouteRecordRaw = {
  path: '/ai',
  name: 'AiGroup',
  redirect: '/ai/keys',
  meta: { title: 'AI 能力', icon: 'i-lucide:sparkles' },
  children: [
    {
      path: 'keys',
      name: 'AiMenuKeys',
      component: () => import('@/views/ai/key.vue'),
      meta: { title: '模型管理', icon: 'i-lucide:brain-circuit' },
    },
    {
      path: 'mcp',
      name: 'AiMcp',
      component: () => import('@/views/ai/mcp.vue'),
      meta: { title: 'MCP 服务', icon: 'i-lucide:plug-zap', roles: ['super'] },
    },
    {
      path: 'advanced',
      name: 'AiAdvanced',
      component: () => import('@/views/ai/baseSetting.vue'),
      meta: { title: '全局配置', icon: 'i-lucide:settings-2' },
    },
    {
      path: 'private-files',
      name: 'PrivateFileManagement',
      component: () => import('@/views/ai/privateFileManagement.vue'),
      meta: { title: '私有文件', icon: 'i-lucide:folder-cog', roles: ['super'] },
    },
    ...packNavPages('AiGroup'),
  ],
};

export default aiGroup;
