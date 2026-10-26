import type { RouteRecordRaw } from 'vue-router';
import { packNavGroups } from '@/packs';
import aiGroup from './ai';
import channelGroup from './channel';
import systemGroup from './system';
import userGroup from './user';

/**
 * 侧栏分组的路由：每组是一条不带组件的路由（路径即分组地址，访问时跳到第一个页面），页面是它的子路由；
 * 内核四组在前，扩展包的分组按包目录名排在后面，包删掉或关闭时自然消失。
 */
export const groupRoutes: RouteRecordRaw[] = [
  systemGroup,
  aiGroup,
  userGroup,
  channelGroup,
  ...packNavGroups(),
];
