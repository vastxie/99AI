import { OPENAI_CHAT_COMPLETIONS_DESCRIPTOR } from './adapters/openai-chat-completions.adapter';
import {
  buildModelGatewayProviderProfilePayload,
  defineModelGatewayCapabilities,
  defineModelGatewayCatalogItem,
} from './provider-profiles';
import type { ModelProtocolDescriptor } from './model-stream';

declare const describe: any;
declare const expect: any;
declare const it: any;

const fakeResponsesDescriptor: ModelProtocolDescriptor = {
  protocol: 'demo_responses',
  label: 'OpenAI Responses',
  endpoints: {
    default: '/v1/demo-responses',
    modelsList: '/v1/models',
    knownSuffixes: ['/responses'],
  },
  multimodalTypes: ['image_url', 'document'],
  supportsNativeWebSearch: true,
  profiles: {
    contentProfiles: [{ key: 'demo_responses', label: 'Responses 内容格式' }],
    catalog: [
      defineModelGatewayCatalogItem({
        id: 'gpt-5.5',
        providerKey: 'demo_responses',
        protocol: 'demo_responses',
        maxTokens: 400000,
        multimodalTypes: ['image_url'],
        reasoning: 'summary',
      }),
      defineModelGatewayCatalogItem({
        id: 'other-vendor-model',
        providerKey: 'other_vendor',
        protocol: 'demo_responses',
        maxTokens: 1000,
        multimodalTypes: [],
      }),
    ],
    providerProfiles: [
      {
        key: 'demo_responses',
        label: 'OpenAI Responses',
        protocol: 'demo_responses',
        baseUrl: 'https://api.openai.com',
        endpointPath: '/v1/demo-responses',
        modelsEndpointPath: '/v1/models',
        supportsRemoteModelList: true,
        contentProfileKey: 'demo_responses',
        defaultMultimodalTypes: ['image_url'],
        defaultCapabilities: defineModelGatewayCapabilities(['image_url']),
        modelCatalogKeys: ['gpt-5.5'],
      },
    ],
  },
};

describe('buildModelGatewayProviderProfilePayload', () => {
  it('lists only loaded protocols with their admin-facing traits', () => {
    const payload = buildModelGatewayProviderProfilePayload([
      OPENAI_CHAT_COMPLETIONS_DESCRIPTOR,
      fakeResponsesDescriptor,
    ]);

    expect(payload.protocols).toEqual([
      {
        value: 'openai_chat_completions',
        label: 'OpenAI Chat Completions / 兼容接口',
        supportsRemoteModelList: true,
        supportsNativeWebSearch: false,
        multimodalTypes: ['image_url', 'video_url', 'audio_url'],
      },
      {
        value: 'demo_responses',
        label: 'OpenAI Responses',
        supportsRemoteModelList: true,
        supportsNativeWebSearch: true,
        multimodalTypes: ['image_url', 'document'],
      },
    ]);
  });

  it('projects provider profiles without internal keys and scopes catalogs to the provider', () => {
    const payload = buildModelGatewayProviderProfilePayload([fakeResponsesDescriptor]);
    const [profile] = payload.profiles;

    expect(profile).toMatchObject({
      key: 'demo_responses',
      protocol: 'demo_responses',
      baseUrl: 'https://api.openai.com',
      supportsRemoteModelList: true,
    });
    expect(Object.keys(profile)).not.toContain('contentProfileKey');
    expect(Object.keys(profile)).not.toContain('modelCatalogKeys');
    expect(profile.modelCatalog.map(item => item.id)).toEqual(['gpt-5.5']);
    expect(payload.catalog.map(item => item.id)).toEqual(['gpt-5.5', 'other-vendor-model']);
  });

  it('keeps the kernel baseline presets (OpenAI compatible vendors) on the baseline protocol', () => {
    const payload = buildModelGatewayProviderProfilePayload([OPENAI_CHAT_COMPLETIONS_DESCRIPTOR]);

    expect(payload.profiles.map(item => item.key)).toEqual([
      'openai_chat_completions',
      'zai_openai_compatible',
      'xiaomi_openai_compatible',
      'deepseek_openai_compatible',
    ]);
    expect(payload.profiles.every(item => item.protocol === 'openai_chat_completions')).toBe(true);
    expect(payload.profiles.every(item => item.defaultAdditionalParams === undefined)).toBe(true);
    expect(payload.catalog.every(item => item.defaultAdditionalParams === undefined)).toBe(true);
  });
});
