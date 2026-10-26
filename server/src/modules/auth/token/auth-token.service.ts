import { authTemporarilyUnavailable, isDefiniteAuthFailure } from '@/common/auth/auth-failure';
import { createRandomUniqueString, createUserUid, getClientIp } from '@/common/utils';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { RedisCacheService } from '@/modules/redisCache/redisCache.service';
import { UserEntity } from '@/modules/user/user.entity';
import { UserService } from '@/modules/user/user.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';

export interface LoginTokenPayload {
  uid: string;
  username: string;
  email?: string;
  phone?: string;
  role: string;
}

export interface ResolvedLoginUser extends LoginTokenPayload {
  id: number | string;
}

/** jwt.verify 解出的登录负载：旧凭证可能带 id，解析时据此拒绝 */
export type DecodedLoginTokenPayload = LoginTokenPayload & { id?: number | string };

export interface VisitorTokenInput {
  deviceId?: string | number;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly redisCacheService: RedisCacheService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  async issueLoginToken(user: UserEntity, req: Request): Promise<string> {
    const userWithUid = await this.userService.ensureUserUid(user);
    const payload: LoginTokenPayload = {
      uid: userWithUid.uid,
      username: userWithUid.username,
      email: userWithUid.email || undefined,
      phone: userWithUid.phone || undefined,
      role: userWithUid.role,
    };

    const ip = getClientIp(req);
    await this.userService.savaLoginIp(userWithUid.id, ip);

    const token = await this.jwtService.sign(payload);
    const refreshToken = createRandomUniqueString(32);
    const maxDevicesConfig = await this.globalConfigService.getConfigs(['maxDevices']);
    const maxDevices = maxDevicesConfig ? parseInt(maxDevicesConfig, 10) : undefined;

    await this.redisCacheService.saveToken(userWithUid.id, token, refreshToken, maxDevices, {
      uid: userWithUid.uid,
      username: userWithUid.username,
      role: userWithUid.role,
    });
    Logger.debug(
      `用户${userWithUid.username}(ID: ${userWithUid.id})登录成功，IP: ${ip}`,
      'AuthTokenService',
    );
    return token;
  }

  async createVisitorToken(input: VisitorTokenInput = {}): Promise<string> {
    const uid = createUserUid();
    await this.redisCacheService.saveVisitorSession(uid, {
      visitorId: `visitor:${uid}`,
      fingerprintHash: this.hashSignal(input.deviceId),
      ip: input.ip,
      userAgentHash: this.hashSignal(input.userAgent),
    });
    return this.jwtService.sign({
      uid,
      username: '游客',
      role: 'visitor',
    });
  }

  private hashSignal(value: string | number | undefined): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return createHash('sha256').update(String(value)).digest('hex');
  }

  async resolveLoginPayloadFromRequest(req: Request): Promise<ResolvedLoginUser> {
    const token = this.extractBearerToken(req);
    if (!token) {
      throw new HttpException('请登录后再绑定账号。', HttpStatus.UNAUTHORIZED);
    }

    try {
      const secret = await this.redisCacheService.getJwtSecret();
      const decoded = jwt.verify(token, secret) as DecodedLoginTokenPayload;
      const resolved = await this.resolveDecodedPayload(decoded);
      await this.redisCacheService.checkTokenAuth(token, { user: resolved });
      return resolved;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // 读密钥、读会话时的暂时故障不能当成登录失效（客户端会据 401 退出登录）
      if (!isDefiniteAuthFailure(error)) {
        Logger.warn('鉴权暂时无法完成', 'AuthTokenService');
        throw authTemporarilyUnavailable();
      }
      throw new HttpException('登录状态已失效，请重新登录。', HttpStatus.UNAUTHORIZED);
    }
  }

  private extractBearerToken(req: Request): string {
    const authorization = req.headers.authorization;
    if (!authorization) return '';
    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return '';
    return parts[1];
  }

  private async resolveDecodedPayload(
    payload: DecodedLoginTokenPayload,
  ): Promise<ResolvedLoginUser> {
    if (!payload?.uid || payload.id !== undefined) {
      throw new HttpException('登录状态已失效，请重新登录。', HttpStatus.UNAUTHORIZED);
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
      throw new HttpException('登录状态已失效，请重新登录。', HttpStatus.UNAUTHORIZED);
    }

    return this.toResolvedUser(payload, userId);
  }

  private toResolvedUser(payload: LoginTokenPayload, id: number | string): ResolvedLoginUser {
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
