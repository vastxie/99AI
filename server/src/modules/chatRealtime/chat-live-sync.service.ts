import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

export type ChatLiveSyncEventType =
  'turn_created' | 'turn_done' | 'turn_error' | 'conversation_updated';

export interface ChatLiveSyncEvent {
  type: ChatLiveSyncEventType;
  userId: number | string;
  channel: string;
  conversationGid: string;
  sourceSocketId?: string;
  cids?: {
    user?: string;
    assistant?: string;
  };
  initialMessages?: {
    user?: Record<string, any>;
    assistant?: Record<string, any>;
  };
  finishReason?: string;
  errorCode?: string;
  conversation?: Record<string, any>;
  deleted?: boolean;
  timestamp: number;
}

/**
 * 同一用户多个标签页之间的会话同步：轮次创建 / 完成 / 失败、会话元数据变化。
 * 发起方 socket 已通过 agent:event / ack 获得同样的状态，服务端直接排除。
 */
@Injectable()
export class ChatLiveSyncService {
  private server?: Server;

  bindServer(server: Server): void {
    this.server = server;
  }

  emitToUser(
    userId: number | string | null | undefined,
    payload: Omit<ChatLiveSyncEvent, 'userId' | 'timestamp'> & { timestamp?: number },
  ): void {
    if (userId === null || userId === undefined || userId === '') return;
    if (!this.server) return;

    const event: ChatLiveSyncEvent = {
      ...payload,
      userId,
      timestamp: payload.timestamp || Date.now(),
    };

    try {
      let target = this.server.to(`user:${userId}`);
      if (payload.sourceSocketId) {
        target = target.except(payload.sourceSocketId);
      }
      void target.emit('chat:sync', event);
    } catch (error: any) {
      Logger.warn(`对话同步事件推送失败: ${error?.message || error}`, 'ChatLiveSyncService');
    }
  }
}
