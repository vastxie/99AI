import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import { ModelStreamRegistry } from '@/modules/modelGateway/model-stream';
import { collectModelStream } from '@/modules/modelGateway/model-stream/model-stream.collector';
import { AnthropicMessagesAdapter } from './anthropic-messages.adapter';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('AnthropicMessagesAdapter', () => {
  const createAdapter = () => {
    const registry = new ModelStreamRegistry();
    return new AnthropicMessagesAdapter(new ModelGatewayUrlBuilder(registry), registry);
  };
  const baseRequest: any = {
    config: {
      protocol: 'anthropic_messages',
      model: 'claude-test',
      apiKey: 'sk-ant-test',
      baseUrl: 'https://api.anthropic.com',
      additionalParams: { top_p: 0.9 },
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

  it('builds Claude request bodies and rejects core overrides', () => {
    const adapter = createAdapter();
    expect(adapter.buildRequestBody(baseRequest, true)).toMatchObject({
      model: 'claude-test',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      system: 'You are helpful.',
      top_p: 0.9,
      stream: true,
      max_tokens: 4096,
      tools: [{ name: 'search', input_schema: {} }],
      tool_choice: { type: 'auto' },
    });

    expect(() =>
      adapter.buildRequestBody(
        { ...baseRequest, config: { ...baseRequest.config, additionalParams: { messages: [] } } },
        true,
      ),
    ).toThrow('保留字段');

    expect(() =>
      adapter.buildRequestBody(
        {
          ...baseRequest,
          config: { ...baseRequest.config, additionalParams: { tool_choice: { type: 'none' } } },
        },
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

  it('drops configured extended thinking when disableThinking is set', () => {
    const adapter = createAdapter();
    const request = {
      ...baseRequest,
      disableThinking: true,
      config: {
        ...baseRequest.config,
        additionalParams: {
          top_p: 0.9,
          thinking: { type: 'enabled', budget_tokens: 2048 },
        },
      },
    };

    const body = adapter.buildRequestBody(request, false);
    expect(body.thinking).toBeUndefined();
    expect(body.top_p).toBe(0.9);

    // 未声明 disableThinking 时保留模型配置的 thinking
    const kept = adapter.buildRequestBody({ ...request, disableThinking: false }, false);
    expect(kept.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 });
  });

  it('passes the explicit thinking of an unknown model through without adding reasoning parameters', () => {
    // 能力表匹配不到的模型（如网关别名）：只透传管理员显式写的 thinking / output_config，档位不再自动换算
    const adapter = createAdapter();
    const unsupported = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          reasoningEffort: 'medium',
          additionalParams: undefined,
        },
      },
      false,
    );
    expect(unsupported.thinking).toBeUndefined();
    expect(unsupported.output_config).toBeUndefined();

    const max = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          reasoningEffort: 'max',
          additionalParams: {
            top_p: 0.9,
            output_config: { verbosity: 'medium' },
            thinking: { type: 'enabled', budget_tokens: 2048 },
          },
        },
      },
      false,
    );
    expect(max.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 });
    expect(max.output_config).toEqual({ verbosity: 'medium' });
    expect(max.top_p).toBe(0.9);

    // off 时去掉 thinking 与 effort（现状行为），不承诺能关
    const off = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          reasoningEffort: 'off',
          additionalParams: {
            output_config: { verbosity: 'medium', effort: 'high' },
            thinking: { type: 'enabled', budget_tokens: 2048 },
          },
        },
      },
      false,
    );
    expect(off.thinking).toBeUndefined();
    expect(off.output_config).toEqual({ verbosity: 'medium' });
  });

  it('maps Claude stream events to gateway events without parsing partial JSON', async () => {
    const adapter = createAdapter();
    (adapter as any).post = jest.fn().mockResolvedValue(
      mockSseResponse([
        {
          type: 'message_start',
          message: {
            usage: {
              input_tokens: 2,
              output_tokens: 0,
              cache_read_input_tokens: 1,
              provider_private: { sentinel: 'PRIVATE_ANTHROPIC_USAGE' },
            },
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: '想' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: '答' },
        },
        {
          type: 'content_block_start',
          index: 2,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'search' },
        },
        {
          type: 'content_block_delta',
          index: 2,
          delta: { type: 'input_json_delta', partial_json: '{"q"' },
        },
        {
          type: 'content_block_delta',
          index: 3,
          delta: { type: 'signature_delta', signature: 'must-not-leak' },
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: {
            output_tokens: 3,
            provider_private: { sentinel: 'PRIVATE_ANTHROPIC_USAGE' },
          },
        },
        { type: 'message_stop' },
      ]),
    );

    const mapped: any[] = [];
    for await (const event of adapter.stream(baseRequest)) {
      mapped.push(event);
    }

    expect(mapped).toEqual([
      {
        type: 'usage',
        usage: {
          inputTokens: 3,
          outputTokens: 0,
          totalTokens: 3,
          cacheHitTokens: 1,
          cacheMissTokens: 2,
        },
      },
      { type: 'reasoning_delta', delta: '想' },
      { type: 'text_delta', delta: '答' },
      {
        type: 'tool_call_delta',
        index: 2,
        id: 'toolu_1',
        nameDelta: 'search',
        rawName: 'search',
      },
      {
        type: 'tool_call_delta',
        index: 2,
        id: 'toolu_1',
        argumentsDelta: '{"q"',
        rawName: 'search',
      },
      {
        type: 'usage',
        // 后面的增量只带 output_tokens：缓存数保持，不被清零
        usage: {
          inputTokens: 3,
          outputTokens: 3,
          totalTokens: 6,
          cacheHitTokens: 1,
          cacheMissTokens: 2,
        },
      },
      // 这次回复的回放记录（块没有正常结束，只留谱系）：紧挨在 done 之前
      {
        type: 'provider_state',
        state: expect.objectContaining({ protocol: 'anthropic_messages', replayable: false }),
      },
      { type: 'done', finishReason: 'tool_use' },
    ]);
    expect(JSON.stringify(mapped)).not.toContain('must-not-leak');
    expect(JSON.stringify(mapped)).not.toContain('PRIVATE_ANTHROPIC_USAGE');
  });

  it('maps Claude non-stream responses and usage', async () => {
    const adapter = createAdapter();
    (adapter as any).post = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        content: [
          { type: 'text', text: 'hello' },
          { type: 'tool_use', id: 'toolu_1', name: 'search', input: {} },
        ],
        usage: {
          input_tokens: 4,
          output_tokens: 5,
          cache_read_input_tokens: 2,
          provider_private: { sentinel: 'PRIVATE_ANTHROPIC_NON_STREAM' },
        },
        provider_private: { sentinel: 'PRIVATE_ANTHROPIC_NON_STREAM' },
      }),
    });

    const result = await adapter.completeOnce({ ...baseRequest, stream: false });

    expect(result).toEqual({
      content: 'hello',
      usage: {
        inputTokens: 6,
        outputTokens: 5,
        totalTokens: 11,
        cacheHitTokens: 2,
        cacheMissTokens: 4,
      },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_ANTHROPIC_NON_STREAM');
  });

  describe('usage', () => {
    const usageSnapshots = async (adapter: any, events: any[]) => {
      adapter.post = jest.fn().mockResolvedValue(mockSseResponse(events));
      const snapshots: any[] = [];
      for await (const event of adapter.stream(baseRequest)) {
        if (event.type === 'usage') snapshots.push(event.usage);
      }
      return snapshots;
    };
    const snapshot = (input: number, output: number, hit: number, miss: number) => ({
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
      cacheHitTokens: hit,
      cacheMissTokens: miss,
    });

    it('counts cache writes and reads as input and keeps them across partial deltas', async () => {
      const snapshots = await usageSnapshots(createAdapter(), [
        {
          type: 'message_start',
          message: {
            usage: {
              input_tokens: 100,
              cache_creation_input_tokens: 200,
              cache_read_input_tokens: 300,
              output_tokens: 1,
            },
          },
        },
        // 只带输出：输入三项保持
        { type: 'message_delta', delta: {}, usage: { output_tokens: 20 } },
        // 只带一个输入分量：只更新这一项
        { type: 'message_delta', delta: {}, usage: { cache_creation_input_tokens: 250 } },
        // 完整的累计值：整体覆盖，重复出现也不累加
        {
          type: 'message_delta',
          delta: {},
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 300,
            output_tokens: 25,
          },
        },
        {
          type: 'message_delta',
          delta: {},
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 300,
            output_tokens: 25,
          },
        },
        // 显式 0 覆盖
        { type: 'message_delta', delta: {}, usage: { cache_read_input_tokens: 0 } },
        { type: 'message_stop' },
      ]);

      expect(snapshots).toEqual([
        snapshot(600, 1, 300, 300),
        snapshot(600, 20, 300, 300),
        snapshot(650, 20, 300, 350),
        snapshot(600, 25, 300, 300),
        snapshot(600, 25, 300, 300),
        snapshot(300, 25, 0, 300),
      ]);
    });

    it('ignores invalid counts and starts each request from zero', async () => {
      const adapter = createAdapter();
      // 原始 SSE 文本：1e400 经 JSON.parse 成为 Infinity（不能用 JSON.stringify 造，那样会变成 null）
      (adapter as any).post = jest.fn().mockResolvedValue({
        ok: true,
        body: (async function* () {
          yield Buffer.from(
            [
              'event: message_start',
              'data: {"type":"message_start","message":{"usage":{"input_tokens":10,"cache_read_input_tokens":5,"output_tokens":1}}}',
              '',
              'event: message_delta',
              'data: {"type":"message_delta","delta":{},"usage":{"input_tokens":-1,"cache_read_input_tokens":"50","cache_creation_input_tokens":null,"output_tokens":1e400}}',
              '',
              'event: message_stop',
              'data: {"type":"message_stop"}',
              '',
              '',
            ].join('\n'),
          );
        })(),
      });
      const first: any[] = [];
      for await (const event of adapter.stream(baseRequest)) {
        if (event.type === 'usage') first.push(event.usage);
      }
      expect(first).toEqual([snapshot(15, 1, 5, 10), snapshot(15, 1, 5, 10)]);

      // 同一个适配器的下一次请求不带上一次的计数；缺失的字段按 0
      const second = await usageSnapshots(adapter, [
        { type: 'message_start', message: { usage: { input_tokens: 7 } } },
        { type: 'message_stop' },
      ]);
      expect(second).toEqual([snapshot(7, 0, 0, 7)]);
    });

    it('ignores non-finite counts in non-stream responses', async () => {
      const adapter = createAdapter();
      (adapter as any).post = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
          usage: {
            input_tokens: 4,
            cache_creation_input_tokens: Number.NaN,
            cache_read_input_tokens: Number.POSITIVE_INFINITY,
            output_tokens: 2,
          },
        }),
      });

      const result = await adapter.completeOnce({ ...baseRequest, stream: false });

      expect(result.usage).toEqual(snapshot(4, 2, 0, 4));
    });

    it('reaches the collector as the last full snapshot without private fields', async () => {
      const adapter = createAdapter();
      (adapter as any).post = jest.fn().mockResolvedValue(
        mockSseResponse([
          {
            type: 'message_start',
            message: {
              usage: {
                input_tokens: 100,
                cache_creation_input_tokens: 200,
                cache_read_input_tokens: 300,
                output_tokens: 1,
                provider_private: { sentinel: 'PRIVATE_ANTHROPIC_USAGE' },
              },
            },
          },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '答' } },
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: 20 },
          },
          { type: 'message_stop' },
        ]),
      );

      const collected = await collectModelStream(adapter.stream(baseRequest));

      expect(collected.usage).toEqual(snapshot(600, 20, 300, 300));
      expect(JSON.stringify(collected)).not.toContain('PRIVATE_ANTHROPIC_USAGE');
    });

    it('applies the same accounting to non-stream responses', async () => {
      const adapter = createAdapter();
      (adapter as any).post = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 300,
            output_tokens: 20,
          },
        }),
      });

      const result = await adapter.completeOnce({ ...baseRequest, stream: false });

      expect(result.usage).toEqual(snapshot(600, 20, 300, 300));
    });
  });

  it('uses a unified throw strategy for Claude error events', async () => {
    const adapter = createAdapter();
    (adapter as any).post = jest
      .fn()
      .mockResolvedValue(mockSseResponse([{ type: 'error', error: { message: 'bad request' } }]));

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

  it('does not synthesize success when a Claude stream ends without message_stop', async () => {
    const adapter = createAdapter();
    (adapter as any).post = jest.fn().mockResolvedValue(
      mockSseResponse([
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'partial' },
        },
      ]),
    );

    const events: any[] = [];
    for await (const event of adapter.stream(baseRequest)) events.push(event);

    expect(events).toEqual([{ type: 'text_delta', delta: 'partial' }]);
    expect(events.some(event => event.type === 'done')).toBe(false);
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
    'classifies rejected HTTP %i without leaking the response body',
    async (status: number, category: string, requestOutcome: string, retryable: boolean) => {
      const adapter = createAdapter();
      (adapter as any).post = jest.fn().mockResolvedValue({
        ok: false,
        status,
        headers: {
          get: (name: string) =>
            status === 429 && name.toLowerCase() === 'retry-after' ? '3' : null,
        },
        text: jest.fn().mockResolvedValue(`PRIVATE_ANTHROPIC_${status}`),
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
      expect(String(thrown)).not.toContain(`PRIVATE_ANTHROPIC_${status}`);
      expect(thrown).not.toHaveProperty('raw');
    },
  );

  it('keeps a network failure unknown and non-retryable', async () => {
    const adapter = createAdapter();
    (adapter as any).post = jest
      .fn()
      .mockRejectedValue({ code: 'ECONNRESET', message: 'PRIVATE_NETWORK_DETAIL' });
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
    (adapter as any).post = jest.fn().mockRejectedValue(new Error('transport'));
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

function mockSseResponse(events: any[]) {
  const frames = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  return {
    ok: true,
    body: (async function* () {
      yield Buffer.from(frames.join(''));
    })(),
  };
}
