import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from './jwtAuth.guard';
import { requireRegisteredUser } from './request-user';

/**
 * 注册用户专用守卫：先按 JwtAuthGuard 完成登录校验（未登录 / 登录失效仍是 401），
 * 再拒绝访客与 id 不是正整数的身份（403「该功能需要登录正式账号」），判定与 requireRegisteredUser 相同。
 * 用于只对注册账号有意义、要把用户 id 当数字主键用的路由（改密、绑定 / 解绑登录身份、改资料等，
 * 扩展包同类路由也挂它）；访客也可用的路由继续挂 JwtAuthGuard，在实现里按 role 分支。
 * 拒绝访客用 403 而不是 401：用户端请求层把访客的 401 当作访客会话过期，会刷新访客身份重试、
 * 再失败就清掉访客会话；403 只提示文案，不动访客会话。
 * 与 SuperAuthGuard 一样失败即关闭：@Public() 路由在父类放行后没有用户，这里按未登录 401，不要同用。
 */
@Injectable()
export class RegisteredUserAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAuthorized = await super.canActivate(context);
    if (!isAuthorized) {
      return false;
    }
    requireRegisteredUser(context.switchToHttp().getRequest<Request>());
    return true;
  }
}
