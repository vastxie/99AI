import type { RouteRecordRaw } from 'vue-router';
import Home from '@/views/index.vue';
import { groupRoutes } from './groups';

export const HOME_PATH = '/';
export const HOME_TITLE = '主页';

/**
 * 路由表：登录页与 404 独立成页，其余页面都挂在布局外壳下；
 * 侧栏各分组（router/groups 与扩展包贡献的分组）直接作为外壳的子路由。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login.vue'),
    meta: { title: '登录' },
  },
  {
    path: HOME_PATH,
    component: () => import('@/shell/AdminShell.vue'),
    children: [
      { path: '', name: 'home', component: Home, meta: { title: HOME_TITLE } },
      {
        path: 'setting',
        name: 'personalSetting',
        component: () => import('@/views/profile/setting.vue'),
        meta: { title: '个人设置' },
      },
      {
        path: 'edit/password',
        name: 'personalEditPassword',
        component: () => import('@/views/profile/edit.password.vue'),
        meta: { title: '修改密码' },
      },
      ...groupRoutes,
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'notFound',
    component: () => import('@/views/not-found.vue'),
    meta: { title: '找不到页面' },
  },
];
