import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import { ModelStreamRegistry } from '@/modules/modelGateway/model-stream';
import { buildModelGatewayProviderProfilePayload } from '@/modules/modelGateway/provider-profiles';
import {
  clearDeepSeekFileCacheForTests,
  DEEPSEEK_READ_URL_TOOL_NAME,
  DEEPSEEK_WEB_SEARCH_TOOL_NAME,
  validatePublicWebUrl,
} from './deepseek-responses';
import { OPENAI_RESPONSES_DESCRIPTOR, OpenAIResponsesAdapter } from './openai-responses.adapter';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('DeepSeek native Responses integration', () => {
  const originalFetch = global.fetch;

  const createAdapter = () => {
    const registry = new ModelStreamRegistry();
    return new OpenAIResponsesAdapter(new ModelGatewayUrlBuilder(registry), registry);
  };

  const baseDeepSeekRequest: any = {
    config: {
      protocol: 'openai_responses',
      model: 'deepseek-flash',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      endpointPath: '/v1/responses',
      reasoningEffort: 'high',
      capabilities: {
        vision: true,
        documentInput: true,
        reasoning: 'delta',
        maxOutputTokens: 393216,
        reasoningControl: {
          levels: ['off', 'low', 'high', 'max'],
          defaultLevel: 'high',
        },
        nativeTools: {
          webSearch: {
            enabled: true,
            mode: 'auto',
            includeSources: true,
          },
        },
      },
    },
    messages: [
      { role: 'system', content: '你是可靠的 AI 助手。' },
      { role: 'user', content: '帮我查一下 DeepSeek V4.1 Flash 的特性。' },
    ],
    stream: true,
    purpose: 'agent_loop',
  };

  beforeEach(() => {
    clearDeepSeekFileCacheForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('exposes DeepSeek native Responses preset and catalog capabilities to admin profiles', () => {
    const payload = buildModelGatewayProviderProfilePayload([OPENAI_RESPONSES_DESCRIPTOR]);
    const deepSeekProfile = payload.profiles.find(item => item.key === 'deepseek_responses');

    expect(deepSeekProfile).toMatchObject({
      key: 'deepseek_responses',
      protocol: 'openai_responses',
      baseUrl: 'https://api.deepseek.com',
      endpointPath: '/v1/responses',
      supportsRemoteModelList: true,
      defaultMultimodalTypes: ['image_url', 'document'],
    });
    expect(deepSeekProfile?.modelCatalog.map(item => item.id)).toEqual([
      'deepseek-flash',
      'deepseek-v4-pro',
    ]);
    expect(deepSeekProfile?.modelCatalog[0]).toMatchObject({
      id: 'deepseek-flash',
      maxTokens: 1048576,
      multimodalTypes: ['image_url', 'document'],
      capabilities: expect.objectContaining({
        vision: true,
        documentInput: true,
        reasoning: 'delta',
        maxOutputTokens: 393216,
        reasoningControl: {
          levels: ['off', 'low', 'high', 'max'],
          defaultLevel: 'high',
        },
        nativeTools: {
          webSearch: {
            enabled: true,
            mode: 'auto',
            includeSources: true,
          },
        },
      }),
    });
  });

  it('uses server-side deepseek_web_search/deepseek_read_url in pure chat and standalone function web tools when client tools exist', () => {
    const adapter = createAdapter();

    const pureChatBody = adapter.buildRequestBody(baseDeepSeekRequest, true);
    expect(pureChatBody.tools).toEqual([
      { type: DEEPSEEK_WEB_SEARCH_TOOL_NAME },
      { type: DEEPSEEK_READ_URL_TOOL_NAME },
    ]);
    expect(pureChatBody.include).toBeUndefined();
    expect(pureChatBody.reasoning).toEqual({ effort: 'high' });

    const v4ProBody = adapter.buildRequestBody(
      {
        ...baseDeepSeekRequest,
        config: { ...baseDeepSeekRequest.config, model: 'deepseek-v4-pro' },
      },
      true,
    );
    expect(v4ProBody.tools).toEqual([{ type: 'web_search' }]);

    const agentWithClientToolsBody = adapter.buildRequestBody(
      {
        ...baseDeepSeekRequest,
        tools: [{ type: 'function', function: { name: 'bash', parameters: { type: 'object' } } }],
      },
      true,
    );
    expect(agentWithClientToolsBody.tools.map((t: any) => `${t.type}:${t.name}`)).toEqual([
      'function:bash',
      `function:${DEEPSEEK_WEB_SEARCH_TOOL_NAME}`,
      `function:${DEEPSEEK_READ_URL_TOOL_NAME}`,
    ]);

    for (const purpose of [
      'test_connection',
      'context_compaction',
      'chat_title',
      'memory_write_extract',
    ]) {
      const isolated = adapter.buildRequestBody({ ...baseDeepSeekRequest, purpose }, true);
      expect(isolated.tools).toBeUndefined();
    }

    const disabledThinking = adapter.buildRequestBody(
      {
        ...baseDeepSeekRequest,
        disableThinking: true,
        config: { ...baseDeepSeekRequest.config, reasoningEffort: undefined },
      },
      true,
    );
    expect(disabledThinking.reasoning).toEqual({ effort: 'none' });
    expect(disabledThinking.tools).toBeUndefined();
  });

  it('maps reasoningControl levels and skips unsupported probe levels during test_connection', () => {
    const adapter = createAdapter();

    for (const [effort, expected] of [
      ['off', 'none'],
      ['low', 'low'],
      ['high', 'high'],
      ['max', 'max'],
    ] as const) {
      const body = adapter.buildRequestBody(
        {
          ...baseDeepSeekRequest,
          maxTokens: 512,
          purpose: 'test_connection',
          config: { ...baseDeepSeekRequest.config, reasoningEffort: effort },
        },
        true,
      );
      expect(body.reasoning).toEqual({ effort: expected });
      expect(body.max_output_tokens).toBe(expected === 'none' ? 512 : 4096);
    }

    const unsupportedMediumProbe = adapter.buildRequestBody(
      {
        ...baseDeepSeekRequest,
        purpose: 'test_connection',
        config: { ...baseDeepSeekRequest.config, reasoningEffort: 'medium' },
      },
      true,
    );
    expect(unsupportedMediumProbe.reasoning).toBeUndefined();
  });

  it('replays reasoning_text only for active tool-call continuations and falls back to effort:none when reasoning is absent', () => {
    const adapter = createAdapter();

    const multiTurnMessages: any[] = [
      { role: 'user', content: '上一轮问题' },
      {
        role: 'assistant',
        content: '',
        reasoning_content: '历史轮推理不应重复回放',
        tool_calls: [{ id: 'hist_1', type: 'function', function: { name: 'ls', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 'hist_1', content: 'README.md' },
      { role: 'assistant', content: '上一轮已完成。' },
      { role: 'user', content: '当前轮问题' },
      {
        role: 'assistant',
        content: '正在执行命令',
        reasoning_content: '先检查当前目录结构',
        tool_calls: [
          {
            id: 'active_1',
            type: 'function',
            function: { name: 'bash', arguments: '{"cmd":"pwd"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'active_1', content: '/workspace' },
    ];

    const activeBody = adapter.buildRequestBody(
      {
        ...baseDeepSeekRequest,
        messages: multiTurnMessages,
        tools: [{ type: 'function', function: { name: 'bash', parameters: {} } }],
      },
      true,
    );

    expect(JSON.stringify(activeBody.input)).not.toContain('历史轮推理不应重复回放');
    const activeUserIdx = activeBody.input.findIndex(
      (item: any) => item.role === 'user' && item.content === '当前轮问题',
    );
    expect(activeBody.input.slice(activeUserIdx + 1)).toEqual([
      {
        type: 'reasoning',
        content: [{ type: 'reasoning_text', text: '先检查当前目录结构' }],
      },
      { role: 'assistant', content: '正在执行命令' },
      {
        type: 'function_call',
        call_id: 'active_1',
        name: 'bash',
        arguments: '{"cmd":"pwd"}',
      },
      {
        type: 'function_call_output',
        call_id: 'active_1',
        output: '/workspace',
      },
    ]);
    expect(activeBody.reasoning).toEqual({ effort: 'high' });

    const missingReasoningBody = adapter.buildRequestBody(
      {
        ...baseDeepSeekRequest,
        messages: [
          { role: 'user', content: '当前轮无思考工具续接' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'active_2', type: 'function', function: { name: 'bash', arguments: '{}' } },
            ],
          },
          { role: 'tool', tool_call_id: 'active_2', content: 'ok' },
        ],
        tools: [{ type: 'function', function: { name: 'bash', parameters: {} } }],
      },
      true,
    );
    expect(missingReasoningBody.reasoning).toEqual({ effort: 'none' });
  });

  it('uploads inline PDFs via Files API (rich_layout_recognition before file), caches in normal turns, and deletes after test_connection', async () => {
    const adapter = createAdapter();
    const fetchCalls: Array<{ url: string; method: string; formKeys?: string[] }> = [];

    global.fetch = jest.fn(async (url: any, init: any) => {
      const urlStr = String(url);
      const method = String(init?.method || 'GET');
      const formKeys: string[] = [];
      if (init?.body instanceof FormData) {
        for (const [key] of (init.body as any).entries()) {
          formKeys.push(key);
        }
      }
      fetchCalls.push({ url: urlStr, method, ...(formKeys.length ? { formKeys } : {}) });
      if (method === 'POST' && urlStr === 'https://api.deepseek.com/v1/files') {
        return new Response(JSON.stringify({ id: `file-ds-${fetchCalls.length}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'DELETE' && urlStr.startsWith('https://api.deepseek.com/v1/files/')) {
        return new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${urlStr}`);
    }) as any;

    const createSpy = jest.fn().mockImplementation(() =>
      Promise.resolve(
        (async function* () {
          yield { type: 'response.output_text.delta', delta: '4827' };
          yield {
            type: 'response.completed',
            response: {
              status: 'completed',
              usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
            },
          };
        })(),
      ),
    );
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: { create: createSpy },
    });

    const pdfMessageRequest = {
      ...baseDeepSeekRequest,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '读取 PDF 中的验证码' },
            {
              type: 'document',
              document: {
                name: 'probe.pdf',
                mime: 'application/pdf',
                data: 'data:application/pdf;base64,JVBERi0xLjQK',
              },
            },
          ],
        },
      ],
    };

    // 第一次正常对话上传并走缓存；第二次命中 SHA-256 缓存不再重复上传
    for await (const unused of adapter.stream(pdfMessageRequest)) void unused;
    for await (const unused of adapter.stream(pdfMessageRequest)) void unused;

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toEqual({
      url: 'https://api.deepseek.com/v1/files',
      method: 'POST',
      formKeys: ['purpose', 'expires_after[anchor]', 'expires_after[seconds]', 'file'],
    });
    expect(createSpy.mock.calls[0][0].input[0].content[1]).toEqual({
      type: 'input_file',
      file_id: 'file-ds-1',
    });
    expect(createSpy.mock.calls[1][0].input[0].content[1]).toEqual({
      type: 'input_file',
      file_id: 'file-ds-1',
    });

    // test_connection 跳过缓存并在结束后自动 DELETE 临时文件
    for await (const unused of adapter.stream({
      ...pdfMessageRequest,
      purpose: 'test_connection',
    })) {
      void unused;
    }

    expect(fetchCalls.slice(1)).toEqual([
      {
        url: 'https://api.deepseek.com/v1/files',
        method: 'POST',
        formKeys: ['purpose', 'expires_after[anchor]', 'expires_after[seconds]', 'file'],
      },
      {
        url: 'https://api.deepseek.com/v1/files/file-ds-2',
        method: 'DELETE',
      },
    ]);
  });

  it('executes standalone /v1/tools/search and /v1/tools/fetch inside Agent turns and emits replayable provider_state before client tools', async () => {
    const adapter = createAdapter();

    global.fetch = jest.fn(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr === 'https://api.deepseek.com/v1/tools/search') {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body).toMatchObject({
          query: 'DeepSeek V4.1 Flash release',
          count: 6,
          need_content: false,
        });
        return new Response(
          JSON.stringify({
            results: [
              {
                url: 'https://api-docs.deepseek.com/news/news261113',
                title: 'DeepSeek Full-Suite App API',
                snippet: 'DeepSeek V4.1 Flash launched.',
              },
              {
                url: 'javascript:alert(1)',
                title: 'Malicious Link',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (urlStr === 'https://api.deepseek.com/v1/tools/fetch') {
        return new Response(
          JSON.stringify({
            title: 'DeepSeek Full-Suite App API',
            content: '# Release Notes\nSupports vision, PDF parsing, and web search.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${urlStr}`);
    }) as any;

    let stepCall = 0;
    const createSpy = jest.fn().mockImplementation(() => {
      stepCall += 1;
      if (stepCall === 1) {
        return Promise.resolve(
          (async function* () {
            yield {
              type: 'response.reasoning_text.delta',
              output_index: 0,
              item_id: 'rs_1',
              delta: '先联网搜索发布公告',
            };
            yield {
              type: 'response.reasoning_text.done',
              output_index: 0,
              item_id: 'rs_1',
              text: '先联网搜索发布公告',
            };
            yield {
              type: 'response.output_item.added',
              output_index: 1,
              item: {
                type: 'function_call',
                call_id: 'ws_fc_1',
                name: DEEPSEEK_WEB_SEARCH_TOOL_NAME,
              },
            };
            yield {
              type: 'response.function_call_arguments.delta',
              output_index: 1,
              delta: '{"queries":["DeepSeek V4.1 Flash release"]}',
            };
            yield {
              type: 'response.completed',
              response: {
                status: 'completed',
                usage: { input_tokens: 20, output_tokens: 15, total_tokens: 35 },
              },
            };
          })(),
        );
      }
      return Promise.resolve(
        (async function* () {
          yield {
            type: 'response.reasoning_text.delta',
            output_index: 0,
            item_id: 'rs_2',
            delta: '再读取详情并在沙箱写入摘要',
          };
          yield {
            type: 'response.output_item.added',
            output_index: 1,
            item: {
              type: 'function_call',
              call_id: 'read_fc_1',
              name: DEEPSEEK_READ_URL_TOOL_NAME,
              arguments: '{"url":"https://api-docs.deepseek.com/news/news261113"}',
            },
          };
          yield {
            type: 'response.output_item.added',
            output_index: 2,
            item: {
              type: 'function_call',
              call_id: 'bash_call_1',
              name: 'bash',
            },
          };
          yield {
            type: 'response.function_call_arguments.delta',
            output_index: 2,
            delta: '{"command":"echo ok"}',
          };
          yield {
            type: 'response.completed',
            response: {
              status: 'completed',
              usage: { input_tokens: 40, output_tokens: 25, total_tokens: 65 },
            },
          };
        })(),
      );
    });

    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: { create: createSpy },
    });

    const agentRequest = {
      ...baseDeepSeekRequest,
      tools: [{ type: 'function', function: { name: 'bash', parameters: { type: 'object' } } }],
    };

    const events: any[] = [];
    for await (const event of adapter.stream(agentRequest)) {
      events.push(event);
    }

    // reasoning_text.done 不应与 reasoning_text.delta 重复输出
    expect(events.filter(e => e.type === 'reasoning_delta').map(e => e.delta)).toEqual([
      '先联网搜索发布公告',
      '再读取详情并在沙箱写入摘要',
    ]);

    // 客户端只收到 bash 的 tool_call_delta（索引从 0 开始），不暴露内部联网伪工具调用
    const clientToolDeltas = events.filter(e => e.type === 'tool_call_delta');
    expect(clientToolDeltas).toEqual([
      {
        type: 'tool_call_delta',
        index: 0,
        id: 'bash_call_1',
        nameDelta: 'bash',
        rawName: 'bash',
      },
      {
        type: 'tool_call_delta',
        index: 0,
        id: 'bash_call_1',
        argumentsDelta: '{"command":"echo ok"}',
        rawName: 'bash',
      },
    ]);

    // 原生联网搜索与网页阅读均映射为 hosted_tool_call，且过滤掉 javascript: 链接；
    // 终止前与首次终止事件均不带 update:true（update:true 仅用于已提交后的事后补注）
    const allHosted = events.filter(e => e.type === 'hosted_tool_call');
    expect(allHosted.every(e => e.toolCall.update === undefined)).toBe(true);
    const hostedDone = allHosted.filter(e => e.toolCall.status === 'success');
    expect(hostedDone).toHaveLength(2);
    expect(JSON.stringify(hostedDone)).not.toContain('javascript:');
    expect(hostedDone[0].toolCall).toMatchObject({
      name: DEEPSEEK_WEB_SEARCH_TOOL_NAME,
      displayName: '联网搜索',
    });
    expect(hostedDone[1].toolCall).toMatchObject({
      name: DEEPSEEK_READ_URL_TOOL_NAME,
      displayName: '网页阅读',
    });

    // 多步累计 usage
    const usageEvents = events.filter(e => e.type === 'usage');
    expect(usageEvents.at(-1)?.usage).toMatchObject({
      inputTokens: 60,
      outputTokens: 40,
      totalTokens: 100,
    });

    // provider_state 在下一轮回放时保持每个子轮严格满足 reasoning -> calls -> outputs 语法
    const providerStateEvent = events.find(e => e.type === 'provider_state');
    expect(providerStateEvent?.state).toMatchObject({
      protocol: 'openai_responses',
      vendor: 'deepseek',
      model: 'deepseek-flash',
      hasNonEmptyReasoning: true,
    });

    const round2Body = adapter.buildRequestBody(
      {
        ...agentRequest,
        messages: [
          ...agentRequest.messages,
          {
            role: 'assistant',
            content: null,
            provider_state: providerStateEvent.state,
            tool_calls: [
              {
                id: 'bash_call_1',
                type: 'function',
                function: { name: 'bash', arguments: '{"command":"echo ok"}' },
              },
            ],
          },
          { role: 'tool', tool_call_id: 'bash_call_1', content: 'ok\n' },
        ],
      },
      true,
    );

    const tailItems = round2Body.input.slice(1);
    expect(tailItems.map((item: any) => `${item.type}:${item.name || item.call_id || ''}`)).toEqual(
      [
        'reasoning:',
        `function_call:${DEEPSEEK_WEB_SEARCH_TOOL_NAME}`,
        'function_call_output:ws_fc_1',
        'reasoning:',
        'function_call:bash',
        `function_call:${DEEPSEEK_READ_URL_TOOL_NAME}`,
        'function_call_output:read_fc_1',
        'function_call_output:bash_call_1',
      ],
    );
  });

  it('blocks SSRF / private / non-http URLs in deepseek_read_url and sanitizes server-side web_search_call URLs', async () => {
    expect(validatePublicWebUrl('http://127.0.0.1:8080/admin')).toBeUndefined();
    expect(validatePublicWebUrl('http://localhost:9520/api')).toBeUndefined();
    expect(validatePublicWebUrl('http://169.254.169.254/latest/meta-data')).toBeUndefined();
    expect(validatePublicWebUrl('http://metadata/computeMetadata/v1')).toBeUndefined();
    expect(validatePublicWebUrl('http://10.0.0.8/internal')).toBeUndefined();
    expect(validatePublicWebUrl('http://[::1]/secret')).toBeUndefined();
    expect(validatePublicWebUrl('http://[::ffff:127.0.0.1]:9520/admin')).toBeUndefined();
    expect(validatePublicWebUrl('http://[::ffff:169.254.169.254]/latest')).toBeUndefined();
    expect(validatePublicWebUrl('http://[64:ff9b::7f00:1]/')).toBeUndefined();
    expect(validatePublicWebUrl('file:///etc/passwd')).toBeUndefined();
    expect(validatePublicWebUrl('https://user:pass@example.com/a')).toBeUndefined();
    expect(validatePublicWebUrl('https://api-docs.deepseek.com/guides/web_tools')).toBe(
      'https://api-docs.deepseek.com/guides/web_tools',
    );

    const adapter = createAdapter();
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    let step = 0;
    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest.fn().mockImplementation(() => {
          step += 1;
          if (step === 1) {
            return Promise.resolve(
              (async function* () {
                yield {
                  type: 'response.reasoning_text.delta',
                  output_index: 0,
                  delta: '尝试读取地址',
                };
                yield {
                  type: 'response.output_item.added',
                  output_index: 1,
                  item: {
                    type: 'function_call',
                    call_id: 'ssrf_1',
                    name: DEEPSEEK_READ_URL_TOOL_NAME,
                    arguments: '{"url":"http://127.0.0.1:9520/api/models"}',
                  },
                };
                yield { type: 'response.completed', response: { status: 'completed' } };
              })(),
            );
          }
          return Promise.resolve(
            (async function* () {
              yield {
                type: 'response.output_item.done',
                output_index: 0,
                item: {
                  id: 'ws_srv_1',
                  type: 'web_search_call',
                  status: 'completed',
                  action: {
                    type: 'open_page',
                    url: 'javascript:evil()',
                  },
                  page: {
                    url: 'https://api-docs.deepseek.com/guides/vision',
                    title: 'DeepSeek Vision Guide',
                  },
                },
              };
              yield { type: 'response.output_text.delta', delta: '已拦截内网请求。' };
              yield { type: 'response.completed', response: { status: 'completed' } };
            })(),
          );
        }),
      },
    });

    const events: any[] = [];
    for await (const event of adapter.stream({
      ...baseDeepSeekRequest,
      tools: [{ type: 'function', function: { name: 'bash', parameters: {} } }],
    })) {
      events.push(event);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).not.toContain('javascript:');
    expect(events.some(e => e.type === 'hosted_tool_call' && e.toolCall.status === 'error')).toBe(
      true,
    );
    expect(
      events.some(
        e =>
          e.type === 'hosted_tool_call' &&
          e.toolCall.displayName === '网页阅读' &&
          JSON.stringify(e.toolCall.output).includes('https://api-docs.deepseek.com/guides/vision'),
      ),
    ).toBe(true);
  });

  it('converges pending hosted web calls to error on incomplete responses without executing partial args', async () => {
    const adapter = createAdapter();
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    (adapter as any).createClient = jest.fn().mockReturnValue({
      responses: {
        create: jest.fn().mockResolvedValue(
          (async function* () {
            yield {
              type: 'response.output_item.added',
              output_index: 0,
              item: {
                type: 'function_call',
                call_id: 'trunc_1',
                name: DEEPSEEK_WEB_SEARCH_TOOL_NAME,
              },
            };
            yield {
              type: 'response.function_call_arguments.delta',
              output_index: 0,
              delta: '{"queries":["half',
            };
            yield {
              type: 'response.incomplete',
              response: {
                status: 'incomplete',
                incomplete_details: { reason: 'max_output_tokens' },
              },
            };
          })(),
        ),
      },
    });

    const events: any[] = [];
    for await (const event of adapter.stream({
      ...baseDeepSeekRequest,
      tools: [{ type: 'function', function: { name: 'bash', parameters: {} } }],
    })) {
      events.push(event);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(events.some(e => e.type === 'tool_call_delta')).toBe(false);
    const hosted = events.filter(e => e.type === 'hosted_tool_call');
    expect(hosted.at(-1)?.toolCall).toMatchObject({
      status: 'error',
    });
    expect(hosted.at(-1)?.toolCall.update).toBeUndefined();
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'max_output_tokens' });
  });
});
