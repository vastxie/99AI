import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { AuthIdentityService } from '../identity/auth-identity.service';
import { AuthTokenService } from '../token/auth-token.service';
import { LoginProviderRegistry } from './login-provider.registry';
import type { QrScene, QrSceneCreated } from './login-provider.types';

export type QrPollResponse =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'failed'; message: string }
  | { status: 'confirmed'; token?: string; message?: string };

/** 扫码类登录的通用流程（内核）：创建场景、轮询结果、签发会话或返回绑定结果 */
@Injectable()
export class QrAuthService {
  constructor(
    private readonly loginProviders: LoginProviderRegistry,
    private readonly authIdentityService: AuthIdentityService,
    private readonly authTokenService: AuthTokenService,
  ) {}

  async createScene(provider: string, scene: QrScene, req: Request): Promise<QrSceneCreated> {
    const adapter = this.requireAdapter(provider);
    const userId = scene === 'bind' ? await this.resolveBindUserId(req) : undefined;
    return adapter.createScene(scene, userId);
  }

  async pollScene(
    provider: string,
    sceneId: string,
    scene: QrScene,
    req: Request,
  ): Promise<QrPollResponse> {
    const adapter = this.requireAdapter(provider);
    const userId = scene === 'bind' ? await this.resolveBindUserId(req) : undefined;
    const result = await adapter.pollScene(sceneId, scene, userId);
    if (result.status !== 'confirmed') return result;
    if (scene === 'bind') {
      return { status: 'confirmed', message: result.message };
    }
    if (!result.userId) {
      throw new HttpException('扫码登录结果不完整，请重新扫码。', HttpStatus.BAD_REQUEST);
    }
    const user = await this.authIdentityService.getActiveUserById(Number(result.userId));
    const token = await this.authTokenService.issueLoginToken(user, req);
    Logger.log(`扫码登录成功 - UserID: ${user.id}, Provider: ${provider}`, 'QrAuthService');
    return { status: 'confirmed', token };
  }

  private requireAdapter(provider: string) {
    const adapter = this.loginProviders.getQr(provider);
    if (!adapter) {
      throw new HttpException('暂不支持该登录方式。', HttpStatus.BAD_REQUEST);
    }
    return adapter;
  }

  private async resolveBindUserId(req: Request): Promise<number> {
    const currentUser = await this.authTokenService.resolveLoginPayloadFromRequest(req);
    if (currentUser.role === 'visitor') {
      throw new HttpException('游客账号不能绑定扫码登录方式。', HttpStatus.FORBIDDEN);
    }
    return Number(currentUser.id);
  }
}
