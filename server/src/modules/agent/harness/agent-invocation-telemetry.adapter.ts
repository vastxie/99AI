import { Logger } from '@nestjs/common';
import type { AgentRuntimePorts } from '@99agent/runtime-core';

type AgentRuntimeTelemetryPort = NonNullable<AgentRuntimePorts['telemetry']>;
export type AgentRuntimeTelemetryEvent = Parameters<AgentRuntimeTelemetryPort['record']>[0];

const SAFE_CODES = new Set([
  'RUNTIME_FAILED',
  'MODEL_ATTEMPT_FAILED',
  'CAPABILITY_BATCH_FAILED',
  'MODEL_CONTEXT_OVERFLOW',
  'MODEL_RATE_LIMIT',
  'MODEL_TRANSIENT_ERROR',
  'MODEL_AUTH_ERROR',
  'MODEL_INVALID_REQUEST',
  'MODEL_ABORTED',
  'MODEL_OUTCOME_UNKNOWN',
]);
const SAFE_ID_PATTERNS = {
  operation: /^(?:op_|ephemeral:)[A-Za-z0-9._:-]{1,181}$/u,
  turn: /^(?:turn_|ephemeral:)[A-Za-z0-9._:-]{1,181}$/u,
  invocation: /^(?:op_|ephemeral:)[A-Za-z0-9._:-]{1,181}$/u,
  trace: /^trace_[A-Za-z0-9._:-]{1,184}$/u,
} as const;
const PHASES = new Set(['run', 'model', 'capability']);
const STATUSES = new Set(['started', 'succeeded', 'failed', 'aborted', 'rejected', 'unknown']);
const CATEGORIES = new Set([
  'context_overflow',
  'rate_limit',
  'transient',
  'auth',
  'invalid_request',
  'aborted',
  'unknown',
]);

function safeId(value: unknown, kind: keyof typeof SAFE_ID_PATTERNS): string {
  const normalized = String(value || '');
  return SAFE_ID_PATTERNS[kind].test(normalized) ? normalized : `invalid:${kind}`;
}

function safeInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return undefined;
  return Math.min(parsed, 2_147_483_647);
}

function safeTimestamp(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeCode(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value || '');
  return SAFE_CODES.has(normalized) ? normalized : 'INVALID_CODE';
}

/** Runtime allowlist: no prompt, model, owner, tool payload, URL, path or raw error can survive. */
export function sanitizeAgentInvocationTelemetryEvent(
  value: AgentRuntimeTelemetryEvent,
): AgentRuntimeTelemetryEvent {
  const raw = value as AgentRuntimeTelemetryEvent & Record<string, unknown>;
  const rawInvocation = (raw.invocation || {}) as AgentRuntimeTelemetryEvent['invocation'] &
    Record<string, unknown>;
  const phase = PHASES.has(String(raw.phase)) ? raw.phase : 'run';
  const status = STATUSES.has(String(raw.status)) ? raw.status : 'unknown';
  const category = CATEGORIES.has(String(raw.category)) ? raw.category : undefined;
  const atMs = safeTimestamp(raw.atMs);
  const durationMs = safeInteger(raw.durationMs);
  const roundIndex = safeInteger(raw.roundIndex);
  const attemptIndex = safeInteger(raw.attemptIndex);
  const messageCount = safeInteger(raw.messageCount);
  const toolCount = safeInteger(raw.toolCount);
  const inputTokens = safeInteger(raw.inputTokens);
  const outputTokens = safeInteger(raw.outputTokens);
  const totalTokens = safeInteger(raw.totalTokens);
  const code = safeCode(raw.code);
  return {
    type: raw.type === 'invocation.started' ? 'invocation.started' : 'invocation.completed',
    invocation: {
      operationId: safeId(rawInvocation.operationId, 'operation'),
      turnId: safeId(rawInvocation.turnId, 'turn'),
      generation: safeInteger(rawInvocation.generation) ?? 0,
      invocationId: safeId(rawInvocation.invocationId, 'invocation'),
      ...(rawInvocation.parentInvocationId
        ? { parentInvocationId: safeId(rawInvocation.parentInvocationId, 'invocation') }
        : {}),
      traceId: safeId(rawInvocation.traceId, 'trace'),
    },
    phase,
    status,
    atMs,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(roundIndex === undefined ? {} : { roundIndex }),
    ...(attemptIndex === undefined ? {} : { attemptIndex }),
    ...(messageCount === undefined ? {} : { messageCount }),
    ...(toolCount === undefined ? {} : { toolCount }),
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(category === undefined ? {} : { category }),
    ...(code === undefined ? {} : { code }),
  };
}

export class AgentInvocationTelemetryAdapter implements AgentRuntimeTelemetryPort {
  constructor(
    private readonly sink: (event: AgentRuntimeTelemetryEvent) => void | Promise<void> = event => {
      Logger.debug(
        `[InvocationTelemetry] trace=${event.invocation.traceId} invocation=${event.invocation.invocationId} phase=${event.phase} status=${event.status} durationMs=${event.durationMs ?? 0} round=${event.roundIndex ?? 0} attempt=${event.attemptIndex ?? 0} tokens=${event.totalTokens ?? 0} tools=${event.toolCount ?? 0} code=${event.code || 'none'}`,
        'AgentInvocationTelemetry',
      );
    },
  ) {}

  record(event: AgentRuntimeTelemetryEvent): void {
    const safeEvent = sanitizeAgentInvocationTelemetryEvent(event);
    try {
      const result = this.sink(safeEvent);
      if (result && typeof result.then === 'function') {
        void result.catch(() =>
          Logger.warn('Invocation telemetry sink rejected', 'AgentInvocationTelemetry'),
        );
      }
    } catch {
      Logger.warn('Invocation telemetry sink failed', 'AgentInvocationTelemetry');
    }
  }
}
