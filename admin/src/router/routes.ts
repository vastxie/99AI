import generatedRoutes from 'virtual:generated-pages';
import { setupLayouts } from 'virtual:meta-layouts';
import type { RouteRecordRaw } from 'vue-router';
import AppMenu from './modules/app.menu';
import ChatMenu from './modules/chat.menu';
import AiMenu from './modules/model.menu';
import PackageMenu from './modules/package.menu';
import PayMenu from './modules/pay.menu';
import SecureMenu from './modules/secure.menu';
import StorageMenu from './modules/storage.menu';
import SystemMenu from './modules/system.menu';
import UserMenu from './modules/user.menu';

import type { Route } from '#/global';
import useSettingsStore from '@/store/modules/settings';
import Home from '@/views/index.vue';

// 固定路由（默认路由）
const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login.vue'),
    meta: {
      title: '登录',
    },
  },
  {
    path: '/:all(.*)*',
    name: 'notFound',
    component: () => import('@/views/[...all].vue'),
    meta: {
      title: '找不到页面',
    },
  },
];

// 系统路由
const systemRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/index.vue'),
    meta: {
      title: () => useSettingsStore().settings.home.title,
      breadcrumb: false,
    },
    children: [
      {
        path: '',
        name: 'home',
        component: Home,
        meta: {
          title: () => useSettingsStore().settings.home.title,
          breadcrumb: false,
        },
      },
      {
        path: 'reload',
        name: 'reload',
        component: () => import('@/views/reload.vue'),
        meta: {
          title: '重新加载',
          breadcrumb: false,
        },
      },
      {
        path: 'setting',
        name: 'personalSetting',
        component: () => import('@/views/personal/setting.vue'),
        meta: {
          title: '个人设置',
          cache: 'personalEditPassword',
        },
      },
      {
        path: 'edit/password',
        name: 'personalEditPassword',
        component: () => import('@/views/personal/edit.password.vue'),
        meta: {
          title: '修改密码',
        },
      },
    ],
  },
];

// 动态路由（异步路由、导航栏路由）
const asyncRoutes: Route.recordMainRaw[] = [
  {
    // meta: {
    //   title: '演示',
    //   icon: 'sidebar-default',
    // },
    children: [
      SystemMenu,
      UserMenu,
      AiMenu,
      ChatMenu,
      AppMenu,
      SecureMenu,
      StorageMenu,
      PackageMenu,
      PayMenu,
    ],
  },
];

const constantRoutesByFilesystem = generatedRoutes.filter((item) => {
  return item.meta?.enabled !== false && item.meta?.constant === true;
});

const asyncRoutesByFilesystem = setupLayouts(
  generatedRoutes.filter((item) => {
    return (
      item.meta?.enabled !== false && item.meta?.constant !== true && item.meta?.layout !== false
    );
  }),
);

export {
  asyncRoutes,
  asyncRoutesByFilesystem,
  constantRoutes,
  constantRoutesByFilesystem,
  systemRoutes,
};
