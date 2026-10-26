import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { WS_AUTH_FAILURE_MESSAGES, WsAuthValidator } from './guards/ws-auth.guard';
import { ChatService, type ChatCommitContext } from './chat.service';
import { WorkflowProcessManager } from './workflowManager.service';
import { ConversationTurnQueue } from './conversation-turn-queue.service';
import { ChatLiveSyncService } from '../chatRealtime/chat-live-sync.service';
import { WSEmitter } from './emitters/ws-emitter';
import { sanitizeAgentEventForFrontend } from '../agent/events/agent-public-event-projector';
import { getClientIpFromHeaders } from '@/common/utils';
import { ChatLogStatus } from '@/common/constants/status.constant';
import { AgentEvent, type AgentInitialMessagesWire } from '@99agent/contracts';
import { extractTurnFromMessage } from '../chatLog/unified-message.util';
import { ChatControlService } from './chat-control.service';
import type { ChatSubmissionOperation } from './chat-submission.service';
import { CHAT_SUBMISSION_ID_PATTERN } from './dto/chatProcess.dto';
import {
  errorResponseOf,
  isPublicError,
  publicErrorCode,
  publicErrorMessage,
} from './public-error.util';

/** chatLog.status 终态 → agent.end finishReason 映射（GENERATING 为非终态） */
const CHAT_LOG_TERMINAL_FINISH_REASON: Record<number, 'stop' | 'abort' | 'error'> = {
  [ChatLogStatus.COMPLETED]: 'stop',
  [ChatLogStatus.FAILED]: 'error',
  [ChatLogStatus.STOPPED]: 'abort',
};

interface GatewayAck<T = any> {
  ok: boolean;
  code?: string;
  message?: string;
  data?: T;
}

interface ChatProcessAckData {
  accepted: boolean;
  cid?: string;
  turnId?: string;
  conversationGid?: string;
  duplicate?: boolean;
  initialMessages?: AgentInitialMessagesWire;
}

interface ChatResyncAckData {
  accepted: boolean;
  cid: string;
  mode: 'buffer' | 'snapshot' | 'terminal';
  seq?: number;
  eventCount?: number;
  status?: string | number;
  finishReason?: 'stop' | 'abort' | 'error';
  terminal?: boolean;
}

@WebSocketGateway({
  path: '/api/socket.io',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly wsAuthValidator: WsAuthValidator,
    private readonly chatService: ChatService,
    private readonly workflowManager: WorkflowProcessManager,
    private readonly conversationTurnQueue: ConversationTurnQueue,
    private readonly chatControl: ChatControlService,
    private readonly chatLiveSyncService?: ChatLiveSyncService,
  ) {}

  afterInit(server: Server): void {
    this.chatLiveSyncService?.bindServer(server);
    // 握手阶段鉴权：通过才接受连接，客户端收到 connect 时 socket.data.user 已经就绪
    // （原来在 handleConnection 里 await，连接已被接受，鉴权完成前到达的包会被当成未登录）
    server.use(async (socket, next) => {
      const result = await this.wsAuthValidator.authenticate(socket);
      if ('user' in result) {
        socket.data.user = result.user;
        next();
        return;
      }
      next(Object.assign(new Error('WebSocket 鉴权失败'), { data: { code: result.code } }));
    });
  }

  private safeSnapshotMessage(message: any): string {
    if (!message) return '';
    return typeof message === 'string' ? message : JSON.stringify(message);
  }

  private emitGatewayError(
    client: Socket,
    cid: string | undefined,
    error: any,
    fallbackMessage: string,
  ): void {
    this.emitAgentEvent(client, {
      type: 'agent.error',
      chatId: cid || `socket:${client.id}`,
      ...(cid ? { messageId: cid } : {}),
      timestamp: Date.now(),
      data: {
        code: publicErrorCode(error),
        message: publicErrorMessage(error, fallbackMessage),
      },
    });
  }

  private emitAgentEvent(client: Socket, event: AgentEvent): void {
    void client.emit('agent:event', sanitizeAgentEventForFrontend(event));
  }

  private buildGatewayErrorAck(error: any, fallbackMessage: string): GatewayAck {
    const response = errorResponseOf(error);
    return {
      ok: false,
      code: publicErrorCode(error),
      message: publicErrorMessage(error, fallbackMessage),
      ...(isPublicError(error) && response && typeof response === 'object' && response.data
        ? { data: response.data }
        : {}),
    };
  }

  private logUnexpectedGatewayError(error: any, message: string): void {
    if (isPublicError(error)) return;
    Logger.error(message, undefined, 'ChatGateway');
  }

  private async resolveAssistantControlTarget(
    cid: string | undefined,
    user: any,
  ): Promise<{ chatId: number; cid: string }> {
    if (!cid) {
      throw { status: 400, message: '消息ID无效' };
    }
    const chatLog = await this.chatControl.resolveAssistantChatLogByCidForUser(cid, user);
    return { chatId: chatLog.id, cid: chatLog.cid };
  }

  /**
   * 启动 chatProcess 并等待首轮落库回调，统一封装 ack 脚手架。
   * chat:start 与 retry/continue 派生任务共用此流程。
   */
  private launchChatProcessWithAck(options: {
    client: Socket;
    body: Record<string, any>;
    startMessage: string;
    notAcceptedMessage: string;
    fallbackErrorMessage: string;
    submissionContext?: {
      operation?: ChatSubmissionOperation;
      strategy?: string;
    };
    /** chat:start 主链路在失败时额外向客户端推 agent.error */
    emitAgentErrorOnFailure?: boolean;
  }): Promise<GatewayAck<ChatProcessAckData>> {
    const { client, body } = options;
    const user = client.data.user;
    const submissionId =
      typeof body?.submissionId === 'string' && CHAT_SUBMISSION_ID_PATTERN.test(body.submissionId)
        ? body.submissionId
        : '';
    const emitter = new WSEmitter(client, submissionId);
    const clientIp = getClientIpFromHeaders(
      client.handshake?.headers || {},
      client.handshake?.address || '',
    );

    let ackSettled = false;
    let resolveAck: (value: GatewayAck<ChatProcessAckData>) => void = () => undefined;
    const ackPromise = new Promise<GatewayAck<ChatProcessAckData>>(resolve => {
      resolveAck = resolve;
    });
    const settleAck = (ack: GatewayAck<ChatProcessAckData>) => {
      if (ackSettled) return;
      ackSettled = true;
      resolveAck(ack);
    };

    const chatProcessPromise = this.chatService.chatProcess(
      { ...body, __clientIp: clientIp, __socketId: client.id },
      user,
      emitter,
      (
        chatId: number,
        initialMessages?: AgentInitialMessagesWire,
        commitContext?: ChatCommitContext,
      ) => {
        const chatRoom = `chat:${chatId}`;
        client.join(chatRoom);
        // 把该用户当前所有在线 socket 一并拉进本轮房间：
        // 排队接续轮（handoff）启动时最初捕获的 client 可能已因重连失效，
        // 单 socket 定向投递会让接续轮对新 socket 永远不可见
        this.server?.in(`user:${user.id}`).socketsJoin(chatRoom);
        // 切换 emitter 为 room emit
        emitter.setRoom(this.server, chatRoom);

        const turnId = String(initialMessages?.assistant?.turnId || '').trim();
        const turn = extractTurnFromMessage(initialMessages?.assistant?.message);
        const assistantCid = String(initialMessages?.assistant?.cid || `chat:${chatId}`);

        const startEvent: AgentEvent = {
          type: 'agent.start',
          chatId: assistantCid,
          messageId: assistantCid,
          ...(turnId ? { turnId } : {}),
          timestamp: Date.now(),
          data: {
            message: options.startMessage,
            initialMessages,
            // 用户的所有页签都在这一轮的房间里：发送方凭提交号认出自己的 agent.start
            ...(submissionId ? { submissionId } : {}),
            ...(turn ? { turn } : {}),
          },
        };
        // agent.start 走 room 广播而非旧 client 直发：接续轮场景旧 socket 可能已断开
        void this.server
          ?.to(chatRoom)
          .emit('agent:event', sanitizeAgentEventForFrontend(startEvent));

        settleAck({
          ok: true,
          data: {
            accepted: true,
            cid: assistantCid,
            ...(turnId ? { turnId } : {}),
          },
        });
      },
      'web',
      options.submissionContext,
    );

    void chatProcessPromise
      .then(result => {
        if (!ackSettled) {
          if (result?.duplicate) {
            settleAck({
              ok: true,
              data: {
                accepted: false,
                duplicate: true,
                cid: result.cid,
                turnId: result.turnId,
              },
            });
            return;
          }
          settleAck({
            ok: false,
            code: 'NOT_ACCEPTED',
            message: options.notAcceptedMessage,
          });
        }
      })
      .catch((error: any) => {
        const errorMessage = publicErrorMessage(error, options.fallbackErrorMessage);
        if (isPublicError(error)) {
          Logger.debug(`chatProcess 业务拦截: ${errorMessage}`, 'ChatGateway');
        } else {
          Logger.error('chatProcess 处理失败', undefined, 'ChatGateway');
        }
        if (options.emitAgentErrorOnFailure) {
          this.emitAgentEvent(client, {
            type: 'agent.error',
            chatId: `socket:${client.id}`,
            timestamp: Date.now(),
            data: {
              code: publicErrorCode(error),
              message: errorMessage,
              ...(submissionId ? { submissionId } : {}),
            },
          });
        }
        settleAck(this.buildGatewayErrorAck(error, options.fallbackErrorMessage));
      });

    return ackPromise;
  }

  private async enqueueContinuationTurn(
    client: Socket,
    payload: {
      cid?: string;
      turn?: Record<string, any>;
      expectedTurnId?: string;
    },
  ): Promise<
    GatewayAck<{
      replaced: boolean;
      queuedPrompt: string;
      parentTurnId?: string;
      conversationGid: string;
      submissionId: string;
      duplicate?: boolean;
    }>
  > {
    const user = client.data.user;
    if (!user) return { ok: false, code: 'UNAUTHORIZED', message: '请先登录后再继续操作' };
    const cid = payload?.cid;
    let target: { chatId: number; cid: string };
    try {
      target = await this.resolveAssistantControlTarget(cid, user);
    } catch (error) {
      this.emitGatewayError(client, cid, error, '无权操作此工作流或工作流不存在');
      return this.buildGatewayErrorAck(error, '无权操作此工作流或工作流不存在');
    }

    const context = this.workflowManager.getWorkflowForUser(target.chatId, user);
    if (!context) {
      this.emitAgentEvent(client, {
        type: 'agent.error',
        chatId: target.cid,
        messageId: target.cid,
        timestamp: Date.now(),
        data: { code: 'FORBIDDEN', message: '无权操作此工作流或工作流不存在' },
      });
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: '无权操作此工作流或工作流不存在',
      };
    }
    const turn = payload?.turn || {};
    const expectedTurnId = String(turn.expectedTurnId || payload?.expectedTurnId || '').trim();
    const activeTurnId = String(context.turnId || '').trim();
    if (!activeTurnId) {
      this.emitAgentEvent(client, {
        type: 'agent.error',
        chatId: target.cid,
        messageId: target.cid,
        timestamp: Date.now(),
        data: {
          code: 'TURN_NOT_FOUND',
          message: '当前任务缺少 turn 信息，请刷新后重试',
        },
      });
      return {
        ok: false,
        code: 'TURN_NOT_FOUND',
        message: '当前任务缺少 turn 信息，请刷新后重试',
      };
    }
    if (expectedTurnId && activeTurnId && expectedTurnId !== activeTurnId) {
      this.emitAgentEvent(client, {
        type: 'agent.error',
        chatId: target.cid,
        messageId: target.cid,
        ...(activeTurnId ? { turnId: activeTurnId } : {}),
        timestamp: Date.now(),
        data: {
          code: 'TURN_MISMATCH',
          message: '当前任务状态已变化，请刷新后重试',
        },
      });
      return {
        ok: false,
        code: 'TURN_MISMATCH',
        message: '当前任务状态已变化，请刷新后重试',
      };
    }

    const prompt = String(turn.prompt || '').trim();
    if (!prompt) {
      this.emitAgentEvent(client, {
        type: 'agent.error',
        chatId: target.cid,
        messageId: target.cid,
        timestamp: Date.now(),
        data: { code: 'BAD_REQUEST', message: '接续内容不能为空' },
      });
      return { ok: false, code: 'BAD_REQUEST', message: '接续内容不能为空' };
    }
    const submissionId = typeof turn.submissionId === 'string' ? turn.submissionId : '';
    if (!CHAT_SUBMISSION_ID_PATTERN.test(submissionId)) {
      this.emitAgentEvent(client, {
        type: 'agent.error',
        chatId: target.cid,
        messageId: target.cid,
        timestamp: Date.now(),
        data: { code: 'BAD_REQUEST', message: 'submissionId格式无效' },
      });
      return { ok: false, code: 'BAD_REQUEST', message: 'submissionId格式无效' };
    }

    const operation = context.operation;
    if (
      !operation ||
      operation.ownerKey !== String(user.id) ||
      operation.groupId <= 0 ||
      !context.conversationGid
    ) {
      this.emitAgentEvent(client, {
        type: 'agent.error',
        chatId: target.cid,
        messageId: target.cid,
        turnId: activeTurnId,
        timestamp: Date.now(),
        data: {
          code: 'TURN_NOT_FOUND',
          message: '当前任务缺少持久运行信息，请刷新后重试',
        },
      });
      return {
        ok: false,
        code: 'TURN_NOT_FOUND',
        message: '当前任务缺少持久运行信息，请刷新后重试',
      };
    }

    const clientIp = getClientIpFromHeaders(
      client.handshake?.headers || {},
      client.handshake?.address || '',
    );
    const conversationGid = context.conversationGid;
    const continuationPayload = {
      prompt,
      submissionId,
      parentTurnId: activeTurnId,
      gid: conversationGid,
      ...(turn.modelId === undefined ? {} : { modelId: turn.modelId }),
      ...(typeof turn.model === 'string' ? { model: turn.model } : {}),
      ...(typeof turn.modelName === 'string' ? { modelName: turn.modelName } : {}),
      ...(typeof turn.reasoningEffort === 'string'
        ? { reasoningEffort: turn.reasoningEffort }
        : {}),
    };
    let queued: { replaced: boolean; duplicate: boolean };
    try {
      queued = await this.conversationTurnQueue.enqueue({
        binding: {
          operationId: operation.operationId,
          parentAssistantLogId: target.chatId,
          parentTurnId: activeTurnId,
          ownerType: operation.ownerType,
          ownerKey: operation.ownerKey,
          groupId: operation.groupId,
          conversationGid,
          generation: operation.generation,
        },
        payload: continuationPayload,
        clientIp,
        sourceSocketId: client.id,
      });
    } catch (error) {
      this.logUnexpectedGatewayError(error, '接续消息入队出现未预期错误');
      this.emitGatewayError(client, target.cid, error, '接续消息入队失败，请刷新后重试');
      return this.buildGatewayErrorAck(error, '接续消息入队失败，请刷新后重试');
    }
    const { replaced, duplicate } = queued;

    this.emitAgentEvent(client, {
      type: 'turn.start',
      chatId: target.cid,
      messageId: target.cid,
      ...(activeTurnId ? { turnId: activeTurnId } : {}),
      timestamp: Date.now(),
      data: {
        nextAction: 'start_queued_turn',
        message: duplicate ? '下一轮要求已存在' : replaced ? '已更新下一轮要求' : '已加入下一轮',
        queuedPrompt: prompt,
        ...(activeTurnId ? { parentTurnId: activeTurnId } : {}),
        conversationGid,
      },
    });
    return {
      ok: true,
      data: {
        replaced,
        ...(duplicate ? { duplicate: true } : {}),
        queuedPrompt: prompt,
        ...(activeTurnId ? { parentTurnId: activeTurnId } : {}),
        conversationGid,
        submissionId,
      },
    };
  }

  private async cancelQueuedContinuationTurn(
    client: Socket,
    payload: { cid?: string; expectedTurnId?: string },
  ): Promise<GatewayAck<{ removed: boolean }>> {
    const user = client.data.user;
    if (!user) return { ok: false, code: 'UNAUTHORIZED', message: '请先登录后再继续操作' };

    const cid = payload?.cid;
    let target: { chatId: number; cid: string };
    try {
      target = await this.resolveAssistantControlTarget(cid, user);
    } catch (error) {
      this.emitGatewayError(client, cid, error, '无权操作此工作流或工作流不存在');
      return this.buildGatewayErrorAck(error, '无权操作此工作流或工作流不存在');
    }

    const context = this.workflowManager.getWorkflowForUser(target.chatId, user);
    if (!context) {
      this.emitAgentEvent(client, {
        type: 'agent.error',
        chatId: target.cid,
        messageId: target.cid,
        timestamp: Date.now(),
        data: { code: 'FORBIDDEN', message: '无权操作此工作流或工作流不存在' },
      });
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: '无权操作此工作流或工作流不存在',
      };
    }

    const expectedTurnId = String(payload?.expectedTurnId || '').trim();
    const activeTurnId = String(context.turnId || '').trim();
    if (!activeTurnId) {
      this.emitAgentEvent(client, {
        type: 'agent.error',
        chatId: target.cid,
        messageId: target.cid,
        timestamp: Date.now(),
        data: {
          code: 'TURN_NOT_FOUND',
          message: '当前任务缺少 turn 信息，请刷新后重试',
        },
      });
      return {
        ok: false,
        code: 'TURN_NOT_FOUND',
        message: '当前任务缺少 turn 信息，请刷新后重试',
      };
    }
    if (expectedTurnId && activeTurnId && expectedTurnId !== activeTurnId) {
      this.emitAgentEvent(client, {
        type: 'agent.error',
        chatId: target.cid,
        messageId: target.cid,
        ...(activeTurnId ? { turnId: activeTurnId } : {}),
        timestamp: Date.now(),
        data: {
          code: 'TURN_MISMATCH',
          message: '当前任务状态已变化，请刷新后重试',
        },
      });
      return {
        ok: false,
        code: 'TURN_MISMATCH',
        message: '当前任务状态已变化，请刷新后重试',
      };
    }

    const operation = context.operation;
    if (!operation || operation.ownerKey !== String(user.id) || !context.conversationGid) {
      return {
        ok: false,
        code: 'TURN_NOT_FOUND',
        message: '当前任务缺少持久运行信息，请刷新后重试',
      };
    }
    let removed = false;
    try {
      removed = await this.conversationTurnQueue.clear({
        operationId: operation.operationId,
        parentAssistantLogId: target.chatId,
        parentTurnId: activeTurnId,
        ownerType: operation.ownerType,
        ownerKey: operation.ownerKey,
        groupId: operation.groupId,
        conversationGid: context.conversationGid,
        generation: operation.generation,
      });
    } catch (error) {
      this.logUnexpectedGatewayError(error, '接续消息删除出现未预期错误');
      this.emitGatewayError(client, target.cid, error, '删除下一轮要求失败，请刷新后重试');
      return this.buildGatewayErrorAck(error, '删除下一轮要求失败，请刷新后重试');
    }
    this.emitAgentEvent(client, {
      type: 'turn.end',
      chatId: target.cid,
      messageId: target.cid,
      ...(activeTurnId ? { turnId: activeTurnId } : {}),
      timestamp: Date.now(),
      data: {
        finishReason: 'stop',
        message: removed ? '已删除下一轮要求' : '没有待删除的下一轮要求',
        ...(activeTurnId ? { parentTurnId: activeTurnId } : {}),
      },
    });
    return { ok: true, data: { removed } };
  }

  handleConnection(client: Socket): void {
    // 握手中间件已经鉴权（afterInit）；没有用户说明中间件没装上，按未鉴权断开
    const user = client.data?.user;
    if (!user) {
      Logger.warn('WebSocket 连接缺少鉴权结果，已断开', 'ChatGateway');
      client.disconnect(true);
      return;
    }

    // 每个入站包重新校验：失败时尽力回执原因、不执行业务处理器，然后断开（离开房间，不再收广播）；
    // 客户端按「服务端断开 → HTTP 核对身份」恢复，暂时故障时以同一凭证重连
    client.use(async (packet, next) => {
      const result = await this.wsAuthValidator.authenticate(client);
      if ('user' in result) {
        client.data.user = result.user;
        next();
        return;
      }
      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') {
        ack({ ok: false, code: result.code, message: WS_AUTH_FAILURE_MESSAGES[result.code] });
      }
      client.disconnect(true);
    });
    client.join(`user:${user.id}`);
    Logger.log('WebSocket 已连接', 'ChatGateway');
  }

  handleDisconnect(client: Socket): void {
    if (client.data?.user) Logger.log('WebSocket 已断开', 'ChatGateway');
  }

  /**
   * 开始聊天
   */
  @SubscribeMessage('chat:start')
  async handleChatStart(client: Socket, payload: any): Promise<GatewayAck<ChatProcessAckData>> {
    const user = client.data.user;
    if (!user) {
      this.emitAgentEvent(client, {
        type: 'agent.error',
        chatId: `socket:${client.id}`,
        data: { code: 'UNAUTHORIZED', message: '请先登录' },
        timestamp: Date.now(),
      });
      return { ok: false, code: 'UNAUTHORIZED', message: '请先登录' };
    }

    return this.launchChatProcessWithAck({
      client,
      body: payload,
      startMessage: '正在准备...',
      notAcceptedMessage: '请求未创建消息，请稍后再试',
      fallbackErrorMessage: '处理请求时发生错误，请稍后再试',
      emitAgentErrorOnFailure: true,
    });
  }

  /**
   * 停止生成。归属校验与停止逻辑统一在 ChatControlService.stopChat（与 HTTP fallback 同一实现）。
   * 结果只经回执返回：被拒时不再另推 agent.error（那会让仍在生成的回复显示成出错）
   */
  @SubscribeMessage('chat:stop')
  async handleStop(
    client: Socket,
    payload: { cid: string },
  ): Promise<GatewayAck<{ stopped: boolean; status: string }>> {
    const user = client.data.user;
    if (!user) return { ok: false, code: 'UNAUTHORIZED', message: '请先登录' };

    try {
      const result = await this.chatControl.stopChat(payload?.cid, user);
      return { ok: true, data: { stopped: result.stopped, status: result.status } };
    } catch (error) {
      this.logUnexpectedGatewayError(error, '停止请求出现未预期错误');
      return this.buildGatewayErrorAck(error, '停止失败，请稍后重试');
    }
  }

  /**
   * 生成中提交下一轮用户消息。
   */
  @SubscribeMessage('chat:queueTurn')
  handleQueueTurn(
    client: Socket,
    payload: { cid: string; turn: Record<string, any> },
  ): Promise<GatewayAck> {
    return this.enqueueContinuationTurn(client, payload);
  }

  /**
   * 删除已提交但尚未执行的下一轮用户消息。
   */
  @SubscribeMessage('chat:cancelQueuedTurn')
  handleCancelQueuedTurn(
    client: Socket,
    payload: { cid: string; expectedTurnId?: string },
  ): Promise<GatewayAck> {
    return this.cancelQueuedContinuationTurn(client, payload);
  }

  /**
   * 重新同步状态（含归属校验）。
   * 客户端携带 afterSeq 时优先增量补发缓冲事件；否则回退全量快照。
   * 内存无运行中工作流时以数据库 chatLog 状态为准。
   */
  @SubscribeMessage('chat:resync')
  async handleResync(
    client: Socket,
    payload: { cid: string; afterSeq?: number },
  ): Promise<GatewayAck<ChatResyncAckData>> {
    const user = client.data.user;
    if (!user) {
      return { ok: false, code: 'UNAUTHORIZED', message: '请先登录后再继续操作' };
    }

    const cid = payload?.cid;
    let chatId: number;
    let resyncCid: string;
    try {
      const target = await this.resolveAssistantControlTarget(cid, user);
      chatId = target.chatId;
      resyncCid = target.cid;
    } catch (error) {
      this.emitGatewayError(client, cid, error, '无权访问此对话');
      return this.buildGatewayErrorAck(error, '无权访问此对话');
    }

    // 加入 room（room emit 模式下确保收到后续事件）
    client.join(`chat:${chatId}`);

    // 内存有运行中工作流：内存是唯一事实源
    const memSnapshot = this.workflowManager.getResyncSnapshot(chatId);
    if (memSnapshot) {
      // 增量补发：客户端已有 afterSeq 之前的事件，缓冲可覆盖时直接重放
      const afterSeq = Number(payload?.afterSeq);
      if (Number.isFinite(afterSeq) && afterSeq >= 0) {
        const buffered = this.workflowManager.getBufferedEventsAfter(chatId, afterSeq);
        if (buffered) {
          for (const event of buffered) {
            // 缓冲内事件在出站时已完成投影脱敏，原样重放
            void client.emit('agent:event', event);
          }
          Logger.log(
            `chat:resync 增量补发, chatId: ${chatId}, afterSeq: ${afterSeq}, 事件数: ${buffered.length}`,
            'ChatGateway',
          );
          return {
            ok: true,
            data: {
              accepted: true,
              cid: resyncCid,
              mode: 'buffer',
              seq: this.workflowManager.getEventSeq(chatId),
              eventCount: buffered.length,
            },
          };
        }
      }

      const memTurn = memSnapshot.turn || extractTurnFromMessage(memSnapshot.message);
      const memTurnId = memSnapshot.turnId || memTurn?.id;
      this.emitAgentEvent(client, {
        type: 'snapshot.sync',
        // 快照对齐点：客户端以此为后续增量的 seq 基准
        seq: memSnapshot.eventSeq,
        workflowSeq: memSnapshot.eventSeq,
        chatId: resyncCid,
        messageId: resyncCid,
        ...(memTurnId ? { turnId: memTurnId } : {}),
        timestamp: Date.now(),
        data: {
          reason: 'resync',
          content: memSnapshot.content || '',
          thinking: memSnapshot.thinking || '',
          message: this.safeSnapshotMessage(memSnapshot.message),
          status: memSnapshot.status ?? 'streaming',
          ...(memTurn ? { turn: memTurn, turnStatus: memTurn.status } : {}),
          ...(memSnapshot.usage ? { usage: memSnapshot.usage } : {}),
          ...(memSnapshot.finishReason ? { finishReason: memSnapshot.finishReason } : {}),
        },
      });
      Logger.log(
        `chat:resync 发送快照, chatId: ${chatId}, content长度: ${memSnapshot.content.length}`,
        'ChatGateway',
      );
      return {
        ok: true,
        data: {
          accepted: true,
          cid: resyncCid,
          mode: 'snapshot',
          seq: memSnapshot.eventSeq,
          eventCount: 1,
          status: memSnapshot.status ?? 'streaming',
        },
      };
    }

    // 内存没有：以数据库 chatLog 为准
    let finalLog = await this.chatControl.getChatLogForResync(chatId);
    if (!finalLog) {
      this.emitAgentEvent(client, {
        type: 'agent.end',
        chatId: resyncCid,
        messageId: resyncCid,
        timestamp: Date.now(),
        data: { finishReason: 'error' },
      });
      return {
        ok: true,
        data: {
          accepted: true,
          cid: resyncCid,
          mode: 'terminal',
          eventCount: 1,
          finishReason: 'error',
          terminal: true,
        },
      };
    }

    let terminalFinishReason = CHAT_LOG_TERMINAL_FINISH_REASON[Number(finalLog.status)];
    if (!terminalFinishReason) {
      // DB 仍是生成中但内存无 workflow：在同一事务内同步收口 ChatLog、turn 与 Work task。
      await this.chatControl.recoverOrphanedTurn(chatId);
      finalLog = (await this.chatControl.getChatLogForResync(chatId)) || finalLog;
      terminalFinishReason = CHAT_LOG_TERMINAL_FINISH_REASON[Number(finalLog.status)];
      Logger.warn(`chat:resync 内存无 workflow，已收口孤儿执行: chatId=${chatId}`, 'ChatGateway');
    }

    const finalTurn = extractTurnFromMessage(finalLog.message);
    const finalTurnId = finalTurn?.id;

    this.emitAgentEvent(client, {
      type: 'snapshot.sync',
      chatId: resyncCid,
      messageId: resyncCid,
      ...(finalTurnId ? { turnId: finalTurnId } : {}),
      timestamp: Date.now(),
      data: {
        reason: 'resync',
        content: finalLog.content || '',
        message: finalLog.message || '',
        status: finalLog.status,
        finishReason: terminalFinishReason,
        ...(finalTurn ? { turn: finalTurn, turnStatus: finalTurn.status } : {}),
      },
    });

    this.emitAgentEvent(client, {
      type: 'agent.end',
      chatId: resyncCid,
      messageId: resyncCid,
      ...(finalTurnId ? { turnId: finalTurnId } : {}),
      timestamp: Date.now(),
      data: {
        finishReason: terminalFinishReason || 'error',
        ...(terminalFinishReason ? {} : { cid: resyncCid }),
        ...(finalTurn ? { turn: finalTurn, turnStatus: finalTurn.status } : {}),
      },
    });

    Logger.log(`chat:resync, chatId: ${chatId}, dbStatus: ${finalLog.status}`, 'ChatGateway');
    return {
      ok: true,
      data: {
        accepted: true,
        cid: resyncCid,
        mode: 'terminal',
        eventCount: 2,
        status: finalLog.status,
        finishReason: terminalFinishReason || 'error',
        terminal: true,
      },
    };
  }
}
