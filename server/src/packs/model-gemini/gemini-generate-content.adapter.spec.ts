import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import { ModelStreamRegistry } from '@/modules/modelGateway/model-stream';
import { GeminiGenerateContentAdapter } from './gemini-generate-content.adapter';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('GeminiGenerateContentAdapter', () => {
  const createAdapter = () => {
    const registry = new ModelStreamRegistry();
    return new GeminiGenerateContentAdapter(new ModelGatewayUrlBuilder(registry), registry);
  };
  const baseRequest: any = {
    config: {
      protocol: 'gemini_generate_content',
      model: 'gemini-test',
      apiKey: 'gemini-test-key',
      baseUrl: 'https://generativelanguage.googleapis.com',
      additionalParams: { safetySettings: [] },
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

  it('builds Gemini request bodies and rejects core overrides', () => {
    const adapter = createAdapter();
    expect(adapter.buildRequestBody(baseRequest, true)).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      systemInstruction: { parts: [{ text: 'You are helpful.' }] },
      safetySettings: [],
      generationConfig: { temperature: 0.2 },
      tools: [{ functionDeclarations: [{ name: 'search', parameters: {} }] }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    });

    expect(() =>
      adapter.buildRequestBody(
        { ...baseRequest, config: { ...baseRequest.config, additionalParams: { contents: [] } } },
        true,
      ),
    ).toThrow('核心字段');

    expect(() =>
      adapter.buildRequestBody(
        {
          ...baseRequest,
          config: {
            ...baseRequest.config,
            additionalParams: { generationConfig: { temperature: 1 } },
          },
        },
        true,
      ),
    ).toThrow('核心字段');
  });

  it('passes a temperature only when the request sets one', () => {
    const adapter = createAdapter();
    // 不设默认温度：没指定时使用模型服务自己的默认值
    const { temperature: _unused, ...withoutTemperature } = baseRequest;
    expect(adapter.buildRequestBody(withoutTemperature, true).generationConfig).not.toHaveProperty(
      'temperature',
    );
    expect(adapter.buildRequestBody(baseRequest, true).generationConfig).toMatchObject({
      temperature: 0.2,
    });
    expect(
      adapter.buildRequestBody({ ...baseRequest, temperature: 0 }, true).generationConfig,
    ).toMatchObject({ temperature: 0 });
  });

  it('maps controlled reasoning levels into Gemini thinkingConfig', () => {
    const adapter = createAdapter();
    const gemini3 = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'gemini-3-pro',
          reasoningEffort: 'medium',
        },
      },
      false,
    );
    expect(gemini3.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'MEDIUM' });

    const disabled = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'gemini-2.5-flash',
          reasoningEffort: 'off',
        },
      },
      false,
    );
    expect(disabled.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });

    const maximum = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'gemini-2.5-pro',
          reasoningEffort: 'max',
        },
      },
      false,
    );
    expect(maximum.generationConfig.thinkingConfig).toEqual({ thinkingBudget: -1 });
  });

  it('uses URL builder endpoints, x-goog-api-key, and maps Gemini stream chunks', async () => {
    const adapter = createAdapter();
    const fetchMock = jest.fn().mockResolvedValue(
      mockSseResponse([
        {
          candidates: [{ content: { parts: [{ text: '答' }] } }],
        },
        {
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: 'search', args: { q: 'docs' } } }],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 2,
            candidatesTokenCount: 3,
            totalTokenCount: 5,
            cachedContentTokenCount: 1,
            providerPrivate: { sentinel: 'PRIVATE_GEMINI_USAGE' },
          },
        },
      ]),
    );
    const previousFetch = (global as any).fetch;
    (global as any).fetch = fetchMock;

    try {
      const mapped: any[] = [];
      for await (const event of adapter.stream(baseRequest)) {
        mapped.push(event);
      }

      expect(fetchMock).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-goog-api-key': 'gemini-test-key',
            accept: 'text/event-stream',
          }),
        }),
      );
      expect(mapped).toEqual([
        { type: 'text_delta', delta: '答' },
        {
          type: 'tool_call_delta',
          index: 0,
          id: 'gemini_call_0',
          nameDelta: 'search',
          rawName: 'search',
        },
        {
          type: 'tool_call_delta',
          index: 0,
          id: 'gemini_call_0',
          argumentsDelta: '{"q":"docs"}',
          rawName: 'search',
        },
        { type: 'done', finishReason: 'STOP' },
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
      ]);
      expect(JSON.stringify(mapped)).not.toContain('PRIVATE_GEMINI_USAGE');
    } finally {
      (global as any).fetch = previousFetch;
    }
  });

  it('does not synthesize success when a Gemini stream ends without a finish reason', async () => {
    const adapter = createAdapter();
    (adapter as any).post = jest
      .fn()
      .mockResolvedValue(
        mockSseResponse([{ candidates: [{ content: { parts: [{ text: 'partial' }] } }] }]),
      );

    const events: any[] = [];
    for await (const event of adapter.stream(baseRequest)) events.push(event);

    expect(events).toEqual([{ type: 'text_delta', delta: 'partial' }]);
    expect(events.some(event => event.type === 'done')).toBe(false);
  });

  it('maps Gemini non-stream responses and usage', async () => {
    const adapter = createAdapter();
    (adapter as any).post = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'hello' }] } }],
        usageMetadata: {
          promptTokenCount: 4,
          candidatesTokenCount: 5,
          totalTokenCount: 9,
          cachedContentTokenCount: 2,
          providerPrivate: { sentinel: 'PRIVATE_GEMINI_NON_STREAM' },
        },
        providerPrivate: { sentinel: 'PRIVATE_GEMINI_NON_STREAM' },
      }),
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
    expect(JSON.stringify(result)).not.toContain('PRIVATE_GEMINI_NON_STREAM');
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
        text: jest.fn().mockResolvedValue(`PRIVATE_GEMINI_${status}`),
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
      expect(String(thrown)).not.toContain(`PRIVATE_GEMINI_${status}`);
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
  const frames = events.map(event => `data: ${JSON.stringify(event)}\n\n`);
  return {
    ok: true,
    body: (async function* () {
      yield Buffer.from(frames.join(''));
    })(),
  };
}
