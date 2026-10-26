import { HttpException } from '@nestjs/common';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { LoginProviderRegistry } from '@/modules/auth/providers/login-provider.registry';
import { OAuthStateService } from '@/modules/auth/providers/oauth-state.service';
import {
  WECHAT_OPEN_WEB_PROVIDER,
  WechatOpenWebOAuthProvider,
} from './wechat-open-web-oauth.provider';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const browserProof = createHash('sha256')
  .update(randomBytes(32).toString('base64url'), 'utf8')
  .digest('hex');

describe('WechatOpenWebOAuthProvider', () => {
  let globalConfigService: { getConfigs: any; getConfigWithFallback: any };
  let redisCacheService: { set: any; getDel: any };
  let oauthState: OAuthStateService;
  let adapter: WechatOpenWebOAuthProvider;

  const enabledConfigs = {
    wechatOpenWebLoginEnabled: '1',
    wechatOpenWebAppId: 'wx-open-appid',
    wechatOpenWebAppSecret: 'wx-open-secret',
    wechatOpenWebCallbackUrl: '',
    wechatOpenWebFastLoginEnabled: '1',
    wechatOpenWebFallbackEnabled: '1',
    wechatOpenWebStyle: 'white',
    siteUrl: 'https://example.com/',
  };

  beforeEach(() => {
    globalConfigService = { getConfigs: jest.fn(), getConfigWithFallback: jest.fn() };
    redisCacheService = { set: jest.fn(), getDel: jest.fn() };
    oauthState = new OAuthStateService(redisCacheService as any);
    const registry = new LoginProviderRegistry();
    adapter = new WechatOpenWebOAuthProvider(globalConfigService as any, oauthState, registry);
    (axios.get as any).mockReset();
  });

  it('lists WeChat open web login only when enabled and configured', async () => {
    globalConfigService.getConfigs.mockResolvedValue(enabledConfigs);
    await expect(adapter.listEntries()).resolves.toEqual([
      {
        provider: WECHAT_OPEN_WEB_PROVIDER,
        displayName: '微信开放平台网站登录',
        type: 'oauth',
        scene: 'oauth',
        enabled: true,
      },
    ]);

    globalConfigService.getConfigs.mockResolvedValue({
      ...enabledConfigs,
      wechatOpenWebAppSecret: '',
    });
    await expect(adapter.listEntries()).resolves.toEqual([]);
  });

  it('lists WeChat open web login only when its callback address can be resolved', async () => {
    const listed = async (extra: Record<string, string>) => {
      globalConfigService.getConfigs.mockResolvedValue({
        ...enabledConfigs,
        wechatOpenWebCallbackUrl: '',
        siteUrl: '',
        ...extra,
      });
      return (await adapter.listEntries()).length === 1;
    };
    const callback = 'https://example.com/auth/callback/wechat_open_web';

    await expect(listed({ wechatOpenWebCallbackUrl: callback })).resolves.toBe(true);
    await expect(listed({ siteUrl: 'https://example.com/' })).resolves.toBe(true);
    await expect(listed({})).resolves.toBe(false);
    await expect(listed({ wechatOpenWebCallbackUrl: ' ', siteUrl: '  ' })).resolves.toBe(false);
    await expect(
      listed({ wechatOpenWebCallbackUrl: ' ', siteUrl: 'https://example.com/' }),
    ).resolves.toBe(true);
    await expect(
      listed({ siteUrl: 'https://example.com/', wechatOpenWebAppId: '  ' }),
    ).resolves.toBe(false);
    // 配置补齐后入口恢复
    await expect(listed({ siteUrl: 'https://example.com/' })).resolves.toBe(true);
  });

  it('creates the embedded login config without returning the AppSecret', async () => {
    globalConfigService.getConfigs.mockResolvedValue(enabledConfigs);
    globalConfigService.getConfigWithFallback.mockResolvedValue('https://open.weixin.qq.com');

    const result = (await adapter.createOAuthUrl(
      oauthState.normalizeCreateOAuthUrlInput(
        {
          scene: 'oauth',
          source: 'pc_web',
          redirectPath: '/chat/abc?from=wechat',
          browserProof,
        },
        'https://example.com',
      ),
    )) as any;

    expect(result).toMatchObject({
      appId: 'wx-open-appid',
      scope: 'snsapi_login',
      redirectUri: 'https://example.com/auth/callback/wechat_open_web',
      style: 'white',
      fastLogin: true,
    });
    expect(result.fallbackUrl).toContain('https://open.weixin.qq.com/connect/qrconnect?');
    expect(result.fallbackUrl).toContain('appid=wx-open-appid');
    expect(JSON.stringify(result)).not.toContain('wx-open-secret');
    const statePayload = JSON.parse(redisCacheService.set.mock.calls[0][0].val);
    expect(statePayload).toMatchObject({
      provider: WECHAT_OPEN_WEB_PROVIDER,
      scene: 'oauth',
      source: 'pc_web',
      callbackUrl: 'https://example.com/auth/callback/wechat_open_web',
      redirectPath: '/chat/abc?from=wechat',
      browserProof,
      requestOrigin: 'https://example.com',
    });
  });

  it('omits the fallback URL when fallback is disabled', async () => {
    globalConfigService.getConfigs.mockResolvedValue({
      ...enabledConfigs,
      wechatOpenWebFallbackEnabled: '0',
      wechatOpenWebStyle: 'black',
    });

    const result = (await adapter.createOAuthUrl(
      oauthState.normalizeCreateOAuthUrlInput(
        { scene: 'oauth', source: 'pc_web', redirectPath: '/', browserProof },
        null,
      ),
    )) as any;

    expect(result.fallbackUrl).toBe('');
    expect(globalConfigService.getConfigWithFallback).not.toHaveBeenCalled();
  });

  it('rejects URL creation when disabled and rejects unsafe redirect paths before storing state', async () => {
    globalConfigService.getConfigs.mockResolvedValue({
      ...enabledConfigs,
      wechatOpenWebLoginEnabled: '0',
    });
    await expect(
      adapter.createOAuthUrl(
        oauthState.normalizeCreateOAuthUrlInput({ scene: 'oauth', browserProof }, null),
      ),
    ).rejects.toBeInstanceOf(HttpException);

    globalConfigService.getConfigs.mockResolvedValue(enabledConfigs);
    await expect(
      adapter.createOAuthUrl(
        oauthState.normalizeCreateOAuthUrlInput(
          { scene: 'oauth', redirectPath: 'https://evil.example/callback', browserProof },
          null,
        ),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(redisCacheService.set).not.toHaveBeenCalled();
  });

  it('normalizes the profile without leaking tokens into the identity payload', async () => {
    globalConfigService.getConfigs.mockResolvedValue(enabledConfigs);
    globalConfigService.getConfigWithFallback.mockResolvedValue('https://api.weixin.qq.com');
    (axios.get as any)
      .mockResolvedValueOnce({
        data: {
          access_token: 'wechat-access-token',
          refresh_token: 'wechat-refresh-token',
          openid: 'open-web-openid',
          unionid: 'shared-unionid',
        },
      })
      .mockResolvedValueOnce({
        data: {
          openid: 'open-web-openid',
          unionid: 'shared-unionid',
          nickname: '开放平台用户',
          headimgurl: 'https://example.com/avatar.jpg',
        },
      });

    const identity = await adapter.fetchIdentityByCode('wechat-code', 'oauth');

    expect(identity).toMatchObject({
      provider: WECHAT_OPEN_WEB_PROVIDER,
      providerUserId: 'open-web-openid',
      linkKey: 'shared-unionid',
      nickname: '开放平台用户',
      avatar: 'https://example.com/avatar.jpg',
      scene: 'oauth',
    });
    const serialized = JSON.stringify(identity);
    expect(serialized).not.toContain('wechat-access-token');
    expect(serialized).not.toContain('wechat-refresh-token');
    expect(serialized).not.toContain('wx-open-secret');
  });
});
