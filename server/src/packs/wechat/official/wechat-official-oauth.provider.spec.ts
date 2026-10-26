import { createHash, randomBytes } from 'crypto';
import { LoginProviderRegistry } from '@/modules/auth/providers/login-provider.registry';
import { OAuthStateService } from '@/modules/auth/providers/oauth-state.service';
import {
  WECHAT_OFFICIAL_PROVIDER,
  WechatOfficialOAuthProvider,
} from './wechat-official-oauth.provider';
import {
  WECHAT_OPEN_WEB_PROVIDER,
  WechatOpenWebOAuthProvider,
} from './wechat-open-web-oauth.provider';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const browserProof = createHash('sha256')
  .update(randomBytes(32).toString('base64url'), 'utf8')
  .digest('hex');

/** 两个微信 OAuth 渠道都把发起标签页的证明与站点写进 state，回调地址与站点不同源时不发起 */
describe('WeChat OAuth providers bind the state to the initiating tab', () => {
  let configs: Record<string, string>;
  let redis: { set: any; getDel: any };
  let oauthState: OAuthStateService;
  let official: WechatOfficialOAuthProvider;
  let openWeb: WechatOpenWebOAuthProvider;

  beforeEach(() => {
    configs = {
      wechatSilentLoginStatus: '1',
      wechatOfficialAppId: 'wx-official-appid',
      wechatOpenWebLoginEnabled: '1',
      wechatOpenWebAppId: 'wx-open-appid',
      wechatOpenWebAppSecret: 'wx-open-secret',
      wechatOpenWebCallbackUrl: '',
      wechatOpenWebFallbackEnabled: '0',
      siteUrl: 'https://chat.example.com/',
    };
    const globalConfig = {
      getConfigs: jest.fn(async (keys: string[]) =>
        keys.length === 1
          ? configs[keys[0]]
          : Object.fromEntries(keys.map(key => [key, configs[key]])),
      ),
      getConfigWithFallback: jest.fn(async () => 'https://open.weixin.qq.com'),
    };
    redis = { set: jest.fn(), getDel: jest.fn() };
    oauthState = new OAuthStateService(redis as any);
    const registry = new LoginProviderRegistry();
    official = new WechatOfficialOAuthProvider(
      globalConfig as any,
      oauthState,
      { getWechatUrl: jest.fn(async () => 'https://open.weixin.qq.com') } as any,
      registry,
    );
    openWeb = new WechatOpenWebOAuthProvider(globalConfig as any, oauthState, registry);
  });

  const input = (requestOrigin: string | null) =>
    oauthState.normalizeCreateOAuthUrlInput(
      { scene: 'oauth', redirectPath: '/', browserProof },
      requestOrigin,
    );
  const storedPayload = () => JSON.parse(redis.set.mock.calls.at(-1)[0].val);

  it('stores the proof and the site origin for both channels', async () => {
    const url = (await official.createOAuthUrl(input('https://chat.example.com'))) as string;
    expect(url).toContain(
      `redirect_uri=${encodeURIComponent('https://chat.example.com/auth/callback/wechat_official')}`,
    );
    expect(storedPayload()).toMatchObject({
      provider: WECHAT_OFFICIAL_PROVIDER,
      source: 'wechat_browser',
      browserProof,
      requestOrigin: 'https://chat.example.com',
    });

    await openWeb.createOAuthUrl(input('https://chat.example.com'));
    expect(storedPayload()).toMatchObject({
      provider: WECHAT_OPEN_WEB_PROVIDER,
      scene: 'oauth',
      source: 'pc_web',
      browserProof,
      requestOrigin: 'https://chat.example.com',
    });
  });

  it('refuses when the site address or the configured callback is on another origin', async () => {
    // 公众号的回调地址固定是「网站地址 + /auth/callback/wechat_official」：网站地址要与访问的站点一致
    await expect(official.createOAuthUrl(input('https://www.chat.example.com'))).rejects.toThrow(
      '第三方登录的回调地址必须与当前站点同源，请检查回调地址配置',
    );
    configs.wechatOpenWebCallbackUrl = 'http://chat.example.com/auth/callback/wechat_open_web';
    await expect(openWeb.createOAuthUrl(input('https://chat.example.com'))).rejects.toThrow(
      '第三方登录的回调地址必须与当前站点同源，请检查回调地址配置',
    );
    expect(redis.set).not.toHaveBeenCalled();
  });
});
