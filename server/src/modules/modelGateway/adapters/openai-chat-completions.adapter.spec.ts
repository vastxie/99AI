import { ModelGatewayUrlBuilder } from '../model-gateway-url.builder';
import { ModelGatewayService } from '../model-gateway.service';
import { ModelStreamRegistry } from '../model-stream';
import { OpenAIChatCompletionsAdapter } from './openai-chat-completions.adapter';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('OpenAIChatCompletionsAdapter', () => {
  const createAdapter = () => {
    const registry = new ModelStreamRegistry();
    return new OpenAIChatCompletionsAdapter(new ModelGatewayUrlBuilder(registry), registry);
  };
  const baseRequest: any = {
    config: {
      protocol: 'openai_chat_completions',
      model: 'gpt-test',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
      additionalParams: { top_p: 0.9, extra_body: { vendor: 'custom' } },
    },
    messages: [{ role: 'user', content: 'hi' }],
    tools: [{ type: 'function', function: { name: 'search', parameters: {} } }],
    toolChoice: 'auto',
    temperature: 0.2,
    maxTokens: 128,
    stream: true,
    purpose: 'agent_loop',
  };

  it('keeps non-reserved additionalParams and rejects reserved overrides', () => {
    const adapter = createAdapter();
    expect(adapter.buildRequestBody(baseRequest, true)).toMatchObject({
      model: 'gpt-test',
      top_p: 0.9,
      extra_body: { vendor: 'custom' },
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 128,
    });

    expect(() =>
      adapter.buildRequestBody(
        { ...baseRequest, config: { ...baseRequest.config, additionalParams: { model: 'evil' } } },
        true,
      ),
    ).toThrow('保留字段');
  });

  it('passes a temperature only when the request sets one', () => {
    const adapter = createAdapter();
    // 不设默认温度：没指定时使用模型服务自己的默认值
    const { temperature: _unused, ...withoutTemperature } = baseRequest;
    expect(adapter.buildRequestBody(withoutTemperature, true)).not.toHaveProperty('temperature');
    expect(adapter.buildRequestBody(baseRequest, true)).toMatchObject({ temperature: 0.2 });
    expect(adapter.buildRequestBody({ ...baseRequest, temperature: 0 }, true)).toMatchObject({
      temperature: 0,
    });
  });

  it('translates disableThinking into per-family opt-out params', () => {
    const adapter = createAdapter();
    const buildWith = (model: string, baseUrl = 'https://api.example.com/v1') =>
      adapter.buildRequestBody(
        {
          ...baseRequest,
          disableThinking: true,
          config: { ...baseRequest.config, model, baseUrl, additionalParams: undefined },
        },
        false,
      );

    // GLM / 豆包系
    expect(buildWith('glm-5.1').thinking).toEqual({ type: 'disabled' });
    expect(buildWith('doubao-seed').thinking).toEqual({ type: 'disabled' });
    expect(buildWith('custom', 'https://open.bigmodel.cn/api/paas/v4').thinking).toEqual({
      type: 'disabled',
    });

    // Qwen / 混元系
    expect(buildWith('qwen3-max').enable_thinking).toBe(false);
    expect(buildWith('hunyuan-turbo').enable_thinking).toBe(false);

    // Gemini OpenAI 兼容层
    expect(buildWith('gemini-2.5-flash').reasoning_effort).toBe('none');

    // 无法禁用思考的纯推理模型：放大 max_tokens 预算
    expect(buildWith('deepseek-r1').max_tokens).toBe(1024);
    expect(buildWith('o3-mini').max_tokens).toBe(1024);

    // 未识别端点：不注入任何未知字段
    const plain = buildWith('gpt-test');
    expect(plain.thinking).toBeUndefined();
    expect(plain.enable_thinking).toBeUndefined();
    expect(plain.reasoning_effort).toBeUndefined();
    expect(plain.max_tokens).toBe(128);

    // 未声明 disableThinking 时完全不干预
    const untouched = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: { ...baseRequest.config, model: 'glm-5.1', additionalParams: undefined },
      },
      false,
    );
    expect(untouched.thinking).toBeUndefined();
  });

  it('maps controlled reasoning effort for OpenAI-compatible providers', () => {
    const adapter = createAdapter();
    const buildWith = (
      model: string,
      baseUrl = 'https://api.example.com/v1',
      reasoningEffort = 'max',
    ) =>
      adapter.buildRequestBody(
        {
          ...baseRequest,
          config: {
            ...baseRequest.config,
            model,
            baseUrl,
            reasoningEffort,
            additionalParams: undefined,
          },
        },
        false,
      );

    expect(buildWith('glm-5.1', 'https://open.bigmodel.cn/api/paas/v4').thinking).toEqual({
      type: 'enabled',
    });
    expect(
      buildWith('doubao-seed', 'https://ark.cn-beijing.volces.com/api/v3', 'off').thinking,
    ).toEqual({ type: 'disabled' });
    expect(
      buildWith('qwen3-max', 'https://dashscope.aliyuncs.com/compatible-mode/v1').enable_thinking,
    ).toBe(true);
    expect(
      buildWith('qwen3-max', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'off')
        .enable_thinking,
    ).toBe(false);
    expect(buildWith('gpt-5.5', 'https://api.openai.com/v1', 'max').reasoning_effort).toBe('xhigh');
    for (const effort of ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']) {
      expect(
        buildWith('deepseek-v4.1-flash', 'https://opencode.ai/zen/go', effort).reasoning_effort,
      ).toBe(effort);
    }
    const deepSeekOff = buildWith('deepseek-v4.1-flash', 'https://opencode.ai/zen/go', 'off');
    expect(deepSeekOff.thinking).toEqual({ type: 'disabled' });
    expect(deepSeekOff.reasoning_effort).toBeUndefined();
    expect(buildWith('gpt-test').reasoning_effort).toBeUndefined();
  });

  it('maps OpenAI stream chunks to gateway events', async () => {
    const adapter = createAdapter();
    const chunks = [
      { choices: [{ delta: { reasoning_content: '想' } }] },
      { choices: [{ delta: { content: '答' } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'search', arguments: '{"q"' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
      },
      {
        choices: [] as unknown[],
        usage: {
          prompt_tokens: 2,
          completion_tokens: 3,
          total_tokens: 5,
          provider_private: { sentinel: 'PRIVATE_OPENAI_CHAT_USAGE' },
        },
      },
    ];
    (adapter as any).createClient = jest.fn().mockReturnValue({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue(
            (async function* () {
              for (const chunk of chunks) yield chunk;
            })(),
          ),
        },
      },
    });

    const events: any[] = [];
    for await (const event of adapter.stream(baseRequest)) {
      events.push(event);
    }

    const doneEvents = events.filter(event => event.type === 'done');
    expect(doneEvents).toEqual([{ type: 'done', finishReason: 'stop' }]);
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'reasoning_delta', delta: '想' },
        { type: 'text_delta', delta: '答' },
        {
          type: 'tool_call_delta',
          index: 0,
          id: 'call_1',
          nameDelta: 'search',
          argumentsDelta: '{"q"',
          rawName: 'search',
        },
        {
          type: 'usage',
          usage: expect.objectContaining({
            inputTokens: 2,
            outputTokens: 3,
            totalTokens: 5,
          }),
        },
        { type: 'done', finishReason: 'stop' },
      ]),
    );
    expect(JSON.stringify(events)).not.toContain('PRIVATE_OPENAI_CHAT_USAGE');
  });

  it.each([
    ['zero-output EOF', []],
    ['partial-text EOF', [{ choices: [{ delta: { content: 'partial' } }] }]],
    [
      'tool-delta EOF',
      [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: { name: 'search', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        },
      ],
    ],
    [
      'usage-only EOF',
      [
        {
          choices: [],
          usage: { prompt_tokens: 2, completion_tokens: 0, total_tokens: 2 },
        },
      ],
    ],
  ])('fails closed through the Gateway on %s', async (_label: string, chunks: unknown[]) => {
    const registry = new ModelStreamRegistry();
    const urlBuilder = new ModelGatewayUrlBuilder(registry);
    const adapter = new OpenAIChatCompletionsAdapter(urlBuilder, registry);
    const create = jest.fn().mockResolvedValue(
      (async function* () {
        for (const chunk of chunks as any[]) yield chunk;
      })(),
    );
    (adapter as any).createClient = jest.fn().mockReturnValue({
      chat: { completions: { create } },
    });
    const gateway = new ModelGatewayService(registry, urlBuilder, {
      prepare: jest.fn((request: any) => Promise.resolve(request)),
    } as any);

    const events: any[] = [];
    for await (const event of gateway.stream(baseRequest)) events.push(event);

    expect(create).toHaveBeenCalledTimes(1);
    expect(events.some(event => event.type === 'done')).toBe(false);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { category: 'unknown', requestOutcome: 'unknown', retryable: false },
    });
  });

  it.each(['stop', 'tool_calls', 'length', 'content_filter'])(
    'accepts explicit %s terminal followed by usage',
    async (finishReason: string) => {
      const adapter = createAdapter();
      (adapter as any).createClient = jest.fn().mockReturnValue({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue(
              (async function* () {
                yield { choices: [{ delta: {}, finish_reason: finishReason }] };
                yield {
                  choices: [] as unknown[],
                  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                };
              })(),
            ),
          },
        },
      });

      const events: any[] = [];
      for await (const event of adapter.stream(baseRequest)) events.push(event);

      expect(events).toEqual([
        {
          type: 'usage',
          usage: expect.objectContaining({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
        },
        { type: 'done', finishReason },
      ]);
    },
  );

  it('keeps non-stream provider payloads inside the adapter', async () => {
    const adapter = createAdapter();
    (adapter as any).createClient = jest.fn().mockReturnValue({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'hello' } }],
            usage: {
              prompt_tokens: 4,
              completion_tokens: 5,
              total_tokens: 9,
              provider_private: { sentinel: 'PRIVATE_OPENAI_CHAT_NON_STREAM' },
            },
            provider_private: { sentinel: 'PRIVATE_OPENAI_CHAT_NON_STREAM' },
          }),
        },
      },
    });

    const result = await adapter.completeOnce({ ...baseRequest, stream: false });

    expect(result).toEqual({
      content: 'hello',
      usage: {
        inputTokens: 4,
        outputTokens: 5,
        totalTokens: 9,
        cacheHitTokens: 0,
        cacheMissTokens: 0,
      },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_OPENAI_CHAT_NON_STREAM');
  });

  it('disables hidden retries in the OpenAI SDK client', () => {
    const adapter = createAdapter();
    expect((adapter as any).createClient(baseRequest).maxRetries).toBe(0);
  });

  it.each([
    [400, 'invalid_request', 'rejected', false],
    [401, 'auth', 'rejected', false],
    [403, 'auth', 'rejected', false],
    [408, 'transient', 'unknown', false],
    [409, 'transient', 'rejected', true],
    [429, 'rate_limit', 'rejected', true],
    [500, 'transient', 'rejected', true],
    [502, 'transient', 'rejected', true],
    [503, 'transient', 'rejected', true],
    [504, 'transient', 'rejected', true],
  ])(
    'classifies rejected HTTP %i without leaking the SDK payload',
    async (status: number, category: string, requestOutcome: string, retryable: boolean) => {
      const adapter = createAdapter();
      (adapter as any).createClient = jest.fn().mockReturnValue({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue({
              status,
              message: `PRIVATE_OPENAI_CHAT_${status}`,
              headers: status === 429 ? { 'retry-after': '3' } : undefined,
            }),
          },
        },
      });

      const consume = async () => {
        for await (const unused of adapter.stream(baseRequest)) void unused;
      };
      let thrown: any;
      await consume().catch(error => {
        thrown = error;
      });
      expect(thrown).toMatchObject({
        category,
        requestOutcome,
        retryable,
        status,
        ...(status === 429 ? { retryAfterMs: 3_000 } : {}),
      });
      expect(String(thrown)).not.toContain(`PRIVATE_OPENAI_CHAT_${status}`);
      expect(thrown).not.toHaveProperty('raw');
    },
  );

  it('keeps a network failure unknown and non-retryable', async () => {
    const adapter = createAdapter();
    (adapter as any).createClient = jest.fn().mockReturnValue({
      chat: {
        completions: {
          create: jest
            .fn()
            .mockRejectedValue({ code: 'ECONNRESET', message: 'PRIVATE_NETWORK_DETAIL' }),
        },
      },
    });

    const consume = async () => {
      for await (const unused of adapter.stream(baseRequest)) void unused;
    };
    await expect(consume()).rejects.toMatchObject({
      category: 'unknown',
      requestOutcome: 'unknown',
      retryable: false,
    });
  });

  it('maps an aborted request without exposing the abort reason', async () => {
    const adapter = createAdapter();
    const controller = new AbortController();
    controller.abort(new Error('PRIVATE_ABORT_REASON'));
    (adapter as any).createClient = jest.fn().mockReturnValue({
      chat: { completions: { create: jest.fn().mockRejectedValue(new Error('transport')) } },
    });
    const consume = async () => {
      for await (const unused of adapter.stream({ ...baseRequest, signal: controller.signal }))
        void unused;
    };

    await expect(consume()).rejects.toMatchObject({
      name: 'AbortError',
      category: 'aborted',
      requestOutcome: 'unknown',
      retryable: false,
      message: '模型请求已取消',
    });
  });
});
