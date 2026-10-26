import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AgentEvent } from '@99agent/contracts';
import { AgentLoopService } from '../agent/core/agent-loop.service';
import { ChatLiveSyncService } from '../chatRealtime/chat-live-sync.service';
import { ChatTitleService } from './chat-title.service';
import { ChatUploadContextService } from './chat-upload-context.service';
import { ChatContextBuilderService } from './chat-context-builder.service';
import { ChatBillingService } from './chat-billing.service';
import { ChatPreflightService, type ChatAdmissionResult } from './chat-preflight.service';
import type { ChatSubmissionOperation } from './chat-submission.service';
import { ChatTurnRun, type ChatTurnCreatedCallback } from './chat-turn-run';
import {
  ContinuationPreflightTerminatedError,
  InteractionDispatcher,
} from './interaction-dispatcher.service';
import { isPublicError, publicErrorCode, publicErrorMessage } from './public-error.util';
import { WorkflowProcessManager } from './workflowManager.service';
import { ConversationTurnQueue, QueuedConversationTurn } from './conversation-turn-queue.service';
import { ChatLogService } from '../chatLog/chatLog.service';
import { UnifiedMessage } from '../chatLog/types/message.types';
import { parseUnifiedMessage, rebuildClientUserMessage } from '../chatLog/unified-message.util';
import { StreamEmitter } from './emitters/stream-emitter.interface';
import { ModelsService } from '../models/models.service';
import { AgentOperationStore } from '../agent/runtime-state/operation-ledger.store';
import type { AgentContinuationClaim } from '../agent/runtime-state/continuation-inbox.types';
import { UserService } from '../user/user.service';

export type { ChatCommitContext } from './chat-turn-run';

type UploadMediaType = 'image' | 'video' | 'audio' | 'document' | 'file';

class ContinuationOwnerUnavailableError extends Error {
  constructor() {
    super('Agent continuation owner is unavailable');
    this.name = 'ContinuationOwnerUnavailableError';
  }
}

/** 补父回合的那一层包着的原始传输（接续下一轮时先解开再包，包装不随接续累积） */
const continuationTransport = new WeakMap<StreamEmitter, StreamEmitter>();

/**
 * 接续轮推出的 agent.error 都带上它要接的父回合（预检限流、调度作废、启动失败、处理失败等各个出口）：
 * 这些错误走上一轮的房间广播，恢复的页签不知道提交号，在接续窗口里按父回合认（与 WSEmitter 补提交号同理）
 */
function withContinuationParent(emitter: StreamEmitter, parentTurnId: string): StreamEmitter {
  const transport = continuationTransport.get(emitter) ?? emitter;
  const wrapped: StreamEmitter = {
    emit: event =>
      transport.emit(
        event.type === 'agent.error' && !event.data?.parentTurnId
          ? ({ ...event, data: { ...event.data, parentTurnId } } as AgentEvent)
          : event,
      ),
  };
  continuationTransport.set(wrapped, transport);
  return wrapped;
}

interface UrlItem {
  type: UploadMediaType;
  url?: string;
  fileId?: string;
  previewUrl?: string;
  downloadUrl?: string;
  publicUrl?: string;
  mime?: string;
  mimeType?: string;
  size?: number;
  name?: string;
}

type MediaItem = {
  type: UploadMediaType;
  name: string;
  url?: string;
  fileId?: string;
  previewUrl?: string;
  downloadUrl?: string;
  publicUrl?: string;
  mime?: string;
  mimeType?: string;
  size?: number;
};

/**
 * 会话编排：一种会话、一条 Agent 循环、一个用户沙箱。
 * 预检与落库交给 InteractionDispatcher / ChatTurnPersistenceService，
 * 运行、事件投影、计费与终态收口交给 ChatTurnRun；这里只负责准入、接续与恢复。
 */
@Injectable()
export class ChatService {
  private continuationRecoveryInFlight?: Promise<number>;

  constructor(
    private readonly chatLogService: ChatLogService,
    private readonly modelsService: ModelsService,
    private readonly agentLoopService: AgentLoopService,
    private readonly workflowManager: WorkflowProcessManager,
    private readonly conversationTurnQueue: ConversationTurnQueue,
    private readonly chatLiveSyncService: ChatLiveSyncService,
    private readonly chatTitleService: ChatTitleService,
    private readonly uploadContext: ChatUploadContextService,
    private readonly contextBuilder: ChatContextBuilderService,
    private readonly billing: ChatBillingService,
    private readonly chatPreflight: ChatPreflightService,
    private readonly interactionDispatcher: InteractionDispatcher,
    private readonly operations: AgentOperationStore,
    private readonly userService: UserService,
  ) {}

  async chatProcess(
    rawBody: any,
    user: any,
    emitter: StreamEmitter,
    onChatIdCreated?: ChatTurnCreatedCallback,
    channel?: string,
    submissionContext: {
      operation?: ChatSubmissionOperation;
      strategy?: string;
      continuationClaim?: AgentContinuationClaim;
    } = {},
  ) {
    // 这里只做稳定事实校验和 canonical submission 摘要；可变预检必须在
    // ChatGroup 行锁内、重复提交判断之后执行。
    const admission = await this.chatPreflight.prepareAdmission(
      rawBody,
      user,
      channel,
      submissionContext,
    );
    const userMessage = this.buildUserMessage(admission);

    const committed = await this.interactionDispatcher.commit({
      admission,
      userMessage,
      emitter,
      continuationClaim: submissionContext.continuationClaim,
    });
    if (!committed) return;
    if (committed.duplicate) {
      return {
        accepted: false,
        duplicate: true,
        cid: committed.records.assistantCid,
        turnId: committed.records.turnId,
      };
    }
    const preflight = committed.preflight;
    if (!preflight) {
      throw new HttpException('执行预检状态缺失', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const run = new ChatTurnRun(
      {
        chatLogService: this.chatLogService,
        modelsService: this.modelsService,
        agentLoopService: this.agentLoopService,
        workflowManager: this.workflowManager,
        conversationTurnQueue: this.conversationTurnQueue,
        chatLiveSyncService: this.chatLiveSyncService,
        chatTitleService: this.chatTitleService,
        contextBuilder: this.contextBuilder,
        billing: this.billing,
        operations: this.operations,
        launchQueuedTurn: (turn, turnEmitter, created) =>
          this.runQueuedConversationTurn(turn, turnEmitter, created),
      },
      {
        user,
        admission,
        preflight,
        records: committed.records,
        userMessage,
        emitter,
        onChatIdCreated,
        continuationClaim: submissionContext.continuationClaim,
      },
    );
    await run.execute();
  }

  /**
   * 用户消息：优先使用前端传递的 message（当前消息对象，rounds 格式）；
   * 否则由 prompt 与附件参数构建，附件以虚拟 user_upload 工具调用挂在消息上。
   */
  private buildUserMessage(admission: ChatAdmissionResult): UnifiedMessage {
    const { body, prompt } = admission;
    const { message: userMessageStr, url: urlParam } = body;

    if (userMessageStr !== undefined && userMessageStr !== null) {
      const userMessage = parseUnifiedMessage(userMessageStr);
      if (!userMessage) {
        throw new HttpException('message 必须是当前消息对象的单层 JSON', HttpStatus.BAD_REQUEST);
      }
      return rebuildClientUserMessage(userMessage);
    }

    const parseUrlParam = (urlString: string | undefined): UrlItem[] => {
      if (!urlString) return [];
      try {
        const parsed = JSON.parse(urlString);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        Logger.warn('附件参数解析失败', 'ChatService');
      }
      return [];
    };

    const urlItems = [
      ...parseUrlParam(urlParam),
      ...parseUrlParam(body.files),
      ...parseUrlParam(body.attachments),
    ];
    const toolCalls = [];
    const attachments: MediaItem[] = [];

    for (const item of urlItems) {
      const itemUrl = this.uploadContext.getUploadUrl(item);
      if (!itemUrl && !item.fileId) continue;
      attachments.push({
        type: this.uploadContext.getUploadMediaType(item),
        name: item.name || itemUrl.split('/').pop() || item.fileId || 'file',
        url: item.url || undefined,
        fileId: item.fileId,
        previewUrl: item.previewUrl,
        downloadUrl: item.downloadUrl,
        publicUrl: item.publicUrl,
        mime: item.mime,
        mimeType: item.mimeType,
        size: item.size,
      });
    }

    // 附件以虚拟 user_upload 工具调用挂在用户消息上（直接存储对象数组，避免双重 JSON 编码）
    if (attachments.length > 0) {
      toolCalls.push({
        id: `user_upload_${Date.now()}`,
        name: 'user_upload',
        arguments: {},
        status: 'success' as const,
        output: { files: attachments },
      });
    }

    return {
      role: 'user',
      content: prompt,
      rounds: [
        {
          text: prompt || null,
          thinking: null,
          toolCalls: toolCalls,
          completed: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  private runQueuedConversationTurn(
    turn: QueuedConversationTurn,
    emitter: StreamEmitter,
    onChatIdCreated?: ChatTurnCreatedCallback,
  ): void {
    const continuationEmitter = withContinuationParent(emitter, turn.parentTurnId);
    void (async () => {
      const user = await this.rehydrateContinuationUser(turn);
      const rawBody = {
        ...turn.payload,
        ...(turn.clientIp ? { __clientIp: turn.clientIp } : {}),
        ...(turn.sourceSocketId ? { __socketId: turn.sourceSocketId } : {}),
      };
      await this.chatProcess(rawBody, user, continuationEmitter, onChatIdCreated, turn.channel, {
        operation: 'continue',
        continuationClaim: turn,
      });
      await this.conversationTurnQueue?.discardClaim(turn, 'launch_not_admitted');
    })().catch(async error => {
      const discard = this.shouldDiscardContinuationLaunch(error);
      if (discard) {
        try {
          await this.conversationTurnQueue?.discardClaim(turn, 'launch_rejected');
        } catch {
          Logger.error('接续消息失败状态持久化失败', undefined, 'ChatService');
        }
      }
      Logger.error('接续消息处理失败', undefined, 'ChatService');
      // 预检拒绝的原因能公开的（违规、额度不足、限流……）原样告诉用户：前端据此弹违规说明、引导购买，
      // 不再只显示「接续消息处理失败」
      const reason =
        error instanceof ContinuationPreflightTerminatedError ? error.reason : undefined;
      const fallbackMessage = discard
        ? '接续消息处理失败，请稍后重试'
        : '接续消息暂未启动，将自动重试';
      continuationEmitter.emit({
        type: 'agent.error',
        chatId: 'pending',
        timestamp: Date.now(),
        data:
          reason && isPublicError(reason)
            ? {
                code: publicErrorCode(reason),
                message: publicErrorMessage(reason, fallbackMessage),
              }
            : { code: 'QUEUE_TURN_ERROR', message: fallbackMessage },
      });
    });
  }

  private shouldDiscardContinuationLaunch(error: unknown): boolean {
    if (
      error instanceof ContinuationOwnerUnavailableError ||
      error instanceof ContinuationPreflightTerminatedError
    ) {
      return true;
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      return status >= 400 && status < 500 && status !== HttpStatus.TOO_MANY_REQUESTS;
    }
    const code = String((error as any)?.code || '');
    return code === 'TURN_MISMATCH' || code === 'SUBMISSION_CONFLICT';
  }

  private async rehydrateContinuationUser(turn: QueuedConversationTurn): Promise<any> {
    if (turn.ownerType === 'visitor') {
      return { id: turn.ownerKey, role: 'visitor' };
    }
    const userId = Number(turn.ownerKey);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !this.userService) {
      throw new ContinuationOwnerUnavailableError();
    }
    const user = await this.userService.getUserById(userId);
    if (!user) throw new ContinuationOwnerUnavailableError();
    return user;
  }

  async recoverQueuedConversationTurns(): Promise<number> {
    if (!this.conversationTurnQueue) return 0;
    if (this.continuationRecoveryInFlight) return this.continuationRecoveryInFlight;
    const run = this.runContinuationRecovery();
    this.continuationRecoveryInFlight = run;
    try {
      return await run;
    } finally {
      if (this.continuationRecoveryInFlight === run) {
        this.continuationRecoveryInFlight = undefined;
      }
    }
  }

  private async runContinuationRecovery(): Promise<number> {
    if (!this.conversationTurnQueue) return 0;
    await this.conversationTurnQueue.expireDue();
    const emitter: StreamEmitter = { emit: () => undefined };
    let launched = 0;
    let afterId = 0;
    for (;;) {
      const candidates = await this.conversationTurnQueue.listRecoveryCandidates(
        new Date(),
        100,
        afterId,
      );
      if (!candidates.length) break;
      for (const candidate of candidates) {
        afterId = Math.max(afterId, candidate.id);
        try {
          const claim = await this.conversationTurnQueue.claimForRecovery(candidate.id);
          if (!claim) continue;
          launched += 1;
          this.runQueuedConversationTurn(claim, emitter);
        } catch (error) {
          Logger.error('Durable 接续消息恢复失败', undefined, 'ChatService');
        }
      }
      if (candidates.length < 100) break;
    }
    return launched;
  }
}
