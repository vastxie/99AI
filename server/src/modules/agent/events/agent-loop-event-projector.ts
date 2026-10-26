import type { AgentEvent } from '@99agent/contracts';
import type { UnifiedMessage } from '../../chatLog/types/message.types';
import type { AgentLoopOptions } from '../core/agent-loop.service';
import { finalizeAssistantTurnState } from '../core/agent-turn-outcome';
import { stringifyFrontendMessage, toFrontendToolCall } from '../../chatLog/tool-result-payload';
import { projectInternalAgentEventToPublic } from './agent-public-event-projector';
import type { InternalAgentEvent } from './internal-agent-event.types';

/** AgentLoop 的内部进度事件（start / thinking / text / tool_call / tool_result / progress / round_phase / round_complete / done） */
export type AgentLoopProgressEvent = Parameters<NonNullable<AgentLoopOptions['onProgress']>>[0];

export interface AgentLoopEventProjectorOptions {
  /** 循环正在写入的助手消息；投影只读它，rounds 的唯一写者是 Platform Adapter */
  currentMessage: UnifiedMessage;
  /** 公开运行标识，固定为助手消息 cid */
  chatId: string;
  /** 事件 messageId；缺省与 chatId 相同 */
  messageId?: string;
  /** 前端投影选项：是否暴露属主可见的私有文件入口 */
  frontendMessageOptions?: { exposePrivateFileDownloads?: boolean };
  onEvent: (event: AgentEvent) => void;
}

/**
 * 把 AgentLoop 的内部进度事件投影成公开 Agent Event（增量 delta 与精简的工具信息），
 * 不再推送 JSON.stringify(currentMessage) 全量数据。
 */
export function createAgentLoopEventProjector(
  options: AgentLoopEventProjectorOptions,
): NonNullable<AgentLoopOptions['onProgress']> {
  return event => projectAgentLoopEvent(event, options);
}

export function projectAgentLoopEvent(
  event: AgentLoopProgressEvent,
  options: AgentLoopEventProjectorOptions,
): void {
  const { currentMessage, onEvent } = options;
  const frontendMessageOptions = options.frontendMessageOptions || {};
  const { type, data } = event;
  const ts = Date.now();
  const turnId = currentMessage.turn?.id;
  const publicChatId = options.chatId;
  const emitInternal = (internalEvent: Omit<InternalAgentEvent, 'timestamp'>) => {
    onEvent(
      projectInternalAgentEventToPublic({
        timestamp: ts,
        ...internalEvent,
        chatId: internalEvent.chatId ?? publicChatId,
        messageId: internalEvent.messageId ?? options.messageId,
      }),
    );
  };

  switch (type) {
    case 'start':
      emitInternal({
        type: 'agent.start',
        chatId: publicChatId,
        ...(turnId ? { turnId } : {}),
        data: {
          ...(currentMessage.turn ? { turn: currentMessage.turn } : {}),
        },
      });
      break;

    case 'thinking':
      emitInternal({
        type: 'reasoning.delta',
        chatId: publicChatId,
        ...(turnId ? { turnId } : {}),
        ...(data?.roundIndex === undefined ? {} : { roundId: String(data.roundIndex) }),
        data: { delta: data?.content || '' },
      });
      break;

    case 'text': {
      emitInternal({
        type: 'message.delta',
        chatId: publicChatId,
        ...(turnId ? { turnId } : {}),
        ...(data?.roundIndex === undefined ? {} : { roundId: String(data.roundIndex) }),
        data: { delta: data?.content || '' },
      });
      break;
    }

    case 'tool_call': {
      const frontendToolCall = toFrontendToolCall(
        {
          ...data?.toolCall,
          status: data?.toolCall?.status || 'loading',
        },
        frontendMessageOptions,
      );
      emitInternal({
        type: 'tool.start',
        chatId: publicChatId,
        ...(turnId ? { turnId } : {}),
        ...(data?.roundIndex === undefined ? {} : { roundId: String(data.roundIndex) }),
        ...(frontendToolCall.id ? { toolCallId: frontendToolCall.id } : {}),
        data: {
          name: frontendToolCall.name,
          displayName: frontendToolCall.displayName || frontendToolCall.name,
          type: frontendToolCall.type,
          status: 'running',
          inputSummary: frontendToolCall.inputSummary,
          outputHint: frontendToolCall.outputHint,
          display: frontendToolCall.display,
        },
      });
      break;
    }

    case 'tool_result': {
      // rounds 的唯一写者是 AgentRuntimePlatformAdapter（capability commit）；这里只做公开投影
      const frontendToolCall = toFrontendToolCall(data?.toolCall || {}, frontendMessageOptions);
      const toolTrace =
        frontendToolCall.trace && typeof frontendToolCall.trace === 'object'
          ? frontendToolCall.trace
          : undefined;
      const traceMessage =
        typeof toolTrace?.message === 'string' && toolTrace.message.trim()
          ? toolTrace.message
          : undefined;
      const outputPublicError = frontendToolCall.output?.publicError;
      const outputError = frontendToolCall.output?.error;
      const fallbackErrorMessage =
        typeof outputPublicError === 'string' && outputPublicError.trim()
          ? outputPublicError
          : typeof outputError === 'string' && outputError.trim()
            ? outputError
            : '工具处理失败';
      const toolEndError =
        frontendToolCall.status === 'error'
          ? {
              ...(typeof toolTrace?.code === 'string' && toolTrace.code.trim()
                ? { code: toolTrace.code }
                : {}),
              message: traceMessage || fallbackErrorMessage,
              ...(typeof toolTrace?.retryable === 'boolean'
                ? { retryable: toolTrace.retryable }
                : {}),
            }
          : undefined;
      emitInternal({
        type: 'tool.end',
        chatId: publicChatId,
        ...(turnId ? { turnId } : {}),
        ...(data?.roundIndex === undefined ? {} : { roundId: String(data.roundIndex) }),
        ...(frontendToolCall.id ? { toolCallId: frontendToolCall.id } : {}),
        data: {
          name: frontendToolCall.name,
          displayName: frontendToolCall.displayName || frontendToolCall.name,
          type: frontendToolCall.type,
          status: frontendToolCall.status,
          durationMs: frontendToolCall.duration,
          outputHint: frontendToolCall.outputHint,
          display: frontendToolCall.display,
          output: frontendToolCall.output,
          ...(Array.isArray(frontendToolCall.assets) && frontendToolCall.assets.length
            ? { assets: frontendToolCall.assets }
            : {}),
          ...(toolEndError ? { error: toolEndError } : {}),
        },
      });
      break;
    }

    case 'progress':
      emitInternal({
        type: 'tool.update',
        chatId: publicChatId,
        ...(turnId ? { turnId } : {}),
        data: {
          status: 'running',
          progress: {
            label: String(data?.description || '正在处理...'),
            ...(data?.current !== undefined ? { current: data.current } : {}),
            ...(data?.total !== undefined ? { total: data.total } : {}),
            ...(data?.percent !== undefined ? { percent: data.percent } : {}),
          },
        },
      });
      break;

    case 'round_phase':
      emitInternal({
        type: 'message.phase',
        chatId: publicChatId,
        ...(turnId ? { turnId } : {}),
        roundId: String(data?.roundIndex ?? 0),
        data: { phase: data?.phase === 'process' ? 'process' : 'answer' },
      });
      break;

    case 'round_complete':
      emitInternal({
        type: 'message.end',
        chatId: publicChatId,
        ...(turnId ? { turnId } : {}),
        ...(data?.roundIndex === undefined ? {} : { roundId: String(data.roundIndex) }),
        data: {},
      });
      break;

    case 'done': {
      const finishReason =
        typeof data?.finishReason === 'string' &&
        ['stop', 'abort', 'error', 'length', 'handoff'].includes(data.finishReason)
          ? data.finishReason
          : 'stop';
      finalizeAssistantTurnState(currentMessage, finishReason);
      emitInternal({
        type: 'agent.end',
        chatId: publicChatId,
        ...(turnId ? { turnId } : {}),
        data: {
          finishReason,
          message: stringifyFrontendMessage(currentMessage, frontendMessageOptions),
          ...(currentMessage.turn
            ? { turn: currentMessage.turn, turnStatus: currentMessage.turn.status }
            : {}),
        },
      });
      break;
    }
  }
}
