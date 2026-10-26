import { formatUrl } from '@/common/utils';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { NormalizedAuthIdentity } from '@/modules/auth/identity/auth-identity.types';
import { LoginProviderRegistry } from '@/modules/auth/providers/login-provider.registry';
import type {
  AuthProviderListEntry,
  NormalizedCreateOAuthUrlInput,
  OAuthLoginAdapter,
  OAuthStatePayload,
} from '@/modules/auth/providers/login-provider.types';
import { OAuthStateService } from '@/modules/auth/providers/oauth-state.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const LOG = 'WechatOpenWebOAuthProvider';

const WECHAT_URLS = {
  open: {
    configKey: 'wechatOpenUrl',
    envKey: 'weChatOpenUrl',
    fallback: 'https://open.weixin.qq.com',
  },
  api: { configKey: 'wechatApiUrl', envKey: 'weChatApiUrl', fallback: 'https://api.weixin.qq.com' },
} as const;

export const WECHAT_OPEN_WEB_PROVIDER = 'wechat_open_web';

/** 微信开放平台网站登录（PC 扫码，微信包） */
@Injectable()
export class WechatOpenWebOAuthProvider implements OAuthLoginAdapter {
  readonly provider = WECHAT_OPEN_WEB_PROVIDER;
  readonly kind = 'oauth' as const;
  readonly returnsRedirectPath = true;

  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly oauthState: OAuthStateService,
    registry: LoginProviderRegistry,
  ) {
    registry.register(this);
  }

  /** 开关 + AppId + AppSecret + 回调地址（没填时回退网站地址）都齐才列出 */
  async listEntries(): Promise<AuthProviderListEntry[]> {
    const configs = await this.globalConfigService.getConfigs([
      'wechatOpenWebLoginEnabled',
      'wechatOpenWebAppId',
      'wechatOpenWebAppSecret',
      'wechatOpenWebCallbackUrl',
      'siteUrl',
    ]);
    const filled = (key: string) => String(configs[key] ?? '').trim() !== '';
    return [
      {
        provider: WECHAT_OPEN_WEB_PROVIDER,
        displayName: '微信开放平台网站登录',
        type: 'oauth' as const,
        scene: 'oauth',
        enabled:
          Number(configs.wechatOpenWebLoginEnabled) === 1 &&
          filled('wechatOpenWebAppId') &&
          filled('wechatOpenWebAppSecret') &&
          (filled('wechatOpenWebCallbackUrl') || filled('siteUrl')),
      },
    ].filter(item => item.enabled);
  }

  async createOAuthUrl(input: NormalizedCreateOAuthUrlInput, userId?: number) {
    const scene = input.scene === 'bind' ? 'bind' : 'oauth';
    if (scene !== 'oauth') {
      throw new HttpException('微信开放平台网站登录暂不支持绑定场景。', HttpStatus.BAD_REQUEST);
    }

    const configs = await this.globalConfigService.getConfigs([
      'wechatOpenWebLoginEnabled',
      'wechatOpenWebAppId',
      'wechatOpenWebAppSecret',
      'wechatOpenWebCallbackUrl',
      'wechatOpenWebFastLoginEnabled',
      'wechatOpenWebFallbackEnabled',
      'wechatOpenWebStyle',
      'siteUrl',
    ]);
    if (Number(configs.wechatOpenWebLoginEnabled) !== 1) {
      throw new HttpException('微信开放平台网站登录未开启。', HttpStatus.BAD_REQUEST);
    }
    if (!configs.wechatOpenWebAppId || !configs.wechatOpenWebAppSecret) {
      throw new HttpException('请先配置微信开放平台网站应用。', HttpStatus.BAD_REQUEST);
    }

    const redirectUri = this.resolveRedirectUri(configs);
    const redirectPath = this.oauthState.normalizeRedirectPath(input.redirectPath);
    const state = this.oauthState.newState();
    const statePayload = this.oauthState.createPayload(
      WECHAT_OPEN_WEB_PROVIDER,
      { ...input, scene, redirectPath },
      redirectUri,
      { defaultSource: 'pc_web', userId },
    );
    await this.oauthState.store(state, statePayload);

    let fallbackUrl = '';
    if (Number(configs.wechatOpenWebFallbackEnabled) === 1) {
      const url = await this.resolveWechatUrl('open');
      fallbackUrl = this.buildFallbackUrl(url, configs.wechatOpenWebAppId, redirectUri, state);
    }

    return {
      appId: configs.wechatOpenWebAppId,
      scope: 'snsapi_login',
      redirectUri,
      state,
      style: configs.wechatOpenWebStyle === 'white' ? 'white' : 'black',
      fastLogin: Number(configs.wechatOpenWebFastLoginEnabled) === 1,
      fallbackUrl,
    };
  }

  validateState(payload: OAuthStatePayload) {
    if (!payload.callbackUrl || !payload.source || !payload.redirectPath) {
      throw new HttpException('登录状态已失效，请重新授权。', HttpStatus.BAD_REQUEST);
    }
    if (payload.scene !== 'oauth') {
      throw new HttpException('登录状态不匹配，请重新授权。', HttpStatus.BAD_REQUEST);
    }
    this.oauthState.normalizeRedirectPath(payload.redirectPath);
  }

  async fetchIdentityByCode(
    code: string,
    scene: 'oauth' | 'bind' = 'oauth',
  ): Promise<NormalizedAuthIdentity> {
    if (!code) {
      throw new HttpException('缺少微信授权 code。', HttpStatus.BAD_REQUEST);
    }

    const configs = await this.globalConfigService.getConfigs([
      'wechatOpenWebLoginEnabled',
      'wechatOpenWebAppId',
      'wechatOpenWebAppSecret',
    ]);
    if (Number(configs.wechatOpenWebLoginEnabled) !== 1) {
      throw new HttpException('微信开放平台网站登录未开启。', HttpStatus.BAD_REQUEST);
    }
    if (!configs.wechatOpenWebAppId || !configs.wechatOpenWebAppSecret) {
      throw new HttpException('请先配置微信开放平台网站应用。', HttpStatus.BAD_REQUEST);
    }

    const url = await this.resolveWechatUrl('api');
    let tokenData: Record<string, any>;
    try {
      const tokenResponse = await axios.get(`${url}/sns/oauth2/access_token`, {
        params: {
          appid: configs.wechatOpenWebAppId,
          secret: configs.wechatOpenWebAppSecret,
          code,
          grant_type: 'authorization_code',
        },
        timeout: 10000,
      });
      tokenData = tokenResponse.data || {};
    } catch {
      Logger.warn('微信开放平台授权换取 token 失败，已返回通用错误。', LOG);
      throw new HttpException('微信授权失败，请重新登录。', HttpStatus.BAD_REQUEST);
    }

    if (tokenData.errcode || tokenData.errmsg) {
      Logger.warn('微信开放平台授权返回错误，已返回通用错误。', LOG);
      throw new HttpException('微信授权失败，请重新登录。', HttpStatus.BAD_REQUEST);
    }
    if (!tokenData.openid || !tokenData.access_token) {
      throw new HttpException('微信授权失败，请重新登录。', HttpStatus.BAD_REQUEST);
    }

    let profile: Record<string, any>;
    try {
      const profileResponse = await axios.get(`${url}/sns/userinfo`, {
        params: {
          access_token: tokenData.access_token,
          openid: tokenData.openid,
          lang: 'zh_CN',
        },
        timeout: 10000,
      });
      profile = profileResponse.data || {};
    } catch {
      Logger.warn('微信开放平台用户资料获取失败，已返回通用错误。', LOG);
      throw new HttpException('微信授权失败，请重新登录。', HttpStatus.BAD_REQUEST);
    }

    if (profile.errcode || profile.errmsg) {
      Logger.warn('微信开放平台用户资料返回错误，已返回通用错误。', LOG);
      throw new HttpException('微信授权失败，请重新登录。', HttpStatus.BAD_REQUEST);
    }
    if (!profile.openid) {
      throw new HttpException('微信身份信息不完整。', HttpStatus.BAD_REQUEST);
    }
    if (!profile.unionid && !tokenData.unionid) {
      Logger.debug('微信开放平台未返回 UnionID，跳过跨渠道自动合并。', LOG);
    }

    Logger.log('微信开放平台身份获取成功', LOG);
    return this.normalizeIdentity(
      {
        openid: profile.openid,
        unionid: profile.unionid || tokenData.unionid || null,
        nickname: profile.nickname || '',
        headimgurl: profile.headimgurl || '',
      },
      scene,
    );
  }

  normalizeIdentity(profile: Record<string, any>, scene: 'oauth' | 'bind'): NormalizedAuthIdentity {
    const openid = profile.openid;
    if (!openid) {
      throw new HttpException('微信身份信息不完整。', HttpStatus.BAD_REQUEST);
    }
    return {
      provider: WECHAT_OPEN_WEB_PROVIDER,
      providerUserId: openid,
      linkKey: profile.unionid || null,
      nickname: profile.nickname || null,
      avatar: profile.headimgurl || null,
      scene,
      rawProfile: {
        openid,
        unionid: profile.unionid || null,
        nickname: profile.nickname || null,
        headimgurl: profile.headimgurl || null,
      },
    };
  }

  private resolveRedirectUri(configs: Record<string, any>) {
    const configuredCallback = String(configs.wechatOpenWebCallbackUrl || '').trim();
    if (configuredCallback) return configuredCallback;

    const siteUrl = String(configs.siteUrl || '')
      .trim()
      .replace(/\/+$/, '');
    if (!siteUrl) {
      throw new HttpException('请先配置网站地址或微信开放平台回调地址。', HttpStatus.BAD_REQUEST);
    }
    return `${siteUrl}/auth/callback/${WECHAT_OPEN_WEB_PROVIDER}`;
  }

  private buildFallbackUrl(
    openApiBaseUrl: string,
    appId: string,
    redirectUri: string,
    state: string,
  ) {
    const params = new URLSearchParams({
      appid: appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'snsapi_login',
      state,
    });
    return `${openApiBaseUrl}/connect/qrconnect?${params.toString()}#wechat_redirect`;
  }

  /** 微信域名：数据库配置 > 环境变量 > 官方默认（可指向反向代理） */
  private async resolveWechatUrl(type: 'open' | 'api'): Promise<string> {
    const { configKey, envKey, fallback } = WECHAT_URLS[type];
    const value = await this.globalConfigService.getConfigWithFallback(configKey, envKey, fallback);
    return value === fallback ? fallback : formatUrl(value);
  }
}
