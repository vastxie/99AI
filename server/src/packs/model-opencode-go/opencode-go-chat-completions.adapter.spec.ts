import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import { ModelStreamRegistry } from '@/modules/modelGateway/model-stream';
import {
  buildOpenCodeGoHeaders,
  OpenCodeGoChatCompletionsAdapter,
  OPENCODE_GO_CHAT_COMPLETIONS_MODEL_IDS,
  OPENCODE_GO_CHAT_COMPLETIONS_PROTOCOL,
  OPENCODE_GO_USER_AGENT,
  resolveOpenCodeGoSessionId,
} from './opencode-go-chat-completions.adapter';
import { OPENCODE_GO_CHAT_COMPLETIONS_CATALOG } from './opencode-go-chat-completions.profiles';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('OpenCodeGoChatCompletionsAdapter', () => {
  const createAdapter = () => {
    const registry = new ModelStreamRegistry();
    return new OpenCodeGoChatCompletionsAdapter(new ModelGatewayUrlBuilder(registry), registry);
  };
  const baseRequest: any = {
    config: {
      protocol: OPENCODE_GO_CHAT_COMPLETIONS_PROTOCOL,
      model: 'fixture-model',
      apiKey: 'fixture-value',
      baseUrl: 'https://opencode.ai/zen/go',
      endpointPath: '/v1/chat/completions',
    },
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0,
    maxTokens: 16,
    stream: true,
    purpose: 'agent_loop',
    sessionId: '99agent-stable-session',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds the required client and stable session headers', () => {
    expect(createAdapter().descriptor.multimodalTypes).toEqual(['image_url']);
    expect(buildOpenCodeGoHeaders(baseRequest)).toEqual({
      'User-Agent': OPENCODE_GO_USER_AGENT,
      'x-opencode-session': '99agent-stable-session',
    });
    const fallback = resolveOpenCodeGoSessionId({ sessionId: 'bad\nvalue', purpose: 'Agent Loop' });
    expect(fallback).toMatch(/^99agent-[0-9a-f-]{36}$/);
    expect(resolveOpenCodeGoSessionId({ purpose: 'Agent Loop' })).not.toBe(fallback);
    expect(resolveOpenCodeGoSessionId({ purpose: 'model-list' })).toBe('99agent-model-list');
    expect(Array.from(OPENCODE_GO_CHAT_COMPLETIONS_MODEL_IDS)).toEqual([
      'deepseek-v4.1-flash',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-v4-flash-vision-exp',
      'glm-5.3-flash',
      'glm-5.3',
      'glm-5.2',
      'glm-5.1',
      'kimi-k3',
      'kimi-k2.7-code',
      'kimi-k2.6',
      'longcat-2.0',
      'mimo-v2.5',
      'mimo-v2.5-pro',
      'hy4-preview',
      'hy3',
    ]);
  });

  it('publishes an endpoint-compatible catalog with verified media and context metadata', () => {
    expect(OPENCODE_GO_CHAT_COMPLETIONS_CATALOG).toHaveLength(16);
    expect(
      OPENCODE_GO_CHAT_COMPLETIONS_CATALOG.find(item => item.id === 'deepseek-v4.1-flash'),
    ).toEqual(
      expect.objectContaining({
        maxTokens: 1000000,
        multimodalTypes: ['image_url'],
        capabilities: expect.objectContaining({
          reasoningControl: {
            levels: ['off', 'low', 'high', 'max'],
            defaultLevel: 'high',
            levelMap: { low: 'low', high: 'high', max: 'max' },
          },
        }),
      }),
    );
    expect(OPENCODE_GO_CHAT_COMPLETIONS_CATALOG.find(item => item.id === 'glm-5.1')).toEqual(
      expect.objectContaining({
        maxTokens: 202752,
        multimodalTypes: [],
      }),
    );
    expect(
      OPENCODE_GO_CHAT_COMPLETIONS_CATALOG.every(item => item.providerKey === 'opencode_go'),
    ).toBe(true);
  });

  it('translates catalog reasoning levels with the OpenCode Go compatibility metadata', () => {
    const adapter = createAdapter();
    const deepSeekCatalog = OPENCODE_GO_CHAT_COMPLETIONS_CATALOG.find(
      item => item.id === 'deepseek-v4.1-flash',
    );
    const glmCatalog = OPENCODE_GO_CHAT_COMPLETIONS_CATALOG.find(
      item => item.id === 'glm-5.3-flash',
    );
    const kimiCatalog = OPENCODE_GO_CHAT_COMPLETIONS_CATALOG.find(item => item.id === 'kimi-k2.6');

    const deepSeek = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'deepseek-v4.1-flash',
          capabilities: deepSeekCatalog?.capabilities,
          reasoningEffort: 'max',
        },
      },
      false,
    );
    const lowDeepSeek = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'deepseek-v4.1-flash',
          capabilities: deepSeekCatalog?.capabilities,
          reasoningEffort: 'low',
        },
      },
      false,
    );
    const glm = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'glm-5.3-flash',
          capabilities: glmCatalog?.capabilities,
          reasoningEffort: 'low',
        },
      },
      false,
    );
    const kimi = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'kimi-k2.6',
          capabilities: kimiCatalog?.capabilities,
          reasoningEffort: 'high',
        },
      },
      false,
    );
    const unsupportedKimiEffort = adapter.buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'kimi-k2.6',
          capabilities: kimiCatalog?.capabilities,
          reasoningEffort: 'medium',
        },
      },
      false,
    );

    expect(deepSeek).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    });
    expect(lowDeepSeek).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    });
    expect(glm).toMatchObject({ reasoning_effort: 'low' });
    expect(glm.thinking).toBeUndefined();
    expect(kimi).toMatchObject({ thinking: { type: 'enabled' } });
    expect(kimi.reasoning_effort).toBeUndefined();
    expect(unsupportedKimiEffort.thinking).toBeUndefined();
    expect(unsupportedKimiEffort.reasoning_effort).toBeUndefined();
  });

  it('uses the dedicated endpoint with both headers and no hidden SDK retry', () => {
    const adapter = createAdapter();
    const client = (adapter as any).createClient(baseRequest, true);

    expect(client.baseURL).toBe('https://opencode.ai/zen/go/v1');
    expect(client.maxRetries).toBe(0);
    expect(client._options.defaultHeaders).toEqual({
      'User-Agent': OPENCODE_GO_USER_AGENT,
      'x-opencode-session': '99agent-stable-session',
    });
  });

  it('keeps image input and DeepSeek reasoning effort in the actual SDK request body', () => {
    const body = createAdapter().buildRequestBody(
      {
        ...baseRequest,
        config: {
          ...baseRequest.config,
          model: 'deepseek-v4.1-flash',
          reasoningEffort: 'high',
        },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '识别图片' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,aW1hZ2U=' },
              },
            ],
          },
        ],
      },
      false,
    );

    expect(body.reasoning_effort).toBe('high');
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: '识别图片' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,aW1hZ2U=' },
          },
        ],
      },
    ]);
  });

  it('maps compatible stream chunks without leaking provider payloads', async () => {
    const adapter = createAdapter();
    (adapter as any).createClient = jest.fn().mockReturnValue({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue(
            (async function* () {
              yield { choices: [{ delta: { reasoning_content: '想' } }] };
              yield { choices: [{ delta: { content: '答' } }] };
              yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
              yield {
                choices: [] as unknown[],
                usage: {
                  prompt_tokens: 2,
                  completion_tokens: 3,
                  total_tokens: 5,
                  provider_private: 'PRIVATE_OPENCODE_GO_USAGE',
                },
              };
            })(),
          ),
        },
      },
    });

    const events: any[] = [];
    for await (const event of adapter.stream(baseRequest)) events.push(event);

    expect(events).toEqual([
      { type: 'reasoning_delta', delta: '想' },
      { type: 'text_delta', delta: '答' },
      {
        type: 'usage',
        usage: expect.objectContaining({ inputTokens: 2, outputTokens: 3, totalTokens: 5 }),
      },
      { type: 'done', finishReason: 'stop' },
    ]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_OPENCODE_GO_USAGE');
  });

  it('sends both headers when loading the remote model list', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [
          { id: 'deepseek-v4.1-flash' },
          { id: 'glm-5.3-flash' },
          { id: 'kimi-k3' },
          { id: 'qwen3.7-plus' },
          { id: 'claude-incompatible-messages-model' },
          { id: 'gpt-incompatible-responses-model' },
        ],
      }),
    } as any);
    const adapter = createAdapter();

    await expect(adapter.listRemoteModels(baseRequest.config)).resolves.toEqual([
      { id: 'deepseek-v4.1-flash' },
      { id: 'glm-5.3-flash' },
      { id: 'kimi-k3' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer fixture-value',
          'User-Agent': OPENCODE_GO_USER_AGENT,
          'x-opencode-session': '99agent-model-list',
        },
      }),
    );
  });
});
