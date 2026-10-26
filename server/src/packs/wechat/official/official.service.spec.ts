import axios from 'axios';
import { OfficialService } from './official.service';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('axios');

describe('OfficialService', () => {
  const mockedAxios = axios as any;

  const createService = () => {
    const globalConfigService = {
      getConfigs: jest.fn(),
    };
    const wechatToken = {
      getAccessToken: jest.fn(),
      getWechatUrl: jest.fn(),
    };
    const redisCacheService = {
      get: jest.fn(),
      getDel: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    const service = new OfficialService(
      globalConfigService as any,
      {} as any,
      {} as any,
      redisCacheService as any,
      wechatToken as any,
    );

    return { service, globalConfigService, redisCacheService, wechatToken };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('requires all WeChat callback signature fields', async () => {
    const { service, globalConfigService } = createService();
    globalConfigService.getConfigs.mockResolvedValue('wechat-token');

    await expect(service.verify('', 'nonce', 'timestamp')).resolves.toBe(false);
    await expect(service.verify('signature', '', 'timestamp')).resolves.toBe(false);
    await expect(service.verify('signature', 'nonce', '')).resolves.toBe(false);
  });

  it('verifies WeChat callback signature with constant-time comparison', async () => {
    const { service, globalConfigService } = createService();
    globalConfigService.getConfigs.mockResolvedValue('wechat-token');
    const signature = service.sha1(['wechat-token', 'nonce', 'timestamp'].sort().join(''));

    await expect(service.verify(signature, 'nonce', 'timestamp')).resolves.toBe(true);
    await expect(service.verify('bad-signature', 'nonce', 'timestamp')).resolves.toBe(false);
  });

  it('returns empty POST callback response when XML payload is missing', async () => {
    const { service } = createService();

    await expect(service.handleNotifyPostMessage({})).resolves.toBe('');
  });

  it('handles WeChat scan event callback messages', async () => {
    const { service } = createService();
    const isBindSceneSpy = jest.spyOn(service, 'isBindScene').mockResolvedValue(false);
    const scanSpy = jest.spyOn(service, 'scan').mockResolvedValue(undefined);
    const sendConfigMessageSpy = jest
      .spyOn(service, 'sendConfigMessage')
      .mockResolvedValue(undefined);

    const result = await service.handleNotifyPostMessage({
      xml: {
        MsgType: ['event'],
        Event: ['SCAN'],
        EventKey: ['login-scene'],
        FromUserName: ['wechat-openid'],
      },
    });

    expect(result).toBe('success');
    expect(isBindSceneSpy).toHaveBeenCalledWith('login-scene');
    expect(scanSpy).toHaveBeenCalledWith('wechat-openid', 'login-scene');
    expect(sendConfigMessageSpy).toHaveBeenCalledWith('wechat-openid', 'officialScanLoginText');
  });

  it('handles nested subscribe callback payloads for bind scenes', async () => {
    const { service } = createService();
    const isBindSceneSpy = jest.spyOn(service, 'isBindScene').mockResolvedValue(true);
    const scanBindWxSpy = jest.spyOn(service, 'scanBindWx').mockResolvedValue({
      status: false,
      msg: '绑定失败',
    });
    const sendConfigMessageSpy = jest
      .spyOn(service, 'sendConfigMessage')
      .mockResolvedValue(undefined);

    const result = await service.handleNotifyPostMessage({
      xml: {
        xml: [
          {
            msgtype: ['event'],
            event: ['subscribe'],
            eventkey: ['qrscene_bind-scene'],
            fromusername: ['wechat-openid'],
          },
        ],
      },
    });

    expect(result).toBe('success');
    expect(isBindSceneSpy).toHaveBeenCalledWith('bind-scene');
    expect(scanBindWxSpy).toHaveBeenCalledWith('wechat-openid', 'bind-scene');
    expect(sendConfigMessageSpy).toHaveBeenCalledWith(
      'wechat-openid',
      'officialBindAccountFailText',
    );
  });

  it('handles menu click callback messages with configured content', async () => {
    const { service } = createService();
    const getMenuContentSpy = jest
      .spyOn(service, 'getMenuContentByKey')
      .mockResolvedValue('菜单回复');
    const sendCustomerServiceMessageSpy = jest
      .spyOn(service, 'sendCustomerServiceMessage')
      .mockResolvedValue(undefined);

    const result = await service.handleNotifyPostMessage({
      xml: {
        MsgType: ['event'],
        Event: ['CLICK'],
        EventKey: ['help-menu'],
        FromUserName: ['wechat-openid'],
      },
    });

    expect(result).toBe('success');
    expect(getMenuContentSpy).toHaveBeenCalledWith('help-menu');
    expect(sendCustomerServiceMessageSpy).toHaveBeenCalledWith('wechat-openid', '菜单回复');
  });

  it('handles text callback messages with configured auto reply', async () => {
    const { service } = createService();
    const sendConfigMessageSpy = jest
      .spyOn(service, 'sendConfigMessage')
      .mockResolvedValue(undefined);

    const result = await service.handleNotifyPostMessage({
      xml: {
        MsgType: ['text'],
        Content: ['你好'],
        FromUserName: ['wechat-openid'],
      },
    });

    expect(result).toBe('success');
    expect(sendConfigMessageSpy).toHaveBeenCalledWith('wechat-openid', 'officialAutoReplyText');
  });

  it('generates text XML replies with swapped sender fields', async () => {
    const { service } = createService();

    const result = await service.genXmlMsg(
      {
        FromUserName: ['sender-openid'],
        ToUserName: ['official-account'],
      },
      '你好',
    );

    expect(result).toContain('<ToUserName><![CDATA[sender-openid]]></ToUserName>');
    expect(result).toContain('<FromUserName><![CDATA[official-account]]></FromUserName>');
    expect(result).toContain('<Content><![CDATA[你好]]></Content>');
  });

  it('rejects XML replies when sender fields are missing', async () => {
    const { service } = createService();

    await expect(service.genXmlMsg({ ToUserName: ['official-account'] }, '你好')).rejects.toThrow(
      '缺少必要的XML字段',
    );
  });

  it('does not fallback to openid-only identity when WeChat user info fetch fails', async () => {
    const { service, wechatToken } = createService();
    wechatToken.getAccessToken.mockResolvedValue('access-token');
    wechatToken.getWechatUrl.mockResolvedValue('https://api.weixin.qq.com');
    mockedAxios.get.mockRejectedValue(new Error('network error'));

    await expect(service.getUserInfoFromWechat('openid')).rejects.toThrow('获取微信用户信息失败');
  });

  it('creates a login scene with a dev placeholder QR code and reports pending until scanned', async () => {
    process.env.ISDEV = 'true';
    try {
      const { service, redisCacheService } = createService();
      redisCacheService.get.mockResolvedValue(null);
      redisCacheService.getDel.mockResolvedValue(null);

      const created = await service.createScene('login');

      expect(created.sceneId).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(created.qrUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(redisCacheService.set).toHaveBeenCalledWith(
        { key: `auth:wechat-official:scene:${created.sceneId}`, val: expect.any(String) },
        300,
      );
      const stored = JSON.parse(redisCacheService.set.mock.calls[0][0].val);
      expect(stored).toMatchObject({ scene: 'qr' });

      redisCacheService.get.mockResolvedValue(JSON.stringify(stored));
      await expect(service.pollScene(created.sceneId, 'login')).resolves.toEqual({
        status: 'pending',
      });
    } finally {
      delete process.env.ISDEV;
    }
  });

  it('confirms a login scene with the scanned user id and clears the scene', async () => {
    const { service, redisCacheService } = createService();
    redisCacheService.get.mockResolvedValue(JSON.stringify({ scene: 'qr', createdAt: Date.now() }));
    redisCacheService.getDel.mockResolvedValue(JSON.stringify({ userId: 42 }));

    await expect(service.pollScene('scene-123456789012345', 'login')).resolves.toEqual({
      status: 'confirmed',
      userId: 42,
    });
    expect(redisCacheService.del).toHaveBeenCalledWith({
      key: 'auth:wechat-official:scene:scene-123456789012345',
    });
  });

  it('reports expired scenes and rejects bind polling from another user', async () => {
    const { service, redisCacheService } = createService();
    redisCacheService.get.mockResolvedValueOnce(null);
    await expect(service.pollScene('missing-scene-1234567', 'login')).resolves.toEqual({
      status: 'expired',
    });

    redisCacheService.get.mockResolvedValueOnce(
      JSON.stringify({ scene: 'bind', userId: 7, createdAt: Date.now() }),
    );
    await expect(service.pollScene('bind-scene-1234567890', 'bind', 8)).rejects.toThrow('非法参数');
  });
});
