import type { FileRefMapping } from '../fileAsset/file-refs';
import type { FileMaterializerActor } from '../fileAsset/materializer/file-materializer.service';
import type { ModelStreamError, ModelStreamHostedToolCall } from './model-stream';

export type {
  ModelCompleteFn,
  ModelCompleteResult,
  ModelProtocolDescriptor,
  ModelProtocolEndpoints,
  ModelStreamAdapter,
  ModelStreamError,
  ModelStreamEvent,
  ModelStreamFn,
  ModelStreamInput,
  ModelStreamPort,
  ModelStreamUsage,
} from './model-stream';

/** 协议标识由各模型包定义（内核自带 openai_chat_completions），内核只当作字符串 */
export type ModelProtocol = string;

export type ModelGatewayPurpose =
  | 'agent_loop'
  | 'chat_title'
  | 'memory_write_extract'
  | 'context_compaction'
  | 'system_chat'
  | 'test_connection';

export interface ModelGatewayCapabilities {
  streaming?: boolean;
  toolCalling?: boolean;
  parallelToolCalls?: boolean;
  reasoning?: 'none' | 'delta' | 'summary' | 'vendor_specific';
  vision?: boolean;
  documentInput?: boolean;
  audioInput?: boolean;
  videoInput?: boolean;
  jsonMode?: boolean;
  usage?: boolean;
  systemMessage?: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  nativeTools?: ModelGatewayNativeToolsConfig;
  reasoningControl?: ModelGatewayReasoningControl;
}

export type ModelGatewayNativeToolMode = 'off' | 'auto' | 'force';
export type ModelGatewayOpenAIWebSearchToolType =
  'web_search' | 'web_search_preview' | 'web_search_preview_2025_03_11';

export interface ModelGatewayNativeWebSearchConfig {
  enabled?: boolean;
  mode?: ModelGatewayNativeToolMode;
  provider?: 'openai';
  toolType?: ModelGatewayOpenAIWebSearchToolType;
  searchContextSize?: 'low' | 'medium' | 'high';
  includeSources?: boolean;
  filters?: Record<string, unknown>;
  returnTokenBudget?: string;
  searchContentTypes?: string[];
  externalWebAccess?: boolean;
  userLocation?: Record<string, unknown>;
}

export interface ModelGatewayNativeToolsConfig {
  webSearch?: ModelGatewayNativeWebSearchConfig;
}

export const MODEL_GATEWAY_REASONING_LEVELS = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type ModelGatewayReasoningEffort = (typeof MODEL_GATEWAY_REASONING_LEVELS)[number];

export interface ModelGatewayReasoningControl {
  levels: ModelGatewayReasoningEffort[];
  defaultLevel: ModelGatewayReasoningEffort;
  /**
   * 可选的供应商档位映射；null 表示该统一档位不可用。
   * 管理端当前只维护 levels/defaultLevel，映射由模型目录或高级配置提供。
   */
  levelMap?: Partial<Record<ModelGatewayReasoningEffort, string | null>>;
}

export const DEFAULT_MODEL_GATEWAY_REASONING_CONTROL: ModelGatewayReasoningControl = {
  levels: ['medium'],
  defaultLevel: 'medium',
};

export function normalizeModelGatewayReasoningEffort(
  value: unknown,
): ModelGatewayReasoningEffort | undefined {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  switch (normalized) {
    case 'off':
      return 'off';
    case 'minimal':
      return 'minimal';
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'xhigh':
      return 'xhigh';
    case 'max':
      return 'max';
    default:
      return undefined;
  }
}

export function normalizeModelGatewayReasoningControl(
  value: unknown,
): ModelGatewayReasoningControl {
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<ModelGatewayReasoningControl>)
      : {};
  const levelMap =
    input.levelMap && typeof input.levelMap === 'object' && !Array.isArray(input.levelMap)
      ? Object.fromEntries(
          MODEL_GATEWAY_REASONING_LEVELS.filter(level =>
            Object.prototype.hasOwnProperty.call(input.levelMap, level),
          ).map(level => {
            const mapped = input.levelMap?.[level];
            return [level, mapped === null ? null : String(mapped || '').trim() || null];
          }),
        )
      : undefined;
  const requestedLevels = Array.isArray(input.levels) ? input.levels : [];
  const levels = Array.from(
    new Set(
      requestedLevels
        .map(level => normalizeModelGatewayReasoningEffort(level))
        .filter(
          (level): level is ModelGatewayReasoningEffort =>
            Boolean(level) && levelMap?.[level as ModelGatewayReasoningEffort] !== null,
        ),
    ),
  ).sort(
    (left, right) =>
      MODEL_GATEWAY_REASONING_LEVELS.indexOf(left) - MODEL_GATEWAY_REASONING_LEVELS.indexOf(right),
  );
  const effectiveLevels =
    levels.length > 0
      ? levels
      : DEFAULT_MODEL_GATEWAY_REASONING_CONTROL.levels.filter(level => levelMap?.[level] !== null);
  const finalLevels: ModelGatewayReasoningEffort[] =
    effectiveLevels.length > 0 ? effectiveLevels : ['off'];
  const requestedDefault = normalizeModelGatewayReasoningEffort(input.defaultLevel);
  const defaultLevel =
    requestedDefault && finalLevels.includes(requestedDefault)
      ? requestedDefault
      : finalLevels.includes(DEFAULT_MODEL_GATEWAY_REASONING_CONTROL.defaultLevel)
        ? DEFAULT_MODEL_GATEWAY_REASONING_CONTROL.defaultLevel
        : finalLevels[0];

  return {
    levels: finalLevels,
    defaultLevel,
    ...(levelMap && Object.keys(levelMap).length > 0 ? { levelMap } : {}),
  };
}

export function withNormalizedModelGatewayReasoningControl(
  capabilities?: ModelGatewayCapabilities | null,
): ModelGatewayCapabilities {
  const normalized = capabilities ? { ...capabilities } : {};
  return {
    ...normalized,
    reasoningControl: normalizeModelGatewayReasoningControl(normalized.reasoningControl),
  };
}

export function resolveModelGatewayReasoningEffort(
  value: unknown,
  capabilities?: ModelGatewayCapabilities | null,
): ModelGatewayReasoningEffort {
  const control = normalizeModelGatewayReasoningControl(capabilities?.reasoningControl);
  const requested = normalizeModelGatewayReasoningEffort(value);
  return requested && control.levels.includes(requested) ? requested : control.defaultLevel;
}

export function mapModelGatewayReasoningEffort(
  effort: ModelGatewayReasoningEffort,
  capabilities?: ModelGatewayCapabilities | null,
): string | null {
  const control = normalizeModelGatewayReasoningControl(capabilities?.reasoningControl);
  if (Object.prototype.hasOwnProperty.call(control.levelMap || {}, effort)) {
    return control.levelMap?.[effort] ?? null;
  }
  return effort;
}

export function shouldApplyModelGatewayReasoningEffort(
  value?: ModelGatewayReasoningEffort | null,
): value is ModelGatewayReasoningEffort {
  return Boolean(value);
}

export interface ModelGatewayRuntimeConfig {
  protocol: ModelProtocol;
  model: string;
  apiKey: string;
  baseUrl: string;
  endpointPath?: string;
  capabilities?: ModelGatewayCapabilities;
  additionalParams?: Record<string, unknown>;
  reasoningEffort?: ModelGatewayReasoningEffort;
}

export type ModelGatewayMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | any[] | null;
  tool_calls?: any[];
  tool_call_id?: string;
  reasoning_content?: string;
  name?: string;
  /** 厂商私有的回放状态（不透明，只在本次运行的内存里） */
  provider_state?: unknown;
};

export interface ModelGatewayFileContext {
  actor: FileMaterializerActor;
  fileRefMapping?: FileRefMapping;
}

export interface ModelGatewayRequest {
  config: ModelGatewayRuntimeConfig;
  messages: ModelGatewayMessage[];
  tools?: any[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
  purpose: ModelGatewayPurpose;
  /** 供应商可用的稳定会话标识；必须是脱敏值，不能直接透传内部会话或用户 ID。 */
  sessionId?: string;
  fileContext?: ModelGatewayFileContext;
  /** 小任务声明「不需要思考」：由各协议适配器翻译为对应端点的禁思考参数 */
  disableThinking?: boolean;
  /** 仅供 Agent runtime：历史 reasoning 已按 source identity 清理。 */
  historyReasoningSanitized?: boolean;
}

export interface ModelGatewayUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

export type ModelGatewayEvent =
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'text_delta'; delta: string }
  | {
      type: 'tool_call_delta';
      index: number;
      id?: string;
      nameDelta?: string;
      argumentsDelta?: string;
      rawName?: string;
    }
  | { type: 'hosted_tool_call'; toolCall: ModelStreamHostedToolCall }
  | { type: 'usage'; usage: ModelGatewayUsage }
  | { type: 'done'; finishReason?: string }
  | { type: 'provider_state'; state: unknown }
  | { type: 'error'; error: ModelGatewayError }
  | { type: 'abort'; reason?: string; error?: ModelGatewayError };

export interface ModelGatewayError extends ModelStreamError {}

export interface ModelGatewayCompleteResult {
  content: string;
  usage?: ModelGatewayUsage;
  finishReason?: string;
}

export interface ModelGatewayUrlResult {
  url: string;
  normalizedBaseUrl: string;
  endpointPath: string;
  warnings: string[];
  openAIChatSdkBaseUrl?: string;
}

export interface ModelGatewayUrlInput {
  protocol: ModelProtocol;
  baseUrl: string;
  model?: string;
  endpointPath?: string;
  operation?: 'stream' | 'non_stream' | 'models_list' | 'test';
}

export interface ModelGatewayRemoteModel {
  id: string;
  [key: string]: unknown;
}

export interface ModelGatewayTestItemResult {
  key: string;
  label: string;
  ok: boolean;
  capability?: 'text' | 'multimodal' | 'reasoning';
  value?: string;
  skipped?: boolean;
  message?: string;
  usage?: ModelGatewayUsage;
}

export interface ModelGatewayTestConnectionResult {
  ok: boolean;
  usage?: ModelGatewayUsage;
  tests: ModelGatewayTestItemResult[];
}

export const DEFAULT_MODEL_PROTOCOL: ModelProtocol = 'openai_chat_completions';

export const MODEL_GATEWAY_RESERVED_ADDITIONAL_PARAMS = new Set([
  'model',
  'messages',
  'input',
  'tools',
  'tool_choice',
  'temperature',
  'stream',
  'stream_options',
  'response_format',
]);

export function deriveCapabilitiesFromMultimodalTypes(
  multimodalTypes: unknown,
): ModelGatewayCapabilities {
  const types = Array.isArray(multimodalTypes) ? multimodalTypes : [];
  return {
    streaming: true,
    toolCalling: true,
    usage: true,
    systemMessage: true,
    reasoning: 'delta',
    vision: types.includes('image_url'),
    documentInput: types.includes('document'),
    videoInput: types.includes('video_url'),
    audioInput: types.includes('audio_url'),
  };
}

export function multimodalTypesFromCapabilities(
  capabilities?: ModelGatewayCapabilities | null,
): string[] {
  if (!capabilities) return [];
  const types: string[] = [];
  if (capabilities.vision) types.push('image_url');
  if (capabilities.documentInput) types.push('document');
  if (capabilities.videoInput) types.push('video_url');
  if (capabilities.audioInput) types.push('audio_url');
  return types;
}

export function getOpenAINativeWebSearchConfig(
  capabilities?: ModelGatewayCapabilities | null,
): ModelGatewayNativeWebSearchConfig | undefined {
  const config = capabilities?.nativeTools?.webSearch;
  if (!config?.enabled || config.mode === 'off') return undefined;
  return {
    provider: 'openai',
    mode: config.mode === 'force' ? 'force' : 'auto',
    toolType: config.toolType || 'web_search',
    searchContextSize: config.searchContextSize,
    includeSources: config.includeSources !== false,
    filters: config.filters,
    returnTokenBudget: config.returnTokenBudget,
    searchContentTypes: config.searchContentTypes,
    externalWebAccess: config.externalWebAccess,
    userLocation: config.userLocation,
    enabled: true,
  };
}

export function parseModelGatewayAdditionalParams(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed);
}

/** 附加参数里由系统控制、不允许覆盖的字段 */
export function findReservedAdditionalParams(additionalParams?: Record<string, unknown>): string[] {
  if (!additionalParams) return [];
  return Object.keys(additionalParams).filter(key =>
    MODEL_GATEWAY_RESERVED_ADDITIONAL_PARAMS.has(key),
  );
}

export function assertNoReservedAdditionalParams(additionalParams?: Record<string, unknown>): void {
  const reserved = findReservedAdditionalParams(additionalParams);
  if (reserved.length) {
    throw new Error(`additionalParams 包含 Model Gateway 保留字段: ${reserved.join(', ')}`);
  }
}
