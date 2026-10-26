import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { NormalizedAuthIdentity } from '@/modules/auth/identity/auth-identity.types';
import { LoginProviderRegistry } from '@/modules/auth/providers/login-provider.registry';
import type {
  AuthProviderListEntry,
  NormalizedCreateOAuthUrlInput,
  OAuthLoginAdapter,
} from '@/modules/auth/providers/login-provider.types';
import { OAuthStateService } from '@/modules/auth/providers/oauth-state.service';
import { WechatOfficialTokenService } from './wechat-official-token.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const LOG = 'WechatOfficialOAuthProvider';

export const WECHAT_OFFICIAL_PROVIDER = 'wechat_official';

/** 微信公众号：微信内授权登录（oauth）；扫码登录见 WechatOfficialQrProvider。微信包。 */
@Injectable()
export class WechatOfficialOAuthProvider implements OAuthLoginAdapter {
  readonly provider = WECHAT_OFFICIAL_PROVIDER;
  readonly kind = 'oauth' as const;

  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly oauthState: OAuthStateService,
    private readonly wechatToken: WechatOfficialTokenService,
    registry: LoginProviderRegistry,
  ) {
    registry.register(this);
  }

  /** 开关 + AppId + AppSecret + 网站地址都齐才列出：缺任何一项发起或回调必定失败 */
  async listEntries(): Promise<AuthProviderListEntry[]> {
    const configs = await this.globalConfigService.getConfigs([
      'wechatSilentLoginStatus',
      'wechatOfficialAppId',
      'wechatOfficialAppSecret',
      'siteUrl',
    ]);
    const filled = (key: string) => String(configs[key] ?? '').trim() !== '';
    const usable =
      Number(configs.wechatSilentLoginStatus) === 1 &&
      filled('wechatOfficialAppId') &&
      filled('wechatOfficialAppSecret') &&
      filled('siteUrl');
    return usable
      ? [
          {
            provider: WECHAT_OFFICIAL_PROVIDER,
            displayName: '微信内授权',
            type: 'oauth',
            scene: 'oauth',
            enabled: true,
          },
        ]
      : [];
  }

  async createOAuthUrl(input: NormalizedCreateOAuthUrlInput, userId?: number) {
    const configs = await this.globalConfigService.getConfigs([
      'wechatSilentLoginStatus',
      'wechatOfficialAppId',
      'siteUrl',
    ]);
    if (Number(configs.wechatSilentLoginStatus) !== 1) {
      throw new HttpException('微信授权登录未开启。', HttpStatus.BAD_REQUEST);
    }
    if (!configs.wechatOfficialAppId) {
      throw new HttpException('请先配置微信公众号 AppId。', HttpStatus.BAD_REQUEST);
    }
    if (!configs.siteUrl) {
      throw new HttpException('请先配置网站地址。', HttpStatus.BAD_REQUEST);
    }

    const baseSiteUrl = String(configs.siteUrl).replace(/\/+$/, '');
    const redirectUri = `${baseSiteUrl}/auth/callback/${WECHAT_OFFICIAL_PROVIDER}`;
    const state = this.oauthState.newState();
    const statePayload = this.oauthState.createPayload(
      WECHAT_OFFICIAL_PROVIDER,
      input,
      redirectUri,
      {
        defaultSource: 'wechat_browser',
        userId,
      },
    );
    await this.oauthState.store(state, statePayload);
    const url = await this.wechatToken.getWechatUrl('open');
    return `${url}/connect/oauth2/authorize?appid=${configs.wechatOfficialAppId}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
  }

  async fetchIdentityByCode(
    code: string,
    scene: 'oauth' | 'bind' = 'oauth',
  ): Promise<NormalizedAuthIdentity> {
    if (!code) {
      throw new HttpException('缺少微信授权 code。', HttpStatus.BAD_REQUEST);
    }
    const appId = await this.globalConfigService.getConfigs(['wechatOfficialAppId']);
    const secret = await this.globalConfigService.getConfigs(['wechatOfficialAppSecret']);
    const url = await this.wechatToken.getWechatUrl('api');

    const tokenResponse = await axios.get(
      `${url}/sns/oauth2/access_token?appid=${appId}&secret=${secret}&code=${encodeURIComponent(
        code,
      )}&grant_type=authorization_code`,
    );
    const { errmsg, openid, unionid, access_token } = tokenResponse.data || {};
    if (errmsg) throw new HttpException('微信授权失败，请重新登录。', HttpStatus.BAD_REQUEST);
    if (!openid) throw new HttpException('微信授权失败，请重新登录。', HttpStatus.BAD_REQUEST);

    let profile: any = {};
    try {
      const profileResponse = await axios.get(
        `${url}/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`,
      );
      profile = profileResponse.data || {};
    } catch (error) {
      Logger.warn('微信授权用户资料获取失败，使用 OpenID 创建身份。', LOG);
    }

    Logger.log('微信授权身份获取成功', LOG);
    return this.normalizeIdentity(
      {
        openid,
        unionid: profile.unionid || unionid || null,
        nickname: profile.nickname || '',
        headimgurl: profile.headimgurl || '',
      },
      scene,
    );
  }

  normalizeIdentity(
    profile: Record<string, any>,
    scene: 'oauth' | 'qr' | 'bind',
  ): NormalizedAuthIdentity {
    const openid = profile.openid;
    if (!openid) {
      throw new HttpException('微信身份信息不完整。', HttpStatus.BAD_REQUEST);
    }
    return {
      provider: WECHAT_OFFICIAL_PROVIDER,
      providerUserId: openid,
      linkKey: profile.unionid || null,
      nickname: profile.nickname || null,
      avatar: profile.headimgurl || null,
      scene,
      rawProfile: profile,
    };
  }
}
