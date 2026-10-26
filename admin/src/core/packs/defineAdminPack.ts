import type { Component } from 'vue';
import type { RouteRecordRaw } from 'vue-router';
import type { LoginConfigTab } from '@/auth/loginConfigTabs';
import type { StorageProviderContribution } from '@/storage/storageConfigFields';

/**
 * 管理端扩展包契约：包用 defineAdminPack 描述自己向内核页面的贡献。
 * 本文件不引用注册表，包可以安全地 import 它；注册表见 @/packs。
 */
export type AdminPackTier = 'system' | 'feature';
export type AdminComponentLoader = () => Promise<{ default: Component }>;

/** 「用户管理」列表的附加列（读取 row 上的字段，字段由包自己的服务端数据提供） */
export interface UserListColumn {
  prop: string;
  label: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  /** 自定义格式化；缺省直接显示字段值 */
  formatter?: (row: any) => string;
}

/** 「用户管理」列表操作列里的附加操作（组件收到 row 与 refresh 回调，可自带弹窗） */
export interface UserListAction {
  id: string;
  component: AdminComponentLoader;
}

/** 「用户详情」页的页签片段（对应服务端 profile.sections[id]，组件收到 profile 与 section；title 为页签名） */
export interface UserDetailSection {
  id: string;
  title: string;
  component: AdminComponentLoader;
}

/** 「用户策略」页的附加配置卡片 */
export interface UserPolicyCard {
  id: string;
  component: AdminComponentLoader;
}

export interface AdminPackDefinition {
  id: string;
  tier: AdminPackTier;
  enabled: boolean;
  /** 侧栏顶层分组：不带组件的路由，页面写在 children 里（同 router/groups 下的内核分组） */
  navGroups?: RouteRecordRaw[];
  /** 挂到内核分组下的页面，按分组路由名归组（SystemGroup / AiGroup / UserGroup / ChannelGroup） */
  navPages?: Record<string, RouteRecordRaw[]>;
  loginConfigTabs?: LoginConfigTab[];
  storageProviders?: StorageProviderContribution[];
  userListColumns?: UserListColumn[];
  userListActions?: UserListAction[];
  userDetailSections?: UserDetailSection[];
  userPolicyCards?: UserPolicyCard[];
  /** 登录方式 id → 显示名（用户详情的身份列表） */
  providerLabels?: Record<string, string>;
  /** 渠道名 → 显示名（用户详情的 Bot 通道列表） */
  channelLabels?: Record<string, string>;
}

export function defineAdminPack(definition: AdminPackDefinition): AdminPackDefinition {
  return definition;
}
