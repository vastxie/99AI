/**
 * 用户单元能不能渲染成跳转用户详情的链接：要求调用方没有关掉链接、有用户 id，
 * 并且当前账号有权进入详情页（与路由 meta.roles 一致；没有权限时只显示文字，不给一个点了会被拦下的链接）
 */
export function userCellLinkable(input: {
  link?: boolean;
  userId?: unknown;
  canAccessDetail: boolean;
}): boolean {
  if (input.link === false) return false;
  const id = input.userId;
  if (id === null || id === undefined || id === '' || id === 0) return false;
  return input.canAccessDetail;
}
