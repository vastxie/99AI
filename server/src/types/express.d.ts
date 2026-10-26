/**
 * JwtAuthGuard 解析后挂到 `req.user` 的当前用户，字段与 `toResolvedUser` 一致：
 * uid 是 token 里的稳定标识，id 由 uid 反查得到——注册用户（含管理员）为 user 表的正整数主键，
 * 访客（role === 'visitor'）为 `visitor:` 开头的 visitorId 字符串。
 * 只对注册用户有意义、要把 id 当数字用的路径，路由挂 RegisteredUserAuthGuard、处理器用
 * `requireRegisteredUser(req)` 取数字 id；访客也可用的路径用 `requireRequestUser(req)` 并按 role 分支。
 * token 自带的 iat / exp 不会进入 req.user。
 */
export interface JwtPayload {
  uid: string;
  id?: number | string;
  username: string;
  email?: string;
  phone?: string;
  role: string;
}

declare global {
  namespace Express {
    /** express 类型本身不声明 Request.user；JwtAuthGuard 解析出的 JWT 负载在这里并入 Express.User */
    interface User extends JwtPayload {}
    interface Request {
      user?: User;
      abortController?: AbortController;
    }
  }
}
