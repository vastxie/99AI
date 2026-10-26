import { Logger } from '@nestjs/common';
import { ModelsService } from './models.service';
import type { ModelGatewayProviderProfilePayload } from '../modelGateway/provider-profiles.types';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ModelsService Model Gateway config', () => {
  const createService = (
    overrides: { repository?: any; redisCacheService?: any; modelGatewayService?: any } = {},
  ) =>
    new ModelsService(
      (overrides.repository || {}) as any,
      (overrides.redisCacheService || { set: jest.fn(), get: jest.fn(), del: jest.fn() }) as any,
      (overrides.modelGatewayService || {}) as any,
    );

  it('maps the stored model key to Model Gateway apiKey', () => {
    const service = createService();
    const config = service.resolveModelGatewayConfig({
      protocol: 'openai_chat_completions',
      model: 'gpt-new',
      key: 'visible-new-key',
      baseUrl: 'https://new.example.com',
      endpointPath: '/v1/chat/completions',
      capabilities: { vision: true, streaming: true },
      additionalParams: '{"top_p":0.8}',
    } as any);

    expect(config).toMatchObject({
      protocol: 'openai_chat_completions',
      model: 'gpt-new',
      apiKey: 'visible-new-key',
      baseUrl: 'https://new.example.com',
      endpointPath: '/v1/chat/completions',
      capabilities: { vision: true, streaming: true },
      additionalParams: { top_p: 0.8 },
    });
  });

  it('does not persist duplicate legacy fields when saving from the admin form', async () => {
    const repository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),
    };
    const redisCacheService = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };
    const service = createService({ repository, redisCacheService });

    await service.setModel({
      id: 1,
      modelName: 'Claude',
      model: 'claude-opus-4-7',
      status: true,
      key: 'visible-new-key',
      apiKey: 'hidden-old-key',
      proxyUrl: 'https://old.example.com',
    } as any);

    expect(repository.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.not.objectContaining({
        apiKey: expect.anything(),
        proxyUrl: expect.anything(),
      }),
    );
    expect(repository.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ key: 'visible-new-key' }),
    );
  });

  it('rejects system-controlled fields in additional params with a clear message', async () => {
    const repository = {
      update: jest.fn(),
      save: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    const service = createService({ repository });
    const errorLog = jest.spyOn(Logger, 'error');

    const error = await service
      .setModel({
        id: 1,
        modelName: 'Fixture',
        additionalParams: '{"temperature":0.3,"top_p":0.9}',
      } as any)
      .catch((caught: any) => caught);

    expect(error.getStatus()).toBe(400);
    expect(error.message).toContain('temperature');
    expect(error.message).not.toContain('top_p');
    expect(repository.update).not.toHaveBeenCalled();
    // 管理员输入错误不记成服务端故障
    expect(errorLog).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('uses baseUrl and derives capabilities from multimodalTypes', () => {
    const service = createService();
    const config = service.resolveModelGatewayConfig({
      model: 'gpt-old',
      key: 'old-key',
      baseUrl: 'https://api.example.com/v1',
      multimodalTypes: ['image_url', 'audio_url'],
    } as any);

    expect(config).toMatchObject({
      protocol: 'openai_chat_completions',
      model: 'gpt-old',
      apiKey: 'old-key',
      baseUrl: 'https://api.example.com/v1',
      capabilities: expect.objectContaining({ vision: true, audioInput: true }),
    });
  });

  it('lets the gateway automatically select the complete real probe scope', async () => {
    const modelGatewayService = {
      testConnection: jest.fn().mockResolvedValue({ ok: true, tests: [] }),
    };
    const service = createService({ modelGatewayService });

    await service.testConnection({
      protocol: 'openai_chat_completions',
      model: 'fixture-model',
      key: 'fixture-value',
      baseUrl: 'https://example.com',
      multimodalTypes: ['image_url', 'audio_url'],
      capabilities: {
        reasoningControl: { levels: ['low', 'medium'], defaultLevel: 'medium' },
      },
    });

    expect(modelGatewayService.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'fixture-model' }),
    );
  });

  it('projects public model list without prompt or provider params', async () => {
    const service = createService({
      redisCacheService: {
        get: jest.fn().mockResolvedValue(
          JSON.stringify([
            {
              id: 1,
              modelName: 'GPT',
              model: 'gpt-test',
              deduct: 1,
              modelAvatar: 'avatar.png',
              multimodalTypes: ['image_url'],
              protocol: 'demo_responses',
              capabilities: { vision: true },
              modelDescription: 'desc',
              systemPrompt: 'secret prompt',
              systemPromptType: 2,
              additionalParams: '{"top_p":0.8}',
            },
          ]),
        ),
        set: jest.fn(),
        del: jest.fn(),
      },
    });

    const result = await service.modelsList();

    expect(result).toEqual([
      expect.objectContaining({
        id: 1,
        modelName: 'GPT',
        model: 'gpt-test',
        protocol: 'demo_responses',
        capabilities: expect.objectContaining({
          vision: true,
          reasoningControl: {
            levels: ['medium'],
            defaultLevel: 'medium',
          },
        }),
      }),
    ]);
    expect(result[0]).not.toHaveProperty('systemPrompt');
    expect(result[0]).not.toHaveProperty('systemPromptType');
    expect(result[0]).not.toHaveProperty('additionalParams');
  });

  it('projects base config with frontend-safe model info', async () => {
    const service = createService({
      repository: {
        findOne: jest.fn().mockResolvedValue({
          id: 2,
          modelName: 'Claude',
          model: 'claude-test',
          deduct: 1,
          protocol: 'demo_messages',
          multimodalTypes: [],
          systemPrompt: 'private prompt',
          additionalParams: '{"max_tokens":4096}',
        }),
      },
    });

    const result = await service.getBaseConfig();

    expect(result.modelInfo).toMatchObject({
      id: 2,
      modelName: 'Claude',
      model: 'claude-test',
      protocol: 'demo_messages',
    });
    expect(result.modelInfo).not.toHaveProperty('systemPrompt');
    expect(result.modelInfo).not.toHaveProperty('additionalParams');
  });

  it('delegates gateway provider profiles to the model gateway registry', () => {
    const payload: ModelGatewayProviderProfilePayload = {
      protocols: [],
      profiles: [],
      catalog: [],
    };
    const modelGatewayService = { getProfilePayload: jest.fn(() => payload) };
    const service = createService({ modelGatewayService });

    expect(service.getGatewayProfiles()).toBe(payload);
    expect(modelGatewayService.getProfilePayload).toHaveBeenCalledTimes(1);
  });

  it('projects remote model list responses without provider metadata', async () => {
    const modelGatewayService = {
      listRemoteModels: jest.fn().mockResolvedValue([
        {
          id: 'gpt-test',
          object: 'model',
          owned_by: 'openai',
          permission: [{ allow: true }],
          root: 'gpt-test',
        },
        { object: 'model' },
        {
          id: 'embedding-test',
          object: 'embedding',
          owned_by: 'openai',
          created: 1710000000,
        },
      ]),
    };
    const service = createService({ modelGatewayService });

    const result = await service.listRemoteModels({
      protocol: 'openai_chat_completions',
      model: 'gpt-test',
      key: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
    });

    expect(modelGatewayService.listRemoteModels).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'openai_chat_completions',
        model: 'gpt-test',
        apiKey: 'sk-test',
        baseUrl: 'https://api.example.com/v1',
      }),
    );
    expect(result).toEqual([
      { id: 'gpt-test', object: 'model', owned_by: 'openai' },
      { id: 'embedding-test', object: 'embedding', owned_by: 'openai' },
    ]);
    expect(JSON.stringify(result)).not.toContain('permission');
    expect(JSON.stringify(result)).not.toContain('1710000000');
  });
});

describe('ModelsService API Key 的提交规则', () => {
  const gateway = () => ({
    testConnection: jest.fn().mockResolvedValue({ ok: true, tests: [] }),
    listRemoteModels: jest.fn().mockResolvedValue([]),
  });
  const createService = (repository: any, modelGatewayService: any) =>
    new ModelsService(
      repository,
      { set: jest.fn(), get: jest.fn(), del: jest.fn() } as any,
      modelGatewayService,
    );
  const base = {
    protocol: 'openai_chat_completions',
    model: 'fixture-model',
    baseUrl: 'https://example.com',
  };

  it('测试连接与拉模型列表：明文去空白后照用；脱敏 / 空值必须换成有效 id 的已存密钥', async () => {
    const repository = {
      findOne: jest.fn(async ({ where }: any) =>
        where.id === 7
          ? { id: 7, key: '  stored-fixture-key  ' }
          : where.id === 8
            ? { id: 8, key: '   ' }
            : null,
      ),
    };
    const modelGatewayService = gateway();
    const service = createService(repository, modelGatewayService);

    await service.testConnection({ ...base, key: '  plain-fixture-key ' });
    expect(modelGatewayService.testConnection).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: 'plain-fixture-key' }),
    );
    await service.listRemoteModels({ ...base, id: 7, key: 'sto****-key' } as any);
    expect(modelGatewayService.listRemoteModels).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: 'stored-fixture-key' }),
    );
    await service.testConnection({ ...base, id: 7, key: '' });
    expect(modelGatewayService.testConnection).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: 'stored-fixture-key' }),
    );
  });

  it('脱敏 / 空白 / 非字符串的密钥解析不到已存密钥：400，两条路径都不请求上游', async () => {
    const repository = {
      findOne: jest.fn(async ({ where }: any) =>
        where.id === 8
          ? { id: 8, key: '   ' }
          : where.id === 9
            ? { id: 9, key: 'abc****wxyz' }
            : null,
      ),
    };
    const modelGatewayService = gateway();
    const service = createService(repository, modelGatewayService);
    const cases: any[] = [
      { key: 'abc****wxyz' }, // 没有 id（复制出来的）
      { key: 'abc****wxyz', id: 'x' }, // id 非法
      { key: 'abc****wxyz', id: 404 }, // 记录不存在
      { key: '', id: 8 }, // 已存密钥为空白
      { key: '****', id: 9 }, // 已存的也是占位
      { key: '   ' }, // 纯空白
      { key: ['abc****wxyz'], id: 7 }, // 数组形式的占位
      { key: { value: 'x' }, id: 7 }, // 对象
    ];
    for (const extra of cases) {
      await expect(service.testConnection({ ...base, ...extra })).rejects.toMatchObject({
        status: 400,
      });
      await expect(service.listRemoteModels({ ...base, ...extra } as any)).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(modelGatewayService.testConnection).not.toHaveBeenCalled();
    expect(modelGatewayService.listRemoteModels).not.toHaveBeenCalled();
  });

  it('新建模型：密钥为空或脱敏 400，不再静默存成空串；明文去空白后保存', async () => {
    const repository = {
      save: jest.fn(async (value: any) => ({ id: 11, ...value })),
      find: jest.fn().mockResolvedValue([]),
    };
    const service = createService(repository, gateway());
    for (const key of ['', '   ', 'abc****wxyz']) {
      await expect(
        service.setModel({ modelName: 'M', model: 'm', status: true, key } as any),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(repository.save).not.toHaveBeenCalled();
    await service.setModel({ modelName: 'M', model: 'm', status: true, key: ' plain-key ' } as any);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ key: 'plain-key' }));
  });
});

describe('ModelsService findById', () => {
  const createService = (repository: any) =>
    new ModelsService(
      repository,
      { set: jest.fn(), get: jest.fn(), del: jest.fn() } as any,
      {} as any,
    );

  it('returns null without querying when no valid id is given', async () => {
    const repository = { findOne: jest.fn() };
    const service = createService(repository);

    await expect(service.findById(undefined)).resolves.toBeNull();
    await expect(service.findById(null)).resolves.toBeNull();
    await expect(service.findById(Number.NaN)).resolves.toBeNull();

    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('keeps querying enabled models by id when an id is given', async () => {
    const model = { id: 5, model: 'gpt-test', status: true };
    const repository = { findOne: jest.fn().mockResolvedValue(model) };
    const service = createService(repository);

    await expect(service.findById(5)).resolves.toBe(model);

    expect(repository.findOne).toHaveBeenCalledTimes(1);
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 5, status: true } });
  });
});
