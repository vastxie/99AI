import { getTokenCount, handleError } from '@/common/utils';
import { ChatLogStatus } from '@/common/constants/status.constant';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AgentEvent, type AgentInitialMessagesWire } from '@99agent/contracts';
import { AgentLoopService } from '../agent/core/agent-loop.service';
import {
  AgentTurnOutcome,
  createAssistantTurnMessage,
  summarizeAgentLoopResult,
  toPersistedAssistantMessage,
} from '../agent/core/agent-turn-outcome';
import { createAgentLoopEventProjector } from '../agent/events/agent-loop-event-projector';
import { sanitizeAgentEventForFrontend } from '../agent/events/agent-public-event-projector';
import type {
  AgentContinuationClaim,
  AgentContinuationParentBinding,
} from '../agent/runtime-state/continuation-inbox.types';
import {
  AgentOperationCancelledError,
  AgentOperationSession,
  AgentOperationStore,
} from '../agent/runtime-state/operation-ledger.store';
import {
  OWNER_FRONTEND_MESSAGE_OPTIONS,
  stringifyFrontendMessage,
} from '../chatLog/tool-result-payload';
import { ChatLogService } from '../chatLog/chatLog.service';
import type { AgentTurnStopReason } from '@99agent/contracts';
import { AgentTurnState, UnifiedMessage } from '../chatLog/types/message.types';
import { parseUnifiedMessage } from '../chatLog/unified-message.util';
import { ModelsService } from '../models/models.service';
import { parseModelGatewayAdditionalParams } from '../modelGateway/model-gateway.types';
import { ChatBillingService } from './chat-billing.service';
import {
  ChatContextBuilderService,
  DEFAULT_HISTORY_CANDIDATE_ROUNDS,
  DEFAULT_TOOL_HISTORY_CANDIDATE_ROUNDS,
} from './chat-context-builder.service';
import { ChatLiveSyncService } from '../chatRealtime/chat-live-sync.service';
import type { ChatAdmissionResult, ChatPreflightResult } from './chat-preflight.service';
import { ChatTitleService } from './chat-title.service';
import type { ChatTurnRecords } from './chat-turn-persistence.service';
import { ConversationTurnQueue, QueuedConversationTurn } from './conversation-turn-queue.service';
import { SequencedEmitter } from './emitters/sequenced-emitter';
import { StreamEmitter } from './emitters/stream-emitter.interface';
import { TASK_RESULT_SUMMARY_LIMIT, sanitizeTaskControlText } from './task-safe-text.util';
import { WorkflowProcessManager, type WorkflowPublisherFence } from './workflowManager.service';

/** 提交完成后交给网关的附加上下文；当前没有额外字段，保留类型便于扩展 */
export type ChatCommitContext = Record<string, never>;

/** 助手轮次已落库并注册工作流后回调网关：此时才向客户端确认 accepted */
export type ChatTurnCreatedCallback = (
  chatId: number,
  initialMessages?: AgentInitialMessagesWire,
  context?: ChatCommitContext,
) => void;

/** 一次轮次运行依赖的协作者；由 ChatService 注入，便于在测试里逐个替换 */
export interface ChatTurnRunServices {
  chatLogService: ChatLogService;
  modelsService: ModelsService;
  agentLoopService: AgentLoopService;
  workflowManager: WorkflowProcessManager;
  conversationTurnQueue: ConversationTurnQueue;
  chatLiveSyncService: ChatLiveSyncService;
  chatTitleService: ChatTitleService;
  contextBuilder: ChatContextBuilderService;
  billing: ChatBillingService;
  operations: AgentOperationStore;
  /** 父轮终态后启动已认领的接续轮 */
  launchQueuedTurn: (
    turn: QueuedConversationTurn,
    emitter: StreamEmitter,
    onChatIdCreated?: ChatTurnCreatedCallback,
  ) => void;
}

/** 已通过预检并成对落库的轮次：运行阶段只读这些事实 */
export interface ChatTurnRunInput {
  user: any;
  admission: ChatAdmissionResult;
  preflight: ChatPreflightResult;
  records: ChatTurnRecords;
  userMessage: UnifiedMessage;
  emitter: StreamEmitter;
  onChatIdCreated?: ChatTurnCreatedCallback;
  continuationClaim?: AgentContinuationClaim;
}

interface SandboxAttachment {
  fileId?: string;
  name?: string;
  mime?: string;
  size?: number;
}

interface TurnContext {
  messagesHistory: any[];
  contextBoundary: any;
  contextBackfill: any;
  fileRefMapping: any;
  queuedTurnInput:
    { parentTurnId: string; prompt: string; channel: string; createdAt: any } | undefined;
}

function getFinalTurnStatus(finishReason?: string): AgentTurnState['status'] {
  if (finishReason === 'abort') return 'interrupted';
  if (finishReason === 'error') return 'failed';
  return 'completed';
}

function finalizeAgentTurn(
  turn: AgentTurnState,
  finishReason?: string,
  status: AgentTurnState['status'] = getFinalTurnStatus(finishReason),
  stopReason?: AgentTurnStopReason,
): AgentTurnState {
  const completedAt = new Date().toISOString();
  const startedAtMs = Date.parse(turn.startedAt || completedAt);
  const completedAtMs = Date.parse(completedAt);
  return {
    ...turn,
    status,
    completedAt,
    durationMs:
      Number.isFinite(startedAtMs) && Number.isFinite(completedAtMs)
        ? Math.max(0, completedAtMs - startedAtMs)
        : undefined,
    ...(stopReason ? { stopReason } : {}),
  };
}

function buildSafeFailureSummary(
  error: { code?: unknown; message?: unknown; retryable?: unknown } | unknown,
  fallback = '执行失败，可稍后重试',
): string {
  if (error && typeof error === 'object') {
    const message = sanitizeTaskControlText(
      (error as Record<string, unknown>).message,
      TASK_RESULT_SUMMARY_LIMIT,
    );
    if (message) return message;
  }
  return sanitizeTaskControlText(error, TASK_RESULT_SUMMARY_LIMIT) || fallback;
}

/** 缺少 usage 时按文本估算 token：输入按历史文本，输出按推理 + 正文 */
async function estimateTokens(messages: any[], outcome: AgentTurnOutcome): Promise<number> {
  let totalText = '';
  for (const message of messages || []) {
    if (typeof message.content === 'string') {
      totalText += message.content + ' ';
    } else if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (item.type === 'text' && item.text) {
          totalText += item.text + ' ';
        }
      }
    }
  }
  const inputTokens = totalText ? await getTokenCount(totalText) : 0;
  const completionText = (outcome.reasoning_content || '') + (outcome.generatedText || '');
  const outputTokens = completionText ? await getTokenCount(completionText) : 0;
  return inputTokens + outputTokens;
}

/** 用户消息里 user_upload 虚拟工具调用携带的附件，交给沙箱原语放进 in/<回合>/ */
function extractSandboxAttachments(userMessage: UnifiedMessage): SandboxAttachment[] {
  const attachments: SandboxAttachment[] = [];
  for (const round of userMessage?.rounds || []) {
    for (const toolCall of (round as any)?.toolCalls || []) {
      if (toolCall?.name !== 'user_upload') continue;
      const files = Array.isArray(toolCall?.output?.files) ? toolCall.output.files : [];
      for (const file of files) {
        if (!file || typeof file !== 'object') continue;
        attachments.push({
          fileId: typeof file.fileId === 'string' ? file.fileId : undefined,
          name: typeof file.name === 'string' ? file.name : undefined,
          mime: file.mime || file.mimeType || undefined,
          size: Number.isFinite(Number(file.size)) ? Number(file.size) : undefined,
        });
      }
    }
  }
  return attachments;
}

function attachTurnToSnapshotMessage(message: unknown, turn: AgentTurnState): string {
  if (!message) return '';
  try {
    const parsed = typeof message === 'string' ? JSON.parse(message) : message;
    if (parsed && typeof parsed === 'object' && !(parsed as UnifiedMessage).turn) {
      (parsed as UnifiedMessage).turn = turn;
    }
    return stringifyFrontendMessage(parsed, OWNER_FRONTEND_MESSAGE_OPTIONS);
  } catch {
    return typeof message === 'string'
      ? message
      : stringifyFrontendMessage(message, OWNER_FRONTEND_MESSAGE_OPTIONS);
  }
}

function attachTurnToBackendMessage(
  message: unknown,
  turn: AgentTurnState,
  replaceTurn = false,
): string {
  if (!message) return '';
  try {
    const parsed = parseUnifiedMessage(message);
    if (parsed) {
      if (replaceTurn || !parsed.turn) parsed.turn = turn;
      return JSON.stringify(parsed);
    }
    return typeof message === 'string' ? message : JSON.stringify(message);
  } catch {
    return typeof message === 'string' ? message : '';
  }
}

/**
 * 一次助手轮次的运行：启动边界 → 上下文 → Agent 循环 → 结算与终态收口。
 *
 * 轮次在 commit 后创建本对象，`execute()` 只跑一次；所有运行中可变状态
 * （操作会话、发布围栏、已生成内容、计费意图、接续认领）都收在实例字段里，
 * 终态收口的几条路径（完成 / 模型失败 / 取消 / 启动失败 / 未知错误）共用同一组方法。
 */
export class ChatTurnRun {
  /**
   * 传输 emitter（接续轮是补父回合的那一层，接续下一轮时由调用方解开再包）；接续下一轮时传递它，
   * 不传 SequencedEmitter，避免包装层随队列累积
   */
  private readonly transportEmitter: StreamEmitter;
  /** 注册工作流后被包装为 SequencedEmitter（赋 seq + 合并增量） */
  private emitter: StreamEmitter;
  private readonly abortController = new AbortController();
  private readonly records: ChatTurnRecords;
  private readonly admission: ChatAdmissionResult;
  private readonly preflight: ChatPreflightResult;

  /** 工具调用费用累加（积分） */
  private toolCost = 0;
  private operationSession?: AgentOperationSession;
  private workflowPublisherFence?: WorkflowPublisherFence;
  private operationTerminalized = false;
  private billingSettlementOutcomePending = false;
  private readonly currentGeneratedData: {
    content: string;
    message: string | null;
    backendMessage: string | null;
    totalTokens: number;
  } = { content: '', message: null, backendMessage: null, totalTokens: 0 };
  /** 循环正在写入的助手消息：适配器发进度事件前已按轮次与阶段重算好它的 content（回答投影） */
  private liveMessage?: UnifiedMessage;
  private workflowFailed = false;
  private queuedTurnAfterComplete: QueuedConversationTurn | undefined;
  private executionStartError: HttpException | null = null;

  constructor(
    private readonly services: ChatTurnRunServices,
    private readonly input: ChatTurnRunInput,
  ) {
    this.transportEmitter = input.emitter;
    this.emitter = input.emitter;
    this.records = input.records;
    this.admission = input.admission;
    this.preflight = input.preflight;
  }

  async execute(): Promise<void> {
    const { user, onChatIdCreated } = this.input;
    const { assistantLogId } = this.records;
    this.services.chatTitleService?.scheduleAutoTitleForFirstUserMessage({
      groupId: this.records.chatGroupId,
      userLogId: this.records.userLogId,
      user,
      prompt: this.admission.prompt,
      model: this.preflight.currentRequestModelKey,
    });

    try {
      if (!(await this.start())) return;

      const context = await this.buildContext();

      try {
        const response = await this.runAgent(context);
        await this.complete(response, context.messagesHistory);
        return;
      } catch (error) {
        if (await this.isCancelled(error)) {
          await this.finishCancelledAssistantTurn();
          return;
        }
        await this.failCreatedAssistantTurn(error, 'PROCESS_ERROR', '处理请求时发生错误');
        return;
      }
    } catch (error) {
      if (this.executionStartError && error === this.executionStartError) {
        throw error;
      }
      if (await this.isCancelled(error)) {
        await this.finishCancelledAssistantTurn();
        return;
      }
      await this.failCreatedAssistantTurn(error, 'UNKNOWN_ERROR', '发生未知错误，请稍后再试');
    } finally {
      this.operationSession?.close();
      if (assistantLogId && !this.workflowFailed && this.workflowPublisherFence) {
        this.services.workflowManager.complete(assistantLogId, this.workflowPublisherFence);
      }
      if (assistantLogId && this.workflowFailed) {
        await this.discardQueuedTurn('parent_failed');
      }
      if (this.queuedTurnAfterComplete) {
        this.services.launchQueuedTurn(
          this.queuedTurnAfterComplete,
          this.transportEmitter,
          onChatIdCreated,
        );
      }
    }
  }

  /* ==================== 阶段 ==================== */

  /**
   * 启动边界：认领操作会话，注册工作流后才向网关确认 accepted=true 并广播 turn_created。
   * 返回 false 表示接续轮启动失败且已收口，调用方直接结束。
   */
  private async start(): Promise<boolean> {
    const { onChatIdCreated } = this.input;
    const { assistantLogId, assistantCid, turnId, initialTurn, initialAssistantMessage } =
      this.records;
    if (!this.services.operations) throw new Error('Agent operation store is unavailable');
    this.operationSession = await this.services.operations.claim(this.records.operation, {
      abortController: this.abortController,
    });
    try {
      this.workflowPublisherFence = this.services.workflowManager.register(
        assistantLogId,
        this.abortController,
        this.admission.workflowOwnerId,
        assistantCid,
        turnId,
        initialTurn,
        this.records.conversationGid,
        {
          operationId: this.operationSession.identity.operationId,
          generation: this.operationSession.fence.generation,
          groupId: this.operationSession.identity.groupId,
          ownerType: this.operationSession.identity.ownerType,
          ownerKey: this.operationSession.identity.ownerKey,
        },
      );
      const sequencedEmitter = new SequencedEmitter(
        this.transportEmitter,
        assistantLogId,
        this.services.workflowManager,
      );
      this.services.workflowManager.setPendingOutboundFlusher(
        assistantLogId,
        () => sequencedEmitter.flushPendingDelta(),
        this.workflowPublisherFence,
      );
      this.emitter = sequencedEmitter;
      onChatIdCreated?.(assistantLogId, this.records.initialMessages, {});
      this.emitLiveSync({
        type: 'turn_created',
        initialMessages: this.records.initialMessages,
      });
      return true;
    } catch (error) {
      this.workflowFailed = true;
      this.abortController.abort();
      this.failCurrentWorkflow();
      const interruptedTurn = finalizeAgentTurn(initialTurn, 'abort', 'interrupted');
      const interruptedMessage = stringifyFrontendMessage(
        {
          ...initialAssistantMessage,
          content: '执行未能启动，请重试',
          turn: interruptedTurn,
        },
        OWNER_FRONTEND_MESSAGE_OPTIONS,
      );
      await this.refundRegisteredTurn();
      await this.terminalizeAssistant({
        phase: 'interrupted',
        terminalReason: 'execution_start_failed',
        content: '执行未能启动，请重试',
        message: interruptedMessage,
        status: ChatLogStatus.STOPPED,
      });
      this.executionStartError = new HttpException(
        {
          code: 'EXECUTION_START_FAILED',
          message: '执行未能启动，请重试',
          data: { cid: assistantCid, turnId },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      // continuation claim 已随 child admission 在同一事务消费；启动边界失败时
      // child operation 自身已经收口，不能把父 inbox 留成“待重试”再造第二个 child。
      if (this.input.continuationClaim) {
        // 接续轮没有网关回执：在等它 agent.start 的页签（上一轮的房间）收到一条错误，知道这一轮没能启动
        // （接续轮的发送器会带上父回合）；其它页签按同步事件刷新，看到已收口的这一轮
        this.transportEmitter.emit({
          type: 'agent.error',
          chatId: 'pending',
          timestamp: Date.now(),
          data: { code: 'EXECUTION_START_FAILED', message: '执行未能启动，请重试' },
        });
        this.emitLiveSync({
          type: 'turn_error',
          errorCode: 'EXECUTION_START_FAILED',
          finishReason: 'error',
        });
        return false;
      }
      throw this.executionStartError;
    }
  }

  /** 历史消息、接续提示与 turn.start */
  private async buildContext(): Promise<TurnContext> {
    const { user } = this.input;
    const { assistantLogId, assistantCid, turnId, initialTurn } = this.records;
    const messageContext = await this.services.contextBuilder.buildMessageFromParentMessageId(
      {
        user,
        systemMessage: this.preflight.setSystemMessage,
        maxModelTokens: this.preflight.maxModelTokens || 64000,
        pureRounds: DEFAULT_HISTORY_CANDIDATE_ROUNDS,
        toolRounds: DEFAULT_TOOL_HISTORY_CANDIDATE_ROUNDS,
        multimodalTypes: this.preflight.runtimeMultimodalTypes,
        groupId: this.records.chatGroupId,
        currentUserLogId: this.records.userLogId,
      },
      this.services.chatLogService,
    );
    const {
      messages: messagesHistory,
      contextBoundary,
      fileRefMapping,
      contextBackfill,
    } = messageContext;
    const queue = this.services.conversationTurnQueue;
    const queuedTurnContext =
      typeof queue?.peekHint === 'function' ? queue.peekHint(assistantLogId, turnId) : undefined;
    const queuedTurnInput = queuedTurnContext
      ? {
          parentTurnId: queuedTurnContext.binding.parentTurnId,
          prompt: queuedTurnContext.payload.prompt,
          channel: 'web',
          createdAt: queuedTurnContext.createdAt,
        }
      : undefined;

    this.emitter.emit(
      sanitizeAgentEventForFrontend({
        type: 'turn.start',
        chatId: assistantCid,
        messageId: assistantCid,
        turnId,
        timestamp: Date.now(),
        data: { turn: initialTurn },
      }),
    );

    return { messagesHistory, contextBoundary, contextBackfill, fileRefMapping, queuedTurnInput };
  }

  /** Agent 循环：进度事件在投影回调里发出并更新快照；结果在循环返回后落库 */
  private async runAgent(context: TurnContext): Promise<AgentTurnOutcome> {
    const { user, userMessage } = this.input;
    const { assistantLogId, assistantCid, turnId, turnStartedAt } = this.records;
    const preflight = this.preflight;
    const currentMessage = createAssistantTurnMessage({
      model: preflight.useModel,
      turnId,
      parentTurnId: this.admission.parentTurnId,
      turnStartedAt,
    });
    this.liveMessage = currentMessage;
    const additionalParams = this.parseAdditionalParams(preflight.additionalParams);
    const modelConfig = preflight.agentModelGatewayConfig
      ? {
          ...preflight.agentModelGatewayConfig,
          model: preflight.useModel,
          additionalParams: preflight.agentModelGatewayConfig.additionalParams || additionalParams,
          reasoningEffort:
            preflight.reasoningEffort || preflight.agentModelGatewayConfig.reasoningEffort,
        }
      : undefined;
    const loopResult = await this.services.agentLoopService.execute(context.messagesHistory, {
      chatId: assistantCid,
      conversationId: this.records.chatGroupId,
      messageId: assistantCid,
      turnId,
      parentTurnId: this.admission.parentTurnId,
      turnStartedAt,
      attachments: extractSandboxAttachments(userMessage),
      apiKey: preflight.modelKey,
      model: preflight.useModel,
      baseUrl: preflight.modelGatewayConfig.baseUrl,
      modelConfig,
      additionalParams,
      reasoningEffort: preflight.reasoningEffort,
      userId: this.admission.chatUserId || undefined,
      userRole: user.role,
      uid: typeof (user as any)?.uid === 'string' ? (user as any).uid : undefined,
      visitorId: this.admission.visitorId || undefined,
      contextMaxTokens: preflight.maxModelTokens || undefined,
      contextBoundary: context.contextBoundary,
      contextBackfill: context.contextBackfill,
      fileRefMapping: context.fileRefMapping,
      platformPolicy: preflight.userRuntimeContext
        ? { content: preflight.userRuntimeContext, sourceId: 'runtime-context' }
        : undefined,
      queuedTurn: context.queuedTurnInput,
      shouldHandoffAfterToolRound: () =>
        Boolean(this.services.conversationTurnQueue?.hasPending(assistantLogId, turnId)),
      currentMessage,
      tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, details: [] },
      onProgress: createAgentLoopEventProjector({
        currentMessage,
        chatId: assistantCid,
        messageId: assistantCid,
        frontendMessageOptions: OWNER_FRONTEND_MESSAGE_OPTIONS,
        onEvent: event => this.handleProgressEvent(event),
      }),
      abortController: this.abortController,
      operationSession: this.operationSession,
    });
    const outcome = summarizeAgentLoopResult(loopResult, currentMessage);
    await this.persistOutcome(outcome, context.messagesHistory);
    return outcome;
  }

  /** 模型附加参数：管理端配置原文（JSON 字符串）或已解析对象；解析失败即忽略 */
  private parseAdditionalParams(value: unknown): Record<string, any> | undefined {
    try {
      return parseModelGatewayAdditionalParams(value) as Record<string, any> | undefined;
    } catch {
      Logger.warn('模型附加参数JSON解析失败，已忽略', 'ChatService');
      return undefined;
    }
  }

  /** 公开进度事件：同步回答、更新运行快照并转发；内部 agent.end 不发给前端 */
  private handleProgressEvent(event: AgentEvent): void {
    const frontendEvent = this.projectEventForCid(event);
    // 回答只含回答轮的文字（过程话术不算），正文增量与轮次阶段变化都会改变它；
    // 必须在任何 await 之前同步，终态快照、取消收尾与 chatlog.content 读的是同一份
    if (frontendEvent.type === 'message.delta' || frontendEvent.type === 'message.phase') {
      const content = this.liveMessage?.content ?? '';
      if (content !== this.currentGeneratedData.content) {
        this.currentGeneratedData.content = content;
        this.updateWorkflowSnapshot({ content });
      }
    }
    // AgentLoop 的内部 agent.end 早于数据库保存与 owner 文件投影收口。
    // 前端只接收 ChatService 在最终保存 / 余额刷新后的 agent.end。
    if (event.type === 'agent.end') {
      return;
    }
    this.emitter.emit(frontendEvent);

    // snapshot.sync 只用于 resync / 最终一致性修复，不作为主流式更新通道。
    if (frontendEvent.type === 'snapshot.sync') {
      const snapData = frontendEvent.data;
      if (snapData?.message) {
        this.updateWorkflowSnapshot({
          message:
            typeof snapData.message === 'string'
              ? snapData.message
              : stringifyFrontendMessage(snapData.message, OWNER_FRONTEND_MESSAGE_OPTIONS),
          content: snapData.content ?? this.currentGeneratedData.content,
          ...(snapData.turn ? { turn: snapData.turn } : {}),
        });
      }
    }
  }

  /**
   * 循环结果落库：补齐后端消息并写 content / message / totalTokens，
   * 同步内存快照（断线重连用）；循环失败时再把安全摘要写进 content。
   */
  private async persistOutcome(outcome: AgentTurnOutcome, messagesHistory: any[]): Promise<void> {
    const { assistantLogId } = this.records;
    try {
      outcome.currentMessage = toPersistedAssistantMessage(outcome.currentMessage, {
        model: this.preflight.useModel,
        tokenUsage: outcome.tokenUsage,
      });
      const content =
        typeof outcome.content === 'string' ? outcome.content : String(outcome.content || '');
      const totalTokens = outcome.totalTokens ?? (await estimateTokens(messagesHistory, outcome));
      const message = JSON.stringify(outcome.currentMessage);
      // 回答可以为空（只有过程话术、达到轮次上限）：空串也写，不能留下别的文字
      const updateData: Record<string, any> = { content };
      this.currentGeneratedData.content = content;
      if (message) {
        updateData.message = message;
        this.currentGeneratedData.backendMessage = message;
        this.currentGeneratedData.message = stringifyFrontendMessage(
          message,
          OWNER_FRONTEND_MESSAGE_OPTIONS,
        );
      }
      // 同步更新内存快照（用于断线重连）
      this.updateWorkflowSnapshot({
        content,
        // message 是 JSON.stringify 出的非空串，右侧只为类型收窄，null 分支不可达
        message: message || (this.currentGeneratedData.message ?? undefined),
      });
      if (totalTokens) {
        updateData.totalTokens = totalTokens;
        this.currentGeneratedData.totalTokens = totalTokens;
      }
      if (outcome.toolCost) {
        this.toolCost = outcome.toolCost;
      }
      if (Object.keys(updateData).length > 0) {
        await this.updateTurnLog(assistantLogId, updateData);
      }
      const toolCallsCount = outcome.currentMessage.rounds?.[0]?.toolCalls?.length || 0;
      Logger.log(
        `[ChatTurnRun] 保存 | 内容:${outcome.currentMessage.content?.length || 0}字 | 轮次:${
          outcome.currentMessage.rounds?.length || 0
        } | 工具:${toolCallsCount} | 费用:${outcome.toolCost || 0}`,
        'ChatService',
      );
    } catch (error) {
      Logger.error(`数据库保存失败: ${handleError(error)}`, 'ChatService');
      throw error;
    }
    if (outcome.errMsg !== undefined) {
      const safeFailureSummary = buildSafeFailureSummary(
        { code: 'AGENT_FAILURE', message: outcome.errMsg, retryable: true },
        '执行失败',
      );
      await this.updateTurnLog(assistantLogId, {
        content: safeFailureSummary,
      });
    }
  }

  /** 循环返回后的收口：取消检查、模型失败、计费结算、终态落库与终态事件 */
  private async complete(response: AgentTurnOutcome, messagesHistory: any[]): Promise<void> {
    const { user } = this.input;
    const { chatUserId } = this.admission;
    const { assistantLogId, assistantCid, userLogId, initialTurn } = this.records;
    const { currentRequestModelKey, useModeName, keyId } = this.preflight;
    const currentGeneratedData = this.currentGeneratedData;
    // execute() 只在 start() 认领操作会话成功后才进入 complete()
    const operationSession = this.operationSession!;

    let durableCancelled = await this.isDurablyCancelled();
    if (durableCancelled) {
      response.finishReason = 'abort';
      await this.finishCancelledAssistantTurn();
      return;
    }

    // 模型失败：不扣基础对话费；已成功执行的工具费按工具成本口径结算
    if (response.finishReason === 'error' && response.errMsg) {
      const successfulToolCost = Math.max(0, Number(response.toolCost || this.toolCost || 0));
      if (successfulToolCost > 0) {
        await operationSession.beginSettlement({
          mode: 'tools_only',
          totalTokens: Number(currentGeneratedData.totalTokens) || 0,
          toolCost: successfulToolCost,
        });
        this.billingSettlementOutcomePending = true;
        const settlement = await this.services.billing?.settleTurn({
          user,
          userId: chatUserId,
          model: currentRequestModelKey,
          totalTokens: Number(currentGeneratedData.totalTokens) || 0,
          toolCost: successfulToolCost,
          relatedId: assistantLogId,
          toolsOnly: true,
        });
        await operationSession.completeSettlement(settlement?.charged ?? 0);
        this.billingSettlementOutcomePending = false;
        this.toolCost = successfulToolCost;
      }
      Logger.error(
        `用户ID: ${chatUserId || '访客'} 模型: ${useModeName} 回复出错，本次不扣除对话积分${
          successfulToolCost > 0 ? `，已结算工具费 ${successfulToolCost}` : ''
        }`,
        'ChatService',
      );
      const failedTurn =
        response.currentMessage?.turn || finalizeAgentTurn(initialTurn, 'error', 'failed');
      const safeFailureSummary = buildSafeFailureSummary(
        { code: 'AI_ERROR', message: response.errMsg || 'AI 回复出错', retryable: true },
        'AI 回复出错',
      );
      this.updateWorkflowSnapshot({ turn: failedTurn });
      this.emitter.emit(
        sanitizeAgentEventForFrontend({
          type: 'agent.error',
          chatId: assistantCid,
          messageId: assistantCid,
          turnId: failedTurn.id,
          timestamp: Date.now(),
          data: {
            code: 'AI_ERROR',
            message: safeFailureSummary,
            retryable: true,
            turn: failedTurn,
            turnStatus: failedTurn.status,
          },
        }),
      );
      await this.refundRegisteredTurn();
      await this.terminalizeAssistant({
        phase: 'failed',
        terminalReason: 'ai_error',
        content: safeFailureSummary,
        status: ChatLogStatus.FAILED,
        message: attachTurnToBackendMessage(
          currentGeneratedData.backendMessage ||
            currentGeneratedData.message ||
            response.currentMessage,
          failedTurn,
        ),
      });
      this.emitLiveSync({ type: 'turn_error', errorCode: 'AI_ERROR', finishReason: 'error' });
      this.failCurrentWorkflow();
      this.workflowFailed = true;
      return;
    }

    // 中断或部分成功：有生成内容就计费（看生成证据，不看展示给用户的回答）
    const hasContent =
      response.generatedText || response.reasoning_content || (response.totalTokens ?? 0) > 0;
    let totalTokens = 0;
    if (response.totalTokens) {
      totalTokens = response.totalTokens;
    } else {
      let totalText = '';
      messagesHistory.forEach(historyMessage => {
        totalText += historyMessage.content + ' ';
      });
      const inputTokens = await getTokenCount(totalText);
      const outputTokens = await getTokenCount(
        (response.reasoning_content || '') + (response.generatedText || ''),
      );
      totalTokens = inputTokens + outputTokens;
    }
    await this.updateTurnLog(userLogId, { totalTokens });

    durableCancelled = durableCancelled || (await this.isDurablyCancelled());
    if (durableCancelled) {
      response.finishReason = 'abort';
      await this.finishCancelledAssistantTurn();
      return;
    }

    let shouldCharge = false;
    if (response.finishReason === 'abort') {
      if (!durableCancelled && hasContent && totalTokens > 0) {
        shouldCharge = true;
        Logger.log(`运行被中断，但已生成内容，按实际使用量计费`, 'ChatService');
      }
    } else if (
      response.finishReason === 'stop' ||
      response.finishReason === 'handoff' ||
      // 输出达到上限：内容已经生成，照常计费（回复按完成处理，只额外提示可能没写完）
      response.finishReason === 'length' ||
      !response.finishReason
    ) {
      shouldCharge = true;
    }

    let charged = 0;
    if (shouldCharge) {
      await operationSession.beginSettlement({
        mode: 'full',
        totalTokens,
        toolCost: this.toolCost,
      });
      this.billingSettlementOutcomePending = true;
      const settlement = await this.services.billing?.settleTurn({
        user,
        userId: chatUserId,
        model: currentRequestModelKey,
        totalTokens,
        toolCost: this.toolCost,
        relatedId: assistantLogId,
      });
      charged = settlement?.charged ?? 0;
      await operationSession.completeSettlement(charged);
      this.billingSettlementOutcomePending = false;
      await this.services.modelsService.saveUseLog(keyId, totalTokens);
      Logger.log(
        `对话${response.finishReason === 'abort' ? '(中断)' : '完成'} - 用户: ${
          chatUserId || '访客'
        }, 模型: ${useModeName}(ID: ${keyId}), Token: ${totalTokens}, 记账: ${charged}`,
        'ChatService',
      );
    } else {
      Logger.log(`运行${response.finishReason}，无内容生成，不计费`, 'ChatService');
    }

    durableCancelled = durableCancelled || (await this.isDurablyCancelled());
    if (durableCancelled) {
      response.finishReason = 'abort';
      await this.finishCancelledAssistantTurn();
      return;
    }

    const billingSummary = (await this.services.billing?.getSummary(chatUserId)) ?? null;
    const canRunQueuedTurn = response.finishReason !== 'abort' && response.finishReason !== 'error';
    const binding = this.continuationBinding();
    this.queuedTurnAfterComplete =
      canRunQueuedTurn && binding
        ? await this.services.conversationTurnQueue?.claimForParent(binding)
        : undefined;
    if (!canRunQueuedTurn) await this.discardQueuedTurn('parent_not_launchable');
    const baseFinishReasonForClient =
      response.finishReason === 'handoff' ? 'stop' : response.finishReason || 'stop';
    const finishReasonForClient = this.queuedTurnAfterComplete
      ? 'handoff'
      : baseFinishReasonForClient;

    const runStopReason = response.stopReason;
    const responseTurn = {
      ...(response.currentMessage?.turn ||
        finalizeAgentTurn(initialTurn, response.finishReason || 'stop')),
      // 收尾原因随 turn 落库，刷新后仍能区分：轮次上限（状态仍是 interrupted，和用户点停区分开）、
      // 输出达到上限（状态 completed，提示回复可能没写完）
      ...(runStopReason ? { stopReason: runStopReason } : {}),
    };
    if (response.currentMessage) {
      response.currentMessage.turn = responseTurn;
    }
    const finalBackendMessage = attachTurnToBackendMessage(
      currentGeneratedData.backendMessage ||
        response.currentMessage ||
        currentGeneratedData.message,
      responseTurn,
      // 流式期间的快照里已经有一个运行中的 turn，终态必须整体换掉才带得上收尾原因
      true,
    );
    const finalSnapshotMessage = attachTurnToSnapshotMessage(
      finalBackendMessage || currentGeneratedData.message || response.currentMessage,
      responseTurn,
    );
    const finalChatLogStatus =
      response.finishReason === 'abort'
        ? ChatLogStatus.STOPPED
        : response.finishReason === 'error'
          ? ChatLogStatus.FAILED
          : ChatLogStatus.COMPLETED;
    await this.terminalizeAssistant({
      phase:
        response.finishReason === 'abort'
          ? 'interrupted'
          : response.finishReason === 'error'
            ? 'failed'
            : 'completed',
      terminalReason: response.finishReason || 'stop',
      ...(finalBackendMessage || finalSnapshotMessage
        ? { message: finalBackendMessage || finalSnapshotMessage }
        : {}),
      status: finalChatLogStatus,
    });

    const emitFinalEvent = (event: AgentEvent) => {
      this.emitter.emit(sanitizeAgentEventForFrontend(event));
    };
    emitFinalEvent({
      type: 'turn.end',
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: responseTurn.id,
      timestamp: Date.now(),
      data: {
        turn: responseTurn,
        finishReason: finishReasonForClient,
        nextAction: finishReasonForClient === 'handoff' ? 'start_queued_turn' : 'none',
      },
    });
    emitFinalEvent({
      type: 'snapshot.sync',
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: responseTurn.id,
      timestamp: Date.now(),
      data: {
        reason: 'workflow_complete',
        message: finalSnapshotMessage,
        content: currentGeneratedData.content,
        turn: responseTurn,
        turnStatus: responseTurn.status,
        finishReason: finishReasonForClient,
        ...(response.tokenUsage
          ? {
              usage: {
                inputTokens: response.tokenUsage.totalInputTokens,
                outputTokens: response.tokenUsage.totalOutputTokens,
                totalTokens: response.tokenUsage.totalTokens,
              },
            }
          : {}),
      },
    });
    emitFinalEvent({
      type: 'billing.update',
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: responseTurn.id,
      timestamp: Date.now(),
      data: { charged, summary: billingSummary },
    });
    emitFinalEvent({
      type: 'agent.end',
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: responseTurn.id,
      timestamp: Date.now(),
      data: {
        finishReason: finishReasonForClient,
        billing: billingSummary,
        cid: assistantCid,
        turn: responseTurn,
        turnStatus: responseTurn.status,
      },
    });
    this.emitLiveSync({ type: 'turn_done', finishReason: finishReasonForClient });
  }

  /* ==================== 终态收口 ==================== */

  private async failCreatedAssistantTurn(error: any, code: string, message: string): Promise<void> {
    const { assistantCid, initialTurn, initialAssistantMessage } = this.records;
    this.workflowFailed = true;
    this.abortController.abort();
    if (this.operationTerminalized) {
      this.failCurrentWorkflow();
      await this.discardQueuedTurn('parent_projection_failed');
      Logger.error(`[ChatService] 终态后投影失败: ${message}`, getErrorStack(error), 'ChatService');
      return;
    }
    const failedTurn = finalizeAgentTurn(initialTurn, 'error', 'failed');
    const failedMessage = stringifyFrontendMessage(
      { ...initialAssistantMessage, content: message, turn: failedTurn },
      OWNER_FRONTEND_MESSAGE_OPTIONS,
    );
    await this.refundRegisteredTurn();
    await this.terminalizeAssistant({
      phase: 'failed',
      terminalReason: code.toLowerCase(),
      content: message,
      message: failedMessage,
      status: ChatLogStatus.FAILED,
    });
    this.updateWorkflowSnapshot({ turn: failedTurn });
    Logger.error(`[ChatService] 对话处理失败: ${message}`, getErrorStack(error), 'ChatService');
    try {
      this.emitter.emit(
        sanitizeAgentEventForFrontend({
          type: 'agent.error',
          chatId: assistantCid,
          messageId: assistantCid,
          turnId: failedTurn.id,
          timestamp: Date.now(),
          data: {
            code,
            message,
            turn: failedTurn,
            turnStatus: failedTurn.status,
          },
        }),
      );
      this.emitLiveSync({ type: 'turn_error', errorCode: code, finishReason: 'error' });
    } finally {
      // 终态事件必须先经过当前 publisher fence；随后再退休工作流，
      // 以免同进程的旧 generation 发布者借用后续序列号。
      this.failCurrentWorkflow();
      await this.discardQueuedTurn('parent_failed');
    }
  }

  private async finishCancelledAssistantTurn(): Promise<void> {
    const { assistantCid, initialTurn, initialAssistantMessage } = this.records;
    const currentGeneratedData = this.currentGeneratedData;
    this.queuedTurnAfterComplete = undefined;
    await this.refundRegisteredTurn();
    await this.discardQueuedTurn('parent_cancelled');
    const interruptedTurn = finalizeAgentTurn(initialTurn, 'abort', 'interrupted');
    const content = currentGeneratedData.content || '已停止生成';
    const message = attachTurnToBackendMessage(
      currentGeneratedData.backendMessage ||
        currentGeneratedData.message ||
        initialAssistantMessage,
      interruptedTurn,
      true,
    );
    await this.terminalizeAssistant({
      phase: 'interrupted',
      terminalReason: 'user_cancelled',
      content,
      ...(message ? { message } : {}),
      status: ChatLogStatus.STOPPED,
    });
    this.updateWorkflowSnapshot({
      content,
      ...(message ? { message } : {}),
      turn: interruptedTurn,
    });
    this.emitter.emit(
      sanitizeAgentEventForFrontend({
        type: 'turn.end',
        chatId: assistantCid,
        messageId: assistantCid,
        turnId: interruptedTurn.id,
        timestamp: Date.now(),
        data: {
          turn: interruptedTurn,
          finishReason: 'abort',
          nextAction: 'none',
        },
      }),
    );
    this.emitter.emit(
      sanitizeAgentEventForFrontend({
        type: 'agent.end',
        chatId: assistantCid,
        messageId: assistantCid,
        turnId: interruptedTurn.id,
        timestamp: Date.now(),
        data: {
          finishReason: 'abort',
          cid: assistantCid,
          turn: interruptedTurn,
          turnStatus: interruptedTurn.status,
        },
      }),
    );
    this.emitLiveSync({ type: 'turn_done', finishReason: 'abort' });
  }

  private async terminalizeAssistant(input: {
    phase: 'completed' | 'failed' | 'interrupted';
    status: number;
    terminalReason: string;
    content?: string;
    message?: string;
  }): Promise<void> {
    if (this.operationTerminalized) return;
    const { assistantLogId } = this.records;
    const chatLogPatch = {
      ...(input.content === undefined ? {} : { content: input.content }),
      ...(input.message === undefined ? {} : { message: input.message }),
      status: input.status,
    };
    if (this.operationSession) {
      await this.operationSession.terminalize({
        assistantLogId,
        phase: input.phase,
        terminalReason: input.terminalReason,
        chatLogPatch,
      });
    } else {
      await this.services.chatLogService.updateChatLog(assistantLogId, chatLogPatch);
    }
    this.operationTerminalized = true;
  }

  private async refundRegisteredTurn(): Promise<void> {
    if (this.input.user.role === 'visitor') {
      if (this.billingSettlementOutcomePending && this.operationSession) {
        await this.operationSession.markBillingUnknown();
        this.billingSettlementOutcomePending = false;
      }
      return;
    }
    if (this.operationSession) await this.operationSession.beginRefund();
    await this.services.billing?.refundTurn(this.records.assistantLogId);
    if (this.operationSession) await this.operationSession.completeRefund();
  }

  /* ==================== 运行中辅助 ==================== */

  private async updateTurnLog(chatLogId: number, patch: Record<string, any>): Promise<void> {
    if (this.operationSession) {
      const updated = await this.operationSession.updateChatLog(chatLogId, patch);
      if (!updated) throw new Error('Agent operation chatlog write failed');
      return;
    }
    await this.services.chatLogService.updateChatLog(chatLogId, patch);
  }

  private continuationBinding(): AgentContinuationParentBinding | undefined {
    const operationSession = this.operationSession;
    return operationSession
      ? {
          operationId: operationSession.identity.operationId,
          parentAssistantLogId: this.records.assistantLogId,
          parentTurnId: this.records.turnId,
          ownerType: operationSession.identity.ownerType,
          ownerKey: operationSession.identity.ownerKey,
          groupId: operationSession.identity.groupId,
          conversationGid: this.records.conversationGid,
          generation: operationSession.fence.generation,
        }
      : undefined;
  }

  private async discardQueuedTurn(reason: string): Promise<boolean> {
    this.queuedTurnAfterComplete = undefined;
    const binding = this.continuationBinding();
    if (!binding || !this.services.conversationTurnQueue) return false;
    return this.services.conversationTurnQueue.clear(binding, reason);
  }

  private updateWorkflowSnapshot(
    data: Parameters<WorkflowProcessManager['updateSnapshot']>[1],
  ): void {
    if (!this.workflowPublisherFence) return;
    this.services.workflowManager.updateSnapshot(
      this.records.assistantLogId,
      data,
      this.workflowPublisherFence,
    );
  }

  private failCurrentWorkflow(): void {
    if (!this.workflowPublisherFence) return;
    this.services.workflowManager.fail(this.records.assistantLogId, this.workflowPublisherFence);
  }

  private async isDurablyCancelled(): Promise<boolean> {
    if (!this.operationSession) return false;
    return this.operationSession.isCancelRequested();
  }

  /** 抛出的错误是否源于持久化取消：显式取消错误，或操作账本已记录取消请求 */
  private async isCancelled(error: unknown): Promise<boolean> {
    if (error instanceof AgentOperationCancelledError) return true;
    if (!this.operationSession) return false;
    return this.operationSession.isCancelRequested().catch(() => false);
  }

  private projectEventForCid(event: AgentEvent): AgentEvent {
    const { assistantCid } = this.records;
    return sanitizeAgentEventForFrontend({
      ...event,
      chatId: assistantCid,
      messageId: event.messageId || assistantCid,
      data: { ...event.data },
    } as AgentEvent);
  }

  /** 同一用户其它连接上的会话级同步事件（turn_created / turn_done / turn_error） */
  private emitLiveSync(
    event: Omit<
      Parameters<ChatLiveSyncService['emitToUser']>[1],
      'channel' | 'conversationGid' | 'sourceSocketId' | 'cids'
    >,
  ): void {
    this.services.chatLiveSyncService?.emitToUser(this.admission.workflowOwnerId, {
      channel: this.admission.chatChannel,
      conversationGid: this.records.conversationGid,
      sourceSocketId: this.admission.sourceSocketId,
      cids: { user: this.records.userCid, assistant: this.records.assistantCid },
      ...event,
    });
  }
}
