import { Logger } from '@nestjs/common';
import axios from 'axios';
import { WechatOfficialTokenService } from './wechat-official-token.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('axios');

describe('WechatOfficialTokenService', () => {
  const mockedAxios = axios as any;
  let configs: Record<string, string>;
  let service: WechatOfficialTokenService;

  beforeEach(() => {
    delete process.env.ISDEV;
    configs = { wechatOfficialAppId: 'app-id', wechatOfficialAppSecret: 'app-secret' };
    const globalConfigService = {
      getConfigs: jest.fn(async (keys: string[]) =>
        keys.length === 1
          ? configs[keys[0]]
          : Object.fromEntries(keys.map(key => [key, configs[key]])),
      ),
      getConfigWithFallback: jest.fn(
        async (configKey: string, _envKey: string, fallback: string) =>
          configs[configKey] || fallback,
      ),
    };
    service = new WechatOfficialTokenService(globalConfigService as any);
    jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('caches the stable token until shortly before it expires, then refreshes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-06T00:00:00Z'));
    mockedAxios.post
      .mockResolvedValueOnce({ data: { access_token: 'token-1', expires_in: 7200 } })
      .mockResolvedValueOnce({ data: { access_token: 'token-2', expires_in: 7200 } });

    await expect(service.getAccessToken()).resolves.toBe('token-1');
    await expect(service.getAccessToken()).resolves.toBe('token-1');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://api.weixin.qq.com/cgi-bin/stable_token',
    );

    jest.setSystemTime(new Date('2026-09-06T01:56:00Z')); // 7200s - 5min 之后
    await expect(service.getAccessToken()).resolves.toBe('token-2');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight refresh between concurrent callers', async () => {
    mockedAxios.post.mockResolvedValue({ data: { access_token: 'token', expires_in: 7200 } });

    const tokens = await Promise.all([service.getAccessToken(), service.getAccessToken()]);

    expect(tokens).toEqual(['token', 'token']);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('never sends the AppSecret in a URL, and retries after a failure', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-06T00:00:00Z'));
    mockedAxios.post
      .mockRejectedValueOnce(new Error('connect ECONNRESET https://api.weixin.qq.com?secret=x'))
      .mockResolvedValueOnce({ data: { errcode: 40164, errmsg: 'invalid ip' } })
      .mockResolvedValueOnce({ data: { access_token: 'token', expires_in: 7200 } });

    await expect(service.getAccessToken()).resolves.toBe('');
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({ secret: 'app-secret' });
    expect(JSON.stringify((Logger.error as any).mock.calls)).not.toContain('secret=x');

    // 失败后 1 分钟内不重试
    await expect(service.getAccessToken()).resolves.toBe('');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-09-06T00:01:01Z'));
    await expect(service.getAccessToken()).resolves.toBe('');
    jest.setSystemTime(new Date('2026-09-06T00:02:02Z'));
    await expect(service.getAccessToken()).resolves.toBe('token');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('returns an empty token without calling WeChat when the account is not configured', async () => {
    configs = {};

    await expect(service.getAccessToken()).resolves.toBe('');
    await service.refresh(true);

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(Logger.warn).toHaveBeenCalledWith(
      '未配置微信公众号 appId/secret，微信扫码登录功能暂不可用',
      'WechatOfficialTokenService',
    );
  });

  it('refetches after invalidate() even when the cached token is still fresh', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { access_token: 'token-1', expires_in: 7200 } })
      .mockResolvedValueOnce({ data: { access_token: 'token-2', expires_in: 7200 } });

    await expect(service.getAccessToken()).resolves.toBe('token-1');
    service.invalidate();
    await expect(service.getAccessToken()).resolves.toBe('token-2');
  });

  it('resolves WeChat URLs from config before the official default', async () => {
    configs.wechatApiUrl = 'https://proxy.example.com/';

    await expect(service.getWechatUrl('api')).resolves.toBe('https://proxy.example.com');
    await expect(service.getWechatUrl('mp')).resolves.toBe('https://mp.weixin.qq.com');
  });
});
