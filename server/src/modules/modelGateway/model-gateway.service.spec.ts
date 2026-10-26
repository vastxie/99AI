import { ModelGatewayService } from './model-gateway.service';
import { ModelStreamRegistry, type ModelStreamInput } from './model-stream';
import { buildOpenAIChatCompletionsRequestBody } from './adapters/openai-chat-completions.adapter';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const createTextStream = (
  content: string,
  usage: any = { inputTokens: 0, outputTokens: 1, totalTokens: 1 },
) =>
  (async function* () {
    if (content) {
      yield { type: 'text_delta', delta: content };
    }
    if (usage) {
      yield { type: 'usage', usage };
    }
    yield { type: 'done', finishReason: 'stop' };
  })();

const createService = (
  adapters: {
    chatAdapter?: any;
    responsesAdapter?: any;
    anthropicAdapter?: any;
    geminiAdapter?: any;
  },
  options: {
    mediaPreparer?: any;
  } = {},
) => {
  const registry = ModelStreamRegistry.from([
    withProtocol('openai_chat_completions', adapters.chatAdapter),
    withProtocol('demo_responses', adapters.responsesAdapter),
    withProtocol('demo_messages', adapters.anthropicAdapter),
    withProtocol('demo_generate', adapters.geminiAdapter),
  ]);
  return new ModelGatewayService(
    registry,
    {} as any,
    options.mediaPreparer ||
      ({ prepare: jest.fn((request: any) => Promise.resolve(request)) } as any),
  );
};

const descriptorFor = (protocol: string) => ({
  protocol,
  label: protocol,
  endpoints: { default: '/v1/chat/completions', knownSuffixes: [] as string[] },
  multimodalTypes: [] as string[],
});
const withProtocol = (protocol: string, adapter?: any) => ({
  protocol,
  descriptor: descriptorFor(protocol),
  stream: jest.fn(() => createTextStream('fallback')),
  completeOnce: jest.fn(),
  ...(adapter || {}),
});

describe('ModelGatewayService', () => {
  it('routes completeOnce protocols through adapter streams and the complete helper', async () => {
    const chatAdapter = {
      stream: jest.fn(() => createTextStream('chat')),
      completeOnce: jest.fn().mockResolvedValue({ content: 'chat' }),
      listRemoteModels: jest.fn().mockResolvedValue([]),
    };
    const responsesAdapter = {
      stream: jest.fn(() => createTextStream('responses')),
      completeOnce: jest.fn().mockResolvedValue({ content: 'responses' }),
    };
    const anthropicAdapter = {
      stream: jest.fn(() => createTextStream('anthropic')),
      completeOnce: jest.fn().mockResolvedValue({ content: 'anthropic' }),
    };
    const geminiAdapter = {
      stream: jest.fn(() => createTextStream('gemini')),
      completeOnce: jest.fn().mockResolvedValue({ content: 'gemini' }),
    };
    const service = createService({
      chatAdapter,
      responsesAdapter,
      anthropicAdapter,
      geminiAdapter,
    });
    const baseConfig = {
      model: 'gpt-test',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
    };

    await expect(
      service.completeOnce({
        config: { ...baseConfig, protocol: 'openai_chat_completions' },
        messages: [{ role: 'user', content: 'hi' }],
        purpose: 'test_connection',
      } as any),
    ).resolves.toMatchObject({ content: 'chat' });

    await expect(
      service.completeOnce({
        config: { ...baseConfig, protocol: 'demo_responses' },
        messages: [{ role: 'user', content: 'hi' }],
        purpose: 'test_connection',
      } as any),
    ).resolves.toMatchObject({ content: 'responses' });

    await expect(
      service.completeOnce({
        config: { ...baseConfig, protocol: 'demo_messages' },
        messages: [{ role: 'user', content: 'hi' }],
        purpose: 'test_connection',
      } as any),
    ).resolves.toMatchObject({ content: 'anthropic' });

    await expect(
      service.completeOnce({
        config: { ...baseConfig, protocol: 'demo_generate' },
        messages: [{ role: 'user', content: 'hi' }],
        purpose: 'test_connection',
      } as any),
    ).resolves.toMatchObject({ content: 'gemini' });

    expect(chatAdapter.stream).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
    expect(responsesAdapter.stream).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
    expect(anthropicAdapter.stream).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
    expect(geminiAdapter.stream).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
    expect(chatAdapter.completeOnce).not.toHaveBeenCalled();
    expect(responsesAdapter.completeOnce).not.toHaveBeenCalled();
    expect(anthropicAdapter.completeOnce).not.toHaveBeenCalled();
    expect(geminiAdapter.completeOnce).not.toHaveBeenCalled();
  });

  it('exposes remote model listing from registered adapter capabilities', async () => {
    const chatAdapter = {
      stream: jest.fn(),
      completeOnce: jest.fn(),
      listRemoteModels: jest.fn().mockResolvedValue([{ id: 'gpt-test' }]),
    };
    const responsesAdapter = {
      stream: jest.fn(),
      completeOnce: jest.fn(),
      listRemoteModels: jest.fn().mockResolvedValue([{ id: 'resp-test' }]),
    };
    const customAdapter = {
      ...withProtocol('custom_provider', {
        listRemoteModels: jest.fn().mockResolvedValue([{ id: 'custom-test' }]),
      }),
    };
    const service = createService({ chatAdapter, responsesAdapter });
    const customService = new ModelGatewayService(
      ModelStreamRegistry.from([customAdapter]),
      {} as any,
      { prepare: jest.fn((request: any) => Promise.resolve(request)) } as any,
    );
    const baseConfig = {
      model: 'gpt-test',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
    };

    await expect(
      service.listRemoteModels({
        ...baseConfig,
        protocol: 'demo_responses',
      } as any),
    ).resolves.toEqual([{ id: 'resp-test' }]);
    expect(responsesAdapter.listRemoteModels).toHaveBeenCalledTimes(1);
    expect(chatAdapter.listRemoteModels).not.toHaveBeenCalled();
    expect(service.supportsRemoteModelList('demo_responses')).toBe(true);

    await expect(
      service.listRemoteModels({
        ...baseConfig,
        protocol: 'demo_messages',
      } as any),
    ).rejects.toThrow('暂不支持远程模型列表');
    expect(service.supportsRemoteModelList('demo_messages')).toBe(false);
    expect(service.supportsRemoteModelList('unknown_protocol')).toBe(false);

    await expect(
      customService.listRemoteModels({
        ...baseConfig,
        protocol: 'custom_provider',
      } as any),
    ).resolves.toEqual([{ id: 'custom-test' }]);
    expect(customService.supportsRemoteModelList('custom_provider')).toBe(true);
    expect(customAdapter.listRemoteModels).toHaveBeenCalledTimes(1);
  });

  it('automatically probes every protocol media type and every reasoning level', async () => {
    const probeStream = jest.fn((request: any) => {
      const content = request.messages[0]?.content;
      if (!Array.isArray(content)) return createTextStream('PROBE_OK');
      if (content.some((part: any) => part.type === 'image_url')) return createTextStream('red');
      if (content.some((part: any) => part.type === 'document')) return createTextStream('4827');
      if (content.some((part: any) => part.type === 'input_audio')) return createTextStream('4827');
      if (content.some((part: any) => part.type === 'video_url')) return createTextStream('black');
      return createTextStream('PROBE_OK');
    });
    const responsesAdapter = {
      descriptor: {
        ...descriptorFor('demo_responses'),
        multimodalTypes: ['image_url', 'document', 'audio_url', 'video_url'],
      },
      stream: probeStream,
      buildRequestBody: jest.fn((request: any) => ({
        reasoning_effort: request.config.reasoningEffort,
      })),
      completeOnce: jest.fn(),
      listRemoteModels: jest.fn(),
    };
    const service = createService({ responsesAdapter });

    const result = await service.testConnection({
      protocol: 'demo_responses',
      model: 'doubao-seed-test',
      apiKey: 'key',
      baseUrl: 'https://example.com',
    });

    expect(result.tests.map(item => item.key)).toEqual([
      'text',
      'multimodal:image_url',
      'multimodal:document',
      'multimodal:audio_url',
      'multimodal:video_url',
      'reasoning:off',
      'reasoning:minimal',
      'reasoning:low',
      'reasoning:medium',
      'reasoning:high',
      'reasoning:xhigh',
      'reasoning:max',
    ]);
    expect(result.tests.every(item => item.ok)).toBe(true);
    expect(responsesAdapter.stream).toHaveBeenCalledTimes(12);
    expect(responsesAdapter.completeOnce).not.toHaveBeenCalled();
    expect(responsesAdapter.stream.mock.calls[0][0]).toMatchObject({
      messages: [{ role: 'user', content: '只回答 PROBE_OK' }],
      maxTokens: 512,
      purpose: 'test_connection',
    });
    // 连接测试与推理探测都不设温度：按模型服务自己的默认值
    expect(
      [...responsesAdapter.stream.mock.calls, ...responsesAdapter.buildRequestBody.mock.calls].some(
        (call: [Record<string, unknown>]) => 'temperature' in call[0],
      ),
    ).toBe(false);
    expect(
      responsesAdapter.stream.mock.calls.every(
        (call: [ModelStreamInput]) => call[0].signal instanceof AbortSignal,
      ),
    ).toBe(true);
    expect(
      responsesAdapter.stream.mock.calls.every((call: [ModelStreamInput]) =>
        /^99agent-[a-f0-9]{32}$/.test(call[0].sessionId!),
      ),
    ).toBe(true);
    expect(
      new Set(
        responsesAdapter.stream.mock.calls.map((call: [ModelStreamInput]) => call[0].sessionId),
      ).size,
    ).toBe(12);
    expect(responsesAdapter.stream.mock.calls[5][0].config.reasoningEffort).toBe('off');
    expect(responsesAdapter.stream.mock.calls[8][0].config.reasoningEffort).toBe('medium');
    expect(responsesAdapter.stream.mock.calls[11][0].config.reasoningEffort).toBe('max');
  });

  it('bounds real capability probes to four concurrent provider requests', async () => {
    let callCount = 0;
    let active = 0;
    let maxActive = 0;
    const probeStream = jest.fn((request: any) =>
      (async function* () {
        callCount += 1;
        if (callCount === 1) {
          yield { type: 'text_delta', delta: 'PROBE_OK' };
          yield { type: 'done', finishReason: 'stop' };
          return;
        }
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 8));
        const content = request.messages[0]?.content;
        const answer = Array.isArray(content)
          ? content.some((part: any) => part.type === 'image_url')
            ? 'red'
            : content.some((part: any) => part.type === 'video_url')
              ? 'black'
              : '4827'
          : 'PROBE_OK';
        yield { type: 'text_delta', delta: answer };
        yield { type: 'done', finishReason: 'stop' };
        active -= 1;
      })(),
    );
    const service = createService({
      responsesAdapter: {
        descriptor: {
          ...descriptorFor('demo_responses'),
          multimodalTypes: ['image_url', 'document', 'audio_url', 'video_url'],
        },
        stream: probeStream,
        buildRequestBody: jest.fn((request: any) => ({
          reasoning_effort: request.config.reasoningEffort,
        })),
      },
    });

    const result = await service.testConnection({
      protocol: 'demo_responses',
      model: 'probe-concurrency-model',
      apiKey: 'fixture-secret',
      baseUrl: 'https://example.com',
    });

    expect(result.tests).toHaveLength(12);
    expect(maxActive).toBe(4);
  });

  it('lists every reasoning level but skips provider calls without a real wire control', async () => {
    const chatAdapter = {
      stream: jest.fn(() => createTextStream('PROBE_OK')),
      buildRequestBody: buildOpenAIChatCompletionsRequestBody,
      completeOnce: jest.fn(),
      listRemoteModels: jest.fn(),
    };
    const service = createService({ chatAdapter });

    const result = await service.testConnection({
      protocol: 'openai_chat_completions',
      model: 'custom-vision-model',
      apiKey: 'key',
      baseUrl: 'https://example.com',
    });

    expect(result.tests.map(item => item.key)).toEqual([
      'text',
      'reasoning:off',
      'reasoning:minimal',
      'reasoning:low',
      'reasoning:medium',
      'reasoning:high',
      'reasoning:xhigh',
      'reasoning:max',
    ]);
    expect(result.tests.slice(1).every(item => item.skipped)).toBe(true);
    expect(chatAdapter.stream).toHaveBeenCalledTimes(1);
    expect(chatAdapter.completeOnce).not.toHaveBeenCalled();
    expect(chatAdapter.stream.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: '只回答 PROBE_OK' },
    ]);
  });

  it('does not probe media types that the selected protocol cannot send', async () => {
    const chatAdapter = {
      stream: jest.fn(() => createTextStream('PROBE_OK')),
      completeOnce: jest.fn(),
    };
    const service = createService({ chatAdapter });

    const result = await service.testConnection({
      protocol: 'openai_chat_completions',
      model: 'text-only',
      apiKey: 'fixture-value',
      baseUrl: 'https://example.com',
    });

    expect(result.tests.some(item => item.key.startsWith('multimodal:'))).toBe(false);
    expect(chatAdapter.stream).toHaveBeenCalledTimes(1);
  });

  it('probes only one representative when multiple levels map to the same wire control', async () => {
    const chatAdapter = {
      stream: jest.fn(() => createTextStream('PROBE_OK')),
      buildRequestBody: jest.fn((request: any) =>
        request.config.reasoningEffort
          ? {
              thinking: {
                type: request.config.reasoningEffort === 'off' ? 'disabled' : 'enabled',
              },
            }
          : {},
      ),
    };
    const service = createService({ chatAdapter });

    const result = await service.testConnection({
      protocol: 'openai_chat_completions',
      model: 'boolean-thinking-model',
      apiKey: 'fixture-value',
      baseUrl: 'https://example.com',
    });

    expect(chatAdapter.stream).toHaveBeenCalledTimes(3);
    expect(
      result.tests
        .filter(item => item.capability === 'reasoning' && item.ok)
        .map(item => item.value),
    ).toEqual(['off', 'medium']);
    expect(
      result.tests
        .filter(item => item.capability === 'reasoning' && item.skipped)
        .map(item => item.value),
    ).toEqual(['minimal', 'low', 'high', 'xhigh', 'max']);
    expect(result.tests.find(item => item.value === 'minimal')?.message).toContain(
      '使用相同控制参数',
    );
  });

  it('does not treat a missing opt-out or an inherited static control as a supported level', async () => {
    const missingOptOutAdapter = {
      stream: jest.fn(() => createTextStream('PROBE_OK')),
      buildRequestBody: jest.fn((request: any) =>
        request.config.reasoningEffort === 'off' || !request.config.reasoningEffort
          ? {}
          : { reasoning_effort: request.config.reasoningEffort },
      ),
    };
    const missingOptOutService = createService({ chatAdapter: missingOptOutAdapter });
    const missingOptOutResult = await missingOptOutService.testConnection({
      protocol: 'openai_chat_completions',
      model: 'no-explicit-opt-out',
      apiKey: 'fixture-value',
      baseUrl: 'https://example.com',
    });

    expect(missingOptOutResult.tests.find(item => item.value === 'off')?.skipped).toBe(true);
    expect(missingOptOutAdapter.stream).toHaveBeenCalledTimes(7);

    const inheritedControlAdapter = {
      stream: jest.fn(() => createTextStream('PROBE_OK')),
      buildRequestBody: jest.fn(() => ({ reasoning_effort: 'high' })),
    };
    const inheritedControlService = createService({ chatAdapter: inheritedControlAdapter });
    const inheritedControlResult = await inheritedControlService.testConnection({
      protocol: 'openai_chat_completions',
      model: 'static-control-model',
      apiKey: 'fixture-value',
      baseUrl: 'https://example.com',
    });

    expect(inheritedControlResult.tests.slice(1).every(item => item.skipped)).toBe(true);
    expect(inheritedControlAdapter.stream).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['glm-5.3-flash', 'https://open.bigmodel.cn/api/paas/v4'],
    ['qwen3-max', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
  ])(
    'does not report boolean-thinking model %s as seven independent levels',
    async (model: string, baseUrl: string) => {
      const chatAdapter = {
        stream: jest.fn(() => createTextStream('PROBE_OK')),
        buildRequestBody: buildOpenAIChatCompletionsRequestBody,
      };
      const service = createService({ chatAdapter });

      const result = await service.testConnection({
        protocol: 'openai_chat_completions',
        model,
        apiKey: 'fixture-value',
        baseUrl,
      });

      expect(chatAdapter.stream).toHaveBeenCalledTimes(3);
      expect(
        result.tests
          .filter(item => item.capability === 'reasoning' && item.ok)
          .map(item => item.value),
      ).toEqual(['off', 'medium']);
      expect(
        result.tests.filter(item => item.capability === 'reasoning' && item.skipped),
      ).toHaveLength(5);
    },
  );

  it('keeps license and media prepare in the wrapper before collecting complete from stream', async () => {
    const preparedRequest = {
      config: {
        protocol: 'openai_chat_completions',
        model: 'gpt-test',
        apiKey: 'key',
        baseUrl: 'https://example.com',
      },
      messages: [{ role: 'user', content: 'prepared ping' }],
      purpose: 'test_connection',
    };
    const chatAdapter = {
      stream: jest.fn(() => createTextStream('prepared answer')),
      completeOnce: jest.fn(),
      listRemoteModels: jest.fn(),
    };
    const mediaPreparer = {
      prepare: jest.fn().mockResolvedValue(preparedRequest),
    };
    const service = createService(
      { chatAdapter },
      {
        mediaPreparer,
      },
    );

    await expect(
      service.completeOnce({
        ...preparedRequest,
        messages: [{ role: 'user', content: 'raw ping' }],
      } as any),
    ).resolves.toMatchObject({ content: 'prepared answer' });

    expect(mediaPreparer.prepare).toHaveBeenCalled();
    expect(chatAdapter.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'prepared ping' }],
        stream: true,
      }),
    );
    expect(chatAdapter.completeOnce).not.toHaveBeenCalled();
  });

  it('strips native tools and provider extras from context compaction before adapter dispatch', async () => {
    const chatAdapter = {
      stream: jest.fn(() => createTextStream('{"version":1}')),
      completeOnce: jest.fn(),
    };
    const mediaPreparer = {
      prepare: jest.fn((request: any) => Promise.resolve(request)),
    };
    const service = createService({ chatAdapter }, { mediaPreparer });

    await service.completeOnce({
      config: {
        protocol: 'openai_chat_completions',
        model: 'gpt-test',
        apiKey: 'key',
        baseUrl: 'https://example.com',
        additionalParams: { include: ['web_search_call.action.sources'] },
        capabilities: {
          nativeTools: { webSearch: { enabled: true, mode: 'force' } },
        },
      },
      messages: [{ role: 'user', content: 'history' }],
      tools: [{ type: 'function', function: { name: 'unsafe', parameters: {} } }],
      toolChoice: 'required',
      purpose: 'context_compaction',
    } as any);

    expect(mediaPreparer.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: undefined,
        toolChoice: 'none',
        disableThinking: true,
        config: expect.objectContaining({
          additionalParams: undefined,
          reasoningEffort: 'off',
          capabilities: expect.objectContaining({ nativeTools: undefined }),
        }),
      }),
    );
    expect(chatAdapter.stream).toHaveBeenCalledWith(
      expect.objectContaining({ tools: undefined, toolChoice: 'none', stream: true }),
    );
  });

  it('reports unregistered protocols from the registry lookup', async () => {
    const service = new ModelGatewayService(
      ModelStreamRegistry.from([]),
      {} as any,
      { prepare: jest.fn((request: any) => Promise.resolve(request)) } as any,
    );

    await expect(
      service.completeOnce({
        config: {
          protocol: 'unknown_protocol',
          model: 'model',
          apiKey: 'key',
          baseUrl: 'https://example.com',
        },
        messages: [{ role: 'user', content: 'hi' }],
        purpose: 'test_connection',
      } as any),
    ).rejects.toThrow('当前暂不支持协议真实调用: unknown_protocol');
  });

  it('marks an error after any output or usage as unknown and strips raw details', async () => {
    const rawSentinel = 'PRIVATE_GATEWAY_FAILURE_DETAIL';
    const chatAdapter = {
      stream: jest.fn(() =>
        (async function* () {
          yield { type: 'text_delta', delta: 'partial' };
          yield {
            type: 'error',
            error: {
              code: 'raw_rate_limit_code',
              message: rawSentinel,
              category: 'rate_limit',
              retryable: true,
              requestOutcome: 'rejected',
              status: 429,
            },
          };
        })(),
      ),
    };
    const service = createService({ chatAdapter });
    const events: any[] = [];
    for await (const event of service.stream(gatewayRequest())) events.push(event);

    expect(events.at(-1)).toEqual({
      type: 'error',
      error: {
        code: 'MODEL_RATE_LIMIT',
        message: '模型服务请求过于频繁，请稍后再试',
        category: 'rate_limit',
        retryable: false,
        requestOutcome: 'unknown',
        status: 429,
      },
    });
    expect(JSON.stringify(events)).not.toContain(rawSentinel);
  });

  it('allowlists adapter usage for stream, complete, connection test and failed usage', async () => {
    const privateSentinel = 'PRIVATE_GATEWAY_USAGE';
    const unsafeUsage = {
      inputTokens: 4,
      outputTokens: 2,
      totalTokens: 6,
      cacheHitTokens: 1,
      cacheMissTokens: 3,
      raw: { provider: { sentinel: privateSentinel } },
      providerPrivate: { sentinel: privateSentinel },
    };
    const expectedUsage = {
      inputTokens: 4,
      outputTokens: 2,
      totalTokens: 6,
      cacheHitTokens: 1,
      cacheMissTokens: 3,
    };
    const chatAdapter = {
      stream: jest.fn(() => createTextStream('PROBE_OK', unsafeUsage)),
    };
    const service = createService({ chatAdapter });

    const streamEvents: any[] = [];
    for await (const event of service.stream(gatewayRequest())) streamEvents.push(event);
    const completed = await service.completeOnce(gatewayRequest());
    const connection = await service.testConnection(gatewayRequest().config);

    expect(streamEvents.find(event => event.type === 'usage')?.usage).toEqual(expectedUsage);
    expect(completed.usage).toEqual(expectedUsage);
    expect(connection.usage).toEqual(expectedUsage);
    expect(connection.tests[0].usage).toEqual(expectedUsage);
    expect(JSON.stringify({ streamEvents, completed, connection })).not.toContain(privateSentinel);

    const failingService = createService({
      chatAdapter: {
        stream: jest.fn(() =>
          (async function* () {
            yield { type: 'usage', usage: unsafeUsage };
            yield {
              type: 'error',
              error: {
                code: 'MODEL_OUTCOME_UNKNOWN',
                message: '模型请求结果无法确认，已停止自动重试',
                category: 'unknown',
                retryable: false,
                requestOutcome: 'unknown',
              },
            };
          })(),
        ),
      },
    });
    let thrown: any;
    await failingService.completeOnce(gatewayRequest()).catch(error => {
      thrown = error;
    });
    expect(thrown?.usage).toEqual(expectedUsage);
    expect(JSON.stringify(thrown)).not.toContain(privateSentinel);
  });

  it.each([
    [
      'explicit overflow without usage',
      [{ type: 'done', finishReason: 'context_length_exceeded' }],
      'rejected',
    ],
    [
      'length at a full context with usage',
      [
        { type: 'done', finishReason: 'length' },
        { type: 'usage', usage: { inputTokens: 950, outputTokens: 0, totalTokens: 950 } },
      ],
      'unknown',
    ],
  ])('classifies silent %s', async (_label: string, script: unknown[], requestOutcome: string) => {
    const chatAdapter = {
      descriptor: {
        ...descriptorFor('openai_chat_completions'),
        multimodalTypes: [] as string[],
      },
      stream: jest.fn(() =>
        (async function* () {
          for (const event of script as any[]) yield event;
        })(),
      ),
    };
    const service = createService({ chatAdapter });
    const events: any[] = [];
    for await (const event of service.stream(gatewayRequest({ maxInputTokens: 1_000 }))) {
      events.push(event);
    }

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: {
        category: 'context_overflow',
        retryable: false,
        requestOutcome,
      },
    });
    expect(events.filter(event => event.type === 'done')).toHaveLength(0);
  });

  it('fails closed on a stream without a terminal event and maps aborts separately', async () => {
    const missingTerminal = createService({
      chatAdapter: {
        stream: jest.fn(() =>
          (async function* (): AsyncGenerator<undefined> {
            if (false) yield undefined;
          })(),
        ),
      },
    });
    const missingEvents: any[] = [];
    for await (const event of missingTerminal.stream(gatewayRequest())) missingEvents.push(event);
    expect(missingEvents).toEqual([
      {
        type: 'error',
        error: expect.objectContaining({ category: 'unknown', requestOutcome: 'unknown' }),
      },
    ]);

    const aborted = createService({
      chatAdapter: {
        stream: jest.fn(() =>
          (async function* () {
            throw Object.assign(new Error('PRIVATE_ABORT_REASON'), { name: 'AbortError' });
          })(),
        ),
      },
    });
    const abortEvents: any[] = [];
    for await (const event of aborted.stream(gatewayRequest())) abortEvents.push(event);
    expect(abortEvents).toEqual([
      {
        type: 'abort',
        error: expect.objectContaining({ category: 'aborted', requestOutcome: 'unknown' }),
      },
    ]);
    expect(JSON.stringify(abortEvents)).not.toContain('PRIVATE_ABORT_REASON');
  });

  it('normalizes tool groups and strips provider-private history before adapter dispatch', async () => {
    const chatAdapter = {
      stream: jest.fn(() =>
        (async function* () {
          yield { type: 'done', finishReason: 'stop' };
        })(),
      ),
    };
    const service = createService({ chatAdapter });
    const request = gatewayRequest();
    request.messages = [
      {
        role: 'assistant',
        content: 'working',
        reasoning_content: 'PRIVATE_REASONING',
        provider_signature: 'PRIVATE_SIGNATURE',
        tool_calls: [
          {
            id: 'bad id',
            type: 'function',
            function: { name: 'bad.name', arguments: '{' },
          },
        ],
      } as any,
      { role: 'user', content: 'next' },
    ];
    for await (const unused of service.stream(request)) void unused;

    const dispatched = chatAdapter.stream.mock.calls[0][0].messages;
    expect(dispatched[0].tool_calls[0].id).toMatch(/^[A-Za-z0-9_-]{1,64}$/u);
    expect(dispatched[0].reasoning_content).toBeUndefined();
    expect(dispatched[0]).not.toHaveProperty('provider_signature');
    expect(dispatched[1]).toMatchObject({
      role: 'tool',
      content: expect.stringContaining('结果缺失或中断'),
    });
    expect(dispatched[2]).toEqual({ role: 'user', content: 'next' });
  });
});

function gatewayRequest(capabilities?: Record<string, unknown>): any {
  return {
    config: {
      protocol: 'openai_chat_completions',
      model: 'gpt-test',
      apiKey: 'test',
      baseUrl: 'https://example.invalid',
      ...(capabilities ? { capabilities } : {}),
    },
    messages: [{ role: 'user', content: 'hi' }],
    purpose: 'agent_loop',
  };
}
