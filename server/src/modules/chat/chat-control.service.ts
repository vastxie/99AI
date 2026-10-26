/**
 * ChatControlService — 会话运行控制：停止、断线重同步、孤儿轮次恢复
 */

import { HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ChatLogService } from '../chatLog/chatLog.service';
import {
  OWNER_FRONTEND_MESSAGE_OPTIONS,
  stringifyFrontendMessage,
} from '../chatLog/tool-result-payload';
import { ConversationTurnQueue } from './conversation-turn-queue.service';
import { WorkflowProcessManager } from './workflowManager.service';
import { ChatTurnPersistenceService } from './chat-turn-persistence.service';

/** 停止结果里回复本身的结局：取消登记在未终结的操作上 → stopped；操作已终结 → 按它的终态 */
type StopReplyStatus = 'stopped' | 'completed' | 'error' | 'not_found';

const TERMINAL_PHASE_REPLY_STATUS: Record<string, StopReplyStatus> = {
  completed: 'completed',
  failed: 'error',
  interrupted: 'stopped',
};

/**
 * stopped 表示这次请求取消了运行或丢弃了排队的接续任务（旧前端只看它）；
 * status 始终描述这条回复：父回复已经结束、只丢弃了接续任务时报回复真实的结局，不报 stopped
 */
function replyStatusOf(durable: { requested: boolean; terminalPhase?: string }): StopReplyStatus {
  if (durable.requested) return 'stopped';
  return TERMINAL_PHASE_REPLY_STATUS[durable.terminalPhase ?? ''] ?? 'not_found';
}

@Injectable()
export class ChatControlService {
  constructor(
    private readonly chatLogService: ChatLogService,
    private readonly workflowManager: WorkflowProcessManager,
    @Optional() private readonly conversationTurnQueue?: ConversationTurnQueue,
    @Optional() private readonly turnPersistence?: ChatTurnPersistenceService,
  ) {}

  async getChatLogForResync(
    chatId: number,
  ): Promise<{ cid: string; content: string; message: string; status: number } | null> {
    const log = await this.chatLogService.findOneChatLog(chatId);
    if (!log) return null;
    return {
      cid: log.cid,
      content: log.content || '',
      message: log.message
        ? stringifyFrontendMessage(log.message, OWNER_FRONTEND_MESSAGE_OPTIONS)
        : '',
      status: log.status,
    };
  }

  resolveAssistantChatLogByCidForUser(cid: string, user: any) {
    return this.chatLogService.resolveChatLogByCidForUser(cid, user, {
      assistantOnly: true,
    });
  }

  async recoverOrphanedTurn(chatId: number): Promise<{ chatLogs: number }> {
    if (!this.turnPersistence) {
      throw new Error('ChatTurnPersistenceService 未就绪，无法恢复孤儿轮次');
    }
    return this.turnPersistence.recoverOrphanedTurn(chatId);
  }

  async verifyChatOwner(
    chatId: number,
    user: { id: number; visitorId?: string },
  ): Promise<boolean> {
    const log = await this.chatLogService.findOneChatLog(chatId);
    if (!log) return false;
    if (log.userId === user.id) return true;
    if (user.visitorId && log.visitorId === String(user.visitorId)) return true;
    return !log.userId && Boolean(log.visitorId) && String(user.id) === log.visitorId;
  }

  async stopChat(cid: string, user: any) {
    const chatLog = await this.resolveAssistantChatLogByCidForUser(cid, user);
    const chatId = chatLog.id;
    const context = this.workflowManager.getWorkflowForUser(chatId, user);
    const ownerType = user?.role === 'visitor' ? 'visitor' : 'user';
    const ownerKey = String(user?.id ?? '').trim();
    if (!ownerKey || !this.conversationTurnQueue) {
      throw new Error('Agent operation cancel store is unavailable');
    }
    if (!context) {
      const isOwner = await this.verifyChatOwner(chatId, user);
      if (!isOwner) {
        throw new HttpException('无权操作此会话', HttpStatus.FORBIDDEN);
      }
      const durable = await this.conversationTurnQueue.requestCancel({
        parentAssistantLogId: chatId,
        ownerType,
        ownerKey,
      });
      const stopped = durable.requested || durable.continuationDiscarded;
      if (stopped) Logger.log('stopChat durable cancel 已提交', 'ChatControlService');
      return { stopped, status: replyStatusOf(durable) };
    }

    const operation = context.operation;
    if (!operation || operation.ownerType !== ownerType || operation.ownerKey !== ownerKey) {
      throw new HttpException('当前任务缺少持久运行信息，请刷新后重试', HttpStatus.CONFLICT);
    }
    const durable = await this.conversationTurnQueue.requestCancel({
      parentAssistantLogId: chatId,
      ownerType,
      ownerKey,
      expectedTurnId: context.turnId,
      expectedGeneration: operation.generation,
    });
    const stopped = this.workflowManager.stop(chatId);
    const accepted = durable.requested || durable.continuationDiscarded || stopped;
    Logger.log('stopChat durable cancel 处理完成', 'ChatControlService');
    return { stopped: accepted, status: replyStatusOf(durable) };
  }
}
