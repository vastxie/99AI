import { ChatPreflightService } from './chat-preflight.service';
import { ChatSubmissionService } from './chat-submission.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const CONVERSATION_GID = 'g_0123456789abcdefghijklmn';
const SUBMISSION_ID = 'sub_preflight_0123456789';

const webUser = { id: 7, role: 'user' };
const visitorUser = { id: 'visitor-fingerprint-1', role: 'visitor' };

function createService(overrides: Record<string, any> = {}) {
  const chatGroupService = {
    resolveGroupByGidForUser: jest.fn(async (gid: string) => ({
      id: 31,
      gid,
    })),
    resolveExternalConversation: jest.fn(async () => ({
      id: 32,
      gid: 'g_abcdefghijklmnopqrstuvwx',
    })),
    ...(overrides.chatGroupService || {}),
  };
  const chatLogService = {
    checkModelLimits: jest.fn().mockResolvedValue(false),
    ...(overrides.chatLogService || {}),
  };
  const userService = {
    checkUserStatus: jest.fn().mockResolvedValue(true),
    getUserById: jest.fn(),
    recordContentViolation: jest.fn().mockResolvedValue(undefined),
    ...(overrides.userService || {}),
  };
  const billing = {
    assertTurnAllowed: jest.fn().mockResolvedValue(undefined),
    ...(overrides.billing || {}),
  };
  const contentFilter = {
    check: jest.fn().mockResolvedValue(null),
    ...(overrides.contentFilter || {}),
  };
  // 与真实 getConfigs 一致：单个键直接返回值，多个键返回对象
  const configValues: Record<string, unknown> = { systemPreMessage: '', ...(overrides.config || {}) };
  const globalConfigService = {
    getConfigs: jest.fn(async (keys: string[]) =>
      keys.length === 1
        ? configValues[keys[0]]
        : Object.fromEntries(keys.map(key => [key, configValues[key]])),
    ),
    ...(overrides.globalConfigService || {}),
  };
  const model = {
    id: 5,
    model: 'gpt-test',
    modelName: 'GPT Test',
    multimodalTypes: [] as string[],
    additionalParams: {},
    systemPromptType: 0,
    systemPrompt: '',
  };
  const modelsService = {
    getCurrentModelKeyInfo: jest.fn().mockResolvedValue(model),
    findById: jest.fn().mockResolvedValue(model),
    getBaseConfig: jest.fn().mockResolvedValue({ modelInfo: model }),
    resolveModelGatewayConfig: jest.fn().mockReturnValue({
      apiKey: 'synthetic-key',
      baseUrl: 'https://example.invalid',
      capabilities: {},
    }),
    ...(overrides.modelsService || {}),
  };
  const redisClient = {
    eval: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
    ...(overrides.redisClient || {}),
  };
  const service = new ChatPreflightService(
    chatLogService as any,
    userService as any,
    billing as any,
    contentFilter as any,
    globalConfigService as any,
    modelsService as any,
    new ChatSubmissionService(),
    redisClient as any,
    chatGroupService as any,
  );
  return {
    service,
    chatGroupService,
    chatLogService,
    userService,
    billing,
    contentFilter,
    globalConfigService,
    modelsService,
    redisClient,
  };
}

function webBody(overrides: Record<string, any> = {}) {
  return {
    prompt: 'hello',
    submissionId: SUBMISSION_ID,
    gid: CONVERSATION_GID,
    ...overrides,
  };
}

describe('ChatPreflightService admission', () => {
  it('admits non-web submissions through external conversation resolution', async () => {
    const { service, chatGroupService } = createService();

    await expect(
      service.prepareAdmission({ prompt: 'hello' }, webUser, 'demo_bot'),
    ).resolves.toMatchObject({
      chatChannel: 'demo_bot',
      submissionFingerprint: null,
      chatGroupId: 32,
      conversationGid: 'g_abcdefghijklmnopqrstuvwx',
    });
    expect(chatGroupService.resolveExternalConversation).toHaveBeenCalledWith(webUser, 'demo_bot');
  });

  it('accepts a well-formed turn to replace and rejects anything else', async () => {
    const { service } = createService();

    await expect(
      service.prepareAdmission(
        webBody({ replaceFromCid: 'c_0123456789abcdefghij' }),
        webUser,
        'web',
      ),
    ).resolves.toMatchObject({ body: { replaceFromCid: 'c_0123456789abcdefghij' } });
    for (const replaceFromCid of ['g_0123456789abcdefghij', 'c_short', 42]) {
      await expect(
        service.prepareAdmission(webBody({ replaceFromCid }), webUser, 'web'),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('admits visitor submissions on the web channel', async () => {
    const { service } = createService();

    await expect(service.prepareAdmission(webBody(), visitorUser, 'web')).resolves.toMatchObject({
      visitorId: 'visitor-fingerprint-1',
      chatUserId: null,
      conversationGid: CONVERSATION_GID,
    });
  });

  it('uses one stable submission identity for visitor IP and billing preflight retries', async () => {
    const { service, redisClient, billing, contentFilter } = createService();
    const admission = await service.prepareAdmission(
      webBody({ model: 'gpt-test', __clientIp: '203.0.113.9' }),
      visitorUser,
      'web',
    );

    await expect(service.prepareExecution(admission, { emit: jest.fn() } as any)).resolves.toEqual(
      expect.objectContaining({ useModel: 'gpt-test' }),
    );
    await expect(service.prepareExecution(admission, { emit: jest.fn() } as any)).resolves.toEqual(
      expect.objectContaining({ useModel: 'gpt-test' }),
    );

    expect(redisClient.eval).toHaveBeenCalledTimes(2);
    expect(redisClient.eval.mock.calls[0][0]).toContain("redis.call('GET', KEYS[2])");
    expect(redisClient.eval.mock.calls[0][0]).toContain("redis.call('INCR', KEYS[1])");
    expect(redisClient.eval.mock.calls[0][1]).toEqual(redisClient.eval.mock.calls[1][1]);
    const idempotencyKey = billing.assertTurnAllowed.mock.calls[0][0].idempotencyKey;
    expect(idempotencyKey).toMatch(/^[a-f0-9]{64}$/u);
    expect(billing.assertTurnAllowed.mock.calls[1][0].idempotencyKey).toBe(idempotencyKey);
    expect(contentFilter.check.mock.calls[0][0].idempotencyKey).toBe(idempotencyKey);
    expect(contentFilter.check.mock.calls[1][0].idempotencyKey).toBe(idempotencyKey);
  });

  it('does not duplicate the user violation count when the filter handled it transactionally', async () => {
    const { service, contentFilter, userService } = createService({
      contentFilter: {
        check: jest.fn().mockResolvedValue({
          words: ['synthetic-risk'],
          violationCounted: true,
        }),
      },
    });
    const admission = await service.prepareAdmission(webBody(), webUser, 'web');

    const refusal = service.prepareExecution(admission, { emit: jest.fn() } as any);
    await expect(refusal).rejects.toMatchObject({ status: 400 });
    // 带错误码：前端按码识别内容违规，不按文案猜
    await expect(refusal.catch(error => error.getResponse())).resolves.toMatchObject({
      code: 'CONTENT_VIOLATION',
    });

    expect(contentFilter.check.mock.calls[0][0].idempotencyKey).toMatch(/^[a-f0-9]{64}$/u);
    expect(userService.recordContentViolation).not.toHaveBeenCalled();
  });

  it('keeps the core violation-count fallback for filter implementations that do not count', async () => {
    const { service, userService } = createService({
      contentFilter: {
        check: jest.fn().mockResolvedValue({ words: ['synthetic-risk'] }),
      },
    });
    const admission = await service.prepareAdmission(webBody(), webUser, 'web');

    await expect(
      service.prepareExecution(admission, { emit: jest.fn() } as any),
    ).rejects.toMatchObject({
      status: 400,
    });

    expect(userService.recordContentViolation).toHaveBeenCalledWith(webUser.id);
  });
});

describe('ChatPreflightService model resolution', () => {
  const defaultModel = {
    id: 9,
    model: 'default-model',
    modelName: 'Default Model',
    multimodalTypes: [] as string[],
    additionalParams: {},
    systemPromptType: 0,
    systemPrompt: '',
  };

  it('falls back to the default model without an id lookup when the body names no model', async () => {
    const { service, modelsService } = createService({
      modelsService: {
        getCurrentModelKeyInfo: jest.fn(async (model: string) =>
          model === 'default-model' ? defaultModel : null,
        ),
        getBaseConfig: jest.fn().mockResolvedValue({ modelInfo: defaultModel }),
      },
    });
    const admission = await service.prepareAdmission(webBody(), webUser, 'web');

    await expect(service.prepareExecution(admission, { emit: jest.fn() } as any)).resolves.toEqual(
      expect.objectContaining({ useModel: 'default-model', keyId: 9 }),
    );

    expect(modelsService.findById).not.toHaveBeenCalled();
    expect(modelsService.getBaseConfig).toHaveBeenCalledTimes(1);
    expect(modelsService.getCurrentModelKeyInfo).toHaveBeenCalledWith('default-model');
  });

  it('prefixes the global system prompt and sends no temperature of its own', async () => {
    const { service } = createService({ config: { systemPreMessage: '全局要求。' } });
    const admission = await service.prepareAdmission(webBody({ modelId: 5 }), webUser, 'web');

    const prepared = await service.prepareExecution(admission, { emit: jest.fn() } as any);

    expect(prepared?.setSystemMessage.startsWith('全局要求。')).toBe(true);
    expect(prepared).not.toHaveProperty('temperature');
  });

  it('still resolves an explicit modelId through findById', async () => {
    const { service, modelsService } = createService();
    const admission = await service.prepareAdmission(webBody({ modelId: 5 }), webUser, 'web');

    await expect(service.prepareExecution(admission, { emit: jest.fn() } as any)).resolves.toEqual(
      expect.objectContaining({ useModel: 'gpt-test', keyId: 5 }),
    );

    expect(modelsService.findById).toHaveBeenCalledTimes(1);
    expect(modelsService.findById).toHaveBeenCalledWith(5);
    expect(modelsService.getBaseConfig).not.toHaveBeenCalled();
  });

  it('still resolves an explicit model name without an id lookup', async () => {
    const { service, modelsService } = createService();
    const admission = await service.prepareAdmission(
      webBody({ model: 'gpt-test' }),
      webUser,
      'web',
    );

    await expect(service.prepareExecution(admission, { emit: jest.fn() } as any)).resolves.toEqual(
      expect.objectContaining({ useModel: 'gpt-test', keyId: 5 }),
    );

    expect(modelsService.getCurrentModelKeyInfo).toHaveBeenCalledWith('gpt-test');
    expect(modelsService.findById).not.toHaveBeenCalled();
    expect(modelsService.getBaseConfig).not.toHaveBeenCalled();
  });
});
