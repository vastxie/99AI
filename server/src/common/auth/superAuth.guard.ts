import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwtAuth.guard';

@Injectable()
export class SuperAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(context))) return false;

    const user = context.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException('请登录后继续操作');
    if (user.role !== 'super') throw new ForbiddenException('非法操作、非超级管理员无权操作！');
    return true;
  }
}
