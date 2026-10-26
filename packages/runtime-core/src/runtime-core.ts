import type {
  AgentRuntimeCapabilityResult,
  AgentRuntimeInput,
  AgentRuntimeInvocationContext,
  AgentRuntimeModelMessage,
  AgentRuntimeModelUsage,
  AgentRuntimePorts,
  AgentRuntimeResult,
  AgentRuntimeTelemetryEvent,
  AgentRuntimeToolCall,
} from './contracts';
import { AGENT_RUNTIME_PROVIDER_STATE_REJECTED } from './contracts';
import { MessageAssembler } from './message-assembler';
import { StopPolicy } from './stop-policy';
import { TurnRunner } from './turn-runner';
import { AgentRuntimeModelFailure } from './turn-runner';

function isToolContent(value: unknown): boolean {
  if (typeof value === 'string') return true;
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 32 &&
    value.every((part) => {
      if (!part || typeof part !== 'object') return false;
      if (part.type === 'text')
        return (
          typeof part.text === 'string' &&
          Object.keys(part).every((key) => key === 'type' || key === 'text')
        );
      return (
        (part.type === 'image_file' || part.type === 'audio_file') &&
        Object.keys(part).every((key) => key === 'type' || key === 'file') &&
        typeof part.file?.fileRef === 'string' &&
        Object.keys(part.file).every((key) => ['fileRef', 'name', 'mime'].includes(key)) &&
        /^(attachment|output_image|output_file|previous_file)_[1-9]\d*$/.test(part.file.fileRef) &&
        (part.file.name === undefined || typeof part.file.name === 'string') &&
        (part.file.mime === undefined || typeof part.file.mime === 'string')
      );
    })
  );
}

function orderAndValidateResults(
  requestedCalls: AgentRuntimeToolCall[],
  results: AgentRuntimeCapabilityResult[],
): AgentRuntimeCapabilityResult[] {
  const requestedIds = requestedCalls.map((call) => call.id);
  const resultIds = results.map((result) => result.callId);
  if (
    resultIds.some((id) => !id) ||
    resultIds.length !== requestedIds.length ||
    new Set(resultIds).size !== resultIds.length ||
    resultIds.some((id) => !requestedIds.includes(id)) ||
    requestedIds.some((id) => !resultIds.includes(id))
  ) {
    throw new Error('Capability result callId set does not match the request set');
  }
  const byId = new Map(results.map((result) => [result.callId, result]));
  const ordered = requestedIds.map((id) => byId.get(id)!);
  for (const result of ordered) {
    if (
      (result.status !== 'success' && result.status !== 'error') ||
      !isToolContent(result.modelContent)
    ) {
      throw new Error(`Capability result is invalid: ${result.callId}`);
    }
  }
  return ordered;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error('Agent runtime aborted');
  error.name = 'AbortError';
  throw error;
}

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    String(record.name || '') === 'AbortError' ||
    ['aborted', 'ABORT_ERR', 'ERR_ABORTED'].includes(String(record.code || ''))
  );
}

function modelRequestSize(messages: AgentRuntimeInput['messages']): number {
  try {
    return JSON.stringify(
      messages.map((message) => {
        const { __agent_context: _internal, ...providerMessage } =
          message as AgentRuntimeModelMessage & { __agent_context?: unknown };
        return providerMessage;
      }),
    ).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function telemetryIdentity(
  invocation: AgentRuntimeInvocationContext,
): Omit<AgentRuntimeInvocationContext, 'signal'> {
  return {
    operationId: invocation.operationId,
    turnId: invocation.turnId,
    generation: invocation.generation,
    invocationId: invocation.invocationId,
    ...(invocation.parentInvocationId ? { parentInvocationId: invocation.parentInvocationId } : {}),
    traceId: invocation.traceId,
  };
}

const TELEMETRY_ID_PATTERNS = {
  operation: /^(?:op_|operation_|ephemeral:)[A-Za-z0-9._:-]{1,181}$/,
  turn: /^(?:turn_|ephemeral:)[A-Za-z0-9._:-]{1,181}$/,
  invocation: /^(?:op_|invocation_|ephemeral:)[A-Za-z0-9._:-]{1,181}$/,
  trace: /^(?:trace_|ephemeral(?::|$))[A-Za-z0-9._:-]{0,184}$/,
} as const;
const TELEMETRY_CODES = new Set([
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

function safeTelemetryId(value: unknown, kind: keyof typeof TELEMETRY_ID_PATTERNS): string {
  const normalized = String(value || '');
  return TELEMETRY_ID_PATTERNS[kind].test(normalized) ? normalized : `invalid:${kind}`;
}

function safeTelemetryInteger(
  value: unknown,
  options: { timestamp?: boolean } = {},
): number | undefined {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return undefined;
  return options.timestamp ? parsed : Math.min(parsed, 2_147_483_647);
}

function safeTelemetryCode(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value || '');
  return TELEMETRY_CODES.has(normalized) ? normalized : 'INVALID_CODE';
}

function sanitizeRuntimeTelemetryEvent(
  event: AgentRuntimeTelemetryEvent,
): AgentRuntimeTelemetryEvent {
  const raw = event as AgentRuntimeTelemetryEvent & Record<string, unknown>;
  const invocation = raw.invocation as AgentRuntimeTelemetryEvent['invocation'] &
    Record<string, unknown>;
  const durationMs = safeTelemetryInteger(raw.durationMs);
  const roundIndex = safeTelemetryInteger(raw.roundIndex);
  const attemptIndex = safeTelemetryInteger(raw.attemptIndex);
  const messageCount = safeTelemetryInteger(raw.messageCount);
  const toolCount = safeTelemetryInteger(raw.toolCount);
  const inputTokens = safeTelemetryInteger(raw.inputTokens);
  const outputTokens = safeTelemetryInteger(raw.outputTokens);
  const totalTokens = safeTelemetryInteger(raw.totalTokens);
  const code = safeTelemetryCode(raw.code);
  return {
    type: raw.type === 'invocation.started' ? 'invocation.started' : 'invocation.completed',
    invocation: {
      operationId: safeTelemetryId(invocation.operationId, 'operation'),
      turnId: safeTelemetryId(invocation.turnId, 'turn'),
      generation: safeTelemetryInteger(invocation.generation) ?? 0,
      invocationId: safeTelemetryId(invocation.invocationId, 'invocation'),
      ...(invocation.parentInvocationId
        ? {
            parentInvocationId: safeTelemetryId(invocation.parentInvocationId, 'invocation'),
          }
        : {}),
      traceId: safeTelemetryId(invocation.traceId, 'trace'),
    },
    phase: ['run', 'model', 'capability'].includes(String(raw.phase)) ? raw.phase : 'run',
    status: ['started', 'succeeded', 'failed', 'aborted', 'rejected', 'unknown'].includes(
      String(raw.status),
    )
      ? raw.status
      : 'unknown',
    atMs: safeTelemetryInteger(raw.atMs, { timestamp: true }) ?? 0,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(roundIndex === undefined ? {} : { roundIndex }),
    ...(attemptIndex === undefined ? {} : { attemptIndex }),
    ...(messageCount === undefined ? {} : { messageCount }),
    ...(toolCount === undefined ? {} : { toolCount }),
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...([
      'context_overflow',
      'rate_limit',
      'transient',
      'auth',
      'invalid_request',
      'aborted',
      'unknown',
    ].includes(String(raw.category))
      ? { category: raw.category }
      : {}),
    ...(code === undefined ? {} : { code }),
  };
}

function recordTelemetry(ports: AgentRuntimePorts, event: AgentRuntimeTelemetryEvent): void {
  try {
    const result = ports.telemetry?.record(sanitizeRuntimeTelemetryEvent(event));
    if (result && typeof result.then === 'function') {
      void result.catch((): undefined => undefined);
    }
  } catch {
    // Telemetry is passive and can never change runtime behavior.
  }
}

function telemetryStatusForError(error: unknown): AgentRuntimeTelemetryEvent['status'] {
  if (isAbortLikeError(error)) return 'aborted';
  if (error instanceof AgentRuntimeModelFailure) {
    return error.requestOutcome === 'rejected' ? 'rejected' : 'unknown';
  }
  return 'failed';
}

/** @experimental */
export class AgentRuntimeCore {
  private readonly assembler = new MessageAssembler();
  private readonly turnRunner: TurnRunner;

  constructor(private readonly ports: AgentRuntimePorts) {
    this.turnRunner = new TurnRunner(ports, this.assembler);
  }

  async run(input: AgentRuntimeInput): Promise<AgentRuntimeResult> {
    const stopPolicy = new StopPolicy(input.maxRounds);
    const runSignal = input.signal || input.invocation?.signal;
    const runInput = runSignal === input.signal ? input : { ...input, signal: runSignal };
    const rootInvocation: AgentRuntimeInvocationContext = input.invocation
      ? {
          operationId: input.invocation.operationId,
          turnId: input.invocation.turnId,
          generation: input.invocation.generation,
          invocationId: input.invocation.invocationId,
          ...(input.invocation.parentInvocationId
            ? { parentInvocationId: input.invocation.parentInvocationId }
            : {}),
          traceId: input.invocation.traceId,
          signal: runSignal,
        }
      : {
          operationId: this.ports.clock.nextId('operation'),
          turnId: this.ports.clock.nextId('turn'),
          generation: 0,
          invocationId: this.ports.clock.nextId('invocation'),
          traceId: this.ports.clock.nextId('trace'),
          signal: runSignal,
        };
    const rootStartedAt = this.ports.clock.nowMs();
    let invocationOrdinal = 0;
    let completedRounds = 0;
    const childInvocation = (
      phase: 'model' | 'capability',
      signal?: AbortSignal,
    ): AgentRuntimeInvocationContext => ({
      ...rootInvocation,
      invocationId: `${rootInvocation.invocationId}:${phase}:${invocationOrdinal++}`,
      parentInvocationId: rootInvocation.invocationId,
      signal: signal || rootInvocation.signal,
    });
    recordTelemetry(this.ports, {
      type: 'invocation.started',
      invocation: telemetryIdentity(rootInvocation),
      phase: 'run',
      status: 'started',
      atMs: rootStartedAt,
      messageCount: input.messages.length,
      toolCount: input.tools.length,
    });
    let messages = input.messages;
    let closed = false;
    let overflowRecoveryUsed = false;
    let previousUsage: AgentRuntimeModelUsage | undefined;
    const finish = (result: Omit<AgentRuntimeResult, 'messages'>): AgentRuntimeResult => {
      if (!closed) {
        closed = true;
        this.ports.lifecycle.closeRun(result.finishReason);
        recordTelemetry(this.ports, {
          type: 'invocation.completed',
          invocation: telemetryIdentity(rootInvocation),
          phase: 'run',
          status:
            result.finishReason === 'abort'
              ? 'aborted'
              : result.finishReason === 'error'
                ? 'failed'
                : 'succeeded',
          atMs: this.ports.clock.nowMs(),
          durationMs: Math.max(0, this.ports.clock.nowMs() - rootStartedAt),
          messageCount: messages.length,
          toolCount: input.tools.length,
          ...(completedRounds > 0 ? { roundIndex: completedRounds - 1 } : {}),
          ...(result.finishReason === 'error' ? { code: 'RUNTIME_FAILED' } : {}),
        });
      }
      return { ...result, messages };
    };

    try {
      for (let roundIndex = 0; ; roundIndex += 1) {
        assertNotAborted(runSignal);
        stopPolicy.beginRound();
        this.assembler.sanitizeMessageSequence(messages);
        this.assembler.sanitizeApiMessageNames(messages);
        const prepared = await this.ports.messagePreparation.prepareForModel(messages, {
          roundIndex,
          reason: 'round',
          previousUsage,
          overflowRecoveryUsed,
          invocation: rootInvocation,
        });
        assertNotAborted(runSignal);
        if (prepared !== messages) {
          messages = prepared;
          this.ports.lifecycle.onMessagesReplaced(messages);
        }
        this.assembler.sanitizeMessageSequence(messages);
        this.assembler.sanitizeApiMessageNames(messages);

        let turn: Awaited<ReturnType<TurnRunner['runTurn']>>;
        let attemptIndex = 0;
        let providerRetryIndex = 0;
        let emitRoundStarted = true;
        for (;;) {
          const modelInvocation = childInvocation('model', runSignal);
          const modelStartedAt = this.ports.clock.nowMs();
          recordTelemetry(this.ports, {
            type: 'invocation.started',
            invocation: telemetryIdentity(modelInvocation),
            phase: 'model',
            status: 'started',
            atMs: modelStartedAt,
            roundIndex,
            attemptIndex,
            messageCount: messages.length,
            toolCount: input.tools.length,
          });
          try {
            turn = await this.turnRunner.runTurn(
              runInput,
              messages,
              roundIndex,
              {
                emitRoundStarted,
                attemptIndex,
              },
              modelInvocation,
            );
            recordTelemetry(this.ports, {
              type: 'invocation.completed',
              invocation: telemetryIdentity(modelInvocation),
              phase: 'model',
              status: turn.aborted ? 'aborted' : 'succeeded',
              atMs: this.ports.clock.nowMs(),
              durationMs: Math.max(0, this.ports.clock.nowMs() - modelStartedAt),
              roundIndex,
              attemptIndex,
              messageCount: messages.length,
              toolCount: turn.toolCalls.length,
              ...(turn.usage
                ? {
                    inputTokens: turn.usage.inputTokens,
                    outputTokens: turn.usage.outputTokens,
                    totalTokens: turn.usage.totalTokens,
                  }
                : {}),
            });
            break;
          } catch (error) {
            recordTelemetry(this.ports, {
              type: 'invocation.completed',
              invocation: telemetryIdentity(modelInvocation),
              phase: 'model',
              status: runSignal?.aborted ? 'aborted' : telemetryStatusForError(error),
              atMs: this.ports.clock.nowMs(),
              durationMs: Math.max(0, this.ports.clock.nowMs() - modelStartedAt),
              roundIndex,
              attemptIndex,
              messageCount: messages.length,
              toolCount: input.tools.length,
              ...(error instanceof AgentRuntimeModelFailure
                ? {
                    category: error.category,
                    ...(error.code ? { code: error.code } : {}),
                  }
                : { code: 'MODEL_ATTEMPT_FAILED' }),
            });
            assertNotAborted(runSignal);
            const canRetryProvider =
              error instanceof AgentRuntimeModelFailure &&
              error.retryable &&
              (error.category === 'rate_limit' || error.category === 'transient') &&
              error.requestOutcome === 'rejected' &&
              error.sideEffectFree &&
              providerRetryIndex < 2 &&
              Boolean(this.ports.modelRetry);
            if (canRetryProvider) {
              assertNotAborted(runSignal);
              const plan = this.ports.modelRetry!.plan({
                category: error.category as 'rate_limit' | 'transient',
                retryAfterMs: error.retryAfterMs,
                retryIndex: providerRetryIndex,
              });
              if (plan) {
                const nextAttemptIndex = attemptIndex + 1;
                this.ports.progress({
                  type: 'run.progress',
                  data: {
                    description: '模型服务暂时繁忙，正在进行有限重试',
                    code: 'provider_retry_wait',
                    category: error.category,
                    roundIndex,
                    retryIndex: providerRetryIndex,
                    delayMs: plan.delayMs,
                  },
                });
                await this.ports.modelRetry!.wait({
                  ...plan,
                  roundIndex,
                  attemptIndex: nextAttemptIndex,
                  retryIndex: providerRetryIndex,
                  signal: runSignal,
                });
                assertNotAborted(runSignal);
                providerRetryIndex += 1;
                attemptIndex = nextAttemptIndex;
                emitRoundStarted = false;
                continue;
              }
            }

            // 带回放状态的请求被拒（尚未开始返回）：删掉运行历史里全部回放状态（之后各轮都不再带），
            // 按新的 attempt 重新派发（照常经过账本围栏与取消检查）。删掉之后历史里没有状态，
            // 本轮不会再满足条件，所以每轮最多一次；之后的回复产生了新状态时，后面的轮次可以再重发
            const canRetryWithoutProviderState =
              error instanceof AgentRuntimeModelFailure &&
              error.code === AGENT_RUNTIME_PROVIDER_STATE_REJECTED &&
              error.requestOutcome === 'rejected' &&
              error.sideEffectFree &&
              messages.some((message) => message.provider_state !== undefined);
            if (canRetryWithoutProviderState) {
              assertNotAborted(runSignal);
              messages = messages.map((message) => {
                if (message.provider_state === undefined) return message;
                const { provider_state: _dropped, ...rest } = message;
                return rest;
              });
              this.ports.lifecycle.onMessagesReplaced(messages);
              this.ports.progress({
                type: 'run.progress',
                data: {
                  description: '模型服务拒绝了回放的思考状态，已去掉后重试',
                  code: 'provider_state_retry',
                  roundIndex,
                },
              });
              attemptIndex += 1;
              emitRoundStarted = false;
              continue;
            }

            const canRecoverOverflow =
              error instanceof AgentRuntimeModelFailure &&
              error.category === 'context_overflow' &&
              error.requestOutcome === 'rejected' &&
              error.sideEffectFree &&
              !overflowRecoveryUsed;
            if (!canRecoverOverflow) throw error;

            overflowRecoveryUsed = true;
            this.ports.progress({
              type: 'run.progress',
              data: {
                description: '上下文超出模型窗口，正在压缩后重试',
                code: 'context_overflow_recovery',
                roundIndex,
              },
            });
            const failedRequestSize = modelRequestSize(messages);
            const recoverySource = JSON.parse(
              JSON.stringify(messages),
            ) as AgentRuntimeModelMessage[];
            const recovered = await this.ports.messagePreparation.prepareForModel(recoverySource, {
              roundIndex,
              reason: 'context_overflow',
              previousUsage,
              overflowRecoveryUsed,
              invocation: rootInvocation,
            });
            assertNotAborted(runSignal);
            const normalizedRecovered = JSON.parse(
              JSON.stringify(recovered),
            ) as AgentRuntimeModelMessage[];
            this.assembler.sanitizeMessageSequence(normalizedRecovered);
            this.assembler.sanitizeApiMessageNames(normalizedRecovered);
            if (modelRequestSize(normalizedRecovered) >= failedRequestSize) {
              throw new Error('Context overflow recovery did not reduce the model request');
            }
            messages = normalizedRecovered;
            this.ports.lifecycle.onMessagesReplaced(messages);
            attemptIndex += 1;
            emitRoundStarted = false;
          }
        }
        previousUsage = turn.usage;
        completedRounds = Math.max(completedRounds, roundIndex + 1);
        const turnDecision = stopPolicy.decideAfterTurn({
          aborted: turn.aborted,
          malformed: turn.malformed,
          toolCalls: turn.toolCalls,
          finishReason: turn.finishReason,
        });
        if (turnDecision.shouldStop) return finish(turnDecision.result!);

        assertNotAborted(runSignal);

        const requestedCallIds = turn.toolCalls.map((call) => call.id);
        if (
          requestedCallIds.some((callId) => !callId) ||
          new Set(requestedCallIds).size !== requestedCallIds.length
        ) {
          throw new Error('Capability request callId set is invalid');
        }
        const assistantMessage = this.ports.messagePreparation.projectAssistantMessage({
          content: turn.fullContent,
          reasoningContent: turn.reasoningContent,
          toolCalls: turn.toolCalls,
          ...(turn.providerState !== undefined ? { providerState: turn.providerState } : {}),
        });
        messages.push(assistantMessage);

        const capabilityInvocation = childInvocation('capability', runSignal);
        const capabilityStartedAt = this.ports.clock.nowMs();
        recordTelemetry(this.ports, {
          type: 'invocation.started',
          invocation: telemetryIdentity(capabilityInvocation),
          phase: 'capability',
          status: 'started',
          atMs: capabilityStartedAt,
          roundIndex,
          toolCount: turn.toolCalls.length,
        });
        let rawResults: AgentRuntimeCapabilityResult[];
        try {
          rawResults = await this.ports.capabilityExecutor({
            toolCalls: turn.toolCalls,
            roundIndex,
            signal: runSignal,
            invocation: capabilityInvocation,
          });
          recordTelemetry(this.ports, {
            type: 'invocation.completed',
            invocation: telemetryIdentity(capabilityInvocation),
            phase: 'capability',
            status: runSignal?.aborted ? 'aborted' : 'succeeded',
            atMs: this.ports.clock.nowMs(),
            durationMs: Math.max(0, this.ports.clock.nowMs() - capabilityStartedAt),
            roundIndex,
            toolCount: rawResults.length,
          });
        } catch (error) {
          recordTelemetry(this.ports, {
            type: 'invocation.completed',
            invocation: telemetryIdentity(capabilityInvocation),
            phase: 'capability',
            status: runSignal?.aborted ? 'aborted' : telemetryStatusForError(error),
            atMs: this.ports.clock.nowMs(),
            durationMs: Math.max(0, this.ports.clock.nowMs() - capabilityStartedAt),
            roundIndex,
            toolCount: turn.toolCalls.length,
            code: 'CAPABILITY_BATCH_FAILED',
          });
          throw error;
        }
        assertNotAborted(runSignal);
        const results = orderAndValidateResults(turn.toolCalls, rawResults);
        const orderedCallIds = turn.toolCalls.map((call) => call.id);
        assertNotAborted(runSignal);
        this.ports.lifecycle.prepareCapabilityCommit(orderedCallIds);
        assertNotAborted(runSignal);
        for (const result of results) {
          messages.push({
            role: 'tool',
            tool_call_id: result.callId,
            content: result.modelContent,
          });
          this.ports.progress({
            type: 'capability.completed',
            data: {
              origin: 'external',
              roundIndex,
              callId: result.callId,
              status: result.status,
              modelContent: result.modelContent,
              ...(result.control ? { control: result.control } : {}),
            },
          });
        }

        assertNotAborted(runSignal);
        const lifecycle = this.ports.lifecycle.afterToolRound() || {};
        const capabilityDecision = stopPolicy.decideAfterCapabilities({
          results,
          shouldHandoff: Boolean(lifecycle.shouldHandoff),
        });
        if (capabilityDecision.reason === 'queued_turn') {
          this.ports.progress({
            type: 'run.progress',
            data: { description: '已收到后续要求，准备进入下一轮' },
          });
        }
        if (capabilityDecision.shouldStop) return finish(capabilityDecision.result!);
      }
    } catch (error) {
      const aborted = Boolean(runSignal?.aborted) || isAbortLikeError(error);
      return finish({
        success: aborted,
        finishReason: aborted ? 'abort' : 'error',
        error: aborted ? undefined : error instanceof Error ? error.message : String(error),
      });
    }
  }
}
