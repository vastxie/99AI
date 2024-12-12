import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwtAuth.guard';

@Injectable()
export class SuperAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAuthorized = await super.canActivate(context);
    if (!isAuthorized) {
      return false;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user && user.role === 'super') {
      return true;
    } else {
      throw new UnauthorizedException('非法操作、非超级管理员无权操作！');
    }
  }
}
