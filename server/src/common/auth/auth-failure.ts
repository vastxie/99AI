import { HttpException, HttpStatus } from '@nestjs/common';
import { JsonWebTokenError } from 'jsonwebtoken';

/**
 * 鉴权失败分类。
 *
 * 客户端把 401 当作「凭证确定无效」：已登录用户会被退出，访客会换一个新身份（服务端每次签发的访客都是新的），
 * 所以只有确定无效时才能给 401——签名错、过期（`JsonWebTokenError` 及其子类 `TokenExpiredError` / `NotBeforeError`）
 * 与已经判定过的 401（payload 不合法、会话不在了）。读 JWT 密钥、读用户 / 访客会话时 Redis 出错等暂时故障
 * 给 503，客户端保留凭证、稍后重试。
 */
export function isDefiniteAuthFailure(error: unknown): boolean {
  if (error instanceof JsonWebTokenError) return true;
  return error instanceof HttpException && error.getStatus() === HttpStatus.UNAUTHORIZED;
}

/**
 * 暂时无法完成鉴权：503。标上 controlled，让全局异常过滤器保留这条文案
 * （守卫里抛出的异常不经过 TransformInterceptor；服务里抛出的经过它，它同样保留 controlled）
 */
export function authTemporarilyUnavailable(): HttpException {
  return Object.assign(
    new HttpException('服务暂时不可用，请稍后重试', HttpStatus.SERVICE_UNAVAILABLE),
    { controlled: true },
  );
}
