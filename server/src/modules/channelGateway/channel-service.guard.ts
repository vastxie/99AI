import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

export const CHANNEL_SERVICE_TOKEN_ENV = 'CHANNEL_SERVICE_TOKEN';
export const CHANNEL_SERVICE_TOKEN_HEADER = 'x-channel-service-token';

/**
 * 进程外渠道服务的服务端令牌校验（server-to-server）。
 * 令牌来自环境变量 CHANNEL_SERVICE_TOKEN；未配置时接口整体不可用（503），不会退化为放行。
 */
@Injectable()
export class ChannelServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = String(process.env[CHANNEL_SERVICE_TOKEN_ENV] || '').trim();
    if (!expected) {
      throw new ServiceUnavailableException('渠道服务令牌未配置（CHANNEL_SERVICE_TOKEN）');
    }
    const request = context.switchToHttp().getRequest();
    const header = request?.headers?.[CHANNEL_SERVICE_TOKEN_HEADER];
    const given = String(Array.isArray(header) ? header[0] : header || '').trim();
    const a = Buffer.from(given, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (!given || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('渠道服务令牌无效');
    }
    return true;
  }
}
