/**
 * 管理端扩展包注册表（内核里唯一认识 packs/ 目录的文件）。
 *
 * 每个包在 packs/<id>/index.ts 里 `export default defineAdminPack({...})`（契约见 @/core/packs/defineAdminPack），
 * 这里用 import.meta.glob 按目录发现，不点名任何包：删掉目录即消失，新增目录即装载。
 */
import type { RouteRecordRaw } from 'vue-router';
import type { LoginConfigTab } from '@/auth/loginConfigTabs';
import type { StorageProviderContribution } from '@/storage/storageConfigFields';
import type {
  AdminPackDefinition,
  UserDetailSection,
  UserListAction,
  UserListColumn,
  UserPolicyCard,
} from '@/core/packs/defineAdminPack';

export * from '@/core/packs/defineAdminPack';

const modules = import.meta.glob<{ default: AdminPackDefinition }>('./*/index.ts', {
  eager: true,
});

let cache: AdminPackDefinition[] | null = null;

/** 已启用的包（按目录名排序）；首次调用时收集，避免与包模块之间的加载顺序问题 */
export function enabledPacks(): AdminPackDefinition[] {
  if (!cache) {
    cache = Object.keys(modules)
      .sort()
      .map((path) => modules[path]?.default)
      .filter((pack): pack is AdminPackDefinition => Boolean(pack && pack.enabled));
  }
  return cache;
}

export function packNavGroups(): RouteRecordRaw[] {
  return enabledPacks().flatMap((pack) => pack.navGroups ?? []);
}

/** 挂在某个内核分组（按分组路由名）下的包页面 */
export function packNavPages(groupName: string): RouteRecordRaw[] {
  return enabledPacks().flatMap((pack) => pack.navPages?.[groupName] ?? []);
}

export function packLoginConfigTabs(): LoginConfigTab[] {
  return enabledPacks().flatMap((pack) => pack.loginConfigTabs ?? []);
}

export function packStorageProviders(): StorageProviderContribution[] {
  return enabledPacks().flatMap((pack) => pack.storageProviders ?? []);
}

export function packUserListColumns(): UserListColumn[] {
  return enabledPacks().flatMap((pack) => pack.userListColumns ?? []);
}

export function packUserListActions(): UserListAction[] {
  return enabledPacks().flatMap((pack) => pack.userListActions ?? []);
}

export function packUserDetailSections(): UserDetailSection[] {
  return enabledPacks().flatMap((pack) => pack.userDetailSections ?? []);
}

export function packUserPolicyCards(): UserPolicyCard[] {
  return enabledPacks().flatMap((pack) => pack.userPolicyCards ?? []);
}

export function providerLabel(provider: string): string {
  for (const pack of enabledPacks()) {
    const label = pack.providerLabels?.[provider];
    if (label) return label;
  }
  return provider;
}

export function channelLabel(channel: string): string {
  for (const pack of enabledPacks()) {
    const label = pack.channelLabels?.[channel];
    if (label) return label;
  }
  return channel;
}
