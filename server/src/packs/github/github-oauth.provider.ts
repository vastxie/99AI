import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { NormalizedAuthIdentity } from '@/modules/auth/identity/auth-identity.types';
import { LoginProviderRegistry } from '@/modules/auth/providers/login-provider.registry';
import type {
  AuthProviderListEntry,
  NormalizedCreateOAuthUrlInput,
  OAuthLoginAdapter,
} from '@/modules/auth/providers/login-provider.types';
import { OAuthStateService } from '@/modules/auth/providers/oauth-state.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export const GITHUB_PROVIDER = 'github';

/** GitHub OAuth 登录 / 绑定（GitHub 包） */
@Injectable()
export class GithubOAuthProvider implements OAuthLoginAdapter {
  readonly provider = GITHUB_PROVIDER;
  readonly kind = 'oauth' as const;

  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly oauthState: OAuthStateService,
    registry: LoginProviderRegistry,
  ) {
    registry.register(this);
  }

  /** 开关 + Client ID + Client Secret + 回调地址（没填时回退网站地址）都齐才列出 */
  async listEntries(): Promise<AuthProviderListEntry[]> {
    const configs = await this.globalConfigService.getConfigs([
      'githubLoginEnabled',
      'githubClientId',
      'githubClientSecret',
      'githubCallbackUrl',
      'siteUrl',
    ]);
    const filled = (key: string) => String(configs[key] ?? '').trim() !== '';
    return [
      {
        provider: GITHUB_PROVIDER,
        displayName: 'GitHub',
        type: 'oauth' as const,
        scene: 'login',
        enabled:
          Number(configs.githubLoginEnabled) === 1 &&
          filled('githubClientId') &&
          filled('githubClientSecret') &&
          (filled('githubCallbackUrl') || filled('siteUrl')),
      },
    ].filter(item => item.enabled);
  }

  async createOAuthUrl(input: NormalizedCreateOAuthUrlInput, userId?: number) {
    const configs = await this.globalConfigService.getConfigs([
      'githubLoginEnabled',
      'githubClientId',
      'githubClientSecret',
      'githubCallbackUrl',
      'siteUrl',
    ]);
    if (Number(configs.githubLoginEnabled) !== 1) {
      throw new HttpException('GitHub 登录未开启。', HttpStatus.BAD_REQUEST);
    }
    if (!configs.githubClientId || !configs.githubClientSecret) {
      throw new HttpException(
        '请先配置 GitHub Client ID 和 Client Secret。',
        HttpStatus.BAD_REQUEST,
      );
    }

    const redirectUri = this.resolveRedirectUri(configs);
    const state = this.oauthState.newState();
    const statePayload = this.oauthState.createPayload(GITHUB_PROVIDER, input, redirectUri, {
      defaultSource: 'pc_web',
      userId,
    });
    await this.oauthState.store(state, statePayload);

    const params = new URLSearchParams({
      client_id: configs.githubClientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async fetchIdentityByCode(
    code: string,
    scene: 'oauth' | 'bind' = 'oauth',
  ): Promise<NormalizedAuthIdentity> {
    if (!code) {
      throw new HttpException('缺少 GitHub 授权 code。', HttpStatus.BAD_REQUEST);
    }

    const configs = await this.globalConfigService.getConfigs([
      'githubClientId',
      'githubClientSecret',
    ]);
    if (!configs.githubClientId || !configs.githubClientSecret) {
      throw new HttpException(
        '请先配置 GitHub Client ID 和 Client Secret。',
        HttpStatus.BAD_REQUEST,
      );
    }

    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: configs.githubClientId,
        client_secret: configs.githubClientSecret,
        code,
      },
      {
        headers: {
          Accept: 'application/json',
        },
        timeout: 10000,
      },
    );

    const { access_token, error, error_description } = tokenResponse.data || {};
    if (error) {
      throw new HttpException(
        error_description || 'GitHub 授权失败，请重新登录。',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!access_token) {
      throw new HttpException('GitHub 授权失败，请重新登录。', HttpStatus.BAD_REQUEST);
    }

    const profileResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${access_token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 10000,
    });
    const profile = profileResponse.data || {};
    if (!profile.id) {
      throw new HttpException('GitHub 身份信息不完整。', HttpStatus.BAD_REQUEST);
    }

    const email = await this.fetchPrimaryEmail(access_token, profile.email);
    return {
      provider: GITHUB_PROVIDER,
      providerUserId: String(profile.id),
      scene,
      email: email?.email || null,
      emailVerified: Boolean(email?.verified),
      nickname: profile.name || profile.login || null,
      avatar: profile.avatar_url || null,
      rawProfile: {
        id: profile.id,
        login: profile.login,
        name: profile.name,
        email: email?.email || profile.email || null,
        avatar_url: profile.avatar_url,
        html_url: profile.html_url,
      },
    };
  }

  private resolveRedirectUri(configs: Record<string, any>) {
    const configuredCallback = String(configs.githubCallbackUrl || '').trim();
    if (configuredCallback) return configuredCallback;

    const siteUrl = String(configs.siteUrl || '')
      .trim()
      .replace(/\/+$/, '');
    if (!siteUrl) {
      throw new HttpException('请先配置网站地址或 GitHub 回调地址。', HttpStatus.BAD_REQUEST);
    }
    return `${siteUrl}/auth/callback/${GITHUB_PROVIDER}`;
  }

  private async fetchPrimaryEmail(accessToken: string, fallbackEmail?: string | null) {
    try {
      const emailResponse = await axios.get('https://api.github.com/user/emails', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        timeout: 10000,
      });
      const emails = Array.isArray(emailResponse.data) ? emailResponse.data : [];
      const primary = emails.find(item => item?.primary) || emails[0];
      if (primary?.email) {
        return {
          email: primary.email,
          verified: Boolean(primary.verified),
        };
      }
    } catch {
      Logger.warn('GitHub 授权邮箱获取失败，使用基础资料继续登录。', 'GithubOAuthProvider');
    }
    return fallbackEmail ? { email: fallbackEmail, verified: false } : null;
  }
}
