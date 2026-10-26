import { defineModelGatewayCapabilities as capabilities } from '@/modules/modelGateway/provider-profiles';
import { defineModelGatewayCatalogItem as catalogItem } from '@/modules/modelGateway/provider-profiles';
import type {
  ModelGatewayReasoningControl,
  ModelGatewayReasoningEffort,
} from '@/modules/modelGateway/model-gateway.types';
import type {
  ModelGatewayCatalogItem,
  ModelGatewayProtocolProfiles,
} from '@/modules/modelGateway/provider-profiles.types';

/**
 * OpenCode Go 官方端点表中当前使用 /v1/chat/completions 的模型。
 * 上下文、图片输入和推理元数据综合 Pi 注册表、供应商资料与实网验证；
 * 可选推理档位仍以部署环境中的真实探针为准。
 */
const OPENCODE_GO_CHAT_COMPLETIONS_CATALOG_BASE: ModelGatewayCatalogItem[] = [
  catalogItem({
    id: 'deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1000000,
    multimodalTypes: ['image_url'],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1000000,
    multimodalTypes: [],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1000000,
    multimodalTypes: [],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'deepseek-v4-flash-vision-exp',
    label: 'DeepSeek V4 Flash Vision Exp',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1000000,
    multimodalTypes: ['image_url'],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'glm-5.3-flash',
    label: 'GLM-5.3 Flash',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1000000,
    multimodalTypes: ['image_url'],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'glm-5.3',
    label: 'GLM-5.3',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1000000,
    multimodalTypes: [],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'glm-5.2',
    label: 'GLM-5.2',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1000000,
    multimodalTypes: [],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'glm-5.1',
    label: 'GLM-5.1',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 202752,
    multimodalTypes: [],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'kimi-k3',
    label: 'Kimi K3',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1048576,
    multimodalTypes: ['image_url'],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 262144,
    multimodalTypes: ['image_url'],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'kimi-k2.6',
    label: 'Kimi K2.6',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 262144,
    multimodalTypes: ['image_url'],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'longcat-2.0',
    label: 'LongCat-2.0',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1000000,
    multimodalTypes: [],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'mimo-v2.5',
    label: 'MiMo V2.5',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1000000,
    multimodalTypes: ['image_url'],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'mimo-v2.5-pro',
    label: 'MiMo V2.5 Pro',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1048576,
    multimodalTypes: [],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'hy4-preview',
    label: 'Hy4 preview',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 1024000,
    multimodalTypes: [],
    reasoning: 'delta',
  }),
  catalogItem({
    id: 'hy3',
    label: 'Hy3',
    providerKey: 'opencode_go',
    protocol: 'opencode_go_chat_completions',
    maxTokens: 256000,
    multimodalTypes: [],
    reasoning: 'delta',
  }),
];

const reasoningControl = (
  levels: ModelGatewayReasoningEffort[],
  defaultLevel: ModelGatewayReasoningEffort,
  levelMap?: ModelGatewayReasoningControl['levelMap'],
): ModelGatewayReasoningControl => ({
  levels,
  defaultLevel,
  ...(levelMap ? { levelMap } : {}),
});

/** 已知的独立推理控制档位；未列档位仍可由真实探针主动验证。 */
export const OPENCODE_GO_CHAT_COMPLETIONS_REASONING_CONTROLS: Record<
  string,
  ModelGatewayReasoningControl
> = {
  'deepseek-v4.1-flash': reasoningControl(['off', 'low', 'high', 'max'], 'high', {
    low: 'low',
    high: 'high',
    max: 'max',
  }),
  'deepseek-v4-pro': reasoningControl(['off', 'high', 'max'], 'high', {
    high: 'high',
    max: 'max',
  }),
  'deepseek-v4-flash': reasoningControl(['off', 'low', 'high', 'max'], 'high', {
    low: 'low',
    high: 'high',
    max: 'max',
  }),
  'deepseek-v4-flash-vision-exp': reasoningControl(['off', 'low', 'high', 'max'], 'high', {
    low: 'low',
    high: 'high',
    max: 'max',
  }),
  'glm-5.3-flash': reasoningControl(['low', 'high', 'max'], 'high', {
    low: 'low',
    high: 'high',
    max: 'max',
  }),
  'glm-5.3': reasoningControl(['low', 'high', 'max'], 'high', {
    low: 'low',
    high: 'high',
    max: 'max',
  }),
  'glm-5.2': reasoningControl(['high', 'max'], 'high', {
    high: 'high',
    max: 'max',
  }),
  'glm-5.1': reasoningControl(['off', 'minimal', 'low', 'medium', 'high'], 'medium'),
  'kimi-k3': reasoningControl(['max'], 'max', { max: 'max' }),
  'kimi-k2.7-code': reasoningControl(['off', 'minimal', 'low', 'medium', 'high'], 'medium'),
  'kimi-k2.6': reasoningControl(['off', 'high'], 'high'),
  'longcat-2.0': reasoningControl(['off', 'minimal', 'low', 'medium', 'high'], 'medium'),
  'mimo-v2.5': reasoningControl(['off', 'minimal', 'low', 'medium', 'high'], 'medium'),
  'mimo-v2.5-pro': reasoningControl(['off', 'minimal', 'low', 'medium', 'high'], 'medium'),
  'hy4-preview': reasoningControl(['off', 'high'], 'high', {
    off: 'none',
    high: 'high',
  }),
  hy3: reasoningControl(['off', 'low', 'high'], 'high', {
    off: 'none',
    low: 'low',
    high: 'high',
  }),
};

export const OPENCODE_GO_CHAT_COMPLETIONS_CATALOG: ModelGatewayCatalogItem[] =
  OPENCODE_GO_CHAT_COMPLETIONS_CATALOG_BASE.map(item => ({
    ...item,
    capabilities: {
      ...item.capabilities,
      reasoningControl: OPENCODE_GO_CHAT_COMPLETIONS_REASONING_CONTROLS[item.id],
    },
  }));

/** OpenCode Go Chat Completions 的内容格式、协议感知目录与厂商预设。 */
export const OPENCODE_GO_CHAT_COMPLETIONS_PROFILES: ModelGatewayProtocolProfiles = {
  contentProfiles: [
    {
      key: 'opencode_go_chat_completions',
      label: 'OpenCode Go Chat Completions 内容格式',
      reasoningFormat: 'reasoning_content',
    },
  ],
  catalog: OPENCODE_GO_CHAT_COMPLETIONS_CATALOG,
  providerProfiles: [
    {
      key: 'opencode_go',
      label: 'OpenCode Go',
      description:
        'OpenCode Go 编码模型入口；自动附加客户端与稳定会话请求头，仅列出官方 Chat Completions 端点模型。',
      protocol: 'opencode_go_chat_completions',
      baseUrl: 'https://opencode.ai/zen/go',
      endpointPath: '/v1/chat/completions',
      modelsEndpointPath: '/v1/models',
      supportsRemoteModelList: true,
      contentProfileKey: 'opencode_go_chat_completions',
      defaultMultimodalTypes: ['image_url'],
      defaultCapabilities: capabilities(['image_url'], {
        reasoning: 'delta',
        parallelToolCalls: true,
      }),
      modelCatalogKeys: OPENCODE_GO_CHAT_COMPLETIONS_CATALOG.map(item => item.id),
    },
  ],
};
