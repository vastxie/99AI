import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { AuthIdentityService } from '../identity/auth-identity.service';
import { AuthTokenService } from '../token/auth-token.service';
import { LoginProviderRegistry } from './login-provider.registry';
import type { OAuthSource } from './login-provider.types';
import { OAuthStateService } from './oauth-state.service';

export interface CreateOAuthUrlBody {
  scene?: string;
  source?: OAuthSource;
  redirectPath?: string;
  /** 发起标签页密钥的摘要（见 OAuthStateService），运行时校验格式 */
  browserProof?: string;
}

export interface OAuthCallbackBody {
  code: string;
  state: string;
  /** 发起时生成的标签页密钥原文：先消费 state 再核对，不符时不去第三方换身份 */
  browserSecret?: string;
}

/** OAuth 类登录的通用流程（内核）：生成授权地址、消费回调换身份、登录或绑定 */
@Injectable()
export class OAuthAuthService {
  constructor(
    private readonly loginProviders: LoginProviderRegistry,
    private readonly oauthState: OAuthStateService,
    private readonly authIdentityService: AuthIdentityService,
    private readonly authTokenService: AuthTokenService,
  ) {}

  async createOAuthUrl(provider: string, body: CreateOAuthUrlBody, req: Request) {
    const scene = body?.scene === 'bind' ? 'bind' : body?.scene || 'oauth';
    let bindUserId: number | undefined;
    if (scene === 'bind') {
      const currentUser = await this.authTokenService.resolveLoginPayloadFromRequest(req);
      if (currentUser.role === 'visitor') {
        throw new HttpException('游客账号不能绑定 OAuth 登录方式。', HttpStatus.FORBIDDEN);
      }
      bindUserId = Number(currentUser.id);
    }
    const adapter = this.loginProviders.getOAuth(provider);
    if (!adapter) {
      throw new HttpException('暂不支持该登录方式。', HttpStatus.BAD_REQUEST);
    }
    return adapter.createOAuthUrl(
      this.oauthState.normalizeCreateOAuthUrlInput(
        {
          scene,
          source: body?.source,
          redirectPath: body?.redirectPath,
          browserProof: body?.browserProof,
        },
        this.oauthState.requestOriginOf(req),
      ),
      bindUserId,
    );
  }

  async oauthCallback(
    provider: string,
    body: OAuthCallbackBody,
    req: Request,
  ): Promise<
    string | { bound: boolean; provider: string } | { token: string; redirectPath?: string }
  > {
    if (!body?.code) {
      throw new HttpException('缺少 OAuth 授权 code。', HttpStatus.BAD_REQUEST);
    }
    const adapter = this.loginProviders.getOAuth(provider);
    if (!adapter) {
      throw new HttpException('暂不支持该登录方式。', HttpStatus.BAD_REQUEST);
    }
    const state = await this.oauthState.consume(provider, body.state, body.browserSecret);
    adapter.validateState?.(state);
    const scene = state.scene === 'bind' ? 'bind' : 'oauth';
    let currentUser: any;
    if (scene === 'bind') {
      currentUser = await this.authTokenService.resolveLoginPayloadFromRequest(req);
      if (currentUser.role === 'visitor') {
        throw new HttpException('游客账号不能绑定 OAuth 登录方式。', HttpStatus.FORBIDDEN);
      }
      if (!state.userId || Number(state.userId) !== Number(currentUser.id)) {
        throw new HttpException('OAuth 绑定状态不匹配，请重新发起绑定。', HttpStatus.FORBIDDEN);
      }
    }
    const identity = await adapter.fetchIdentityByCode(body.code, scene);
    if (scene === 'bind') {
      const bound = await this.authIdentityService.bindIdentity(Number(currentUser.id), identity);
      Logger.log('绑定 OAuth 登录身份成功', 'OAuthAuthService');
      return { bound: true, provider: bound.provider };
    }
    const user = await this.authIdentityService.loginOrCreateByIdentity(identity);
    const token = await this.authTokenService.issueLoginToken(user, req);
    if (adapter.returnsRedirectPath) {
      return {
        token,
        redirectPath: state.redirectPath || '/',
      };
    }
    return token;
  }
}
