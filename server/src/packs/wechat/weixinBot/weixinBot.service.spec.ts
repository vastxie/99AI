import { Logger } from '@nestjs/common';
import { BotChannel } from '../bot/bot-channel.config';
import { WeixinBotService } from './weixinBot.service';
import { WeixinCrypto } from './utils/weixin-crypto';
import { downloadAndDecryptMedia } from './utils/weixin-media';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('./utils/weixin-media', () => {
  const actual = jest.requireActual('./utils/weixin-media');
  return {
    ...actual,
    downloadAndDecryptMedia: jest.fn(),
  };
});

const mockApiClient = {
  getBotQrCode: jest.fn(),
  getQrCodeStatus: jest.fn(),
  getUpdates: jest.fn(),
  getConfig: jest.fn(),
  sendMessage: jest.fn(),
};

jest.mock('./utils/weixin-api-client', () => ({
  WeixinApiClient: jest.fn().mockImplementation(() => mockApiClient),
}));

const waitingSession = {
  status: 'waiting',
  userId: 7,
  qrData: 'data:image/png;base64,AA==',
  qrcode: 'qr-credential',
  createdAt: 1_700_000_000_000,
};

function createBindService(
  overrides: {
    redis?: Record<string, any>;
    channelManager?: Record<string, any>;
    /** weixinBotStatus：默认开启 */
    featureStatus?: string;
    userEntity?: Record<string, any>;
    modelsService?: Record<string, any>;
  } = {},
) {
  // 发起对话的真实路径：查用户 → 取渠道模型 → chatService.chatProcess
  const userEntity = {
    findOne: jest.fn().mockResolvedValue({ id: 7, role: 'viewer', status: 1 }),
    ...(overrides.userEntity || {}),
  };
  const modelInfo = { id: 9, model: 'm', modelName: 'M' };
  const modelsService = {
    getBaseConfig: jest.fn().mockResolvedValue({ modelInfo }),
    getConfigByModelId: jest.fn().mockResolvedValue({ modelInfo }),
    ...(overrides.modelsService || {}),
  };
  const chatService = { chatProcess: jest.fn().mockResolvedValue(undefined) };
  const redis = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    ...(overrides.redis || {}),
  };
  const channelManager = {
    getChannelStatus: jest.fn().mockResolvedValue(null),
    bindChannel: jest.fn().mockResolvedValue({ id: 1 }),
    checkMessageDup: jest.fn().mockResolvedValue(false),
    getSyncState: jest.fn().mockResolvedValue(undefined),
    updateSyncState: jest.fn().mockResolvedValue(undefined),
    updateContextToken: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    ...(overrides.channelManager || {}),
  };
  const globalConfigService = {
    getConfigs: jest.fn().mockResolvedValue(overrides.featureStatus ?? '1'),
  };
  const configRegistry = { register: jest.fn() };
  const service = new WeixinBotService(
    userEntity as any,
    chatService as any,
    globalConfigService as any,
    modelsService as any,
    redis as any,
    channelManager as any,
    { register: jest.fn() } as any,
    {} as any,
    {} as any,
    configRegistry as any,
  );
  return {
    service,
    redis,
    channelManager,
    globalConfigService,
    configRegistry,
    chatService,
    userEntity,
  };
}

function resetApiClientMock() {
  for (const fn of Object.values(mockApiClient)) {
    fn.mockReset();
  }
  mockApiClient.getConfig.mockResolvedValue({});
}

describe('WeixinBotService inbound media FileAsset storage', () => {
  let fileAssetService: any;
  let service: WeixinBotService;

  beforeEach(() => {
    jest.clearAllMocks();
    fileAssetService = {
      createFromBuffer: jest.fn().mockResolvedValue({
        fileId: 'file_1234567890abcdefABCDEF12',
        name: 'wechat-image.png',
        mime: 'image/png',
        size: 4,
        previewUrl: '/api/files/file_1234567890abcdefABCDEF12/preview',
        downloadUrl: '/api/files/file_1234567890abcdefABCDEF12/download',
      }),
    };
    service = new WeixinBotService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { register: jest.fn() } as any,
      {} as any,
      fileAssetService,
      { register: jest.fn() } as any,
    );
  });

  it('stores inbound image media as a private FileAsset and returns safe file metadata', async () => {
    (downloadAndDecryptMedia as any).mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const media = await (service as any).downloadAndSaveMedia(
      7,
      {
        encrypt_query_param: 'encrypted-param',
        aes_key: '0123456789abcdef0123456789abcdef',
        full_url: 'https://wechat.example/media',
      },
      'image',
      'wechat-image.png',
    );

    expect(downloadAndDecryptMedia).toHaveBeenCalledWith(
      'encrypted-param',
      '0123456789abcdef0123456789abcdef',
      'https://wechat.example/media',
    );
    expect(fileAssetService.createFromBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        name: 'wechat-image.png',
        userId: 7,
        origin: 'weixin_bot',
        category: 'media',
        purpose: 'chat_image',
        visibility: 'private',
        allowPreview: true,
        allowDownload: true,
      }),
    );
    expect(media).toEqual(
      expect.objectContaining({
        type: 'image',
        fileId: 'file_1234567890abcdefABCDEF12',
        url: '/api/files/file_1234567890abcdefABCDEF12/preview',
        previewUrl: '/api/files/file_1234567890abcdefABCDEF12/preview',
        downloadUrl: '/api/files/file_1234567890abcdefABCDEF12/download',
      }),
    );
  });
});

describe('WeixinBotService bind session credentials', () => {
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    resetApiClientMock();
    logSpy = jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    errorSpy = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('rejects a QR code response without the polling credential instead of creating a dead session', async () => {
    const { service, redis } = createBindService();
    mockApiClient.getBotQrCode.mockResolvedValue({
      qrcode_img_content: 'https://weixin.example/qr',
    });

    await expect(service.getBindQrCode(7)).rejects.toMatchObject({
      status: 500,
      message: '获取微信二维码失败，请稍后再试',
    });

    expect(redis.set).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('qrcode'),
      expect.anything(),
      'WeixinBotService',
    );
  });

  it('stores the polling credential in the bind session when WeChat returns it', async () => {
    const { service, redis } = createBindService();
    mockApiClient.getBotQrCode.mockResolvedValue({
      qrcode: 'qr-credential',
      qrcode_img_content: 'https://weixin.example/qr',
    });

    const result = await service.getBindQrCode(7);

    expect(result.qrData).toMatch(/^data:image\/png;base64,/);
    expect(result.sessionId).toMatch(/^bind_7_/);
    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, raw, options] = redis.set.mock.calls[0];
    expect(key).toBe(`weixin:bind:${result.sessionId}`);
    expect(JSON.parse(raw)).toEqual({
      status: 'waiting',
      userId: 7,
      qrData: result.qrData,
      qrcode: 'qr-credential',
      createdAt: expect.any(Number),
    });
    expect(options).toEqual({ EX: 300 });
  });

  it('fails fast when a bind session has no polling credential', async () => {
    const { service, redis } = createBindService();
    redis.get.mockResolvedValue(JSON.stringify({ ...waitingSession, qrcode: undefined }));

    await expect(service.pollBindStatus(7, 'bind_7_session')).rejects.toMatchObject({
      status: 400,
      message: '绑定会话缺少二维码凭据，请重新获取二维码',
    });

    expect(mockApiClient.getQrCodeStatus).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('does not mark the session confirmed when WeChat confirms without a bot token', async () => {
    const { service, redis } = createBindService();
    redis.get.mockResolvedValue(JSON.stringify(waitingSession));
    mockApiClient.getQrCodeStatus.mockResolvedValue({
      status: 'confirmed',
      ilink_user_id: 'wx_user_1',
    });

    await expect(service.pollBindStatus(7, 'bind_7_session')).rejects.toMatchObject({
      status: 502,
      message: '微信未返回 Bot 凭据，请重新获取二维码',
    });

    expect(mockApiClient.getQrCodeStatus).toHaveBeenCalledWith('qr-credential');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('stores the bot token when WeChat confirms the scan', async () => {
    const { service, redis } = createBindService();
    redis.get.mockResolvedValue(JSON.stringify(waitingSession));
    mockApiClient.getQrCodeStatus.mockResolvedValue({
      status: 'confirmed',
      bot_token: 'bot-token-1',
      baseurl: 'https://ilinkai.weixin.qq.com',
      ilink_user_id: 'wx_user_1',
    });

    await expect(service.pollBindStatus(7, 'bind_7_session')).resolves.toEqual({
      status: 'confirmed',
      userId: 7,
      qrData: waitingSession.qrData,
      createdAt: waitingSession.createdAt,
    });

    expect(redis.set).toHaveBeenCalledWith('weixin:bind:bind_7_session', expect.any(String), {
      EX: 300,
    });
    expect(JSON.parse(redis.set.mock.calls[0][1])).toMatchObject({
      status: 'confirmed',
      botToken: 'bot-token-1',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      weixinUserId: 'wx_user_1',
    });
  });

  it('keeps treating transient polling errors as still waiting', async () => {
    const { service, redis } = createBindService();
    redis.get.mockResolvedValue(JSON.stringify(waitingSession));
    mockApiClient.getQrCodeStatus.mockRejectedValue(new Error('timeout'));

    await expect(service.pollBindStatus(7, 'bind_7_session')).resolves.toMatchObject({
      status: 'waiting',
    });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('refuses to bind when the confirmed session lost its bot token', async () => {
    const { service, redis, channelManager } = createBindService();
    redis.get.mockResolvedValue(
      JSON.stringify({
        ...waitingSession,
        status: 'confirmed',
        baseUrl: 'https://ilinkai.weixin.qq.com',
        weixinUserId: 'wx_user_1',
      }),
    );
    const encryptSpy = jest.spyOn(WeixinCrypto, 'encrypt').mockResolvedValue('encrypted-bot-token');

    await expect(service.confirmBind(7, 'bind_7_session')).rejects.toMatchObject({
      status: 400,
      message: '绑定会话缺少微信 Bot 凭据，请重新扫码绑定',
    });

    expect(encryptSpy).not.toHaveBeenCalled();
    expect(channelManager.bindChannel).not.toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('weixin:bind:lock:bind_7_session');
    expect(redis.del).not.toHaveBeenCalledWith('weixin:bind:bind_7_session');
    encryptSpy.mockRestore();
  });

  it('binds the channel with the encrypted bot token from a complete session', async () => {
    const { service, redis, channelManager } = createBindService();
    redis.get.mockResolvedValue(
      JSON.stringify({
        ...waitingSession,
        status: 'confirmed',
        botToken: 'bot-token-1',
        baseUrl: 'https://ilinkai.weixin.qq.com',
        weixinUserId: 'wx_user_1',
      }),
    );
    const encryptSpy = jest.spyOn(WeixinCrypto, 'encrypt').mockResolvedValue('encrypted-bot-token');
    const startPolling = jest.spyOn(service as any, 'startPolling').mockResolvedValue(undefined);

    await expect(service.confirmBind(7, 'bind_7_session')).resolves.toBeUndefined();

    expect(encryptSpy).toHaveBeenCalledWith('bot-token-1', redis);
    expect(channelManager.bindChannel).toHaveBeenCalledWith(7, BotChannel.WEIXIN, {
      accessToken: 'encrypted-bot-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      channelUserId: 'wx_user_1',
    });
    expect(redis.del).toHaveBeenCalledWith('weixin:bind:bind_7_session');
    expect(redis.del).toHaveBeenCalledWith('weixin:bind:lock:bind_7_session');
    expect(startPolling).toHaveBeenCalledWith(7);
    encryptSpy.mockRestore();
  });
});

describe('WeixinBotService inbound message identity', () => {
  let logSpy: any;

  const flushPromises = () => new Promise(resolve => setImmediate(resolve));

  beforeEach(() => {
    jest.clearAllMocks();
    resetApiClientMock();
    logSpy = jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('delivers polled messages without message_id instead of deduping them as undefined', async () => {
    const { service } = createBindService({
      channelManager: {
        getChannelStatus: jest
          .fn()
          .mockResolvedValue({ accessToken: 'encrypted-bot-token', baseUrl: null }),
      },
    });
    const decryptSpy = jest.spyOn(WeixinCrypto, 'decrypt').mockResolvedValue('bot-token-1');
    const handled: any[] = [];
    (service as any).handleIncomingMessage = jest.fn(async (_userId: number, msg: any) => {
      handled.push(msg);
    });
    let releaseSecondPoll: (value: any) => void = () => undefined;
    mockApiClient.getUpdates
      .mockResolvedValueOnce({
        ret: 0,
        msgs: [
          { message_type: 1, from_user_id: 'wx_user_1' },
          { message_type: 1, from_user_id: 'wx_user_1' },
          { message_id: 11, message_type: 1, from_user_id: 'wx_user_1' },
          { message_id: 11, message_type: 1, from_user_id: 'wx_user_1' },
          { message_id: 12, message_type: 2, from_user_id: 'wx_user_1' },
        ],
      })
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseSecondPoll = resolve;
          }),
      );

    await (service as any).startPolling(7);
    await flushPromises();
    await flushPromises();

    expect(handled.map(msg => msg.message_id)).toEqual([undefined, undefined, 11]);
    expect(mockApiClient.getUpdates).toHaveBeenCalledTimes(2);

    (service as any).stopPolling(7);
    releaseSecondPoll({ ret: 0, msgs: [] });
    await flushPromises();
    decryptSpy.mockRestore();
  });

  it('skips the Redis dedup key and channelMessageId for messages without message_id', async () => {
    const { service, channelManager } = createBindService();
    const invoke = jest.spyOn(service as any, 'invokeChatProcess').mockResolvedValue(undefined);

    await (service as any).handleIncomingMessage(
      7,
      {
        message_type: 1,
        from_user_id: 'wx_user_1',
        item_list: [{ type: 1, text_item: { text: 'hello' } }],
      },
      mockApiClient,
    );

    expect(channelManager.checkMessageDup).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      7,
      'hello',
      expect.anything(),
      [],
      undefined,
      expect.any(Function),
    );
  });

  it('keeps deduping messages that carry a message_id through Redis and channelMessageId', async () => {
    const { service, channelManager } = createBindService();
    channelManager.checkMessageDup.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const invoke = jest.spyOn(service as any, 'invokeChatProcess').mockResolvedValue(undefined);
    const message = {
      message_id: 11,
      message_type: 1,
      from_user_id: 'wx_user_1',
      item_list: [{ type: 1, text_item: { text: 'hello' } }],
    };

    await (service as any).handleIncomingMessage(7, message, mockApiClient);
    await (service as any).handleIncomingMessage(7, message, mockApiClient);

    expect(channelManager.checkMessageDup).toHaveBeenCalledTimes(2);
    expect(channelManager.checkMessageDup).toHaveBeenCalledWith(BotChannel.WEIXIN, '11');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      7,
      'hello',
      expect.anything(),
      [],
      '11',
      expect.any(Function),
    );
  });
});

describe('WeixinBotService polling resilience and feature switch', () => {
  let logSpy: any;
  let warnSpy: any;
  let errorSpy: any;
  let unhandled: unknown[];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  const flushPromises = () => new Promise(resolve => setImmediate(resolve));

  function boundService(overrides: Parameters<typeof createBindService>[0] = {}) {
    const created = createBindService({
      ...overrides,
      channelManager: {
        getChannelStatus: jest
          .fn()
          .mockResolvedValue({ accessToken: 'encrypted-bot-token', baseUrl: null }),
        ...(overrides.channelManager || {}),
      },
    });
    jest.spyOn(WeixinCrypto, 'decrypt').mockResolvedValue('bot-token-1');
    return created;
  }

  /** 第一次轮询返回给定结果，之后挂起，便于在一轮之后检查状态 */
  function pollOnceThenHang(first: any) {
    let release: (value: any) => void = () => undefined;
    mockApiClient.getUpdates.mockImplementationOnce(first).mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );
    return () => release({ ret: 0, msgs: [] });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    resetApiClientMock();
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
    logSpy = jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    warnSpy = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    errorSpy = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('keeps polling and delivers the batch when saving the sync cursor fails', async () => {
    const { service } = boundService({
      channelManager: {
        updateSyncState: jest.fn().mockRejectedValue(new Error('db connection lost')),
      },
    });
    const handled: any[] = [];
    (service as any).handleIncomingMessage = jest.fn(async (_userId: number, msg: any) => {
      handled.push(msg);
    });
    const release = pollOnceThenHang(async () => ({
      ret: 0,
      get_updates_buf: 'buf-1',
      msgs: [{ message_id: 21, message_type: 1, from_user_id: 'wx_user_1' }],
    }));

    await (service as any).startPolling(7);
    for (let i = 0; i < 5; i += 1) await flushPromises();

    // 游标落库失败只记警告：本批消息照常投递，轮询继续，进程不会因未处理的拒绝退出
    expect(handled.map(msg => msg.message_id)).toEqual([21]);
    expect(mockApiClient.getUpdates).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('游标保存失败'), 'PollingTask');
    expect(unhandled).toEqual([]);

    (service as any).stopPolling(7);
    release();
    await flushPromises();
  });

  it('contains a failing session-expired handler instead of crashing the process', async () => {
    const { service } = boundService({
      channelManager: {
        updateStatus: jest.fn().mockRejectedValue(new Error('redis down')),
      },
    });
    mockApiClient.getUpdates.mockRejectedValueOnce({
      response: { data: { errcode: -14 } },
      message: 'session expired',
    });

    await (service as any).startPolling(7);
    for (let i = 0; i < 5; i += 1) await flushPromises();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('会话过期处理失败'),
      expect.anything(),
      'PollingTask',
    );
    expect(unhandled).toEqual([]);
  });

  it('does not deliver a poll response that arrives after polling stopped', async () => {
    const { service } = boundService();
    const handled: any[] = [];
    (service as any).handleIncomingMessage = jest.fn(async (_userId: number, msg: any) => {
      handled.push(msg);
    });
    let resolveFirst: (value: any) => void = () => undefined;
    mockApiClient.getUpdates.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFirst = resolve;
        }),
    );

    await (service as any).startPolling(7);
    (service as any).stopPolling(7);
    resolveFirst({
      ret: 0,
      msgs: [{ message_id: 31, message_type: 1, from_user_id: 'wx_user_1' }],
    });
    for (let i = 0; i < 3; i += 1) await flushPromises();

    expect(handled).toEqual([]);
  });

  it('refuses to bind and does not start polling while the feature is off', async () => {
    const { service } = boundService({ featureStatus: '0' });

    await expect(service.getBindQrCode(7)).rejects.toMatchObject({ status: 403 });
    await expect(service.confirmBind(7, 'bind_7_session')).rejects.toMatchObject({ status: 403 });
    await (service as any).startPolling(7);

    expect((service as any).pollingTasks.size).toBe(0);
    expect(mockApiClient.getUpdates).not.toHaveBeenCalled();
  });

  it('abandons a start that is still in flight when polling is stopped', async () => {
    let releaseSyncState: (value: any) => void = () => undefined;
    const { service } = boundService({
      channelManager: {
        getSyncState: jest.fn(
          () =>
            new Promise(resolve => {
              releaseSyncState = resolve;
            }),
        ),
      },
    });

    const starting = (service as any).startPolling(7);
    await flushPromises();
    // 启动途中解绑 / 关闭：停止让这次启动作废
    (service as any).stopPolling(7);
    releaseSyncState(undefined);
    await starting;

    expect((service as any).pollingTasks.size).toBe(0);
    expect(mockApiClient.getUpdates).not.toHaveBeenCalled();
  });

  /** 处理到保存上下文时挂起，便于在发起对话之前关闭 / 重启 */
  function holdAtContextSave() {
    const hold = { release: () => undefined as void };
    const updateContextToken = jest.fn(
      () =>
        new Promise<void>(resolve => {
          hold.release = resolve;
        }),
    );
    return { hold, updateContextToken };
  }

  const textMessage = (id: number) => ({
    message_id: id,
    message_type: 1,
    from_user_id: 'wx_user_1',
    context_token: `ctx-${id}`,
    item_list: [{ type: 1, text_item: { text: '你好' } }],
  });

  it('does not start a conversation when the bot is turned off while a message is being prepared', async () => {
    const { hold, updateContextToken } = holdAtContextSave();
    const { service, globalConfigService, configRegistry, chatService } = boundService({
      channelManager: { updateContextToken },
    });
    pollOnceThenHang(() => new Promise(() => undefined));
    await (service as any).startPolling(7);

    const handling = (service as any).handleIncomingMessage(
      7,
      textMessage(41),
      mockApiClient,
      (service as any).pollingGenerations.get(7),
    );
    for (let i = 0; i < 3; i += 1) await flushPromises();
    expect(updateContextToken).toHaveBeenCalledTimes(1);
    globalConfigService.getConfigs.mockResolvedValue('0');
    await configRegistry.register.mock.calls[0][0].onChanged(['weixinBotStatus']);
    hold.release();
    await handling;

    expect(chatService.chatProcess).not.toHaveBeenCalled();
  });

  it('does not start a conversation when the bot is turned off while the user and model are looked up', async () => {
    let releaseUser: (value: any) => void = () => undefined;
    const { service, globalConfigService, configRegistry, chatService } = boundService({
      userEntity: {
        findOne: jest.fn(
          () =>
            new Promise(resolve => {
              releaseUser = resolve;
            }),
        ),
      },
    });
    pollOnceThenHang(() => new Promise(() => undefined));
    await (service as any).startPolling(7);

    const handling = (service as any).handleIncomingMessage(
      7,
      textMessage(44),
      mockApiClient,
      (service as any).pollingGenerations.get(7),
    );
    for (let i = 0; i < 5; i += 1) await flushPromises();
    globalConfigService.getConfigs.mockResolvedValue('0');
    await configRegistry.register.mock.calls[0][0].onChanged(['weixinBotStatus']);
    releaseUser({ id: 7, role: 'viewer', status: 1 });
    await handling;

    expect(chatService.chatProcess).not.toHaveBeenCalled();
  });

  it('drops a message prepared before a restart even though the bot is back on', async () => {
    const { hold, updateContextToken } = holdAtContextSave();
    const { service, chatService } = boundService({ channelManager: { updateContextToken } });
    pollOnceThenHang(() => new Promise(() => undefined));
    await (service as any).startPolling(7);

    const handling = (service as any).handleIncomingMessage(
      7,
      textMessage(42),
      mockApiClient,
      (service as any).pollingGenerations.get(7),
    );
    for (let i = 0; i < 3; i += 1) await flushPromises();
    // 关闭后立即重新开启：开关是开的，但已经是新的一次轮询
    (service as any).stopPolling(7);
    await (service as any).startPolling(7);
    hold.release();
    await handling;
    expect(chatService.chatProcess).not.toHaveBeenCalled();

    // 新一次轮询收到的消息照常处理
    updateContextToken.mockResolvedValue(undefined);
    await (service as any).handleIncomingMessage(
      7,
      textMessage(43),
      mockApiClient,
      (service as any).pollingGenerations.get(7),
    );
    expect(chatService.chatProcess).toHaveBeenCalledTimes(1);
  });

  it('does not deliver cached media when the bot is turned off before the delivery starts a conversation', async () => {
    const { hold, updateContextToken } = holdAtContextSave();
    const { service, globalConfigService, configRegistry, chatService } = boundService({
      channelManager: { updateContextToken },
    });
    pollOnceThenHang(() => new Promise(() => undefined));
    await (service as any).startPolling(7);

    (service as any).cacheMediaItems(
      7,
      [{ type: 'image', url: '/x' }],
      'ctx-media',
      'wx_user_1',
      (service as any).pollingGenerations.get(7),
    );
    (service as any).flushPendingMedia(7);
    for (let i = 0; i < 3; i += 1) await flushPromises();
    expect(updateContextToken).toHaveBeenCalledTimes(1);
    globalConfigService.getConfigs.mockResolvedValue('0');
    await configRegistry.register.mock.calls[0][0].onChanged(['weixinBotStatus']);
    hold.release();
    for (let i = 0; i < 3; i += 1) await flushPromises();

    expect(chatService.chatProcess).not.toHaveBeenCalled();
  });

  it("keeps the new session's media cache when an old text-and-image message finishes downloading", async () => {
    const { service, channelManager, chatService } = boundService();
    let finishDownload: (value: any) => void = () => undefined;
    (service as any).downloadAndSaveMedia = jest.fn(
      () =>
        new Promise(resolve => {
          finishDownload = resolve;
        }),
    );
    pollOnceThenHang(() => new Promise(() => undefined));
    await (service as any).startPolling(7);

    const handling = (service as any).handleIncomingMessage(
      7,
      {
        message_id: 46,
        message_type: 1,
        from_user_id: 'wx_user_1',
        context_token: 'ctx-old',
        item_list: [
          { type: 1, text_item: { text: '看看这张' } },
          { type: 2, image_item: { media: { encrypt_query_param: 'p' } } },
        ],
      },
      mockApiClient,
      (service as any).pollingGenerations.get(7),
    );
    for (let i = 0; i < 3; i += 1) await flushPromises();
    // 旧消息还在下载时重启；新一次轮询缓存了一张新图
    (service as any).stopPolling(7);
    await (service as any).startPolling(7);
    (service as any).cacheMediaItems(
      7,
      [{ type: 'image', url: '/new' }],
      'ctx-new',
      'wx_user_1',
      (service as any).pollingGenerations.get(7),
    );
    finishDownload({ type: 'image', url: '/old' });
    await handling;

    // 旧消息既不能清掉新缓存，也不能写回自己的上下文，更不能发起对话
    expect((service as any).pendingMedia.get(7)?.mediaItems).toEqual([
      { type: 'image', url: '/new' },
    ]);
    expect(channelManager.updateContextToken).not.toHaveBeenCalled();
    expect(chatService.chatProcess).not.toHaveBeenCalled();
    (service as any).clearPendingMedia(7);
  });

  it('does not cache media whose download finishes after a restart', async () => {
    const { service, chatService } = boundService();
    let finishDownload: (value: any) => void = () => undefined;
    (service as any).downloadAndSaveMedia = jest.fn(
      () =>
        new Promise(resolve => {
          finishDownload = resolve;
        }),
    );
    pollOnceThenHang(() => new Promise(() => undefined));
    await (service as any).startPolling(7);

    const handling = (service as any).handleIncomingMessage(
      7,
      {
        message_id: 45,
        message_type: 1,
        from_user_id: 'wx_user_1',
        context_token: 'ctx-45',
        item_list: [{ type: 2, image_item: { media: { encrypt_query_param: 'p' } } }],
      },
      mockApiClient,
      (service as any).pollingGenerations.get(7),
    );
    for (let i = 0; i < 3; i += 1) await flushPromises();
    (service as any).stopPolling(7);
    await (service as any).startPolling(7);
    finishDownload({ type: 'image', url: '/x' });
    await handling;

    // 旧的下载不进新一次轮询的缓存，之后也不会被投递
    expect((service as any).pendingMedia.has(7)).toBe(false);
    expect(chatService.chatProcess).not.toHaveBeenCalled();
  });

  it('stops every polling task when the switch is turned off and recovers bound users when it is turned on', async () => {
    const { service, configRegistry, globalConfigService } = boundService();
    const section = configRegistry.register.mock.calls[0][0];
    expect(section.name).toBe('weixin-bot-switch');
    pollOnceThenHang(() => new Promise(() => undefined));

    await (service as any).startPolling(7);
    expect((service as any).pollingTasks.size).toBe(1);

    globalConfigService.getConfigs.mockResolvedValue('0');
    await section.onChanged(['weixinBotStatus']);
    expect((service as any).pollingTasks.size).toBe(0);

    globalConfigService.getConfigs.mockResolvedValue('1');
    const recover = jest.spyOn(service, 'onModuleInit').mockResolvedValue(undefined);
    await section.onChanged(['weixinBotStatus']);
    expect(recover).toHaveBeenCalledTimes(1);

    // 其他配置变更不影响轮询
    await section.onChanged(['weixinBotModelId']);
    expect(recover).toHaveBeenCalledTimes(1);
  });
});
