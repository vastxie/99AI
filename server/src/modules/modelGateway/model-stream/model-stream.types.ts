export type ModelStreamToolChoice = 'auto' | 'none' | 'required';

export interface ModelStreamRuntimeConfig {
  protocol: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  endpointPath?: string;
  capabilities?: unknown;
  additionalParams?: Record<string, unknown>;
  reasoningEffort?: string;
}

export interface ModelStreamMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | unknown[] | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  reasoning_content?: string;
  name?: string;
  /** 厂商私有的回放状态（不透明，协议包产出与消费）；只在本次运行的内存里 */
  provider_state?: unknown;
}

export interface ModelStreamFileContext {
  actor: unknown;
  fileRefMapping?: unknown;
}

export interface ModelStreamInput {
  config: ModelStreamRuntimeConfig;
  messages: ModelStreamMessage[];
  tools?: unknown[];
  toolChoice?: ModelStreamToolChoice;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
  purpose: string;
  /** 供应商可用的稳定会话标识；必须是脱敏值，不能直接透传内部会话或用户 ID。 */
  sessionId?: string;
  fileContext?: ModelStreamFileContext;
  /** 小任务声明「不需要思考」：由各协议适配器翻译为对应端点的禁思考参数 */
  disableThinking?: boolean;
  /** 内部 Agent 路径已按 source model 清理历史 reasoning；外部调用不得设置。 */
  historyReasoningSanitized?: boolean;
}

export interface ModelStreamUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

export type ModelStreamErrorCategory =
  | 'context_overflow'
  | 'rate_limit'
  | 'transient'
  | 'auth'
  | 'invalid_request'
  | 'aborted'
  | 'unknown';

export interface ModelStreamError {
  code: string;
  message: string;
  category: ModelStreamErrorCategory;
  retryable: boolean;
  retryAfterMs?: number;
  requestOutcome: 'rejected' | 'unknown';
  status?: number;
}

export interface ModelStreamToolCallDelta {
  index: number;
  id?: string;
  nameDelta?: string;
  argumentsDelta?: string;
  rawName?: string;
}

export interface ModelStreamHostedToolCall {
  id: string;
  name: string;
  displayName?: string;
  type?: string;
  status: 'running' | 'searching' | 'success' | 'error';
  inputSummary?: string;
  output?: unknown;
  display?: {
    title?: string;
    summary?: string;
    markdown?: string;
    json?: unknown;
  };
}

export type ModelStreamEvent =
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'text_delta'; delta: string }
  | ({ type: 'tool_call_delta' } & ModelStreamToolCallDelta)
  | { type: 'hosted_tool_call'; toolCall: ModelStreamHostedToolCall }
  | { type: 'usage'; usage: ModelStreamUsage }
  | { type: 'done'; finishReason?: string }
  /** 本次回复的厂商私有状态（不透明）：运行时挂到这条助手消息上，不进公开事件与日志 */
  | { type: 'provider_state'; state: unknown }
  | { type: 'error'; error: ModelStreamError }
  | { type: 'abort'; reason?: string; error?: ModelStreamError };

export type ModelStreamFn = (input: ModelStreamInput) => AsyncIterable<ModelStreamEvent>;

export interface ModelStreamPort {
  stream(input: ModelStreamInput): AsyncIterable<ModelStreamEvent>;
}

export interface ModelCompleteResult {
  content: string;
  usage?: ModelStreamUsage;
  finishReason?: string;
}

export type ModelCompleteFn = (input: ModelStreamInput) => Promise<ModelCompleteResult>;

export type ModelRemoteModelsFn = (config: ModelStreamRuntimeConfig) => Promise<unknown[]>;

/** 协议的默认端点：可含 {model} 占位；stream 缺省与 default 相同 */
export interface ModelProtocolEndpoints {
  default: string;
  stream?: string;
  /** 远程模型列表端点；缺省表示该协议不支持拉取模型列表 */
  modelsList?: string;
  /** 流式请求附加的 query（如 Gemini 的 alt=sse） */
  streamQuery?: Record<string, string>;
  /** 用来识别 baseUrl 是否已经包含完整端点的路径后缀 */
  knownSuffixes: string[];
}

/**
 * 协议描述（内核只认这份数据）：默认端点给 URL 构造用，展示名 / 多模态 / 原生联网给管理端用，
 * 厂商预设与模型目录随协议一起登记，包关闭时一并消失。
 */
export interface ModelProtocolDescriptor {
  protocol: string;
  label: string;
  endpoints: ModelProtocolEndpoints;
  /** 该协议支持的多模态输入类型（image_url / document / video_url / audio_url） */
  multimodalTypes: string[];
  /** 原生联网搜索（hosted tool）由协议自身提供 */
  supportsNativeWebSearch?: boolean;
  /** 厂商预设、模型目录与内容格式说明（形状见 provider-profiles.types） */
  profiles?: unknown;
}

export interface ModelStreamAdapter extends ModelStreamPort {
  protocol: string;
  descriptor: ModelProtocolDescriptor;
  complete?: ModelCompleteFn;
  listRemoteModels?: ModelRemoteModelsFn;
}
