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

  it('maps controlled reasoning levels into Gemini thinkingConfig across Gemini 2.5, 3, and 4', () => {
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
    expect(gemini3.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'MEDIUM',
    });

    const hydrogenXHigh = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'gemini-4-hydrogen',
          reasoningEffort: 'xhigh',
        },
      },
      false,
    );
    expect(hydrogenXHigh.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'XHIGH',
    });

    const hydrogenMinimalFallback = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'gemini-4-hydrogen',
          reasoningEffort: 'minimal',
        },
      },
      false,
    );
    expect(hydrogenMinimalFallback.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
    });

    const argonXHighClamped = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'gemini-4-argon',
          reasoningEffort: 'xhigh',
        },
      },
      false,
    );
    expect(argonXHighClamped.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'HIGH',
    });

    const gemini4Compaction = adapter.buildRequestBody(
      {
        ...baseRequest,
        purpose: 'context_compaction',
        disableThinking: true,
        config: {
          ...baseRequest.config,
          model: 'gemini-4-hydrogen',
          reasoningEffort: 'off',
        },
      },
      false,
    );
    expect(gemini4Compaction.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'LOW',
    });

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
    expect(maximum.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingBudget: -1,
    });

    // 不支持关闭思考的模型（gemini-2.5-pro、gemini-3-pro）在 disableThinking 与 off 下不会发非法 0 预算或 MINIMAL
    expect(
      adapter.buildRequestBody(
        {
          ...baseRequest,
          disableThinking: true,
          config: { ...baseRequest.config, model: 'gemini-2.5-pro', reasoningEffort: 'off' },
        },
        false,
      ).generationConfig.thinkingConfig,
    ).toEqual({ thinkingBudget: 128 });
    expect(
      adapter.buildRequestBody(
        {
          ...baseRequest,
          config: {
            ...baseRequest.config,
            model: 'gemini-3-pro-preview',
            reasoningEffort: 'minimal',
          },
        },
        false,
      ).generationConfig.thinkingConfig,
    ).toEqual({ includeThoughts: true });
    expect(
      adapter.buildRequestBody(
        {
          ...baseRequest,
          config: { ...baseRequest.config, model: 'gemma-4-31b-it', reasoningEffort: 'high' },
        },
        false,
      ).generationConfig.thinkingConfig,
    ).toEqual({ includeThoughts: true });
    expect(
      adapter.buildRequestBody(
        {
          ...baseRequest,
          config: { ...baseRequest.config, model: 'gemini-2.5-flash', reasoningEffort: 'xhigh' },
        },
        false,
      ).generationConfig.thinkingConfig,
    ).toEqual({ includeThoughts: true, thinkingBudget: 24576 });
    expect(
      adapter.buildRequestBody(
        {
          ...baseRequest,
          config: { ...baseRequest.config, model: 'gemma-3-27b-it', reasoningEffort: 'high' },
        },
        false,
      ).generationConfig.thinkingConfig,
    ).toBeUndefined();
  });

  it('enables native Google Search alongside function tools and projects hosted search events', async () => {
    const adapter = createAdapter();
    const searchRequest = {
      ...baseRequest,
      config: {
        ...baseRequest.config,
        model: 'gemini-4-hydrogen',
        capabilities: {
          nativeTools: {
            webSearch: {
              enabled: true,
              mode: 'auto',
              includeSources: true,
            },
          },
        },
      },
    };

    const body = adapter.buildRequestBody(searchRequest, true);
    expect(body.tools).toEqual([
      { googleSearch: {} },
      { functionDeclarations: [{ name: 'search', parameters: {} }] },
    ]);
    expect(body.toolConfig).toEqual({
      functionCallingConfig: { mode: 'AUTO' },
      includeServerSideToolInvocations: true,
    });

    const probeBody = adapter.buildRequestBody(
      { ...searchRequest, purpose: 'test_connection' },
      false,
    );
    expect(probeBody.tools).toEqual([
      { functionDeclarations: [{ name: 'search', parameters: {} }] },
    ]);

    expect(adapter.buildRequestBody({ ...searchRequest, toolChoice: 'none' }, false).tools).toEqual(
      [{ functionDeclarations: [{ name: 'search', parameters: {} }] }],
    );
    expect(
      adapter.buildRequestBody(
        { ...searchRequest, purpose: 'chat_title', disableThinking: true },
        false,
      ).tools,
    ).toEqual([{ functionDeclarations: [{ name: 'search', parameters: {} }] }]);
    expect(
      adapter.buildRequestBody(
        { ...searchRequest, config: { ...searchRequest.config, model: 'gemini-2.5-flash' } },
        false,
      ).tools,
    ).toEqual([{ functionDeclarations: [{ name: 'search', parameters: {} }] }]);

    (adapter as any).post = jest.fn().mockResolvedValue(
      mockSseResponse([
        {
          candidates: [
            {
              content: {
                parts: [
                  {
                    thoughtSignature: 'SIG_S1',
                    toolCall: {
                      id: 'gsearch_1',
                      toolType: 'GOOGLE_SEARCH_WEB',
                      args: { queries: ['Gemini 4 Hydrogen release'] },
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          candidates: [
            {
              content: {
                parts: [
                  {
                    thoughtSignature: 'SIG_S2',
                    toolResponse: {
                      id: 'gsearch_1',
                      toolType: 'GOOGLE_SEARCH_WEB',
                      response: {},
                    },
                  },
                  { text: 'Released in Nov 2026.' },
                ],
              },
              groundingMetadata: {
                webSearchQueries: ['Gemini 4 Hydrogen release'],
                groundingChunks: [
                  { web: { uri: 'https://blog.google/gemini-4', title: 'Google Blog' } },
                  { web: { uri: 'javascript:alert(1)' } },
                ],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            toolUsePromptTokenCount: 5,
            candidatesTokenCount: 6,
            thoughtsTokenCount: 14,
            totalTokenCount: 35,
          },
        },
      ]),
    );

    const streamed: any[] = [];
    for await (const event of adapter.stream(searchRequest)) {
      streamed.push(event);
    }

    const hosted = streamed.filter(event => event.type === 'hosted_tool_call');
    expect(hosted).toHaveLength(3);
    expect(hosted[0].toolCall).toMatchObject({
      name: 'gemini_google_search',
      status: 'searching',
      inputSummary: '搜索：Gemini 4 Hydrogen release',
    });
    expect(hosted[1].toolCall).toMatchObject({
      name: 'gemini_google_search',
      status: 'success',
    });
    expect(hosted[2].toolCall).toMatchObject({
      name: 'gemini_google_search',
      status: 'success',
      update: true,
      output: expect.objectContaining({
        queries: ['Gemini 4 Hydrogen release'],
        results: [{ title: 'Google Blog', url: 'https://blog.google/gemini-4' }],
      }),
    });
    const usageEvent = streamed.find(event => event.type === 'usage');
    expect(usageEvent.usage).toMatchObject({
      inputTokens: 15,
      outputTokens: 20,
      totalTokens: 35,
    });
  });

  it('lists generateContent models from /v1beta/models', async () => {
    const adapter = createAdapter();
    const previousFetch = (global as any).fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        models: [
          {
            name: 'models/gemini-4-hydrogen',
            displayName: 'Gemini 4 Hydrogen',
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          },
          {
            name: 'models/gemini-3.8-live',
            displayName: 'Gemini 3.8 Live',
            supportedGenerationMethods: ['bidiGenerateContent'],
          },
        ],
      }),
    });
    try {
      const models = await adapter.listRemoteModels({
        protocol: 'gemini_generate_content',
        baseUrl: 'https://core.example.com',
        apiKey: 'gemini-key',
        model: 'gemini-4-hydrogen',
      });
      expect(models).toEqual([{ id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen' }]);
    } finally {
      (global as any).fetch = previousFetch;
    }
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
          redirect: 'error',
          headers: expect.objectContaining({
            'x-goog-api-key': 'gemini-test-key',
            accept: 'text/event-stream',
          }),
        }),
      );

      // 即使模型配置保存了非流式后缀 endpointPath，流式调用也会自动切换为 :streamGenerateContent
      fetchMock.mockResolvedValueOnce(
        mockSseResponse([
          { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] },
        ]),
      );
      for await (const _event of adapter.stream({
        ...baseRequest,
        config: {
          ...baseRequest.config,
          endpointPath: '/v1beta/models/{model}:generateContent',
        },
      })) {
        // consume
      }
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse',
        expect.objectContaining({ redirect: 'error' }),
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
