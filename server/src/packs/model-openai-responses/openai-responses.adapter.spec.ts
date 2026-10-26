import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import { ModelStreamRegistry } from '@/modules/modelGateway/model-stream';
import { OpenAIResponsesAdapter } from './openai-responses.adapter';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('OpenAIResponsesAdapter', () => {
  const createAdapter = () => {
    const registry = new ModelStreamRegistry();
    return new OpenAIResponsesAdapter(new ModelGatewayUrlBuilder(registry), registry);
  };
  const baseRequest: any = {
    config: {
      protocol: 'openai_responses',
      model: 'gpt-test',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
      additionalParams: { top_p: 0.9, metadata: { source: 'test' } },
    },
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hi' },
    ],
    tools: [{ type: 'function', function: { name: 'search', parameters: {} } }],
    toolChoice: 'auto',
    temperature: 0.2,
    stream: true,
    purpose: 'agent_loop',
  };

  it('builds Responses request bodies and rejects core or stateful overrides', () => {
    const adapter = createAdapter();
    expect(adapter.buildRequestBody(baseRequest, true)).toMatchObject({
      model: 'gpt-test',
      input: [{ role: 'user', content: 'hi' }],
      instructions: 'You are helpful.',
      top_p: 0.9,
      metadata: { source: 'test' },
      stream: true,
      store: false,
      tools: [{ type: 'function', name: 'search', parameters: {}, strict: null }],
    });

    expect(() =>
      adapter.buildRequestBody(
        { ...baseRequest, config: { ...baseRequest.config, additionalParams: { input: [] } } },
        true,
      ),
    ).toThrow('保留字段');

    expect(() =>
      adapter.buildRequestBody(
        {
          ...baseRequest,
          config: { ...baseRequest.config, additionalParams: { previous_response_id: 'resp_1' } },
        },
        true,
      ),
    ).toThrow('状态字段');

    expect(() =>
      adapter.buildRequestBody(
        {
          ...baseRequest,
          config: { ...baseRequest.config, additionalParams: { conversation: 'conv_1' } },
        },
        true,
      ),
    ).toThrow('状态字段');

    expect(() =>
      adapter.buildRequestBody(
        { ...baseRequest, config: { ...baseRequest.config, additionalParams: { store: true } } },
        true,
      ),
    ).toThrow('状态字段');
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

  it('adds OpenAI native web search tools from model capabilities', () => {
    const adapter = createAdapter();
    expect(
      adapter.buildRequestBody(
        {
          ...baseRequest,
          config: {
            ...baseRequest.config,
            capabilities: {
              nativeTools: {
                webSearch: {
                  enabled: true,
                  mode: 'force',
                  toolType: 'web_search',
                  searchContextSize: 'medium',
                  filters: { allowed_domains: ['openai.com'] },
                },
              },
            },
          },
        },
        true,
      ),
    ).toMatchObject({
      tools: [
        { type: 'function', name: 'search', parameters: {}, strict: null },
        {
          type: 'web_search',
          search_context_size: 'medium',
          filters: { allowed_domains: ['openai.com'] },
        },
      ],
      tool_choice: { type: 'web_search' },
      include: ['web_search_call.action.sources'],
    });
  });

  it.each(['auto', 'force'])(
    'removes all hosted/function tools for compaction (%s)',
    (mode: string) => {
      const adapter = createAdapter();
      const body = adapter.buildRequestBody(
        {
          ...baseRequest,
          purpose: 'context_compaction',
          config: {
            ...baseRequest.config,
            additionalParams: { include: ['web_search_call.action.sources'], top_p: 0.9 },
            capabilities: {
              nativeTools: { webSearch: { enabled: true, mode } },
            },
          },
        },
        true,
      );

      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
      expect(body.include).toBeUndefined();
      expect(body.top_p).toBeUndefined();
    },
  );

  it('maps controlled reasoning effort into Responses reasoning.effort', () => {
    const adapter = createAdapter();
    const unsupported = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          reasoningEffort: 'medium',
        },
      },
      true,
    );
    expect(unsupported.reasoning).toBeUndefined();

    const balanced = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'o3',
          reasoningEffort: 'medium',
        },
      },
      true,
    );
    expect(balanced.reasoning).toEqual({ effort: 'medium' });

    const gpt5Pro = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'gpt-5.5',
          reasoningEffort: 'max',
        },
      },
      true,
    );
    expect(gpt5Pro.reasoning).toEqual({ effort: 'xhigh' });

    const off = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'o3',
          reasoningEffort: 'off',
        },
      },
      true,
    );
    expect(off.reasoning).toEqual({ effort: 'none' });
  });

  it('maps Responses stream events to gateway events', async () => {
    const adapter = createAdapter();
    const events = [
      { type: 'response.output_text.delta', delta: '答' },
      { type: 'response.reasoning_summary_text.delta', delta: '想' },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'search' },
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        delta: '{"q"',
      },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          usage: {
            input_tokens: 2,
            output_tokens: 3,
            total_tokens: 5,
            input_tokens_details: { cached_tokens: 1 },
            provider_private: { sentinel: 'PRIVATE_OPENAI_RESPONSES_USAGE' },
          },
        },
      },
    ];
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest.fn().mockResolvedValue(
          (async function* () {
            for (const event of events) yield event;
          })(),
        ),
      },
    });

    const mapped: any[] = [];
    for await (const event of adapter.stream(baseRequest)) {
      mapped.push(event);
    }

    expect(mapped).toEqual([
      { type: 'text_delta', delta: '答' },
      { type: 'reasoning_delta', delta: '想' },
      {
        type: 'tool_call_delta',
        index: 0,
        id: 'call_1',
        nameDelta: 'search',
        rawName: 'search',
      },
      {
        type: 'tool_call_delta',
        index: 0,
        id: 'call_1',
        argumentsDelta: '{"q"',
        rawName: 'search',
      },
      {
        type: 'usage',
        usage: expect.objectContaining({
          inputTokens: 2,
          outputTokens: 3,
          totalTokens: 5,
          cacheHitTokens: 1,
          cacheMissTokens: 1,
        }),
      },
      { type: 'done', finishReason: 'completed' },
    ]);
    expect(JSON.stringify(mapped)).not.toContain('PRIVATE_OPENAI_RESPONSES_USAGE');
  });

  it('keeps non-stream provider payloads inside the adapter', async () => {
    const adapter = createAdapter();
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest.fn().mockResolvedValue({
          output_text: 'hello',
          usage: {
            input_tokens: 4,
            output_tokens: 5,
            total_tokens: 9,
            input_tokens_details: { cached_tokens: 2 },
            provider_private: { sentinel: 'PRIVATE_OPENAI_RESPONSES_NON_STREAM' },
          },
          provider_private: { sentinel: 'PRIVATE_OPENAI_RESPONSES_NON_STREAM' },
        }),
      },
    });

    const result = await adapter.completeOnce({ ...baseRequest, stream: false });

    expect(result).toEqual({
      content: 'hello',
      usage: {
        inputTokens: 4,
        outputTokens: 5,
        totalTokens: 9,
        cacheHitTokens: 2,
        cacheMissTokens: 2,
      },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_OPENAI_RESPONSES_NON_STREAM');
  });

  it('maps native web search stream events into hosted tool activity', async () => {
    const adapter = createAdapter();
    const events = [
      {
        type: 'response.web_search_call.in_progress',
        item_id: 'ws_1',
        output_index: 0,
        sequence_number: 1,
      },
      {
        type: 'response.web_search_call.searching',
        item_id: 'ws_1',
        output_index: 0,
        sequence_number: 2,
      },
      {
        type: 'response.output_text_annotation.added',
        item_id: 'msg_1',
        output_index: 1,
        content_index: 0,
        annotation_index: 0,
        sequence_number: 3,
        annotation: {
          type: 'url_citation',
          title: 'OpenAI Docs',
          url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
        },
      },
      {
        type: 'response.output_text.annotation.added',
        item_id: 'msg_1',
        output_index: 1,
        content_index: 0,
        annotation_index: 1,
        sequence_number: 4,
        annotation: {
          type: 'url_citation',
          title: 'OpenAI Homepage',
          url: 'https://openai.com/',
        },
      },
      {
        type: 'response.web_search_call.completed',
        item_id: 'ws_1',
        output_index: 0,
        sequence_number: 5,
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: 'ws_1',
          type: 'web_search_call',
          status: 'completed',
          action: {
            type: 'search',
            query: 'site:openai.com OpenAI docs',
            queries: ['site:openai.com OpenAI docs'],
            sources: [{ type: 'url', url: 'https://openai.com/about/' }],
          },
        },
        sequence_number: 6,
      },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
          },
        },
      },
    ];
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest.fn().mockResolvedValue(
          (async function* () {
            for (const event of events) yield event;
          })(),
        ),
      },
    });

    const mapped: any[] = [];
    for await (const event of adapter.stream(baseRequest)) {
      mapped.push(event);
    }

    const hostedEvents = mapped.filter(event => event.type === 'hosted_tool_call');
    const hostedIds = new Set(hostedEvents.map(event => event.toolCall.id));
    expect(hostedIds.size).toBe(1);
    expect(hostedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCall: expect.objectContaining({ id: expect.any(String), status: 'running' }),
        }),
        expect.objectContaining({
          toolCall: expect.objectContaining({ id: expect.any(String), status: 'searching' }),
        }),
        expect.objectContaining({
          toolCall: expect.objectContaining({
            id: expect.any(String),
            status: 'searching',
            output: expect.objectContaining({
              results: [
                {
                  title: 'OpenAI Docs',
                  url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
                },
              ],
            }),
          }),
        }),
        expect.objectContaining({
          toolCall: expect.objectContaining({
            id: expect.any(String),
            status: 'success',
            output: expect.objectContaining({
              queries: ['site:openai.com OpenAI docs'],
              sources: [{ type: 'url', url: 'https://openai.com/about/' }],
            }),
          }),
        }),
      ]),
    );
    expect(hostedEvents[hostedEvents.length - 1]).toEqual(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          id: expect.any(String),
          displayName: '联网搜索',
          inputSummary: '搜索：site:openai.com OpenAI docs',
          status: 'success',
          output: expect.objectContaining({
            queries: ['site:openai.com OpenAI docs'],
            sources: [{ type: 'url', url: 'https://openai.com/about/' }],
            providerItemIds: ['ws_1'],
          }),
        }),
      }),
    );
  });

  it('coalesces multiple native web search provider items into one hosted tool call', async () => {
    const adapter = createAdapter();
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'ws_search', type: 'web_search_call', status: 'in_progress' },
      },
      { type: 'response.web_search_call.in_progress', item_id: 'ws_search', output_index: 0 },
      { type: 'response.web_search_call.searching', item_id: 'ws_search', output_index: 0 },
      { type: 'response.web_search_call.completed', item_id: 'ws_search', output_index: 0 },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: 'ws_search',
          type: 'web_search_call',
          status: 'completed',
          action: {
            type: 'search',
            query: 'GPT-5.6 latest public news OpenAI',
            queries: ['GPT-5.6 latest public news OpenAI'],
            sources: [{ type: 'url', url: 'https://example.com/search-result' }],
          },
        },
      },
      {
        type: 'response.output_item.added',
        output_index: 2,
        item: { id: 'ws_open_page', type: 'web_search_call', status: 'in_progress' },
      },
      { type: 'response.web_search_call.in_progress', item_id: 'ws_open_page', output_index: 2 },
      { type: 'response.web_search_call.searching', item_id: 'ws_open_page', output_index: 2 },
      { type: 'response.web_search_call.completed', item_id: 'ws_open_page', output_index: 2 },
      {
        type: 'response.output_item.done',
        output_index: 2,
        item: {
          id: 'ws_open_page',
          type: 'web_search_call',
          status: 'completed',
          action: {
            type: 'open_page',
            url: 'https://openai.com/index/previewing-gpt-5-6-sol/',
          },
        },
      },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [
            {
              id: 'ws_search',
              type: 'web_search_call',
              action: {
                type: 'search',
                query: 'GPT-5.6 latest public news OpenAI',
                queries: ['GPT-5.6 latest public news OpenAI'],
                sources: [{ type: 'url', url: 'https://example.com/search-result' }],
              },
            },
            {
              id: 'ws_open_page',
              type: 'web_search_call',
              action: {
                type: 'open_page',
                url: 'https://openai.com/index/previewing-gpt-5-6-sol/',
              },
            },
          ],
        },
      },
    ];
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest.fn().mockResolvedValue(
          (async function* () {
            for (const event of events) yield event;
          })(),
        ),
      },
    });

    const mapped: any[] = [];
    for await (const event of adapter.stream(baseRequest)) {
      mapped.push(event);
    }

    const hostedEvents = mapped.filter(event => event.type === 'hosted_tool_call');
    const hostedIds = new Set(hostedEvents.map(event => event.toolCall.id));
    expect(hostedIds.size).toBe(1);
    expect(hostedEvents.at(-1)).toEqual(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          displayName: '联网搜索',
          inputSummary: '搜索：GPT-5.6 latest public news OpenAI',
          status: 'success',
          output: expect.objectContaining({
            queries: ['GPT-5.6 latest public news OpenAI'],
            sources: [
              { type: 'url', url: 'https://example.com/search-result' },
              { type: 'url', url: 'https://openai.com/index/previewing-gpt-5-6-sol/' },
            ],
            providerItemIds: ['ws_search', 'ws_open_page'],
          }),
        }),
      }),
    );
  });

  it('uses a unified throw strategy for Responses error events', async () => {
    const adapter = createAdapter();
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest.fn().mockResolvedValue(
          (async function* () {
            yield { type: 'error', message: 'bad request' };
          })(),
        ),
      },
    });

    await expect(async () => {
      for await (const unused of adapter.stream(baseRequest)) {
        void unused;
      }
    }).rejects.toMatchObject({
      name: 'ModelStreamError',
      code: 'MODEL_OUTCOME_UNKNOWN',
      message: '模型请求结果无法确认，已停止自动重试',
      category: 'unknown',
      retryable: false,
      requestOutcome: 'rejected',
    });
  });

  it('does not synthesize success when a Responses stream ends without a terminal event', async () => {
    const adapter = createAdapter();
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest.fn().mockResolvedValue(
          (async function* () {
            yield { type: 'response.output_text.delta', delta: 'partial' };
          })(),
        ),
      },
    });

    const events: any[] = [];
    for await (const event of adapter.stream(baseRequest)) events.push(event);

    expect(events).toEqual([{ type: 'text_delta', delta: 'partial' }]);
    expect(events.some(event => event.type === 'done')).toBe(false);
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
        responses: {
          create: jest.fn().mockRejectedValue({
            status,
            message: `PRIVATE_OPENAI_RESPONSES_${status}`,
            headers: status === 429 ? { 'retry-after': '3' } : undefined,
          }),
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
      expect(String(thrown)).not.toContain(`PRIVATE_OPENAI_RESPONSES_${status}`);
      expect(thrown).not.toHaveProperty('raw');
    },
  );

  it('keeps a network failure unknown and non-retryable', async () => {
    const adapter = createAdapter();
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest
          .fn()
          .mockRejectedValue({ code: 'ECONNRESET', message: 'PRIVATE_NETWORK_DETAIL' }),
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
      responses: { create: jest.fn().mockRejectedValue(new Error('transport')) },
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

  it('does not duplicate reasoning done text after reasoning deltas', async () => {
    const adapter = createAdapter();
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest.fn().mockResolvedValue(
          (async function* () {
            yield {
              type: 'response.reasoning_summary_text.delta',
              output_index: 0,
              delta: '先想',
            };
            yield {
              type: 'response.reasoning_summary_text.done',
              output_index: 0,
              text: '先想',
            };
            yield { type: 'response.completed', response: { status: 'completed' } };
          })(),
        ),
      },
    });

    const mapped: any[] = [];
    for await (const event of adapter.stream(baseRequest)) {
      mapped.push(event);
    }

    expect(mapped.filter(event => event.type === 'reasoning_delta')).toEqual([
      { type: 'reasoning_delta', delta: '先想' },
    ]);
  });

  it('uses reasoning done text as a fallback when no delta was seen', async () => {
    const adapter = createAdapter();
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest.fn().mockResolvedValue(
          (async function* () {
            yield {
              type: 'response.reasoning_summary_text.done',
              output_index: 0,
              text: '完整思考',
            };
            yield { type: 'response.completed', response: { status: 'completed' } };
          })(),
        ),
      },
    });

    const mapped: any[] = [];
    for await (const event of adapter.stream(baseRequest)) {
      mapped.push(event);
    }

    expect(mapped.filter(event => event.type === 'reasoning_delta')).toEqual([
      { type: 'reasoning_delta', delta: '完整思考' },
    ]);
  });
});
