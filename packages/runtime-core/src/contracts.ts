/** @experimental */
export interface AgentRuntimeModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: unknown;
  name?: string;
  reasoning_content?: string;
  tool_calls?: AgentRuntimeToolCall[];
  tool_call_id?: string;
  /**
   * 厂商私有的回放状态（如思考块签名）：协议包产出、协议包消费，内核只原样携带；
   * 只在本次运行的内存里，不持久化、不进公开事件与工具上下文
   */
  provider_state?: unknown;
}

/** 请求带了回放状态而被厂商拒绝（尚未开始返回）：运行时删掉全部回放状态后重发一次 */
export const AGENT_RUNTIME_PROVIDER_STATE_REJECTED = 'provider_state_rejected';

/** @experimental */
export interface AgentRuntimeToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

/** @experimental */
export interface AgentRuntimeToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** @experimental */
export interface AgentRuntimeCapabilityResult {
  callId: string;
  status: 'success' | 'error';
  modelContent:
    | string
    | Array<
        | { type: 'text'; text: string }
        | {
            type: 'image_file' | 'audio_file';
            file: { fileRef: string; name?: string; mime?: string };
          }
      >;
  control?: {
    handoff?: boolean;
    queueNextTurn?: boolean;
    /** 本轮工具执行完后正常结束运行（例如已向用户提问、等待回答） */
    terminate?: boolean;
  };
}

export interface AgentRuntimeHostedToolCall {
  id: string;
  name: string;
  displayName?: string;
  type?: string;
  status: 'running' | 'searching' | 'success' | 'error';
  inputSummary?: string;
  output?: unknown;
  display?: Record<string, unknown>;
}

export type AgentRuntimeModelErrorCategory =
  | 'context_overflow'
  | 'rate_limit'
  | 'transient'
  | 'auth'
  | 'invalid_request'
  | 'aborted'
  | 'unknown';

export interface AgentRuntimeModelError {
  code?: string;
  message?: string;
  category?: AgentRuntimeModelErrorCategory;
  retryable?: boolean;
  retryAfterMs?: number;
  requestOutcome?: 'rejected' | 'unknown';
}

export interface AgentRuntimeModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

export type AgentRuntimeModelEvent =
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'text_delta'; delta: string }
  | {
      type: 'tool_call_delta';
      index: number;
      id?: string;
      nameDelta?: string;
      argumentsDelta?: string;
    }
  | { type: 'hosted_tool_call'; toolCall: AgentRuntimeHostedToolCall }
  | {
      type: 'usage';
      usage: AgentRuntimeModelUsage;
    }
  | { type: 'done'; finishReason?: string }
  /** 本次回复的厂商私有状态（不透明），由运行时挂到这条助手消息上 */
  | { type: 'provider_state'; state: unknown }
  | { type: 'error'; error?: AgentRuntimeModelError }
  | {
      type: 'abort';
      reason?: string;
      error?: AgentRuntimeModelError;
    };

export interface AgentRuntimePreparationContext {
  roundIndex: number;
  reason: 'round' | 'context_overflow';
  previousUsage?: AgentRuntimeModelUsage;
  overflowRecoveryUsed: boolean;
  invocation?: AgentRuntimeInvocationContext;
}

/** @experimental */
export interface AgentRuntimeInvocationContext {
  operationId: string;
  turnId: string;
  generation: number;
  invocationId: string;
  parentInvocationId?: string;
  traceId: string;
  signal?: AbortSignal;
}

export type AgentRuntimeTelemetryPhase = 'run' | 'model' | 'capability';
export type AgentRuntimeTelemetryStatus =
  'started' | 'succeeded' | 'failed' | 'aborted' | 'rejected' | 'unknown';

/** @experimental */
export interface AgentRuntimeTelemetryEvent {
  type: 'invocation.started' | 'invocation.completed';
  invocation: Omit<AgentRuntimeInvocationContext, 'signal'>;
  phase: AgentRuntimeTelemetryPhase;
  status: AgentRuntimeTelemetryStatus;
  atMs: number;
  durationMs?: number;
  roundIndex?: number;
  attemptIndex?: number;
  messageCount?: number;
  toolCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  category?: AgentRuntimeModelErrorCategory;
  code?: string;
}

/** @experimental */
export interface AgentRuntimeProgressEvent {
  type:
    | 'round.started'
    | 'reasoning.delta'
    | 'text.delta'
    | 'round.tool_call'
    | 'capability.started'
    | 'capability.completed'
    | 'round.completed'
    | 'run.progress';
  data: Record<string, unknown>;
}

export type AgentRuntimeCloseReason = 'stop' | 'abort' | 'error' | 'length' | 'handoff';

/** @experimental */
export interface AgentRuntimePorts {
  modelStream(input: {
    messages: AgentRuntimeModelMessage[];
    tools: AgentRuntimeToolDefinition[];
    /** Stable zero-based runtime round for durable provider-effect correlation. */
    roundIndex: number;
    /** Stable zero-based attempt within the round across provider and overflow retries. */
    attemptIndex: number;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    invocation?: AgentRuntimeInvocationContext;
  }): AsyncIterable<AgentRuntimeModelEvent>;
  modelRetry?: {
    plan(input: {
      category: Extract<AgentRuntimeModelErrorCategory, 'rate_limit' | 'transient'>;
      retryAfterMs?: number;
      /** Zero-based retry ordinal; the initial provider request is not counted. */
      retryIndex: number;
    }): { delayMs: number; notBeforeMs: number } | null;
    wait(input: {
      delayMs: number;
      notBeforeMs: number;
      roundIndex: number;
      /** Attempt index that will be used after the wait completes. */
      attemptIndex: number;
      retryIndex: number;
      signal?: AbortSignal;
    }): Promise<void>;
  };
  capabilityExecutor(input: {
    toolCalls: AgentRuntimeToolCall[];
    roundIndex: number;
    signal?: AbortSignal;
    invocation?: AgentRuntimeInvocationContext;
  }): Promise<AgentRuntimeCapabilityResult[]>;
  telemetry?: {
    record(event: AgentRuntimeTelemetryEvent): void | Promise<void>;
  };
  progress(event: AgentRuntimeProgressEvent): void;
  trace(event: {
    type: 'usage';
    data: {
      roundIndex: number;
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cacheHitTokens?: number;
        cacheMissTokens?: number;
      };
    };
  }): void;
  messagePreparation: {
    prepareForModel(
      messages: AgentRuntimeModelMessage[],
      context: AgentRuntimePreparationContext,
    ): Promise<AgentRuntimeModelMessage[]>;
    projectAssistantMessage(input: {
      content: string;
      reasoningContent: string;
      toolCalls: AgentRuntimeToolCall[];
      providerState?: unknown;
    }): AgentRuntimeModelMessage;
  };
  lifecycle: {
    prepareCapabilityCommit(orderedCallIds: string[]): void;
    afterToolRound(): { shouldHandoff?: boolean } | void;
    onMessagesReplaced(messages: AgentRuntimeModelMessage[]): void;
    closeRun(reason: AgentRuntimeCloseReason): void;
  };
  logger(event: { level: 'debug' | 'info' | 'warn' | 'error'; code: string }): void;
  clock: {
    nowMs(): number;
    nowIso(): string;
    nextId(prefix: string): string;
    schedule(callback: () => void, delayMs: number): unknown;
    cancel(handle: unknown): void;
  };
}

/** @experimental */
export interface AgentRuntimeInput {
  model: string;
  messages: AgentRuntimeModelMessage[];
  tools: AgentRuntimeToolDefinition[];
  maxRounds: number;
  temperature?: number;
  maxTokens?: number;
  contextWindowTokens?: number;
  /** How long to wait for the first model stream event of each request. Defaults to 30 000 ms. */
  firstEventTimeoutMs?: number;
  /** How long a started stream may stay silent between events. No limit when omitted. */
  idleTimeoutMs?: number;
  /** Primary cancellation signal. When supplied, it takes precedence over invocation.signal. */
  signal?: AbortSignal;
  /** Explicit root invocation; its signal is the fallback when the primary signal is absent. */
  invocation?: AgentRuntimeInvocationContext;
}

/**
 * finishReason 表达不了的收尾原因，宿主据此区分提示：
 * - max_rounds：工具轮次用完，finishReason 仍是 abort；
 * - length：模型单次输出达到上限，finishReason 是 length，回复按完成处理但可能没写完。
 */
export type AgentRuntimeStopReason = 'max_rounds' | 'length';

/** @experimental */
export interface AgentRuntimeResult {
  success: boolean;
  finishReason: AgentRuntimeCloseReason;
  messages: AgentRuntimeModelMessage[];
  stopReason?: AgentRuntimeStopReason;
  error?: string;
  doneData?: Record<string, unknown>;
  includeCacheMetrics?: boolean;
  includeTokenDetails?: boolean;
}
