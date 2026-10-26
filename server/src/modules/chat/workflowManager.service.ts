import { Injectable, Logger } from '@nestjs/common';
import {
  OWNER_FRONTEND_MESSAGE_OPTIONS,
  stringifyFrontendMessage,
} from '../chatLog/tool-result-payload';
import { getErrorStack } from '@/common/utils/error-stack.util';
import {
  createAgentEventReducerState,
  reduceAgentEvent,
  toSnapshotSyncEventData,
  type AgentEvent,
  type AgentEventReducerState,
} from '@99agent/contracts';
import { sanitizePublicEventData } from '../agent/events/agent-public-event-projector';
import { extractTurnFromMessage } from '../chatLog/unified-message.util';
import type { AgentTurnState } from '../chatLog/types/message.types';

/**
 * 工作流执行上下文
 */
export interface WorkflowContext {
  controller: AbortController;
  userId: number | string | null;
  /** 对外运行控制句柄，固定为助手消息 cid */
  publicCid: string;
  /** 当前 Agent 运行 ID */
  turnId: string;
  /** 当前会话 gid；运行控制内部使用，不由客户端提供。 */
  conversationGid: string;
  /** 当前 durable operation 绑定；只在服务端用于 queue/cancel fence。 */
  operation?: {
    operationId: string;
    generation: number;
    groupId: number;
    ownerType: 'user' | 'visitor';
    ownerKey: string;
  };
  startTime: number;
  /** 当前累积快照（content + message），用于断线重连 */
  snapshot: { content: string; message: string; turn?: AgentTurnState };
  /** 与公开 Event Wire 共用 reference reducer 的运行中投影。 */
  publicProjection: AgentEventReducerState;
  /** 每次 register 都不同；阻止旧异步 publisher 借用新 workflow 的 seq。 */
  publisherToken: symbol;
  /** 出站事件流水号，单调递增 */
  eventSeq: number;
  /** 最近出站事件环形缓冲，用于断线增量补发 */
  eventBuffer: AgentEvent[];
  /** 冲刷 SequencedEmitter 内待合并的 delta，确保 resync 快照和 seq 来自同一基线 */
  flushPendingOutbound?: () => void;
}

export interface WorkflowResyncSnapshot {
  content: string;
  thinking: string;
  message: string;
  turnId?: string;
  turn?: AgentTurnState;
  conversationGid?: string;
  eventSeq: number;
  status?: string | number | null;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  finishReason?: 'stop' | 'abort' | 'error' | 'length' | 'handoff';
}

export interface WorkflowPublisherFence {
  readonly token: symbol;
  readonly publicCid: string;
  readonly turnId: string;
  readonly operationId?: string;
  readonly generation?: number;
}

/**
 * 工作流进程管理器
 *
 * 内存 Map 只保存本实例的 AbortController 与流式快照；运行、取消和跨重启恢复
 * 以 durable operation/inbox 为准，旧 chatLog 才走兼容扫尾。
 */
@Injectable()
export class WorkflowProcessManager {
  // 存储正在运行的工作流: chatId -> WorkflowContext
  private readonly runningWorkflows = new Map<number, WorkflowContext>();

  /** 每个工作流保留的出站事件条数，超出后丢弃最旧事件（增量补发退化为全量快照） */
  private readonly EVENT_BUFFER_LIMIT = 800;

  /**
   * 注册工作流
   */
  register(
    chatId: number,
    controller: AbortController,
    userId: number | string | null,
    publicCid: string,
    turnId: string,
    turn?: AgentTurnState,
    conversationGid = '',
    operation?: WorkflowContext['operation'],
  ): WorkflowPublisherFence {
    this.runningWorkflows.set(chatId, {
      controller,
      userId,
      publicCid,
      turnId,
      conversationGid,
      ...(operation ? { operation: { ...operation } } : {}),
      startTime: Date.now(),
      snapshot: { content: '', message: '', ...(turn ? { turn } : {}) },
      publicProjection: createAgentEventReducerState({
        chatId: publicCid,
        messageId: publicCid,
        turnId,
        ...(turn ? { turn, status: turn.status } : {}),
      }),
      publisherToken: Symbol(`workflow:${chatId}`),
      eventSeq: 0,
      eventBuffer: [],
    });

    Logger.debug(`工作流注册成功: chatId=${chatId}, userId=${userId}`, 'WorkflowProcessManager');
    return this.capturePublisherFence(chatId)!;
  }

  /**
   * 停止工作流
   * @returns 是否成功停止
   */
  stop(chatId: number): boolean {
    const context = this.runningWorkflows.get(chatId);

    if (!context) {
      Logger.warn(`尝试停止不存在的工作流: chatId=${chatId}`, 'WorkflowProcessManager');
      return false;
    }

    try {
      context.controller.abort();
      this.runningWorkflows.delete(chatId);

      Logger.log(
        `工作流已停止: chatId=${chatId}, userId=${context.userId}`,
        'WorkflowProcessManager',
      );
      return true;
    } catch (error) {
      Logger.error(
        `停止工作流失败: chatId=${chatId}`,
        getErrorStack(error),
        'WorkflowProcessManager',
      );
      return false;
    }
  }

  /**
   * 标记工作流完成
   */
  complete(chatId: number, publisherFence: WorkflowPublisherFence): void {
    const context = this.runningWorkflows.get(chatId);
    if (!this.isCurrentPublisher(context, publisherFence)) return;

    if (context) {
      const duration = Date.now() - context.startTime;
      Logger.log(
        `工作流完成: chatId=${chatId}, userId=${context.userId}, 耗时=${duration}ms`,
        'WorkflowProcessManager',
      );
    }

    this.runningWorkflows.delete(chatId);
  }

  /**
   * 标记工作流失败
   */
  fail(chatId: number, publisherFence: WorkflowPublisherFence): void {
    const context = this.runningWorkflows.get(chatId);
    if (!this.isCurrentPublisher(context, publisherFence)) return;

    if (context) {
      const duration = Date.now() - context.startTime;
      Logger.log(
        `工作流异常: chatId=${chatId}, userId=${context.userId}, 耗时=${duration}ms`,
        'WorkflowProcessManager',
      );
    }

    this.runningWorkflows.delete(chatId);
  }

  /**
   * 获取运行中工作流上下文（含归属信息），校验用户权限
   * @returns 工作流上下文或 null
   */
  getWorkflowForUser(chatId: number, user: { id: number | string }): WorkflowContext | null {
    const context = this.runningWorkflows.get(chatId);
    if (!context) return null;
    if (!this.isOwner(context, user)) return null;
    return context;
  }

  /**
   * 获取运行中工作流的对外 cid
   */
  getPublicCid(chatId: number): string | null {
    return this.runningWorkflows.get(chatId)?.publicCid || null;
  }

  /**
   * 获取运行中工作流的当前 Turn ID
   */
  getTurnId(chatId: number): string | null {
    return this.runningWorkflows.get(chatId)?.turnId || null;
  }

  setPendingOutboundFlusher(
    chatId: number,
    flush: () => void,
    publisherFence: WorkflowPublisherFence,
  ): void {
    const context = this.runningWorkflows.get(chatId);
    if (this.isCurrentPublisher(context, publisherFence)) {
      context.flushPendingOutbound = flush;
    }
  }

  capturePublisherFence(chatId: number): WorkflowPublisherFence | null {
    const context = this.runningWorkflows.get(chatId);
    if (!context) return null;
    return {
      token: context.publisherToken,
      publicCid: context.publicCid,
      turnId: context.turnId,
      ...(context.operation
        ? {
            operationId: context.operation.operationId,
            generation: context.operation.generation,
          }
        : {}),
    };
  }

  private isCurrentPublisher(
    context: WorkflowContext | undefined,
    fence: WorkflowPublisherFence,
  ): context is WorkflowContext {
    if (!context || context.publisherToken !== fence.token) return false;
    if (context.publicCid !== fence.publicCid || context.turnId !== fence.turnId) return false;
    if (fence.operationId === undefined && fence.generation === undefined) {
      return context.operation === undefined;
    }
    return (
      context.operation?.operationId === fence.operationId &&
      context.operation?.generation === fence.generation
    );
  }

  private flushPendingOutboundEvents(chatId: number): void {
    const context = this.runningWorkflows.get(chatId);
    if (!context?.flushPendingOutbound) return;

    try {
      context.flushPendingOutbound();
    } catch (error) {
      Logger.warn(
        `冲刷待发送事件失败: chatId=${chatId}, error=${(error as any)?.message || error}`,
        'WorkflowProcessManager',
      );
    }
  }

  private isOwner(context: WorkflowContext, user: { id: number | string }): boolean {
    return context.userId === user.id;
  }

  /**
   * 给出站事件赋单调 seq 并写入环形缓冲。
   * 工作流不在内存时（注册前的早期事件等）原样返回，不带 seq。
   */
  stampOutboundEvent(
    chatId: number,
    event: AgentEvent,
    publisherFence: WorkflowPublisherFence | null,
  ): AgentEvent | null {
    const context = this.runningWorkflows.get(chatId);
    if (!context) return publisherFence ? null : event;
    if (!publisherFence || !this.isCurrentPublisher(context, publisherFence)) return null;

    context.eventSeq += 1;
    const stamped: AgentEvent = { ...event, seq: context.eventSeq, workflowSeq: context.eventSeq };
    context.publicProjection = reduceAgentEvent(context.publicProjection, stamped).state;
    context.eventBuffer.push(stamped);
    if (context.eventBuffer.length > this.EVENT_BUFFER_LIMIT) {
      context.eventBuffer.shift();
    }
    return stamped;
  }

  /**
   * 获取运行中工作流当前的事件流水号（快照同步时回传给客户端）
   */
  getEventSeq(chatId: number): number {
    return this.runningWorkflows.get(chatId)?.eventSeq || 0;
  }

  /**
   * 取出 afterSeq 之后的缓冲事件用于增量补发。
   * @returns 事件数组；缓冲已无法覆盖（最旧事件比 afterSeq+1 还新）时返回 null，调用方应回退全量快照
   */
  getBufferedEventsAfter(chatId: number, afterSeq: number): AgentEvent[] | null {
    this.flushPendingOutboundEvents(chatId);
    const context = this.runningWorkflows.get(chatId);
    if (!context) return null;
    if (afterSeq >= context.eventSeq) return [];

    const buffer = context.eventBuffer;
    const oldestSeq = buffer.length > 0 ? Number(buffer[0].seq) : context.eventSeq + 1;
    if (afterSeq < oldestSeq - 1) return null;

    return buffer.filter(event => Number(event.seq) > afterSeq);
  }

  /**
   * 更新运行中工作流的快照（内存）
   */
  updateSnapshot(
    chatId: number,
    data: { content?: string; message?: string; turn?: AgentTurnState },
    publisherFence: WorkflowPublisherFence,
  ): void {
    const context = this.runningWorkflows.get(chatId);
    if (!this.isCurrentPublisher(context, publisherFence)) return;
    if (context) {
      if (data.content !== undefined) context.snapshot.content = data.content;
      if (data.message !== undefined) {
        context.snapshot.message = stringifyFrontendMessage(
          data.message,
          OWNER_FRONTEND_MESSAGE_OPTIONS,
        );
        const messageTurn = extractTurnFromMessage(data.message);
        if (messageTurn) context.snapshot.turn = messageTurn;
        context.publicProjection = reduceAgentEvent(context.publicProjection, {
          type: 'snapshot.sync',
          chatId: context.publicCid,
          messageId: context.publicCid,
          turnId: context.turnId,
          timestamp: Date.now(),
          data: {
            reason: 'resync',
            content: data.content ?? context.snapshot.content,
            message: context.snapshot.message,
            ...(messageTurn || data.turn
              ? {
                  turn: (data.turn || messageTurn) as AgentTurnState,
                  turnStatus: (data.turn || messageTurn)!.status,
                }
              : {}),
            ...(context.publicProjection.usage
              ? { usage: { ...context.publicProjection.usage } }
              : {}),
            ...(context.publicProjection.finishReason
              ? { finishReason: context.publicProjection.finishReason }
              : {}),
          },
        }).state;
      }
      if (data.turn) {
        context.snapshot.turn = data.turn;
        if (data.message === undefined) {
          context.publicProjection = reduceAgentEvent(context.publicProjection, {
            type: 'turn.start',
            chatId: context.publicCid,
            messageId: context.publicCid,
            turnId: context.turnId,
            timestamp: Date.now(),
            data: { turn: data.turn },
          }).state;
        }
      }
    }
  }

  private projectRunningSnapshot(context: WorkflowContext): {
    content: string;
    thinking: string;
    message: string;
    turn?: AgentTurnState;
    status?: string | number | null;
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    finishReason?: 'stop' | 'abort' | 'error' | 'length' | 'handoff';
  } {
    const projected = toSnapshotSyncEventData(context.publicProjection, 'resync');
    const message = JSON.stringify(
      sanitizePublicEventData(
        projected.message || {
          role: 'assistant',
          content: projected.content || '',
          rounds: [],
        },
      ),
    );
    return {
      content: projected.content || context.snapshot.content,
      thinking: projected.thinking || '',
      message,
      ...(((projected.turn || context.snapshot.turn) as AgentTurnState | undefined)
        ? { turn: (projected.turn || context.snapshot.turn) as AgentTurnState }
        : {}),
      ...(projected.status === undefined
        ? {}
        : { status: projected.status === 'running' ? 'streaming' : projected.status }),
      ...(projected.usage ? { usage: { ...projected.usage } } : {}),
      ...(projected.finishReason ? { finishReason: projected.finishReason } : {}),
    };
  }

  /**
   * 获取运行中工作流的当前快照
   */
  getRunningSnapshot(chatId: number): Omit<WorkflowResyncSnapshot, 'eventSeq'> | null {
    const context = this.runningWorkflows.get(chatId);
    const projected = context ? this.projectRunningSnapshot(context) : null;
    return context
      ? {
          ...projected!,
          turnId: context.turnId,
          ...(context.conversationGid ? { conversationGid: context.conversationGid } : {}),
        }
      : null;
  }

  /**
   * resync 专用快照读取：先冲刷合并中的 delta，再一次性读取 snapshot 与 seq。
   * 这样前端收到的 snapshot.sync(seq=N) 能保证内容至少覆盖到 N。
   */
  getResyncSnapshot(chatId: number): WorkflowResyncSnapshot | null {
    this.flushPendingOutboundEvents(chatId);
    const context = this.runningWorkflows.get(chatId);
    if (!context) return null;
    const projected = this.projectRunningSnapshot(context);

    return {
      ...projected,
      turnId: context.turnId,
      eventSeq: context.eventSeq,
      ...(context.conversationGid ? { conversationGid: context.conversationGid } : {}),
    };
  }
}
