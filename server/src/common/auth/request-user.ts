import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * 经 JwtAuthGuard / SuperAuthGuard 解析后的请求用户：守卫保证 user 与 id 均已解析。
 * id 对注册用户是数字主键、对访客是 visitorId 字符串，使用方按 role 分支或改用 requireRegisteredUser。
 */
export type RequestUser = Express.User & { id: NonNullable<Express.User['id']> };

/** 注册用户（含管理员）：id 是 user 表的正整数主键 */
export type RegisteredRequestUser = RequestUser & { id: number };

/** 访客或身份异常的请求访问注册用户专用功能时的 403 文案 */
export const REGISTERED_USER_REQUIRED_MESSAGE = '该功能需要登录正式账号';

/**
 * 取受守卫保护的处理器里的当前用户（访客也可能到达，id 可能是 visitorId 字符串）。
 * 守卫失败时请求不会到达处理器，因此这里缺失只可能是路由未挂守卫；
 * 原本会在 `req.user.id` 处 TypeError（500），现在统一为 401。
 */
export function requireRequestUser(req: Request): RequestUser {
  const user = req.user;
  if (!user || user.id === undefined || user.id === null) {
    // 与 JwtAuthGuard 未登录时的文案一致
    throw new UnauthorizedException('亲爱的用户,请登录后继续操作,我们正在等您的到来！');
  }
  return user as RequestUser;
}

/**
 * 取注册用户专用处理器里的当前用户，返回类型里的 id 是 number（与 RegisteredUserAuthGuard 同一判定）。
 * 缺少用户仍按未登录 401；访客（role === 'visitor'）或 id 不是正整数时 403——
 * 不用 401：用户端请求层会把访客的 401 当作访客会话过期而刷新 / 清掉访客身份。
 */
export function requireRegisteredUser(req: Request): RegisteredRequestUser {
  const user = requireRequestUser(req);
  const { id } = user;
  if (user.role === 'visitor' || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new ForbiddenException(REGISTERED_USER_REQUIRED_MESSAGE);
  }
  return { ...user, id };
}
