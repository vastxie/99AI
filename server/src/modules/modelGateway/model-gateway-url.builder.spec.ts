import { OPENAI_CHAT_COMPLETIONS_DESCRIPTOR } from './adapters/openai-chat-completions.adapter';
import { buildModelGatewayRequestUrl } from './model-gateway-url.builder';
import type { ModelGatewayUrlInput } from './model-gateway.types';
import type { ModelProtocolEndpoints } from './model-stream';

/** 单测里模拟 某协议包登记的端点规则（包本身不在内核测试范围） */
const DEMO_ENDPOINTS: ModelProtocolEndpoints = {
  default: '/v1beta/models/{model}:demoGenerate',
  stream: '/v1beta/models/{model}:streamDemoGenerate',
  streamQuery: { alt: 'sse' },
  knownSuffixes: [':demoGenerate', ':streamDemoGenerate'],
};
const KNOWN_SUFFIXES = [
  ...OPENAI_CHAT_COMPLETIONS_DESCRIPTOR.endpoints.knownSuffixes,
  '/responses',
  '/messages',
  ...DEMO_ENDPOINTS.knownSuffixes,
];
const build = (input: ModelGatewayUrlInput) =>
  buildModelGatewayRequestUrl(input, {
    endpoints:
      input.protocol === 'demo_generate'
        ? DEMO_ENDPOINTS
        : OPENAI_CHAT_COMPLETIONS_DESCRIPTOR.endpoints,
    knownSuffixes: KNOWN_SUFFIXES,
    deriveOpenAIChatSdkBaseUrl: input.protocol === 'openai_chat_completions',
  });

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('ModelGatewayUrlBuilder', () => {
  it('builds OpenAI Chat URLs without duplicating /v1', () => {
    expect(
      build({
        protocol: 'openai_chat_completions',
        baseUrl: 'https://api.openai.com',
      }).url,
    ).toBe('https://api.openai.com/v1/chat/completions');

    expect(
      build({
        protocol: 'openai_chat_completions',
        baseUrl: 'https://api.openai.com/v1/',
      }).url,
    ).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('preserves proxy path prefixes and detects full endpoints', () => {
    expect(
      build({
        protocol: 'openai_chat_completions',
        baseUrl: 'https://proxy.example.com/api/llm/openai',
      }).url,
    ).toBe('https://proxy.example.com/api/llm/openai/v1/chat/completions');

    const fullEndpoint = build({
      protocol: 'openai_chat_completions',
      baseUrl: 'https://proxy.example.com/v1/chat/completions',
    });
    expect(fullEndpoint.url).toBe('https://proxy.example.com/v1/chat/completions');
    expect(fullEndpoint.warnings).toContain('baseUrl_contains_endpoint');
    expect(fullEndpoint.openAIChatSdkBaseUrl).toBe('https://proxy.example.com/v1');
  });

  it('does not append /v1 again when the base path already ends with an API version segment', () => {
    const chatResult = build({
      protocol: 'openai_chat_completions',
      baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    });

    expect(chatResult.url).toBe('https://open.bigmodel.cn/api/coding/paas/v4/chat/completions');
    expect(chatResult.endpointPath).toBe('/chat/completions');
    expect(chatResult.openAIChatSdkBaseUrl).toBe('https://open.bigmodel.cn/api/coding/paas/v4');

    const modelsResult = build({
      protocol: 'openai_chat_completions',
      baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
      operation: 'models_list',
    });

    expect(modelsResult.url).toBe('https://open.bigmodel.cn/api/coding/paas/v4/models');
  });

  it('rejects unsafe base URLs', () => {
    const base = { protocol: 'openai_chat_completions', baseUrl: '' };
    expect(() => build(base)).toThrow('不能为空');
    expect(() => build({ ...base, baseUrl: 'ftp://api.example.com' })).toThrow('http 或 https');
    expect(() => build({ ...base, baseUrl: 'https://user:pass@example.com' })).toThrow(
      '用户名或密码',
    );
    expect(() => build({ ...base, baseUrl: 'https://api.example.com?key=secret' })).toThrow(
      'query',
    );
    expect(() => build({ ...base, baseUrl: 'https://api.example.com#frag' })).toThrow('hash');
  });

  it('rejects cloud metadata hosts even when configured by an administrator', () => {
    expect(() =>
      build({ protocol: 'openai_chat_completions', baseUrl: 'http://169.254.169.254/v1' }),
    ).toThrow('元数据');
    expect(() =>
      build({ protocol: 'openai_chat_completions', baseUrl: 'http://metadata.google.internal' }),
    ).toThrow('元数据');
  });

  it('rejects endpointPath when baseUrl already contains a full endpoint', () => {
    expect(() =>
      build({
        protocol: 'openai_chat_completions',
        baseUrl: 'https://proxy.example.com/v1/chat/completions',
        endpointPath: '/chat/completions',
      }),
    ).toThrow('endpointPath');
  });

  it('builds OpenAI model list URLs without deriving chat SDK baseUrl', () => {
    const result = build({
      protocol: 'openai_chat_completions',
      baseUrl: 'https://api.openai.com',
      operation: 'models_list',
    });

    expect(result.url).toBe('https://api.openai.com/v1/models');
    expect(result.openAIChatSdkBaseUrl).toBeUndefined();

    const fullEndpointResult = build({
      protocol: 'openai_chat_completions',
      baseUrl: 'https://proxy.example.com/v1/chat/completions',
      operation: 'models_list',
    });

    expect(fullEndpointResult.url).toBe('https://proxy.example.com/v1/models');
    expect(fullEndpointResult.openAIChatSdkBaseUrl).toBeUndefined();
  });

  it('encodes Gemini model path and adds stream query internally', () => {
    const result = build({
      protocol: 'demo_generate',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'models/gemini 2.5',
      operation: 'stream',
    });
    expect(result.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/models%2Fgemini%202.5:streamDemoGenerate?alt=sse',
    );
    expect(result.url).not.toContain('apiKey');
  });
});
