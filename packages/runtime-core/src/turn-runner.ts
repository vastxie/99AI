import type {
  AgentRuntimeInput,
  AgentRuntimeInvocationContext,
  AgentRuntimeModelError,
  AgentRuntimeModelMessage,
  AgentRuntimeModelUsage,
  AgentRuntimePorts,
  AgentRuntimeToolCall,
} from './contracts';
import { MessageAssembler } from './message-assembler';

type TurnResult = {
  roundIndex: number;
  fullContent: string;
  reasoningContent: string;
  toolCalls: AgentRuntimeToolCall[];
  malformed: boolean;
  aborted: boolean;
  finishReason?: string;
  usage?: AgentRuntimeModelUsage;
  /** 本次回复最后一个 provider_state 事件的状态（不透明） */
  providerState?: unknown;
};

export class AgentRuntimeModelFailure extends Error {
  readonly code?: string;
  readonly category: AgentRuntimeModelError['category'];
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly requestOutcome: 'rejected' | 'unknown';
  readonly sideEffectFree: boolean;

  constructor(error: AgentRuntimeModelError = {}, sideEffectFree = false) {
    super(error.message || 'Model stream error');
    this.name = 'AgentRuntimeModelFailure';
    this.code = error.code;
    this.category = error.category || 'unknown';
    this.retryable = Boolean(error.retryable);
    this.retryAfterMs = error.retryAfterMs;
    this.requestOutcome = error.requestOutcome || 'unknown';
    this.sideEffectFree = sideEffectFree;
  }
}

function isAbortLikeError(error: unknown): boolean {
  if (typeof error !== 'object' || !error) return false;
  const code = 'code' in error ? String(error.code || '') : '';
  const name = 'name' in error ? String(error.name || '') : '';
  const message = 'message' in error ? String(error.message || '') : '';
  return (
    code === 'aborted' ||
    code === 'ABORT_ERR' ||
    code === 'ERR_ABORTED' ||
    name === 'AbortError' ||
    /abort|aborted|中止/i.test(message)
  );
}

export class TurnRunner {
  constructor(
    private readonly ports: AgentRuntimePorts,
    private readonly assembler: MessageAssembler,
  ) {}

  async runTurn(
    input: AgentRuntimeInput,
    messages: AgentRuntimeModelMessage[],
    roundIndex: number,
    options: { emitRoundStarted?: boolean; attemptIndex?: number } = {},
    invocation?: AgentRuntimeInvocationContext,
  ): Promise<TurnResult> {
    let fullContent = '';
    let reasoningContent = '';
    let thinkingStartedAt: number | undefined;
    let thinkingDurationMs = 0;
    let usage: AgentRuntimeModelUsage | undefined;
    let aborted = false;
    let hasToolCalls = false;
    let finishReason: string | undefined;
    let providerState: unknown;
    let visibleEffectObserved = false;
    const chunks = new Map<number, { id: string; name: string; arguments: string }>();
    /** 已经通知过的工具调用：参数开始到来时名称已完整，每个调用只通知一次 */
    const announcedToolCalls = new Set<number>();

    if (options.emitRoundStarted !== false) {
      this.ports.progress({
        type: 'round.started',
        data: { roundIndex, messages, tools: input.tools },
      });
    }

    const controller = new AbortController();
    let firstEventReceived = false;
    let waitTimedOut = false;
    let streamCompleted = false;
    const forwardAbort = () => controller.abort(input.signal?.reason);
    if (input.signal?.aborted) forwardAbort();
    else input.signal?.addEventListener('abort', forwardAbort, { once: true });
    // 一个定时器管两段等待：第一个事件之前按首次响应上限，之后每来一个事件按空闲上限重新计时
    const onWaitTimeout = () => {
      waitTimedOut = true;
      controller.abort(new Error('model_wait_timeout'));
    };
    let timer = this.ports.clock.schedule(onWaitTimeout, input.firstEventTimeoutMs ?? 30_000);
    try {
      for await (const event of this.ports.modelStream({
        messages,
        tools: input.tools,
        roundIndex,
        attemptIndex: options.attemptIndex ?? 0,
        // 不设默认温度：没指定时由模型服务按自己的默认值处理
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        maxTokens: input.maxTokens,
        signal: controller.signal,
        invocation: invocation ||
          input.invocation || {
            operationId: 'ephemeral',
            turnId: 'ephemeral',
            generation: 0,
            invocationId: 'ephemeral:model',
            traceId: 'ephemeral',
            signal: controller.signal,
          },
      })) {
        if (input.signal?.aborted) {
          aborted = true;
          break;
        }
        if (event.type === 'abort') {
          aborted = true;
          break;
        }
        this.ports.clock.cancel(timer);
        if (input.idleTimeoutMs && !waitTimedOut)
          timer = this.ports.clock.schedule(onWaitTimeout, input.idleTimeoutMs);
        firstEventReceived = true;
        if (event.type === 'error') {
          throw new AgentRuntimeModelFailure(event.error, !visibleEffectObserved && !usage);
        }
        if (event.type === 'reasoning_delta' && event.delta) {
          visibleEffectObserved = true;
          if (thinkingStartedAt === undefined) thinkingStartedAt = this.ports.clock.nowMs();
          reasoningContent += event.delta;
          this.ports.progress({
            type: 'reasoning.delta',
            data: {
              roundIndex,
              delta: event.delta,
              cumulative: reasoningContent,
              thinkingDurationMs: thinkingDurationMs + this.ports.clock.nowMs() - thinkingStartedAt,
            },
          });
        }
        if (event.type === 'text_delta' && event.delta) {
          visibleEffectObserved = true;
          if (thinkingStartedAt !== undefined) {
            thinkingDurationMs += this.ports.clock.nowMs() - thinkingStartedAt;
            thinkingStartedAt = undefined;
          }
          fullContent += event.delta;
          this.ports.progress({
            type: 'text.delta',
            data: { roundIndex, delta: event.delta, cumulative: fullContent },
          });
        }
        if (event.type === 'tool_call_delta') {
          visibleEffectObserved = true;
          hasToolCalls = true;
          const index = event.index ?? 0;
          const chunk = chunks.get(index) || {
            id: '',
            name: '',
            arguments: '',
          };
          if (event.id) chunk.id = event.id;
          if (event.nameDelta) chunk.name += event.nameDelta;
          if (event.argumentsDelta) chunk.arguments += event.argumentsDelta;
          chunks.set(index, chunk);
          if (!announcedToolCalls.has(index) && chunk.name && chunk.arguments) {
            announcedToolCalls.add(index);
            this.ports.progress({
              type: 'round.tool_call',
              data: { roundIndex, index, name: chunk.name },
            });
          }
        }
        if (event.type === 'hosted_tool_call') {
          visibleEffectObserved = true;
          const completed =
            event.toolCall.status === 'success' || event.toolCall.status === 'error';
          this.ports.progress({
            type: completed ? 'capability.completed' : 'capability.started',
            data: {
              origin: 'hosted',
              roundIndex,
              callId: event.toolCall.id,
              status:
                event.toolCall.status === 'error' ? 'error' : completed ? 'success' : 'running',
              toolCall: event.toolCall,
            },
          });
        }
        if (event.type === 'usage') {
          visibleEffectObserved = true;
          usage = event.usage;
        }
        if (event.type === 'done') {
          streamCompleted = true;
          finishReason = event.finishReason;
        }
        if (event.type === 'provider_state') providerState = event.state;
      }
      // 等待到期后流以 abort 或直接结束收场：按超时处理；已经正常收尾的照常返回
      if (waitTimedOut && !streamCompleted) throw new Error('model_wait_timeout');
    } catch (error) {
      if (input.signal?.aborted) {
        aborted = true;
      } else if (waitTimedOut) {
        throw new Error(
          firstEventReceived ? '模型长时间没有输出，已中断，请重试' : '模型响应超时，请重试',
        );
      } else if (isAbortLikeError(error)) {
        aborted = true;
      } else {
        throw error;
      }
    } finally {
      this.ports.clock.cancel(timer);
      input.signal?.removeEventListener('abort', forwardAbort);
    }

    if (thinkingStartedAt !== undefined) {
      thinkingDurationMs += this.ports.clock.nowMs() - thinkingStartedAt;
    }
    if (usage) this.ports.trace({ type: 'usage', data: { roundIndex, usage } });
    const assembled = hasToolCalls
      ? this.assembler.assembleToolCalls(chunks, this.ports.clock)
      : { toolCalls: [], malformed: false };
    this.ports.progress({
      type: 'round.completed',
      data: {
        roundIndex,
        fullContent,
        reasoningContent,
        thinkingDurationMs,
        toolCallNames: assembled.toolCalls.map((call) => call.function.name),
        // 缺名称的畸形调用不在名称列表里，运行随后以错误结束；单独标出，免得把这一轮当成没调用工具
        malformedToolCalls: assembled.malformed,
      },
    });
    return {
      roundIndex,
      fullContent,
      reasoningContent,
      toolCalls: assembled.toolCalls,
      malformed: assembled.malformed,
      aborted: aborted || Boolean(input.signal?.aborted),
      finishReason,
      usage,
      ...(providerState !== undefined ? { providerState } : {}),
    };
  }
}
