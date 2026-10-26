import { shouldKeepReasoningContentForModel } from '@/common/utils';
import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type {
  AgentRuntimeCapabilityResult,
  AgentRuntimeModelMessage,
  AgentRuntimePorts,
  AgentRuntimeProgressEvent,
  AgentRuntimeToolCall,
} from '@99agent/runtime-core';
import { projectAnswerText } from '@99agent/contracts';
import type { ModelGatewayRuntimeConfig } from '../../modelGateway/model-gateway.types';
import type { ModelGatewayService } from '../../modelGateway/model-gateway.service';
import { createOpaqueModelGatewaySessionId } from '../../modelGateway/model-gateway-session';
import {
  classifyProviderError,
  normalizeModelHistory,
  planProviderRetry,
  toSafeModelStreamError,
  waitForProviderRetry,
} from '../../modelGateway/model-stream';
import type { ModelStreamError } from '../../modelGateway/model-stream';
import type { ModelMessage, UnifiedMessage } from '../../chatLog/types/message.types';
import type { ToolExecutionContext } from '../tools/tool-provider.interface';
import { getToolModelContent, toBackendToolCall } from '../../chatLog/tool-result-payload';
import type { AgentToolModelContent } from '../../chatLog/agent-tool-result.types';
import type { AgentLoopOptions } from './agent-loop.service';
import { AgentToolExecutor } from './agent-tool-executor.adapter';
import { isConversationToolName } from '../conversation/conversation-tool.provider';
import type { ContextProjectionSession } from '../context/context-checkpoint-coordinator';
import type { AgentOperationSession } from '../runtime-state/operation-ledger.store';
import { sanitizeOperationLedgerText } from '../runtime-state/operation-ledger.types';

type AgentRuntimePreparationContext = Parameters<
  AgentRuntimePorts['messagePreparation']['prepareForModel']
>[1];

type CorrelationEntry = {
  callId: string;
  ordinal: number;
  origin: 'external' | 'hosted';
  state: 'started' | 'terminal' | 'resolved' | 'prepared' | 'committed' | 'discarded';
  roundIndex: number;
  platformResult?: any;
};

function modelPersistenceFailure(): ModelStreamError {
  return toSafeModelStreamError({
    code: 'MODEL_OUTCOME_UNKNOWN',
    message: '',
    category: 'unknown',
    retryable: false,
    requestOutcome: 'unknown',
  });
}

class ModelEffectPersistenceError extends Error {
  constructor() {
    super('模型执行状态持久化失败');
    this.name = 'ModelEffectPersistenceError';
  }
}

export function stripAgentContextMetadata(
  messages: readonly AgentRuntimeModelMessage[] | undefined,
): AgentRuntimeModelMessage[] {
  return (messages || []).map(message => {
    const { __agent_context: _internal, ...safeMessage } = message as any;
    return safeMessage as AgentRuntimeModelMessage;
  });
}

/** 交给工具的消息：在去掉内部元数据之外，再去掉厂商私有回放状态（发给模型的投影保留它） */
export function toToolContextMessages(
  messages: readonly AgentRuntimeModelMessage[] | undefined,
): AgentRuntimeModelMessage[] {
  return stripAgentContextMetadata(messages).map(message => {
    if (message.provider_state === undefined) return message;
    const { provider_state: _private, ...safeMessage } = message;
    return safeMessage;
  });
}

/**
 * 接近工具调用轮次上限时给模型的提醒（只在本次运行中附在本轮第一个工具结果最前面，不进效果账本与历史）：
 * 运行时在上限之后仍允许一轮不调用工具的最终答复，提醒让模型及时收尾，而不是在上限处被截断。
 */
export function roundBudgetNote(roundIndex: number, maxRounds: number | undefined): string {
  if (!maxRounds || maxRounds < 1) return '';
  const remaining = maxRounds - 1 - roundIndex;
  if (remaining > 5) return '';
  return remaining <= 0
    ? '[轮次提醒] 本次回复的工具调用轮次已用完：请直接给出最终答复，不要再调用工具。'
    : `[轮次提醒] 本次回复最多还能再调用 ${remaining} 轮工具：请停止继续搜集，用已有结果完成任务、交付成果，然后给出最终答复。`;
}

/** runtime-core 校验工具结果时数组内容最多 32 项 */
const MAX_MODEL_CONTENT_PARTS = 32;

function withLeadingNote(content: AgentToolModelContent, note: string): AgentToolModelContent {
  if (typeof content === 'string') return `${note}\n${content}`;
  // 优先并入已有的文本项；只有媒体项且已满时不加，不让结果超出内核的数量上限
  const textIndex = content.findIndex(part => part.type === 'text');
  if (textIndex >= 0)
    return content.map((part, index) =>
      index === textIndex && part.type === 'text'
        ? { ...part, text: `${note}\n${part.text}` }
        : part,
    );
  return content.length < MAX_MODEL_CONTENT_PARTS
    ? [{ type: 'text', text: note }, ...content]
    : content;
}

export class AgentRuntimePlatformAdapter {
  readonly ports: AgentRuntimePorts;
  private readonly correlation = new Map<string, CorrelationEntry>();
  private closed = false;
  private preparedExternalCallIds?: string[];
  private nextExternalCommitOrdinal = 0;

  constructor(
    private readonly input: {
      model: string;
      modelConfig: ModelGatewayRuntimeConfig;
      options: AgentLoopOptions;
      currentMessage: UnifiedMessage;
      toolContext: ToolExecutionContext;
      sanitizedNameMap: Map<string, string>;
      modelGateway: ModelGatewayService;
      toolExecutor: AgentToolExecutor;
      prepareMedia(messages: ModelMessage[]): Promise<ModelMessage[]>;
      createRoundTrace(roundIndex: number, messages: ModelMessage[], tools: any[]): any;
      summarizeModelOutput(content: string): string | undefined;
      contextProjection?: ContextProjectionSession;
      operationSession?: AgentOperationSession;
      telemetry?: AgentRuntimePorts['telemetry'];
      /** 本次回复的工具调用轮次上限，用于接近上限时提醒模型收尾 */
      maxRounds?: number;
    },
  ) {
    this.ports = {
      modelStream: request => this.streamModel(request),
      ...(this.input.operationSession
        ? {
            modelRetry: {
              plan: input =>
                planProviderRetry({
                  category: input.category,
                  retryAfterMs: input.retryAfterMs,
                  retryIndex: input.retryIndex,
                }),
              wait: input => this.waitBeforeModelRetry(input),
            },
          }
        : {}),
      capabilityExecutor: request => this.executeCapabilities(request),
      ...(this.input.telemetry ? { telemetry: this.input.telemetry } : {}),
      progress: event => this.handleProgress(event),
      trace: event => this.handleTrace(event),
      messagePreparation: {
        prepareForModel: (messages, context) => this.prepareForModel(messages, context),
        projectAssistantMessage: draft => this.projectAssistantMessage(draft),
      },
      lifecycle: {
        prepareCapabilityCommit: callIds => this.prepareCapabilityCommit(callIds),
        afterToolRound: () => {
          this.assertOpen();
          if (this.preparedExternalCallIds) {
            throw new Error('Capability correlation batch is not fully committed');
          }
          return {
            shouldHandoff: Boolean(this.input.options.shouldHandoffAfterToolRound?.()),
          };
        },
        onMessagesReplaced: messages => {
          this.assertOpen();
          this.input.toolContext.input.messages = toToolContextMessages(messages) as ModelMessage[];
        },
        closeRun: reason => this.closeRun(reason),
      },
      logger: event => {
        if (event.level === 'error') Logger.error(event.code, undefined, 'AgentRuntimeCore');
        else if (event.level === 'warn') Logger.warn(event.code, 'AgentRuntimeCore');
        else if (event.level === 'debug') Logger.debug(event.code, 'AgentRuntimeCore');
        else Logger.log(event.code, 'AgentRuntimeCore');
      },
      clock: {
        nowMs: () => Date.now(),
        nowIso: () => new Date().toISOString(),
        nextId: prefix => `${prefix}_${Date.now()}`,
        schedule: (callback, delayMs) => setTimeout(callback, delayMs),
        cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
    };
  }

  private async *streamModel(request: {
    messages: AgentRuntimeModelMessage[];
    tools: any[];
    temperature?: number;
    maxTokens?: number;
    roundIndex: number;
    attemptIndex: number;
    signal?: AbortSignal;
  }): AsyncGenerator<any> {
    const providerMessages = stripAgentContextMetadata(request.messages) as ModelMessage[];
    const operationSession = this.input.operationSession;
    let effectKey: string | undefined;
    let effectSettlementAttempted = false;
    let providerEffectObserved = false;
    let textTail = '';
    let textChars = 0;
    let reasoningChars = 0;
    let usage: any;
    let uncheckpointedChars = 0;
    let checkpointedAt = Date.now();
    const checkpoint = () => ({
      ...(textTail ? { textTail: sanitizeOperationLedgerText(textTail, 8_192) } : {}),
      textChars,
      reasoningChars,
      ...(usage
        ? {
            usage: {
              inputTokens: Math.max(0, Number(usage.inputTokens) || 0),
              outputTokens: Math.max(0, Number(usage.outputTokens) || 0),
              totalTokens: Math.max(0, Number(usage.totalTokens) || 0),
              ...(usage.cacheHitTokens === undefined
                ? {}
                : { cacheHitTokens: Math.max(0, Number(usage.cacheHitTokens) || 0) }),
              ...(usage.cacheMissTokens === undefined
                ? {}
                : { cacheMissTokens: Math.max(0, Number(usage.cacheMissTokens) || 0) }),
            },
          }
        : {}),
    });
    const persistCheckpoint = async (force = false): Promise<void> => {
      if (!operationSession || !effectKey) return;
      const now = Date.now();
      if (!force && uncheckpointedChars < 2_048 && now - checkpointedAt < 2_000) return;
      try {
        await operationSession.checkpointModelEffect(effectKey, checkpoint());
      } catch {
        Logger.error('模型执行检查点持久化失败', undefined, 'AgentRuntimePlatformAdapter');
        throw new ModelEffectPersistenceError();
      }
      uncheckpointedChars = 0;
      checkpointedAt = now;
    };
    const finishEffect = async (state: 'committed' | 'rejected' | 'unknown'): Promise<boolean> => {
      if (!operationSession || !effectKey || effectSettlementAttempted) return true;
      // 一旦尝试终结就不再重试：落库结果本身未知时，重复 finish 可能覆盖
      // 原始故障或制造额外数据库副作用，只能向 runtime 返回固定 unknown。
      effectSettlementAttempted = true;
      try {
        await operationSession.finishModelEffect(effectKey, state, checkpoint());
        return true;
      } catch {
        Logger.error('模型执行终态持久化失败', undefined, 'AgentRuntimePlatformAdapter');
        return false;
      }
    };

    if (operationSession) {
      let intent: Awaited<ReturnType<AgentOperationSession['beginModelEffect']>>;
      try {
        intent = await operationSession.beginModelEffect({
          roundIndex: request.roundIndex,
          attemptIndex: request.attemptIndex,
          messageCount: providerMessages.length,
          toolNames: request.tools.map(tool => String(tool?.function?.name || '')).filter(Boolean),
          providerPayloadChars: this.serializedSize({
            messages: providerMessages,
            tools: request.tools,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
          }),
          requestShapeHash: this.modelRequestShapeHash(providerMessages, request.tools),
        });
      } catch {
        Logger.error('模型执行意图持久化失败', undefined, 'AgentRuntimePlatformAdapter');
        yield { type: 'error', error: modelPersistenceFailure() };
        return;
      }
      effectKey = intent.effectKey;
      if (intent.action !== 'execute') {
        throw new Error('模型请求状态不确定，已阻止重复调用');
      }
    }

    try {
      for await (const rawEvent of this.input.modelGateway.stream({
        config: this.input.modelConfig,
        messages: providerMessages,
        tools: request.tools.length ? request.tools : undefined,
        toolChoice: request.tools.length ? 'auto' : undefined,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        stream: true,
        signal: request.signal,
        purpose: 'agent_loop',
        sessionId: this.modelGatewaySessionId(),
        historyReasoningSanitized: true,
        fileContext:
          this.input.toolContext.fileRefMappingStore || this.input.options.fileRefMapping
            ? {
                actor: {
                  id: this.input.options.userId,
                  role: this.input.options.userRole,
                  visitorId: this.input.options.visitorId,
                },
                fileRefMapping:
                  this.input.toolContext.fileRefMappingStore?.snapshot() ||
                  this.input.options.fileRefMapping,
              }
            : undefined,
      }) as any) {
        let event = rawEvent as any;
        if (event.type === 'text_delta' && event.delta) {
          providerEffectObserved = true;
          const delta = String(event.delta);
          textChars += delta.length;
          uncheckpointedChars += delta.length;
          textTail = `${textTail}${delta}`.slice(-8_192);
          await persistCheckpoint();
        } else if (event.type === 'reasoning_delta' && event.delta) {
          providerEffectObserved = true;
          const delta = String(event.delta);
          reasoningChars += delta.length;
          uncheckpointedChars += delta.length;
          await persistCheckpoint();
        } else if (event.type === 'usage') {
          providerEffectObserved = true;
          usage = event.usage;
          await persistCheckpoint(true);
        } else if (event.type === 'tool_call_delta' || event.type === 'hosted_tool_call') {
          providerEffectObserved = true;
        } else if (event.type === 'error') {
          const classified = this.normalizeProviderEventError(event.error, request.signal);
          event = {
            type: 'error',
            error: providerEffectObserved
              ? { ...classified, retryable: false, requestOutcome: 'unknown' as const }
              : classified,
          };
          const persisted = await finishEffect(
            event.error.requestOutcome === 'rejected' && !providerEffectObserved
              ? 'rejected'
              : 'unknown',
          );
          if (!persisted) {
            yield { type: 'error', error: modelPersistenceFailure() };
            return;
          }
          yield event;
          return;
        } else if (event.type === 'abort') {
          if (!(await finishEffect('unknown'))) {
            yield { type: 'error', error: modelPersistenceFailure() };
            return;
          }
          yield event;
          return;
        } else if (event.type === 'done') {
          if (!(await finishEffect('committed'))) {
            yield { type: 'error', error: modelPersistenceFailure() };
            return;
          }
          yield event;
          return;
        }
        yield event;
      }
      if (operationSession) {
        if (!(await finishEffect('unknown'))) {
          yield { type: 'error', error: modelPersistenceFailure() };
          return;
        }
        throw new Error('模型响应在终态事件前中断');
      }
    } catch (error) {
      const classified =
        error instanceof ModelEffectPersistenceError
          ? modelPersistenceFailure()
          : classifyProviderError(error, { signal: request.signal });
      let effective = providerEffectObserved
        ? { ...classified, retryable: false, requestOutcome: 'unknown' as const }
        : classified;
      if (!effectSettlementAttempted) {
        const persisted = await finishEffect(
          effective.requestOutcome === 'rejected' && !providerEffectObserved
            ? 'rejected'
            : 'unknown',
        );
        if (!persisted) effective = modelPersistenceFailure();
      }
      yield effective.category === 'aborted'
        ? { type: 'abort', error: effective }
        : { type: 'error', error: effective };
      return;
    } finally {
      if (!effectSettlementAttempted) await finishEffect('unknown');
    }
  }

  private serializedSize(value: unknown): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  /** 给需要会话黏性的供应商使用；HMAC 后不泄露、也不可枚举会话或用户 ID。 */
  private modelGatewaySessionId(): string {
    const scope = this.input.options.contextBoundary?.groupId
      ? `group:${this.input.options.contextBoundary.groupId}`
      : `run:${this.input.options.chatId || this.input.options.turnId || this.input.options.messageId || 'anonymous'}`;
    return createOpaqueModelGatewaySessionId(scope);
  }

  private normalizeProviderEventError(error: unknown, signal?: AbortSignal): ModelStreamError {
    if (
      error &&
      typeof error === 'object' &&
      [
        'context_overflow',
        'rate_limit',
        'transient',
        'auth',
        'invalid_request',
        'aborted',
        'unknown',
      ].includes(String((error as any).category)) &&
      ['rejected', 'unknown'].includes(String((error as any).requestOutcome))
    ) {
      return toSafeModelStreamError(error as ModelStreamError);
    }
    return classifyProviderError(error, {
      signal,
      requestOutcome:
        (error as any)?.requestOutcome === 'rejected'
          ? 'rejected'
          : (error as any)?.requestOutcome === 'unknown'
            ? 'unknown'
            : undefined,
    });
  }

  private async waitBeforeModelRetry(input: {
    delayMs: number;
    notBeforeMs: number;
    roundIndex: number;
    attemptIndex: number;
    retryIndex: number;
    signal?: AbortSignal;
  }): Promise<void> {
    if (input.signal?.aborted) {
      await waitForProviderRetry({ delayMs: input.delayMs, signal: input.signal });
      return;
    }
    if (this.input.operationSession) {
      await this.input.operationSession.setRetryNotBefore(new Date(input.notBeforeMs));
    }
    await waitForProviderRetry({ delayMs: input.delayMs, signal: input.signal });
    if (this.input.operationSession) {
      await this.input.operationSession.clearRetryNotBefore();
    }
  }

  private modelRequestShapeHash(messages: ModelMessage[], tools: any[]): string {
    const contentShape = (content: unknown): unknown => {
      if (typeof content === 'string') return { type: 'text', chars: content.length };
      if (!Array.isArray(content)) return { type: content === null ? 'null' : typeof content };
      return content.map((part: any) => ({
        type: String(part?.type || 'unknown'),
        chars:
          typeof part?.text === 'string'
            ? part.text.length
            : typeof part?.input_audio?.data === 'string'
              ? part.input_audio.data.length
              : typeof part?.image_url?.url === 'string'
                ? part.image_url.url.length
                : typeof part?.video_url?.url === 'string'
                  ? part.video_url.url.length
                  : 0,
        fileRefChars: typeof part?.file?.fileRef === 'string' ? part.file.fileRef.length : 0,
      }));
    };
    const safeShape = {
      messages: messages.map((message: any) => ({
        role: message.role,
        nameChars: typeof message.name === 'string' ? message.name.length : 0,
        content: contentShape(message.content),
        reasoningChars:
          typeof message.reasoning_content === 'string' ? message.reasoning_content.length : 0,
        toolCallIdChars: typeof message.tool_call_id === 'string' ? message.tool_call_id.length : 0,
        toolCalls: Array.isArray(message.tool_calls)
          ? message.tool_calls.map((call: any) => ({
              idChars: typeof call?.id === 'string' ? call.id.length : 0,
              name: String(call?.function?.name || ''),
              argumentChars:
                typeof call?.function?.arguments === 'string' ? call.function.arguments.length : 0,
            }))
          : [],
      })),
      tools: tools.map(tool => ({
        name: String(tool?.function?.name || ''),
        descriptionChars:
          typeof tool?.function?.description === 'string' ? tool.function.description.length : 0,
        parameterChars: this.serializedSize(tool?.function?.parameters),
      })),
    };
    return createHash('sha256').update(JSON.stringify(safeShape)).digest('hex');
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Agent runtime adapter is closed');
  }

  private async prepareForModel(
    messages: AgentRuntimeModelMessage[],
    context: AgentRuntimePreparationContext,
  ): Promise<AgentRuntimeModelMessage[]> {
    this.assertOpen();
    const projected = this.input.contextProjection
      ? await this.input.contextProjection.prepareForModel(messages, context)
      : messages;
    const supportedMediaTypes = (this.input.modelGateway as any).describeProtocol?.(
      this.input.modelConfig.protocol,
    )?.multimodalTypes;
    const normalized = normalizeModelHistory(projected as any[], {
      config: this.input.modelConfig,
      supportedMediaTypes,
    });
    const prepared = await this.input.prepareMedia(normalized as ModelMessage[]);
    return normalizeModelHistory(prepared as any[], {
      config: this.input.modelConfig,
      supportedMediaTypes,
      reasoningAlreadySanitized: true,
    }) as AgentRuntimeModelMessage[];
  }

  private projectAssistantMessage(input: {
    content: string;
    reasoningContent: string;
    toolCalls: AgentRuntimeToolCall[];
    providerState?: unknown;
  }): AgentRuntimeModelMessage {
    this.assertOpen();
    const message: AgentRuntimeModelMessage = {
      role: 'assistant',
      content: input.content || null,
      tool_calls: input.toolCalls,
    };
    if (shouldKeepReasoningContentForModel(this.input.model, this.input.options.additionalParams)) {
      message.reasoning_content = input.reasoningContent || '';
    }
    // 厂商私有回放状态只挂在运行时历史里（不进 rounds、公开事件与持久化）
    if (input.providerState !== undefined) message.provider_state = input.providerState;
    (message as any).__agent_context = {
      sourceModelIdentity: `${String(this.input.modelConfig.protocol || '').trim()}:${String(
        this.input.modelConfig.model || '',
      ).trim()}`,
    };
    return message;
  }

  private async executeCapabilities(input: {
    toolCalls: AgentRuntimeToolCall[];
    roundIndex: number;
    signal?: AbortSignal;
  }): Promise<AgentRuntimeCapabilityResult[]> {
    try {
      this.assertOpen();
      if (input.signal?.aborted) throw input.signal.reason || new Error('Agent runtime aborted');
      const results = await this.input.toolExecutor.executeToolCalls({
        toolCalls: input.toolCalls,
        toolContext: this.input.toolContext,
        sanitizedNameMap: this.input.sanitizedNameMap,
        options: this.input.options,
        currentRoundIndex: input.roundIndex,
        signal: input.signal,
        operationSession: this.input.operationSession,
      });
      if (input.signal?.aborted) throw input.signal.reason || new Error('Agent runtime aborted');
      for (let ordinal = 0; ordinal < results.length; ordinal += 1) {
        if (input.signal?.aborted) throw input.signal.reason || new Error('Agent runtime aborted');
        const result = results[ordinal];
        const callId = input.toolCalls[ordinal]?.id;
        const entry = this.correlation.get(callId);
        if (
          !entry ||
          (entry.state !== 'started' && entry.state !== 'terminal') ||
          entry.ordinal !== ordinal
        ) {
          throw new Error(`Capability correlation resolve rejected: ${callId}`);
        }
        entry.platformResult = result;
        entry.state = 'resolved';
      }
      if (input.signal?.aborted) throw input.signal.reason || new Error('Agent runtime aborted');
      const note = roundBudgetNote(input.roundIndex, this.input.maxRounds);
      return results.map((result, ordinal) => ({
        callId: input.toolCalls[ordinal].id,
        status: result.status === 'error' ? 'error' : 'success',
        modelContent:
          ordinal === 0 && note
            ? withLeadingNote(getToolModelContent(result), note)
            : getToolModelContent(result),
        ...(result?.toolResult?.control || result?.control
          ? { control: result?.toolResult?.control || result?.control }
          : {}),
      }));
    } catch (error) {
      this.closeRun(input.signal?.aborted ? 'abort' : 'error');
      throw error;
    }
  }

  startExternal(input: {
    callId: string;
    ordinal: number;
    roundIndex: number;
    functionName: string;
    displayName: string;
    toolType: string;
    inputSummary?: string;
    outputHint?: any;
  }): void {
    this.assertOpen();
    if (!input.callId || this.correlation.has(input.callId)) {
      throw new Error(`Capability correlation start rejected: ${input.callId}`);
    }
    this.correlation.set(input.callId, {
      callId: input.callId,
      ordinal: input.ordinal,
      origin: 'external',
      state: 'started',
      roundIndex: input.roundIndex,
    });
    this.input.options.onProgress?.({
      type: 'tool_call',
      data: {
        roundIndex: input.roundIndex,
        toolCall: {
          id: input.callId,
          toolName: input.functionName,
          displayName: input.displayName,
          name: input.displayName,
          inputSummary: input.inputSummary,
          arguments: {},
          type: input.toolType,
          ...(input.outputHint ? { outputHint: input.outputHint } : {}),
        },
      },
    });
  }

  registerExternalTerminal(input: { callId: string; ordinal: number; roundIndex: number }): void {
    this.assertOpen();
    if (!input.callId || this.correlation.has(input.callId)) {
      throw new Error(`Capability terminal correlation rejected: ${input.callId}`);
    }
    this.correlation.set(input.callId, {
      callId: input.callId,
      ordinal: input.ordinal,
      origin: 'external',
      state: 'terminal',
      roundIndex: input.roundIndex,
    });
  }

  private prepareCapabilityCommit(callIds: string[]): void {
    this.assertOpen();
    if (
      this.preparedExternalCallIds ||
      new Set(callIds).size !== callIds.length ||
      callIds.some(callId => !callId)
    ) {
      throw new Error('Capability correlation prepare rejected');
    }
    const externalEntries = [...this.correlation.values()].filter(
      entry => entry.origin === 'external' && entry.state !== 'committed',
    );
    if (
      externalEntries.length !== callIds.length ||
      callIds.some((callId, ordinal) => {
        const entry = this.correlation.get(callId);
        return (
          !entry ||
          entry.origin !== 'external' ||
          entry.state !== 'resolved' ||
          entry.ordinal !== ordinal
        );
      })
    ) {
      throw new Error('Capability correlation prepare rejected');
    }
    for (const callId of callIds) this.correlation.get(callId)!.state = 'prepared';
    this.preparedExternalCallIds = [...callIds];
    this.nextExternalCommitOrdinal = 0;
  }

  private handleProgress(event: AgentRuntimeProgressEvent): void {
    this.assertOpen();
    const data = event.data as any;
    const roundIndex = Number(data.roundIndex ?? 0);
    if (event.type === 'round.started') {
      const round: any = {
        text: null,
        thinking: null,
        toolCalls: [],
        completed: false,
        trace: this.input.createRoundTrace(roundIndex, data.messages as ModelMessage[], data.tools),
      };
      this.input.currentMessage.rounds.push(round);
      this.input.currentMessage.trace?.rounds.push(round.trace);
      this.input.options.onProgress?.({ type: 'round_start', data: { roundIndex } });
      return;
    }
    const round: any = this.input.currentMessage.rounds[roundIndex];
    if (event.type === 'reasoning.delta') {
      if (round) {
        round.thinking = data.cumulative;
        round.thinkingDuration = data.thinkingDurationMs;
        if (round.trace) round.trace.thinkingMs = data.thinkingDurationMs;
      }
      this.input.options.onProgress?.({
        type: 'thinking',
        data: { content: data.delta, roundIndex },
      });
      return;
    }
    if (event.type === 'text.delta') {
      if (round) round.text = data.cumulative;
      this.refreshAnswer();
      this.input.options.onProgress?.({
        type: 'text',
        data: { content: data.delta, roundIndex },
      });
      return;
    }
    if (event.type === 'round.tool_call') {
      // 早期信号：调用普通工具的轮次立刻标为过程轮，文字不再算回答
      if (this.isProcessToolCall(data.name)) this.setRoundPhase(roundIndex, true);
      return;
    }
    if (event.type === 'round.completed') {
      if (round) {
        round.completed = true;
        if (round.trace) {
          round.trace.endedAt = new Date().toISOString();
          round.trace.status = 'success';
          const summary = this.input.summarizeModelOutput(data.fullContent);
          if (summary) round.trace.modelOutputSummary = summary;
        }
        // 按完整的工具调用校正早期判定；只调会话控制工具的轮次仍是回答，畸形调用按过程轮保守处理
        const names: unknown[] = Array.isArray(data.toolCallNames) ? data.toolCallNames : [];
        this.setRoundPhase(
          roundIndex,
          Boolean(data.malformedToolCalls) || names.some(name => this.isProcessToolCall(name)),
        );
      }
      this.input.options.onProgress?.({ type: 'round_complete', data: { roundIndex } });
      return;
    }
    if (event.type === 'run.progress') {
      this.input.options.onProgress?.({ type: 'progress', data });
      return;
    }
    if (event.type === 'capability.started' && data.origin === 'hosted') {
      this.startHosted(data);
      return;
    }
    if (event.type === 'capability.completed' && data.origin === 'hosted') {
      this.commitHosted(data);
      return;
    }
    if (event.type === 'capability.completed' && data.origin === 'external') {
      this.commitExternal(data.callId);
    }
  }

  /** 调用的不是会话控制工具（展示成果、提问）：这一轮的文字是过程话术 */
  private isProcessToolCall(name: unknown): boolean {
    const sanitizedName = String(name || '');
    return !isConversationToolName(this.input.sanitizedNameMap.get(sanitizedName) || sanitizedName);
  }

  /** 回答投影：最后一个过程轮之后的文字（见 contracts agent-reply） */
  private refreshAnswer(): void {
    this.input.currentMessage.content = projectAnswerText(this.input.currentMessage.rounds);
  }

  /** 设置一轮是否为过程轮；有变化时重算回答并通知公开投影 */
  private setRoundPhase(roundIndex: number, process: boolean): void {
    const round: any = this.input.currentMessage.rounds[roundIndex];
    if (!round || (round.phase === 'process') === process) return;
    if (process) round.phase = 'process';
    else delete round.phase;
    this.refreshAnswer();
    this.input.options.onProgress?.({
      type: 'round_phase',
      data: { roundIndex, phase: process ? 'process' : 'answer' },
    });
  }

  private startHosted(data: any): void {
    const callId = String(data.callId || '');
    const existing = this.correlation.get(callId);
    if (!callId || existing) {
      throw new Error(`Hosted correlation start rejected: ${callId}`);
    }
    this.correlation.set(callId, {
      callId,
      ordinal: this.correlation.size,
      origin: 'hosted',
      state: 'started',
      roundIndex: data.roundIndex,
    });
    this.input.options.onProgress?.({
      type: 'tool_call',
      data: { roundIndex: data.roundIndex, toolCall: { ...data.toolCall, status: 'loading' } },
    });
  }

  private commitHosted(data: any): void {
    const callId = String(data.callId || '');
    let entry = this.correlation.get(callId);
    if (!entry) {
      if (!callId) throw new Error(`Hosted correlation commit rejected: ${callId}`);
      entry = {
        callId,
        ordinal: this.correlation.size,
        origin: 'hosted',
        state: 'resolved',
        roundIndex: data.roundIndex,
      };
      this.correlation.set(callId, entry);
    } else {
      if (entry.origin !== 'hosted' || entry.state !== 'started') {
        throw new Error(`Hosted correlation commit rejected: ${callId}`);
      }
      entry.state = 'resolved';
    }
    entry.platformResult = { ...data.toolCall, status: data.status };
    entry.state = 'prepared';
    this.input.options.onProgress?.({
      type: 'tool_result',
      data: { roundIndex: data.roundIndex, toolCall: entry.platformResult },
    });
    this.writeCommittedToolCall(data.roundIndex, callId, entry.platformResult, undefined);
    entry.state = 'committed';
  }

  /**
   * rounds / trace 的唯一写入口：commit 时用后端投影替换同 callId 的旧条目并按 commit 顺序追加。
   */
  private writeCommittedToolCall(
    roundIndex: number,
    callId: string,
    platformResult: any,
    trace: any,
  ): void {
    const round = this.input.currentMessage.rounds[roundIndex];
    if (!round) return;
    const backendToolCall = toBackendToolCall(platformResult);
    round.toolCalls = (Array.isArray(round.toolCalls) ? round.toolCalls : []).filter(
      (toolCall: any) => toolCall?.id !== callId,
    );
    round.toolCalls.push(backendToolCall);
    if (trace && round.trace) {
      round.trace.toolCalls = (
        Array.isArray(round.trace.toolCalls) ? round.trace.toolCalls : []
      ).filter((toolTrace: any) => toolTrace?.callId !== callId);
      round.trace.toolCalls.push(trace);
    }
  }

  private commitExternal(callId: string): void {
    const entry = this.correlation.get(callId);
    const expectedCallId = this.preparedExternalCallIds?.[this.nextExternalCommitOrdinal];
    if (
      !entry ||
      entry.origin !== 'external' ||
      entry.state !== 'prepared' ||
      expectedCallId !== callId ||
      entry.ordinal !== this.nextExternalCommitOrdinal
    ) {
      throw new Error(`Capability correlation commit rejected: ${callId}`);
    }
    const trace = entry.platformResult?.internal?.trace;
    this.input.options.onProgress?.({
      type: 'tool_result',
      data: { roundIndex: entry.roundIndex, toolCall: entry.platformResult },
    });
    this.writeCommittedToolCall(entry.roundIndex, callId, entry.platformResult, trace);
    entry.state = 'committed';
    this.correlation.delete(callId);
    this.nextExternalCommitOrdinal += 1;
    if (this.nextExternalCommitOrdinal === this.preparedExternalCallIds!.length) {
      this.preparedExternalCallIds = undefined;
      this.nextExternalCommitOrdinal = 0;
    }
  }

  private handleTrace(event: any): void {
    this.assertOpen();
    if (event.type !== 'usage' || !this.input.options.tokenUsage) return;
    const usage = event.data.usage || {};
    this.input.options.tokenUsage.totalInputTokens += usage.inputTokens || 0;
    this.input.options.tokenUsage.totalOutputTokens += usage.outputTokens || 0;
    this.input.options.tokenUsage.totalTokens += usage.totalTokens || 0;
    this.input.options.tokenUsage.details.push({
      nodeId: 'agent-loop',
      nodeType: 'agent-loop',
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      totalTokens: usage.totalTokens || 0,
      cacheHitTokens: usage.cacheHitTokens || 0,
      cacheMissTokens: usage.cacheMissTokens || 0,
      description: `Agent Loop R${event.data.roundIndex + 1}`,
      timestamp: new Date().toISOString(),
    });
  }

  private closeRun(_reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.correlation.values()) {
      if (entry.state !== 'committed') entry.state = 'discarded';
    }
    this.correlation.clear();
    this.preparedExternalCallIds = undefined;
    this.nextExternalCommitOrdinal = 0;
  }
}
