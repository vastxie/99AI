import { RedisCacheService } from '@/modules/redisCache/redisCache.service';
import { AuthConfig } from '@/common/config/auth.config';
import { IS_PUBLIC_KEY } from '@/common/auth/public.decorator';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';

import { AuthService } from '../../modules/auth/auth.service';
import { authTemporarilyUnavailable, isDefiniteAuthFailure } from './auth-failure';

/** 自行从 Bearer 头提取 token 并用 jsonwebtoken 验签，不经第三方鉴权策略框架。 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private permissionCache = new Map<string, { permissions: any; timestamp: number }>();
  private jwtSecretCache: { secret: string; timestamp: number } | null = null;

  constructor(
    private redisCacheService: RedisCacheService,
    private readonly moduleRef: ModuleRef,
    private readonly authService: AuthService,
    private readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector &&
      typeof context.getHandler === 'function' &&
      typeof context.getClass === 'function'
    ) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return true;
      }
    }

    if (!this.redisCacheService) {
      this.redisCacheService = this.moduleRef.get(RedisCacheService, {
        strict: false,
      });
    }
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      // 缺失 token：原流程会在 validateToken 内被 jwt.verify 拒绝并转成同一 401，这里提前收口以便类型收窄
      throw new HttpException(
        '亲爱的用户,请登录后继续操作,我们正在等您的到来！',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 检查缓存
    const cached = this.permissionCache.get(token);
    if (cached && Date.now() - cached.timestamp < AuthConfig.cache.permissionCacheTTL) {
      request.user = cached.permissions;
      await this.redisCacheService.checkTokenAuth(token, request);
      await this.authService.validateAuthenticatedUser(request.user);
      return true;
    }

    // 验证 token
    request.user = await this.validateToken(token);

    await this.redisCacheService.checkTokenAuth(token, request);
    await this.authService.validateAuthenticatedUser(request.user);

    // Redis session 与当前账号状态都通过后再缓存权限。
    this.permissionCache.set(token, {
      permissions: request.user,
      timestamp: Date.now(),
    });

    // 定期清理过期缓存
    if (this.permissionCache.size > 1000) {
      this.cleanupCache();
    }

    return true;
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.permissionCache.entries()) {
      if (now - value.timestamp > AuthConfig.cache.permissionCacheTTL) {
        this.permissionCache.delete(key);
      }
    }
  }

  /** 子类可扩展取 token 来源（如文件访问场景的 cookie 兜底），默认仅认 Bearer 头 */
  protected extractToken(request: Request) {
    if (!request.headers.authorization) {
      return null;
    }
    const parts = request.headers.authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    return parts[1];
  }

  private async validateToken(token: string) {
    try {
      // 获取 JWT 密钥（带缓存）
      const secret = await this.getCachedJwtSecret();
      const decoded = (await jwt.verify(token, secret)) as any;
      return await this.resolveDecodedUser(decoded);
    } catch (error) {
      // 读密钥、读会话时的暂时故障不能当成登录失效：客户端会据 401 退出登录或换掉访客身份
      if (!isDefiniteAuthFailure(error)) {
        Logger.warn('鉴权暂时无法完成', 'JwtAuthGuard');
        throw authTemporarilyUnavailable();
      }
      throw new HttpException(
        '亲爱的用户,请登录后继续操作,我们正在等您的到来！',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private async getCachedJwtSecret(): Promise<string> {
    const now = Date.now();

    // 检查缓存是否有效
    if (
      this.jwtSecretCache &&
      now - this.jwtSecretCache.timestamp < AuthConfig.cache.jwtSecretCacheTTL
    ) {
      return this.jwtSecretCache.secret;
    }

    // 从 Redis 获取并缓存
    const secret = await this.redisCacheService.getJwtSecret();
    this.jwtSecretCache = {
      secret,
      timestamp: now,
    };

    return secret;
  }

  private async resolveDecodedUser(payload: any) {
    if (!payload?.uid || payload.id !== undefined) {
      throw new HttpException(
        '亲爱的用户,请登录后继续操作,我们正在等您的到来！',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (payload.role === 'visitor') {
      const visitorId = await this.redisCacheService.resolveVisitorIdByUid(payload.uid);
      if (!visitorId) {
        throw new HttpException('游客登录状态已失效，请刷新后重试。', HttpStatus.UNAUTHORIZED);
      }
      return this.toResolvedUser(payload, visitorId);
    }

    const userId = await this.redisCacheService.resolveUserIdByUid(payload.uid);
    if (!userId) {
      throw new HttpException(
        '亲爱的用户,请登录后继续操作,我们正在等您的到来！',
        HttpStatus.UNAUTHORIZED,
      );
    }

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
}
