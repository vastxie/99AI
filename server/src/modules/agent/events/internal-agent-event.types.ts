import type { AgentEventType } from '@99agent/contracts';

export type InternalAgentEventSeverity = 'debug' | 'info' | 'warn' | 'error';

export interface InternalAgentEventTrace {
  traceId?: string;
  spanId?: string;
  retryAttempt?: number;
  retryable?: boolean;
  diagnosticCode?: string;
  diagnosticMessage?: string;
  diagnostics?: Record<string, unknown>;
}

export interface InternalAgentEventProviderState {
  provider?: string;
  model?: string;
  finishReason?: string;
  usage?: unknown;
  rawPayload?: unknown;
  request?: unknown;
  response?: unknown;
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, unknown>;
}

export interface InternalAgentEventRuntimeState {
  runtime?: string;
  taskType?: string;
  stdout?: string;
  stderr?: string;
  rawOutput?: unknown;
  privatePath?: string;
  workingDirectory?: string;
}

export interface InternalAgentEvent<TData = Record<string, unknown>> {
  type: AgentEventType;
  chatId: string | number;
  messageId?: string | number;
  taskId?: string;
  conversationGid?: string;
  turnId?: string;
  roundId?: string | number;
  toolCallId?: string;
  timestamp: number;
  severity?: InternalAgentEventSeverity;
  data?: TData;
  provider?: InternalAgentEventProviderState;
  runtime?: InternalAgentEventRuntimeState;
  trace?: InternalAgentEventTrace;
  contextBlockManifest?: unknown;
}
