/**
 * 由路由表推导导航数据：侧栏分组、面包屑与页面搜索的条目。
 * 纯函数，不依赖 store 与路由实例（tests/navigation.test.mjs 直接覆盖）。
 */
import type { RouteMeta, RouteRecordRaw } from 'vue-router';

export interface NavLink {
  path: string;
  title: string;
  icon?: string;
}

export interface NavGroup {
  path: string;
  title: string;
  icon?: string;
  links: NavLink[];
}

export interface Crumb {
  title: string;
  /** 最后一级（当前页面）没有链接 */
  path?: string;
}

export interface SearchEntry extends NavLink {
  /** 分组名与页面名，搜索时一起参与匹配 */
  trail: string[];
}

/** 判断当前账号能否访问某条路由（传入路由 meta 里的 roles） */
export type RoleCheck = (roles?: readonly string[]) => boolean;

/** 子路由的完整路径：以 / 开头的原样返回，否则拼在分组路径后面 */
export function joinPath(base: string, path: string): string {
  if (path.startsWith('/')) return path;
  const trimmed = base.replace(/\/+$/u, '');
  return path ? `${trimmed}/${path}` : trimmed || '/';
}

/**
 * 侧栏分组：隐藏页面、没有标题的页面与无权访问的页面不列出；
 * 分组本身无权访问或者一个可见页面都没有时，整组不出现。
 */
export function buildNavGroups(
  groups: readonly RouteRecordRaw[],
  canAccess: RoleCheck,
): NavGroup[] {
  const result: NavGroup[] = [];
  for (const group of groups) {
    if (!canAccess(group.meta?.roles)) continue;
    const links: NavLink[] = [];
    for (const page of group.children ?? []) {
      const meta = page.meta ?? {};
      if (meta.hidden || !meta.title || !canAccess(meta.roles)) continue;
      links.push({ path: joinPath(group.path, page.path), title: meta.title, icon: meta.icon });
    }
    if (links.length) {
      result.push({
        path: group.path,
        title: group.meta?.title ?? '',
        icon: group.meta?.icon,
        links,
      });
    }
  }
  return result;
}

/** 侧栏里应当高亮的路径：隐藏页面借用 activeNav 指向的条目 */
export function activeNavPath(route: { path: string; meta: RouteMeta }): string {
  return route.meta.activeNav ?? route.path;
}

/**
 * 面包屑：首页打头，后面接当前路由链上带标题的分组与页面（首页自己不重复出现）；
 * 除最后一级外都可点击。
 */
export function buildBreadcrumbs(
  matched: readonly { path: string; meta: RouteMeta }[],
  home: { path: string; title: string },
): Crumb[] {
  const trail = matched
    .filter((record) => record.meta.title && record.path !== home.path)
    .map((record) => ({ title: record.meta.title as string, path: record.path }));
  const crumbs: Crumb[] = [{ title: home.title, path: home.path }, ...trail];
  const current = crumbs[crumbs.length - 1];
  crumbs[crumbs.length - 1] = { title: current.title };
  return crumbs;
}

/** 页面搜索的候选：每个侧栏页面一条，页面没有图标时沿用分组图标 */
export function buildSearchEntries(groups: readonly NavGroup[]): SearchEntry[] {
  return groups.flatMap((group) =>
    group.links.map((link) => ({
      ...link,
      icon: link.icon ?? group.icon,
      trail: [group.title, link.title],
    })),
  );
}

/**
 * 按关键字找页面（不区分大小写）：页面名以关键字开头的排最前，其次是页面名包含关键字的，
 * 最后是只有分组名或路径命中的；同一档保持侧栏里的顺序。关键字为空时返回全部。
 */
export function searchEntries(entries: readonly SearchEntry[], keyword: string): SearchEntry[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return [...entries];
  const rankOf = (entry: SearchEntry) => {
    const title = entry.title.toLowerCase();
    if (title.startsWith(needle)) return 0;
    if (title.includes(needle)) return 1;
    return [entry.path, ...entry.trail].some((text) => text.toLowerCase().includes(needle))
      ? 2
      : -1;
  };
  return entries
    .map((entry, order) => ({ entry, order, rank: rankOf(entry) }))
    .filter((item) => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((item) => item.entry);
}
