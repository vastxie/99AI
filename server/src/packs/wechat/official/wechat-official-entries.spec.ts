import { LoginProviderRegistry } from '@/modules/auth/providers/login-provider.registry';
import {
  WECHAT_OFFICIAL_PROVIDER,
  WechatOfficialOAuthProvider,
} from './wechat-official-oauth.provider';
import { WechatOfficialQrProvider } from './wechat-official-qr.provider';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/** 公众号的两个登录入口只在各自必需的配置都齐时列出；任一入口可用，公众号身份就算可用 */
describe('WeChat official login entries need the configuration their flow uses', () => {
  let configs: Record<string, string>;
  let registry: LoginProviderRegistry;
  let oauth: WechatOfficialOAuthProvider;
  let qr: WechatOfficialQrProvider;

  beforeEach(() => {
    configs = {
      wechatSilentLoginStatus: '1',
      wechatRegisterStatus: '1',
      wechatOfficialAppId: 'wx-official-appid',
      wechatOfficialAppSecret: 'wx-official-secret',
      wechatOfficialToken: 'wx-official-token',
      siteUrl: 'https://chat.example.com',
    };
    const globalConfig = {
      getConfigs: jest.fn(async (keys: string[]) =>
        keys.length === 1
          ? configs[keys[0]]
          : Object.fromEntries(keys.map(key => [key, configs[key]])),
      ),
    };
    registry = new LoginProviderRegistry();
    oauth = new WechatOfficialOAuthProvider(
      globalConfig as any,
      {} as any,
      { getWechatUrl: jest.fn() } as any,
      registry,
    );
    qr = new WechatOfficialQrProvider(globalConfig as any, {} as any, registry);
  });

  it('lists in-WeChat authorization only with the switch, AppId, AppSecret and site address', async () => {
    await expect(oauth.listEntries()).resolves.toEqual([
      {
        provider: WECHAT_OFFICIAL_PROVIDER,
        displayName: '微信内授权',
        type: 'oauth',
        scene: 'oauth',
        enabled: true,
      },
    ]);
    for (const [key, value] of [
      ['wechatSilentLoginStatus', '0'],
      ['wechatOfficialAppId', ''],
      ['wechatOfficialAppSecret', ''],
      ['siteUrl', ''],
      ['siteUrl', '   '],
    ]) {
      const saved = configs[key];
      configs[key] = value;
      await expect(oauth.listEntries()).resolves.toEqual([]);
      // 配置补齐后入口恢复
      configs[key] = saved;
      await expect(oauth.listEntries()).resolves.toHaveLength(1);
    }
  });

  it('lists QR login only with the switch, AppId, AppSecret and server token', async () => {
    await expect(qr.listEntries()).resolves.toEqual([
      {
        provider: WECHAT_OFFICIAL_PROVIDER,
        displayName: '微信公众号扫码',
        type: 'qr',
        scene: 'qr',
        enabled: true,
      },
    ]);
    for (const [key, value] of [
      ['wechatRegisterStatus', '0'],
      ['wechatOfficialAppId', ''],
      ['wechatOfficialAppSecret', ' '],
      ['wechatOfficialToken', ''],
    ]) {
      const saved = configs[key];
      configs[key] = value;
      await expect(qr.listEntries()).resolves.toEqual([]);
      configs[key] = saved;
      await expect(qr.listEntries()).resolves.toHaveLength(1);
    }
  });

  it('keeps an official account identity usable while either entry is usable', async () => {
    await expect(registry.isProviderUsable(WECHAT_OFFICIAL_PROVIDER)).resolves.toBe(true);

    configs.wechatSilentLoginStatus = '0';
    await expect(registry.isProviderUsable(WECHAT_OFFICIAL_PROVIDER)).resolves.toBe(true);

    configs.wechatSilentLoginStatus = '1';
    configs.wechatOfficialToken = '';
    await expect(registry.isProviderUsable(WECHAT_OFFICIAL_PROVIDER)).resolves.toBe(true);

    configs.siteUrl = '';
    await expect(registry.isProviderUsable(WECHAT_OFFICIAL_PROVIDER)).resolves.toBe(false);
  });
});
