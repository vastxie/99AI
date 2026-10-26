import { isDefiniteAuthFailure } from '@/common/auth/auth-failure';
import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { RedisCacheService } from '../../redisCache/redisCache.service';
import { AuthService } from '../../auth/auth.service';

/**
 * 实时连接鉴权失败的分类（与 HTTP 的确定失效口径一致，见 common/auth/auth-failure.ts）：
 * - SESSION_INVALID：凭证确定无效（没有令牌、载荷不合法、签名错或过期、会话不在、账号状态不可用）；
 * - SESSION_UNAVAILABLE：暂时无法验证（读密钥、会话时 Redis 等出错），客户端稍后用同一凭证再连
 */
export type WsAuthFailureCode = 'SESSION_INVALID' | 'SESSION_UNAVAILABLE';
export type WsAuthResult = { user: any } | { code: WsAuthFailureCode };

/** 回执与握手错误里给客户端看的文案（静态） */
export const WS_AUTH_FAILURE_MESSAGES: Record<WsAuthFailureCode, string> = {
  SESSION_INVALID: '登录状态已失效，请刷新后重试',
  SESSION_UNAVAILABLE: '服务暂时不可用，请稍后重试',
};

/**
 * WebSocket JWT 鉴权
 * 从 socket.handshake 提取 token，验证后返回用户；失败时返回分类（见 WsAuthResult）
 *
 * 支持两种方式：
 * 1. handshake.auth.token — 标准方式
 * 2. handshake.headers.authorization — Bearer token 方式
 */
@Injectable()
export class WsAuthValidator {
  private jwtSecret: string | null = null;
  private jwtSecretCacheTime = 0;
  private readonly JWT_SECRET_CACHE_TTL = 3600000; // 1 小时

  constructor(
    private readonly redisCacheService: RedisCacheService,
    private readonly authService: AuthService,
  ) {}

  /** 验证 WebSocket 连接的 JWT：通过返回 { user }，失败返回 { code }（确定失效 / 暂时无法验证） */
  async authenticate(socket: any): Promise<WsAuthResult> {
    try {
      const token = this.extractToken(socket.handshake);
      if (!token) {
        Logger.warn('WebSocket 连接没有令牌', 'WsAuthValidator');
        return { code: 'SESSION_INVALID' };
      }

      const secret = await this.getCachedJwtSecret();
      const decoded = jwt.verify(token, secret);
      const user = await this.resolveDecodedUser(decoded);
      if (!user) {
        Logger.warn('WebSocket 鉴权失败：令牌载荷无效或会话不在', 'WsAuthValidator');
        return { code: 'SESSION_INVALID' };
      }
      await this.redisCacheService.checkTokenAuth(token, {
        headers: socket.handshake?.headers || {},
        user,
      });
      await this.authService.validateAuthenticatedUser(user);
      return { user };
    } catch (error) {
      if (isDefiniteAuthFailure(error)) {
        Logger.warn('WebSocket 鉴权失败：凭证无效', 'WsAuthValidator');
        return { code: 'SESSION_INVALID' };
      }
      Logger.warn('WebSocket 鉴权暂时无法完成', 'WsAuthValidator');
      return { code: 'SESSION_UNAVAILABLE' };
    }
  }

  private extractToken(handshake: any): string | null {
    // 优先取 auth.token
    if (handshake.auth?.token) {
      return handshake.auth.token;
    }

    // 其次取 headers.authorization
    if (handshake.headers?.authorization) {
      const parts = handshake.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        return parts[1];
      }
    }

    return null;
  }

  private async resolveDecodedUser(payload: any): Promise<any> {
    if (!payload?.uid || payload.id !== undefined) return null;

    if (payload.role === 'visitor') {
      const visitorId = await this.redisCacheService.resolveVisitorIdByUid(payload.uid);
      if (!visitorId) return null;
      return this.toResolvedUser(payload, visitorId);
    }

    const userId = await this.redisCacheService.resolveUserIdByUid(payload.uid);
    if (!userId) return null;
    return this.toResolvedUser(payload, userId);
  }

  private toResolvedUser(payload: any, id: number | string) {
    return {
      uid: payload.uid,
      id,
      username: payload.username,
      email: payload.email,
      phone: payload.phone,
      role: payload.role,
    };
  }

  private async getCachedJwtSecret(): Promise<string> {
    const now = Date.now();
    if (this.jwtSecret && now - this.jwtSecretCacheTime < this.JWT_SECRET_CACHE_TTL) {
      return this.jwtSecret;
    }

    const secret = await this.redisCacheService.getJwtSecret();
    this.jwtSecret = secret;
    this.jwtSecretCacheTime = now;
    return secret;
  }
}
