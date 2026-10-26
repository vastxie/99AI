import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { createUnsafeFrontendMessageString } from '../../test/factories/chat-log.factory';
import { createMockSocket } from '../../test/mocks/socket.mock';
import { stringifyFrontendMessage } from '../chatLog/tool-result-payload';
import { ChatGateway } from './chat.gateway';
import type { ChatTurnCreatedCallback } from './chat-turn-run';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const legacyRawMessage = createUnsafeFrontendMessageString();
const assistantCid = 'c_assistant000000000000000001';
const userCid = 'c_user000000000000000000000001';
const queuedSubmissionId = 'sub_queue_0123456789';

function activeWorkflow(overrides: Record<string, any> = {}) {
  return {
    userId: 7,
    turnId: 'turn_active',
    conversationGid: 'g_abcdefghijklmnopqrstuvwx',
    operation: {
      operationId: 'op_turn_active',
      generation: 1,
      groupId: 3,
      ownerType: 'user',
      ownerKey: '7',
    },
    ...overrides,
  };
}

function expectNoRawToolSecrets(value: any) {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain('SECRET_TOKEN');
  expect(serialized).not.toContain('SECRET_API_KEY');
  expect(serialized).not.toContain('SECRET_BEARER');
  expect(serialized).not.toContain('STDOUT_SECRET');
  expect(serialized).not.toContain('RAW_SECRET');
  expect(serialized).not.toContain('PROVIDER_SECRET');
}

function agentEvents(socket: any) {
  return socket.emit.mock.calls
    .filter((call: any[]) => call[0] === 'agent:event')
    .map((call: any[]) => call[1]);
}

/** agent.start 走 room 广播（server.to(room).emit），从 server mock 上取事件；
 * to 为 mockReturnValue，所有调用共享同一个 emit mock */
function roomAgentEvents(gateway: any) {
  const emit = gateway.server.to.mock.results[0]?.value?.emit;
  if (!emit) return [];
  return emit.mock.calls
    .filter((call: any[]) => call[0] === 'agent:event')
    .map((call: any[]) => call[1]);
}

describe('ChatGateway lightweight exits', () => {
  let chatService: any;
  let chatControl: any;
  let workflowManager: any;
  let conversationTurnQueue: any;
  let wsAuthValidator: any;
  let gateway: ChatGateway;

  beforeEach(() => {
    chatService = {
      chatProcess: jest.fn(),
    };
    chatControl = {
      stopChat: jest.fn(),
      verifyChatOwner: jest.fn(),
      resolveAssistantChatLogByCidForUser: jest.fn(),
      getChatLogForResync: jest.fn(),
      recoverOrphanedTurn: jest.fn(),
    };
    workflowManager = {
      getWorkflowForUser: jest.fn(),
      stop: jest.fn(),
      getPublicCid: jest.fn(),
      getRunningSnapshot: jest.fn(),
      getResyncSnapshot: jest.fn(),
      getBufferedEventsAfter: jest.fn(),
      getEventSeq: jest.fn().mockReturnValue(0),
    };
    conversationTurnQueue = {
      enqueue: jest.fn(),
      clear: jest.fn(),
    };
    wsAuthValidator = {
      authenticate: jest.fn(),
    };
    gateway = new ChatGateway(
      wsAuthValidator,
      chatService,
      workflowManager,
      conversationTurnQueue,
      chatControl,
    );
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      in: jest.fn().mockReturnValue({ socketsJoin: jest.fn() }),
    };
  });

  it('emits UNAUTHORIZED for chat:start without a socket user', async () => {
    const socket = createMockSocket(jest.fn, { data: {} });

    const ack = await gateway.handleChatStart(socket as any, { prompt: 'hello' });

    expect(ack).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(agentEvents(socket)[0]).toMatchObject({
      type: 'agent.error',
      data: { code: 'UNAUTHORIZED' },
    });
    expect(chatService.chatProcess).not.toHaveBeenCalled();
  });

  it('emits FORBIDDEN for chat:start business owner rejections', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatService.chatProcess.mockRejectedValue({ status: 403, message: '无权访问此对话分组' });

    const ack = await gateway.handleChatStart(socket as any, { prompt: 'hello' });

    expect(ack).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
      message: '无权访问此对话分组',
    });
    expect(agentEvents(socket)[0]).toMatchObject({
      type: 'agent.error',
      data: { code: 'FORBIDDEN', message: '无权访问此对话分组' },
    });
  });

  it('classifies payment refusals (HTTP 402) as PAYMENT_REQUIRED so the client can offer purchase', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatService.chatProcess.mockRejectedValue(
      new HttpException('synthetic balance message', HttpStatus.PAYMENT_REQUIRED),
    );

    const ack = await gateway.handleChatStart(socket as any, { prompt: 'hello' });

    expect(ack).toMatchObject({ ok: false, code: 'PAYMENT_REQUIRED' });
    expect(agentEvents(socket)[0]).toMatchObject({
      type: 'agent.error',
      data: { code: 'PAYMENT_REQUIRED', message: 'synthetic balance message' },
    });
  });

  it('tags a start failure with its submission and carries refusal details in the ack', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatService.chatProcess.mockRejectedValue(
      new HttpException(
        { code: 'REPLACE_RANGE_CHANGED', message: '对不上', data: { laterTurns: 4 } },
        HttpStatus.CONFLICT,
      ),
    );

    const ack = await gateway.handleChatStart(socket as any, {
      prompt: 'hello',
      submissionId: 'submission-gateway-fail-1',
    });

    expect(ack).toMatchObject({
      ok: false,
      code: 'REPLACE_RANGE_CHANGED',
      data: { laterTurns: 4 },
    });
    expect(agentEvents(socket)[0]).toMatchObject({
      type: 'agent.error',
      data: { code: 'REPLACE_RANGE_CHANGED', submissionId: 'submission-gateway-fail-1' },
    });
  });

  it('does not expose an unexpected chat:start failure in ack, events, or logs', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    const marker = 'SECRET_SQL_MARKER_chat_start_internal';
    chatService.chatProcess.mockRejectedValue(new Error(`SELECT ${marker}`));
    const logger = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);

    const ack = await gateway.handleChatStart(socket as any, { prompt: 'hello' });

    expect(ack).toEqual({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: '处理请求时发生错误，请稍后再试',
    });
    expect(agentEvents(socket)[0]).toMatchObject({
      data: {
        code: 'INTERNAL_ERROR',
        message: '处理请求时发生错误，请稍后再试',
      },
    });
    expect(JSON.stringify([ack, agentEvents(socket), logger.mock.calls])).not.toContain(marker);
    expect(logger).toHaveBeenCalledWith('chatProcess 处理失败', undefined, 'ChatGateway');
    logger.mockRestore();
  });

  it('emits initial persisted messages after chat:start creates chat ids', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    const fileId = 'file_gatewaystartaaaaaaaaaaaa';
    chatService.chatProcess.mockImplementation(
      async (
        _payload: unknown,
        _user: unknown,
        _emitter: unknown,
        onChatIdCreated: ChatTurnCreatedCallback,
      ) => {
        onChatIdCreated(
          51,
          {
            user: { cid: userCid, role: 'user', content: 'hello' },
            assistant: {
              cid: assistantCid,
              content: '',
              role: 'assistant',
              loading: true,
              message: stringifyFrontendMessage(
                {
                  role: 'assistant',
                  content: 'preparing file',
                  rounds: [
                    {
                      toolCalls: [
                        {
                          id: 'tool_gateway_file',
                          status: 'success',
                          output: {
                            files: [
                              {
                                fileId,
                                name: 'gateway.pdf',
                                previewUrl: `/api/files/${fileId}/preview`,
                                downloadUrl: `/api/files/${fileId}/download`,
                              },
                            ],
                          },
                        },
                      ],
                    },
                  ],
                },
                { exposePrivateFileDownloads: true },
              ),
            },
          },
          {},
        );
      },
    );

    const ack = await gateway.handleChatStart(socket as any, {
      prompt: 'hello',
      submissionId: 'submission-gateway-start-01',
    });

    expect(ack).toMatchObject({
      ok: true,
      data: {
        accepted: true,
        cid: assistantCid,
      },
    });
    const startEvent = roomAgentEvents(gateway)[0];
    expect(startEvent).toMatchObject({
      type: 'agent.start',
      chatId: assistantCid,
      messageId: assistantCid,
      data: {
        message: '正在准备...',
        submissionId: 'submission-gateway-start-01',
        initialMessages: {
          user: { cid: userCid, content: 'hello' },
          assistant: { cid: assistantCid, content: '', loading: true },
        },
      },
    });
    expect(startEvent).not.toHaveProperty('taskId');
    expect(startEvent).not.toHaveProperty('taskStatus');
    expect(startEvent).not.toHaveProperty('conversationGid');
    expect(startEvent.data.initialMessages.user).not.toHaveProperty('chatId');
    expect(startEvent.data.initialMessages.assistant).not.toHaveProperty('chatId');
    expect(JSON.stringify(startEvent)).toContain('gateway.pdf');
    expect(JSON.stringify(startEvent)).not.toContain(`/api/files/${fileId}/preview`);
    expect(JSON.stringify(startEvent)).not.toContain(`/api/files/${fileId}/download`);
  });

  it('leaves a malformed submission id out of agent.start', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatService.chatProcess.mockImplementation(
      async (
        _payload: unknown,
        _user: unknown,
        _emitter: unknown,
        onChatIdCreated: ChatTurnCreatedCallback,
      ) => {
        onChatIdCreated(
          52,
          {
            user: { cid: userCid, role: 'user', content: 'hello' },
            assistant: { cid: assistantCid, content: '', role: 'assistant', loading: true },
          },
          {},
        );
      },
    );

    await gateway.handleChatStart(socket as any, { prompt: 'hello', submissionId: '<script>' });

    expect(roomAgentEvents(gateway)[0].data).not.toHaveProperty('submissionId');
  });

  it('handles disconnect without socket-level bookkeeping', () => {
    jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });

    expect(gateway.handleDisconnect(socket as any)).toBeUndefined();
  });

  it.each([
    ['SESSION_INVALID', '登录状态已失效，请刷新后重试'],
    ['SESSION_UNAVAILABLE', '服务暂时不可用，请稍后重试'],
  ])(
    'answers a packet that fails revalidation with %s, skips the handler and disconnects',
    async (code: string, message: string) => {
      wsAuthValidator.authenticate.mockResolvedValue({ code });
      const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } }, use: jest.fn() });

      gateway.handleConnection(socket as any);

      expect(socket.use).toHaveBeenCalledTimes(1);
      const middleware = socket.use.mock.calls[0][0];
      const next = jest.fn();
      const ack = jest.fn();
      await middleware(['chat:start', {}, ack], next);
      expect(ack).toHaveBeenCalledWith({ ok: false, code, message });
      expect(next).not.toHaveBeenCalled();
      expect(socket.disconnect).toHaveBeenCalledWith(true);

      // 没有回执的包：只断开
      const noAckNext = jest.fn();
      await middleware(['chat:queueTurn', {}], noAckNext);
      expect(noAckNext).not.toHaveBeenCalled();
      expect(socket.disconnect).toHaveBeenCalledTimes(2);
    },
  );

  it('refreshes the user on a packet that passes revalidation', async () => {
    wsAuthValidator.authenticate.mockResolvedValue({ user: { id: 7, role: 'user', fresh: true } });
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } }, use: jest.fn() });

    gateway.handleConnection(socket as any);
    const next = jest.fn();
    await socket.use.mock.calls[0][0](['chat:start', {}], next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user).toEqual({ id: 7, role: 'user', fresh: true });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a connection that reached handleConnection without a handshake user', () => {
    const socket = createMockSocket(jest.fn, { data: {}, use: jest.fn() });
    gateway.handleConnection(socket as any);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.use).not.toHaveBeenCalled();
  });

  it('authenticates in the handshake middleware before the connection is accepted', async () => {
    const server = { use: jest.fn() };
    gateway.afterInit(server as any);
    const middleware = server.use.mock.calls[0][0];

    wsAuthValidator.authenticate.mockResolvedValueOnce({ user: { id: 7 } });
    const accepted = { data: {} as any };
    const next = jest.fn();
    await middleware(accepted, next);
    expect(next).toHaveBeenCalledWith();
    expect(accepted.data.user).toEqual({ id: 7 });

    wsAuthValidator.authenticate.mockResolvedValueOnce({ code: 'SESSION_UNAVAILABLE' });
    const rejectedNext = jest.fn();
    await middleware({ data: {} }, rejectedNext);
    const error = rejectedNext.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('WebSocket 鉴权失败');
    expect(error.data).toEqual({ code: 'SESSION_UNAVAILABLE' });
  });

  it('answers chat:stop with an ack instead of an agent.error when the service rejects it', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.stopChat.mockRejectedValue({ status: 403, message: '无权操作此任务' });

    await expect(gateway.handleStop(socket as any, { cid: assistantCid })).resolves.toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: '无权操作此任务',
    });
    expect(agentEvents(socket)).toEqual([]);
  });

  it('returns the shared ChatControlService result in the chat:stop ack', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.stopChat.mockResolvedValue({ stopped: true, status: 'stopped' });

    await expect(gateway.handleStop(socket as any, { cid: assistantCid })).resolves.toEqual({
      ok: true,
      data: { stopped: true, status: 'stopped' },
    });
    expect(chatControl.stopChat).toHaveBeenCalledWith(assistantCid, { id: 7 });
    expect(agentEvents(socket)).toEqual([]);
  });

  it('passes the reply status through when the reply had already ended', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.stopChat.mockResolvedValue({ stopped: true, status: 'completed' });

    await expect(gateway.handleStop(socket as any, { cid: assistantCid })).resolves.toEqual({
      ok: true,
      data: { stopped: true, status: 'completed' },
    });
  });

  it('answers chat:stop from an unauthenticated socket without calling the service', async () => {
    const socket = createMockSocket(jest.fn, { data: {} });

    await expect(gateway.handleStop(socket as any, { cid: assistantCid })).resolves.toEqual({
      ok: false,
      code: 'UNAUTHORIZED',
      message: '请先登录',
    });
    expect(chatControl.stopChat).not.toHaveBeenCalled();
    expect(agentEvents(socket)).toEqual([]);
  });

  it('acks user message cids and missing durable operations as bad requests', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.stopChat.mockRejectedValueOnce({ status: 400, message: '只能操作助手消息' });
    chatControl.stopChat.mockRejectedValueOnce({
      status: 409,
      message: '当前任务缺少持久运行信息，请刷新后重试',
    });

    await expect(gateway.handleStop(socket as any, { cid: userCid })).resolves.toEqual({
      ok: false,
      code: 'BAD_REQUEST',
      message: '只能操作助手消息',
    });
    await expect(gateway.handleStop(socket as any, { cid: assistantCid })).resolves.toEqual({
      ok: false,
      code: 'BAD_REQUEST',
      message: '当前任务缺少持久运行信息，请刷新后重试',
    });
    expect(agentEvents(socket)).toEqual([]);
  });

  it('acks unexpected stop failures with the public fallback message', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.stopChat.mockRejectedValue(
      new Error('Agent operation cancel store is unavailable'),
    );

    await expect(gateway.handleStop(socket as any, { cid: assistantCid })).resolves.toEqual({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: '停止失败，请稍后重试',
    });
    expect(agentEvents(socket)).toEqual([]);
  });

  it('blocks chat:queueTurn for workflows not owned by the socket user', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(null);

    await gateway.handleQueueTurn(socket as any, {
      cid: assistantCid,
      turn: { prompt: 'more context' },
    });

    const event = agentEvents(socket)[0];
    expect(event).toMatchObject({
      type: 'agent.error',
      chatId: assistantCid,
      messageId: assistantCid,
      data: { code: 'FORBIDDEN' },
    });
    expect(conversationTurnQueue.enqueue).not.toHaveBeenCalled();
  });

  it('queues chat:queueTurn for owned workflows and binds it to the active turn', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());
    conversationTurnQueue.enqueue.mockResolvedValue({ replaced: false, duplicate: false });

    const ack = await gateway.handleQueueTurn(socket as any, {
      cid: assistantCid,
      turn: {
        prompt: 'more context',
        submissionId: queuedSubmissionId,
        modelId: 2,
        expectedTurnId: 'turn_active',
      },
    });

    expect(conversationTurnQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({
          operationId: 'op_turn_active',
          parentAssistantLogId: 50,
          parentTurnId: 'turn_active',
          ownerType: 'user',
          ownerKey: '7',
          groupId: 3,
          conversationGid: 'g_abcdefghijklmnopqrstuvwx',
          generation: 1,
        }),
        payload: expect.objectContaining({
          prompt: 'more context',
          submissionId: queuedSubmissionId,
          modelId: 2,
          parentTurnId: 'turn_active',
          gid: 'g_abcdefghijklmnopqrstuvwx',
        }),
      }),
    );
    const event = agentEvents(socket)[0];
    expect(event).toMatchObject({
      type: 'turn.start',
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: 'turn_active',
      data: {
        nextAction: 'start_queued_turn',
        message: '已加入下一轮',
        queuedPrompt: 'more context',
        parentTurnId: 'turn_active',
        conversationGid: 'g_abcdefghijklmnopqrstuvwx',
      },
    });
    expect(ack).toMatchObject({
      ok: true,
      data: {
        queuedPrompt: 'more context',
        parentTurnId: 'turn_active',
        conversationGid: 'g_abcdefghijklmnopqrstuvwx',
        submissionId: queuedSubmissionId,
      },
    });
  });

  it('does not trust client-provided gid when queueing a continuation turn', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());
    conversationTurnQueue.enqueue.mockResolvedValue({ replaced: false, duplicate: false });

    await gateway.handleQueueTurn(socket as any, {
      cid: assistantCid,
      turn: {
        prompt: 'more context',
        submissionId: queuedSubmissionId,
        gid: 'g_zzzzzzzzzzzzzzzzzzzzzzzz',
        expectedTurnId: 'turn_active',
      },
    });

    expect(conversationTurnQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          gid: 'g_abcdefghijklmnopqrstuvwx',
        }),
      }),
    );
  });

  it('rejects chat:queueTurn without a valid client-issued submissionId', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());
    conversationTurnQueue.enqueue.mockResolvedValue({ replaced: false, duplicate: false });

    const ack = await gateway.handleQueueTurn(socket as any, {
      cid: assistantCid,
      turn: { prompt: 'missing id', expectedTurnId: 'turn_active' },
    });

    expect(ack).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
    expect(agentEvents(socket)[0]).toMatchObject({
      data: { code: 'BAD_REQUEST', message: 'submissionId格式无效' },
    });
    expect(conversationTurnQueue.enqueue).not.toHaveBeenCalled();
  });

  it('acks the same durable queued action idempotently', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());
    conversationTurnQueue.enqueue.mockResolvedValue({ replaced: false, duplicate: true });

    const ack = await gateway.handleQueueTurn(socket as any, {
      cid: assistantCid,
      turn: {
        prompt: 'same follow up',
        submissionId: queuedSubmissionId,
        expectedTurnId: 'turn_active',
      },
    });

    expect(ack).toMatchObject({
      ok: true,
      data: {
        duplicate: true,
        replaced: false,
        submissionId: queuedSubmissionId,
      },
    });
    expect(conversationTurnQueue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('rejects a queued replacement that reuses a submissionId for another payload', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());
    conversationTurnQueue.enqueue.mockRejectedValue({
      code: 'SUBMISSION_CONFLICT',
      message: 'submissionId 已用于另一项请求',
    });

    const ack = await gateway.handleQueueTurn(socket as any, {
      cid: assistantCid,
      turn: {
        prompt: 'different payload',
        submissionId: queuedSubmissionId,
        expectedTurnId: 'turn_active',
      },
    });

    expect(ack).toMatchObject({ ok: false, code: 'SUBMISSION_CONFLICT' });
    expect(agentEvents(socket)[0]).toMatchObject({
      data: { code: 'SUBMISSION_CONFLICT' },
    });
    expect(conversationTurnQueue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('does not expose an unexpected queue database error in ack or public events', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());
    const marker = 'SECRET_SQL_MARKER_agent_continuation_inbox_op_internal';
    conversationTurnQueue.enqueue.mockRejectedValue(new Error(`SELECT ${marker}`));
    const logger = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);

    const ack = await gateway.handleQueueTurn(socket as any, {
      cid: assistantCid,
      turn: {
        prompt: 'safe public prompt',
        submissionId: queuedSubmissionId,
        expectedTurnId: 'turn_active',
      },
    });

    expect(ack).toEqual({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: '接续消息入队失败，请刷新后重试',
    });
    expect(agentEvents(socket)[0]).toMatchObject({
      data: {
        code: 'INTERNAL_ERROR',
        message: '接续消息入队失败，请刷新后重试',
      },
    });
    expect(JSON.stringify([ack, agentEvents(socket)])).not.toContain(marker);
    expect(logger).toHaveBeenCalledWith('接续消息入队出现未预期错误', undefined, 'ChatGateway');
    logger.mockRestore();
  });

  it('replaces a queued action only when the client issues a fresh submissionId', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    const replacementSubmissionId = 'sub_queue_replacement_012345';
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());
    conversationTurnQueue.enqueue.mockResolvedValue({ replaced: true, duplicate: false });

    const ack = await gateway.handleQueueTurn(socket as any, {
      cid: assistantCid,
      turn: {
        prompt: 'replacement payload',
        submissionId: replacementSubmissionId,
        expectedTurnId: 'turn_active',
      },
    });

    expect(conversationTurnQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          prompt: 'replacement payload',
          submissionId: replacementSubmissionId,
        }),
      }),
    );
    expect(ack).toMatchObject({
      ok: true,
      data: {
        replaced: true,
        submissionId: replacementSubmissionId,
      },
    });
  });

  it('rejects stale chat:queueTurn requests for a changed active turn', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());

    const ack = await gateway.handleQueueTurn(socket as any, {
      cid: assistantCid,
      turn: { prompt: 'more context', expectedTurnId: 'turn_stale' },
    });

    const event = agentEvents(socket)[0];
    expect(event).toMatchObject({
      type: 'agent.error',
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: 'turn_active',
      data: { code: 'TURN_MISMATCH' },
    });
    expect(ack).toMatchObject({ ok: false, code: 'TURN_MISMATCH' });
    expect(conversationTurnQueue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects chat:queueTurn when the running workflow has no turn id', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow({ turnId: '' }));

    const ack = await gateway.handleQueueTurn(socket as any, {
      cid: assistantCid,
      turn: { prompt: 'more context' },
    });

    expect(ack).toMatchObject({ ok: false, code: 'TURN_NOT_FOUND' });
    expect(conversationTurnQueue.enqueue).not.toHaveBeenCalled();
  });

  it('clears queued chat:cancelQueuedTurn for owned workflows and emits a status event', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());
    conversationTurnQueue.clear.mockResolvedValue(true);

    await gateway.handleCancelQueuedTurn(socket as any, {
      cid: assistantCid,
      expectedTurnId: 'turn_active',
    });

    expect(conversationTurnQueue.clear).toHaveBeenCalledWith({
      operationId: 'op_turn_active',
      parentAssistantLogId: 50,
      parentTurnId: 'turn_active',
      ownerType: 'user',
      ownerKey: '7',
      groupId: 3,
      conversationGid: 'g_abcdefghijklmnopqrstuvwx',
      generation: 1,
    });
    const event = agentEvents(socket)[0];
    expect(event).toMatchObject({
      type: 'turn.end',
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: 'turn_active',
      data: {
        finishReason: 'stop',
        message: '已删除下一轮要求',
        parentTurnId: 'turn_active',
      },
    });
  });

  it('does not expose an unexpected queued-turn clear database error', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());
    const marker = 'SECRET_SQL_MARKER_parent_operation_internal';
    conversationTurnQueue.clear.mockRejectedValue(new Error(`deadlock ${marker}`));
    const logger = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);

    const ack = await gateway.handleCancelQueuedTurn(socket as any, {
      cid: assistantCid,
      expectedTurnId: 'turn_active',
    });

    expect(ack).toEqual({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: '删除下一轮要求失败，请刷新后重试',
    });
    expect(agentEvents(socket)[0]).toMatchObject({
      data: {
        code: 'INTERNAL_ERROR',
        message: '删除下一轮要求失败，请刷新后重试',
      },
    });
    expect(JSON.stringify([ack, agentEvents(socket)])).not.toContain(marker);
    expect(logger).toHaveBeenCalledWith('接续消息删除出现未预期错误', undefined, 'ChatGateway');
    logger.mockRestore();
  });

  it('rejects stale chat:cancelQueuedTurn requests for a changed active turn', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow());

    const ack = await gateway.handleCancelQueuedTurn(socket as any, {
      cid: assistantCid,
      expectedTurnId: 'turn_stale',
    });

    const event = agentEvents(socket)[0];
    expect(event).toMatchObject({
      type: 'agent.error',
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: 'turn_active',
      data: { code: 'TURN_MISMATCH' },
    });
    expect(ack).toMatchObject({ ok: false, code: 'TURN_MISMATCH' });
    expect(conversationTurnQueue.clear).not.toHaveBeenCalled();
  });

  it('rejects chat:cancelQueuedTurn when the running workflow has no turn id', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(activeWorkflow({ turnId: '' }));

    const ack = await gateway.handleCancelQueuedTurn(socket as any, { cid: assistantCid });

    expect(ack).toMatchObject({ ok: false, code: 'TURN_NOT_FOUND' });
    expect(conversationTurnQueue.clear).not.toHaveBeenCalled();
  });

  it('blocks chat:cancelQueuedTurn for workflows not owned by the socket user', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getWorkflowForUser.mockReturnValue(null);

    await gateway.handleCancelQueuedTurn(socket as any, { cid: assistantCid });

    const event = agentEvents(socket)[0];
    expect(event).toMatchObject({
      type: 'agent.error',
      chatId: assistantCid,
      messageId: assistantCid,
      data: { code: 'FORBIDDEN' },
    });
    expect(conversationTurnQueue.clear).not.toHaveBeenCalled();
  });

  it('blocks chat:resync when the socket user does not own the chat', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockRejectedValue({
      status: 403,
      message: '无权访问此对话',
    });

    const ack = await gateway.handleResync(socket as any, { cid: assistantCid });

    const event = agentEvents(socket)[0];
    expect(event).toMatchObject({
      type: 'agent.error',
      chatId: assistantCid,
      messageId: assistantCid,
      data: { code: 'FORBIDDEN' },
    });
    expect(ack).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('returns sanitized final messages for terminal chat:resync states', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getResyncSnapshot.mockReturnValue(null);
    const finalTurn = {
      id: 'turn_done',
      status: 'completed',
      startedAt: '2026-05-29T00:00:00.000Z',
      completedAt: '2026-05-29T00:00:01.000Z',
    };
    const finalMessage = {
      ...JSON.parse(legacyRawMessage),
      turn: finalTurn,
      task: {
        status: 'completed',
      },
    };
    chatControl.getChatLogForResync.mockResolvedValue({
      cid: assistantCid,
      content: 'done',
      message: stringifyFrontendMessage(finalMessage),
      status: 3,
    });

    const ack = await gateway.handleResync(socket as any, { cid: assistantCid });

    const event = agentEvents(socket)[0];
    expect(event).toMatchObject({
      type: 'snapshot.sync',
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: 'turn_done',
      data: { reason: 'resync', content: 'done', status: 3, turn: finalTurn },
    });
    expect(event.data.finishReason).toBe('stop');
    expect(event.data).not.toHaveProperty('chatId');
    expect(JSON.parse(event.data.message).rounds[0].toolCalls[0].arguments).toEqual({});
    expect(agentEvents(socket)[1]).toMatchObject({
      type: 'agent.end',
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: 'turn_done',
      data: { finishReason: 'stop', turn: finalTurn },
    });
    expect(ack).toMatchObject({
      ok: true,
      data: {
        accepted: true,
        cid: assistantCid,
        mode: 'terminal',
        eventCount: 2,
        status: 3,
        finishReason: 'stop',
        terminal: true,
      },
    });
    expectNoRawToolSecrets(event);
  });

  it('replays in-memory running snapshots with the current event seq', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getResyncSnapshot.mockReturnValue({
      content: 'partial',
      message: legacyRawMessage,
      turnId: 'turn_running',
      eventSeq: 42,
      turn: {
        id: 'turn_running',
        status: 'running',
        startedAt: '2026-05-29T00:00:00.000Z',
      },
    });

    const ack = await gateway.handleResync(socket as any, { cid: assistantCid });

    const events = agentEvents(socket);
    expect(events[0]).toMatchObject({
      type: 'snapshot.sync',
      seq: 42,
      workflowSeq: 42,
      chatId: assistantCid,
      messageId: assistantCid,
      turnId: 'turn_running',
      data: { reason: 'resync', content: 'partial', status: 'streaming' },
    });
    expect(JSON.parse(events[0].data.message).rounds[0].toolCalls[0].arguments).toEqual({});
    expect(events).toHaveLength(1);
    expect(ack).toMatchObject({
      ok: true,
      data: {
        accepted: true,
        cid: assistantCid,
        mode: 'snapshot',
        seq: 42,
        eventCount: 1,
        status: 'streaming',
      },
    });
    expectNoRawToolSecrets(events);
  });

  it('does not remap canonical primitive tool output during in-memory resync', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getResyncSnapshot.mockReturnValue({
      content: 'done',
      message: JSON.stringify({
        role: 'assistant',
        content: 'done',
        rounds: [
          {
            text: 'done',
            thinking: null,
            completed: true,
            toolCalls: [
              {
                id: 'call_primitive',
                name: 'read',
                toolName: 'read',
                status: 'success',
                arguments: {},
                output: 'plain output',
              },
            ],
          },
        ],
      }),
      turnId: 'turn_running',
      eventSeq: 7,
    });

    await gateway.handleResync(socket as any, { cid: assistantCid });

    const message = JSON.parse(agentEvents(socket)[0].data.message);
    expect(message.rounds[0].toolCalls[0].output).toBe('plain output');
    expect(message.rounds[0].toolCalls[0]).not.toHaveProperty('display');
    expect(message.rounds[0].toolCalls[0]).not.toHaveProperty('type');
  });

  it('replays buffered events incrementally when afterSeq is covered', async () => {
    const socket = createMockSocket(jest.fn, { data: { user: { id: 7 } } });
    chatControl.resolveAssistantChatLogByCidForUser.mockResolvedValue({
      id: 50,
      cid: assistantCid,
    });
    workflowManager.getResyncSnapshot.mockReturnValue({
      content: 'partial',
      message: '',
      eventSeq: 6,
    });
    workflowManager.getEventSeq.mockReturnValue(6);
    const buffered = [
      { type: 'message.delta', seq: 5, chatId: assistantCid, timestamp: 1, data: { delta: 'a' } },
      { type: 'message.delta', seq: 6, chatId: assistantCid, timestamp: 2, data: { delta: 'b' } },
    ];
    workflowManager.getBufferedEventsAfter.mockReturnValue(buffered);

    const ack = await gateway.handleResync(socket as any, { cid: assistantCid, afterSeq: 4 });

    expect(workflowManager.getBufferedEventsAfter).toHaveBeenCalledWith(50, 4);
    expect(agentEvents(socket)).toEqual(buffered);
    expect(ack).toMatchObject({
      ok: true,
      data: {
        accepted: true,
        cid: assistantCid,
        mode: 'buffer',
        seq: 6,
        eventCount: 2,
      },
    });
  });
});
