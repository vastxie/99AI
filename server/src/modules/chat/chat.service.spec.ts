import { HttpException, HttpStatus } from '@nestjs/common';
import { getTokenCount } from '@/common/utils';
import { ChatLogStatus } from '@/common/constants/status.constant';
import { AgentOperationCancelledError } from '../agent/runtime-state/operation-ledger.store';
import { ChatService } from './chat.service';
import { ContinuationPreflightTerminatedError } from './interaction-dispatcher.service';
import { WorkflowProcessManager } from './workflowManager.service';
import type { Round } from '../chatLog/types/message.types';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const CONVERSATION_GID = 'g_0123456789abcdefghijklmn';
const TURN_STARTED_AT = '2026-09-02T00:00:00.000Z';

function buildRecords() {
  const initialTurn = { id: 'turn_1', status: 'running', startedAt: TURN_STARTED_AT };
  const initialAssistantMessage = {
    role: 'assistant',
    content: '',
    rounds: [] as Round[],
    turn: initialTurn,
  };
  return {
    chatGroupId: 1,
    conversationGid: CONVERSATION_GID,
    userLogId: 10,
    assistantLogId: 11,
    userCid: 'c_user',
    assistantCid: 'c_assistant',
    turnId: 'turn_1',
    turnStartedAt: TURN_STARTED_AT,
    initialTurn,
    initialAssistantMessage,
    initialMessages: {
      user: { cid: 'c_user', role: 'user', content: 'hi' },
      assistant: { cid: 'c_assistant', role: 'assistant', turnId: 'turn_1', loading: true },
    },
    operation: {
      operationId: 'op_turn_1',
      ownerType: 'user',
      ownerKey: '7',
      groupId: 1,
      userLogId: 10,
      assistantLogId: 11,
      turnId: 'turn_1',
      modelKeyId: 5,
    },
  } as any;
}

function buildPreflight(admission: any) {
  return {
    ...admission,
    setSystemMessage: '',
    userRuntimeContext: '',
    currentRequestModelKey: { id: 5 },
    modelGatewayConfig: { baseUrl: 'https://api.example.com/v1' },
    agentModelGatewayConfig: { protocol: 'openai_chat_completions', model: 'gpt-test' },
    runtimeMultimodalTypes: [],
    keyId: 5,
    useModel: 'gpt-test',
    additionalParams: undefined,
    reasoningEffort: undefined,
    useModeName: 'GPT',
    modelKey: 'sk-test',
    maxModelTokens: 64000,
  };
}

const user = { id: 7, role: 'user' };

function createHarness(agentResult: (inputs: any) => Promise<any>) {
  const admission = {
    body: {
      prompt: 'hi',
      message: undefined as string | undefined,
      url: undefined as string | undefined,
    },
    visitorId: null as string | null,
    chatUserId: 7,
    workflowOwnerId: 7,
    prompt: 'hi',
    parentTurnId: undefined as string | undefined,
    sourceSocketId: 'socket-1',
    chatChannel: 'web',
    conversationGid: CONVERSATION_GID,
  };
  const records = buildRecords();
  const workflowManager = new WorkflowProcessManager();
  const chatLogService = { updateChatLog: jest.fn().mockResolvedValue(undefined) };
  const modelsService = { saveUseLog: jest.fn().mockResolvedValue(undefined) };
  const agentLoopService = {
    execute: jest.fn((_history: any[], options: any) => agentResult(options)),
  };
  const conversationTurnQueue = {
    peekHint: jest.fn().mockReturnValue(undefined),
    hasPending: jest.fn().mockReturnValue(false),
    claimForParent: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(false),
    discardClaim: jest.fn().mockResolvedValue(false),
    expireDue: jest.fn().mockResolvedValue(0),
    listRecoveryCandidates: jest.fn().mockResolvedValue([]),
    claimForRecovery: jest.fn().mockResolvedValue(undefined),
  };
  const chatLiveSync = { emitToUser: jest.fn() };
  const chatTitleService = { scheduleAutoTitleForFirstUserMessage: jest.fn() };
  const uploadContext = {
    getUploadUrl: jest.fn((item: any) => item.url || ''),
    getUploadMediaType: jest.fn(() => 'document'),
  };
  const contextBuilder = {
    buildMessageFromParentMessageId: jest.fn().mockResolvedValue({
      messages: [{ role: 'user', content: 'hi' }],
      contextBoundary: undefined,
      fileRefMapping: undefined,
    }),
  };
  const billing = {
    settleTurn: jest.fn().mockResolvedValue({ charged: 1 }),
    refundTurn: jest.fn().mockResolvedValue(undefined),
    getSummary: jest.fn().mockResolvedValue({ credits: 90 }),
  };
  // admission.body 是预检校验后的请求体：这里原样回传 rawBody，让 message / 附件进入构建路径
  const chatPreflight = {
    prepareAdmission: jest.fn(async (rawBody: any) => ({ ...admission, body: { ...rawBody } })),
  };
  const interactionDispatcher = {
    commit: jest.fn().mockResolvedValue({
      duplicate: false,
      preflight: buildPreflight(admission),
      records,
    }),
  };
  const operationSession = {
    identity: records.operation,
    fence: { operationId: records.operation.operationId, generation: 1, leaseOwner: 'test' },
    isCancelRequested: jest.fn().mockResolvedValue(false),
    beginSettlement: jest.fn().mockResolvedValue(undefined),
    completeSettlement: jest.fn().mockResolvedValue(undefined),
    beginRefund: jest.fn().mockResolvedValue(undefined),
    completeRefund: jest.fn().mockResolvedValue(undefined),
    markBillingUnknown: jest.fn().mockResolvedValue(undefined),
    updateChatLog: jest.fn(async (id: number, patch: any) => {
      await chatLogService.updateChatLog(id, patch);
      return true;
    }),
    terminalize: jest.fn(async ({ assistantLogId, chatLogPatch }: any) => {
      await chatLogService.updateChatLog(assistantLogId, chatLogPatch);
      return true;
    }),
    close: jest.fn(),
  };
  const operations = {
    claim: jest.fn().mockResolvedValue(operationSession),
  };
  const userService = {
    getUserById: jest.fn().mockResolvedValue(user),
  };
  const service = new ChatService(
    chatLogService as any,
    modelsService as any,
    agentLoopService as any,
    workflowManager,
    conversationTurnQueue as any,
    chatLiveSync as any,
    chatTitleService as any,
    uploadContext as any,
    contextBuilder as any,
    billing as any,
    chatPreflight as any,
    interactionDispatcher as any,
    operations as any,
    userService as any,
  );
  const emitter = { emit: jest.fn() };
  return {
    service,
    emitter,
    records,
    workflowManager,
    chatLogService,
    modelsService,
    agentLoopService,
    contextBuilder,
    chatLiveSync,
    billing,
    chatPreflight,
    interactionDispatcher,
    operations,
    operationSession,
    conversationTurnQueue,
    userService,
  };
}

function emittedTypes(emitter: { emit: any }): string[] {
  return emitter.emit.mock.calls.map((call: any[]) => call[0].type);
}

function queuedTurn(overrides: Record<string, any> = {}) {
  return {
    inboxId: 9,
    kind: 'follow_up',
    sequence: 1,
    claimToken: 'a'.repeat(64),
    payloadFingerprint: 'b'.repeat(64),
    operationId: 'op_turn_1',
    parentAssistantLogId: 11,
    parentTurnId: 'turn_1',
    ownerType: 'user',
    ownerKey: '7',
    groupId: 1,
    conversationGid: CONVERSATION_GID,
    generation: 1,
    payload: {
      prompt: 'follow up',
      submissionId: 'submission_follow_up_0001',
      parentTurnId: 'turn_1',
      gid: CONVERSATION_GID,
      modelId: 5,
    },
    channel: 'web',
    ...overrides,
  } as any;
}

async function flushAsyncWork(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

describe('ChatService chatProcess', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    // AgentLoopService 替身：按内部进度事件推送正文，并把结果写回 options.currentMessage
    harness = createHarness(async options => {
      options.onProgress?.({ type: 'text', data: { roundIndex: 0, content: 'hello' } });
      options.currentMessage.content = 'hello';
      return {
        success: true,
        message: options.currentMessage,
        finishReason: 'stop',
        tokenUsage: {
          totalInputTokens: 8,
          totalOutputTokens: 4,
          totalTokens: 12,
        },
        toolCost: 0,
      };
    });
  });

  it('runs one turn end to end: attachments to the sandbox, events, persistence and billing', async () => {
    const {
      service,
      emitter,
      agentLoopService,
      chatLogService,
      billing,
      modelsService,
      chatLiveSync,
    } = harness;
    const onChatIdCreated = jest.fn();
    const rawBody = {
      prompt: 'hi',
      message: JSON.stringify({
        role: 'user',
        content: 'hi',
        rounds: [
          {
            text: 'hi',
            toolCalls: [
              {
                id: 'user_upload_1',
                name: 'user_upload',
                arguments: {},
                status: 'success',
                output: {
                  files: [
                    {
                      type: 'document',
                      name: 'a.pdf',
                      fileId: 'f1',
                      mime: 'application/pdf',
                      size: 3,
                    },
                  ],
                },
              },
            ],
            completed: true,
          },
        ],
      }),
    };

    await service.chatProcess(rawBody, user, emitter as any, onChatIdCreated, 'web');

    const inputs = agentLoopService.execute.mock.calls[0][1];
    expect(inputs).toMatchObject({
      chatId: 'c_assistant',
      messageId: 'c_assistant',
      turnId: 'turn_1',
      userId: 7,
      model: 'gpt-test',
      attachments: [{ fileId: 'f1', name: 'a.pdf', mime: 'application/pdf', size: 3 }],
    });
    expect(inputs).not.toHaveProperty('task');
    expect(inputs).not.toHaveProperty('runScope');
    expect(inputs.operationSession).toBe(harness.operationSession);

    expect(onChatIdCreated).toHaveBeenCalledWith(11, expect.any(Object), {});
    expect(emittedTypes(emitter)).toEqual([
      'turn.start',
      'message.delta',
      'turn.end',
      'snapshot.sync',
      'billing.update',
      'agent.end',
    ]);
    const agentEnd = emitter.emit.mock.calls.at(-1)[0];
    expect(agentEnd).toMatchObject({
      chatId: 'c_assistant',
      data: { finishReason: 'stop', cid: 'c_assistant', turnStatus: 'completed' },
    });
    expect(emitter.emit.mock.calls[3][0]).toMatchObject({
      type: 'snapshot.sync',
      data: {
        finishReason: 'stop',
        usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
      },
    });

    expect(chatLogService.updateChatLog).toHaveBeenCalledWith(10, { totalTokens: 12 });
    expect(chatLogService.updateChatLog).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ status: ChatLogStatus.COMPLETED }),
    );
    expect(billing.settleTurn).toHaveBeenCalledWith({
      user,
      userId: 7,
      model: { id: 5 },
      totalTokens: 12,
      toolCost: 0,
      relatedId: 11,
    });
    expect(harness.operationSession.beginSettlement).toHaveBeenCalledWith({
      mode: 'full',
      totalTokens: 12,
      toolCost: 0,
    });
    expect(harness.operationSession.completeSettlement).toHaveBeenCalledWith(1);
    expect(harness.operationSession.terminalize).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'completed', terminalReason: 'stop' }),
    );
    expect(harness.operationSession.beginSettlement.mock.invocationCallOrder[0]).toBeLessThan(
      billing.settleTurn.mock.invocationCallOrder[0],
    );
    expect(billing.settleTurn.mock.invocationCallOrder[0]).toBeLessThan(
      harness.operationSession.completeSettlement.mock.invocationCallOrder[0],
    );
    expect(harness.operationSession.completeSettlement.mock.invocationCallOrder[0]).toBeLessThan(
      harness.operationSession.terminalize.mock.invocationCallOrder[0],
    );
    expect(emitter.emit.mock.calls.at(-2)[0]).toMatchObject({
      type: 'billing.update',
      data: { charged: 1, summary: { credits: 90 } },
    });
    expect(modelsService.saveUseLog).toHaveBeenCalledWith(5, 12);
    expect(chatLiveSync.emitToUser.mock.calls.map((call: any[]) => call[1].type)).toEqual([
      'turn_created',
      'turn_done',
    ]);
    expect(harness.workflowManager.getRunningSnapshot(11)).toBeNull();
  });

  it('persists an empty answer for a process-only truncation but still charges on the generated text', async () => {
    const processOnly = createHarness(async options => {
      // 适配器维护的回答投影：只有过程轮时为空
      options.currentMessage.rounds.push({
        text: '先搜一下相关资料。',
        thinking: null,
        toolCalls: [],
        completed: true,
        phase: 'process',
      });
      options.onProgress?.({
        type: 'text',
        data: { roundIndex: 0, content: '先搜一下相关资料。' },
      });
      options.onProgress?.({ type: 'round_phase', data: { roundIndex: 0, phase: 'process' } });
      options.currentMessage.content = '';
      // 没有 usage：计费按生成文字估算
      return {
        success: true,
        message: options.currentMessage,
        finishReason: 'abort',
        stopReason: 'max_rounds',
        toolCost: 0,
      };
    });

    await processOnly.service.chatProcess({ prompt: 'hi' }, user, processOnly.emitter as any);

    const persisted = processOnly.chatLogService.updateChatLog.mock.calls
      .filter((call: any[]) => call[0] === 11 && 'content' in call[1])
      .map((call: any[]) => call[1].content);
    expect(persisted).toEqual(['']);
    const snapshot = processOnly.emitter.emit.mock.calls
      .map((call: any[]) => call[0])
      .find((event: any) => event.type === 'snapshot.sync');
    expect(snapshot.data.content).toBe('');
    expect(JSON.parse(snapshot.data.message).rounds[0].phase).toBe('process');
    const expectedTokens =
      (await getTokenCount('hi ')) + (await getTokenCount('先搜一下相关资料。'));
    expect(processOnly.billing.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ totalTokens: expectedTokens }),
    );
  });

  it('charges an output-limit reply and keeps the truncation reason on the completed turn', async () => {
    const truncated = createHarness(async options => {
      options.currentMessage.rounds.push({
        text: '第一部分写完了，第二部分',
        thinking: null,
        toolCalls: [],
        completed: true,
      });
      options.onProgress?.({
        type: 'text',
        data: { roundIndex: 0, content: '第一部分写完了，第二部分' },
      });
      options.currentMessage.content = '第一部分写完了，第二部分';
      return {
        success: true,
        message: options.currentMessage,
        finishReason: 'length',
        stopReason: 'length',
        toolCost: 0,
      };
    });

    await truncated.service.chatProcess({ prompt: 'hi' }, user, truncated.emitter as any);

    // 内容已经生成：照常计费，不能因为结束原因不是 stop 就免单
    expect(truncated.billing.settleTurn).toHaveBeenCalledTimes(1);
    const events = truncated.emitter.emit.mock.calls.map((call: any[]) => call[0]);
    const end = events.find((event: any) => event.type === 'agent.end');
    expect(end.data.finishReason).toBe('length');
    expect(end.data.turn).toMatchObject({ status: 'completed', stopReason: 'length' });
    const snapshot = events.find((event: any) => event.type === 'snapshot.sync');
    expect(JSON.parse(snapshot.data.message).turn).toMatchObject({
      status: 'completed',
      stopReason: 'length',
    });
  });

  it('persists a closing question as plain text without counting it as generated output', async () => {
    const asking = createHarness(async options => {
      options.currentMessage.rounds.push({
        text: '初稿已完成。',
        thinking: null,
        toolCalls: [
          {
            id: 'call_ask',
            type: 'question',
            status: 'success',
            display: { json: { question: { text: '要哪种风格？', options: ['科技感', '手绘'] } } },
          },
        ],
        completed: true,
      });
      options.onProgress?.({ type: 'text', data: { roundIndex: 0, content: '初稿已完成。' } });
      options.currentMessage.content = '初稿已完成。';
      return { success: true, message: options.currentMessage, finishReason: 'stop', toolCost: 0 };
    });

    await asking.service.chatProcess({ prompt: 'hi' }, user, asking.emitter as any);

    const reply = '初稿已完成。\n\n要哪种风格？\n1. 科技感\n2. 手绘';
    expect(asking.chatLogService.updateChatLog).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ content: reply }),
    );
    const snapshot = asking.emitter.emit.mock.calls
      .map((call: any[]) => call[0])
      .find((event: any) => event.type === 'snapshot.sync');
    expect(snapshot.data.content).toBe(reply);
    const expectedTokens = (await getTokenCount('hi ')) + (await getTokenCount('初稿已完成。'));
    expect(asking.billing.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ totalTokens: expectedTokens }),
    );
  });

  it.each([
    JSON.stringify(JSON.stringify({ role: 'user', content: 'hi' })),
    '[]',
    'null',
    '"text"',
    '{invalid',
  ])(
    'rejects non-current message input before persistence or model execution',
    async (message: string) => {
      await expect(
        harness.service.chatProcess({ prompt: 'hi', message }, user, harness.emitter as any),
      ).rejects.toMatchObject({ status: 400 });
      expect(harness.interactionDispatcher.commit).not.toHaveBeenCalled();
      expect(harness.agentLoopService.execute).not.toHaveBeenCalled();
      expect(harness.billing.settleTurn).not.toHaveBeenCalled();
      expect(harness.emitter.emit).not.toHaveBeenCalled();
    },
  );

  it('marks the turn failed, refunds and emits agent.error when the model run errors', async () => {
    harness = createHarness(async options => ({
      success: false,
      message: options.currentMessage,
      finishReason: 'error',
      error: 'provider exploded',
    }));
    const { service, emitter, chatLogService, billing, chatLiveSync } = harness;

    await service.chatProcess({ prompt: 'hi' }, user, emitter as any, undefined, 'web');

    expect(emittedTypes(emitter)).toEqual(['turn.start', 'agent.error']);
    expect(emitter.emit.mock.calls[1][0]).toMatchObject({
      chatId: 'c_assistant',
      data: { code: 'AI_ERROR', retryable: true, turnStatus: 'failed' },
    });
    expect(chatLogService.updateChatLog).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ status: ChatLogStatus.FAILED }),
    );
    expect(billing.refundTurn).toHaveBeenCalledWith(11);
    expect(billing.settleTurn).not.toHaveBeenCalled();
    expect(chatLiveSync.emitToUser.mock.calls.map((call: any[]) => call[1].type)).toEqual([
      'turn_created',
      'turn_error',
    ]);
    expect(harness.workflowManager.getRunningSnapshot(11)).toBeNull();
  });

  it('rejects a fresh turn whose execution cannot start through the gateway ack, without an extra event', async () => {
    const { service, emitter, workflowManager, chatLogService, billing } = harness;
    jest.spyOn(workflowManager, 'register').mockImplementation(() => {
      throw new Error('publisher registration failed');
    });

    await expect(
      service.chatProcess({ prompt: 'hi' }, user, emitter as any, undefined, 'web'),
    ).rejects.toMatchObject({ response: { code: 'EXECUTION_START_FAILED' } });

    expect(emitter.emit).not.toHaveBeenCalled();
    expect(chatLogService.updateChatLog).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ status: ChatLogStatus.STOPPED }),
    );
    expect(billing.refundTurn).toHaveBeenCalledWith(11);
  });

  it('tells the waiting tabs and the other tabs when a continuation cannot start', async () => {
    const { service, emitter, workflowManager, chatLiveSync, chatLogService } = harness;
    jest.spyOn(workflowManager, 'register').mockImplementation(() => {
      throw new Error('publisher registration failed');
    });

    (service as any).runQueuedConversationTurn(queuedTurn(), emitter);
    await flushAsyncWork();

    expect(emittedTypes(emitter)).toEqual(['agent.error']);
    // 带上父回合：恢复的页签不知道提交号，在接续窗口里按它认
    expect(emitter.emit.mock.calls[0][0]).toMatchObject({
      chatId: 'pending',
      data: {
        code: 'EXECUTION_START_FAILED',
        message: '执行未能启动，请重试',
        parentTurnId: 'turn_1',
      },
    });
    expect(chatLiveSync.emitToUser.mock.calls.map((call: any[]) => call[1])).toEqual([
      expect.objectContaining({ type: 'turn_error', errorCode: 'EXECUTION_START_FAILED' }),
    ]);
    expect(chatLogService.updateChatLog).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ status: ChatLogStatus.STOPPED }),
    );
  });

  it('chains continuations through one parent-turn layer that always names the direct parent', async () => {
    const emitters: any[] = [];
    jest
      .spyOn(harness.service, 'chatProcess')
      .mockImplementation(async (_body: any, _user: any, turnEmitter: any) => {
        emitters.push(turnEmitter);
        return undefined;
      });

    (harness.service as any).runQueuedConversationTurn(queuedTurn(), harness.emitter);
    await flushAsyncWork();
    // 接续轮完成后再接续下一轮：launchQueuedTurn 传下来的是上一轮的发送器
    (harness.service as any).runQueuedConversationTurn(
      queuedTurn({ parentTurnId: 'turn_2' }),
      emitters[0],
    );
    await flushAsyncWork();
    const outer = jest.spyOn(emitters[0], 'emit');
    emitters[1].emit({
      type: 'agent.error',
      chatId: 'pending',
      timestamp: 1,
      data: { code: 'RATE_LIMIT', message: 'slow down' },
    });

    expect(outer).not.toHaveBeenCalled();
    expect(harness.emitter.emit).toHaveBeenCalledTimes(1);
    expect(harness.emitter.emit.mock.calls[0][0]).toMatchObject({
      data: { code: 'RATE_LIMIT', parentTurnId: 'turn_2' },
    });
  });

  it('tags every continuation error with its parent turn, including preflight rejections that do not throw', async () => {
    const claim = queuedTurn();
    jest
      .spyOn(harness.service, 'chatProcess')
      .mockImplementation(async (_body: any, _user: any, turnEmitter: any) => {
        // 预检的软拒绝（限流）直接推错误后返回，不抛错
        turnEmitter.emit({
          type: 'agent.error',
          chatId: 'pending',
          timestamp: 1,
          data: { code: 'RATE_LIMIT', message: '1 小时内对话次数过多' },
        });
        return undefined;
      });

    (harness.service as any).runQueuedConversationTurn(claim, harness.emitter);
    await flushAsyncWork();

    expect(harness.emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.error',
        data: { code: 'RATE_LIMIT', message: '1 小时内对话次数过多', parentTurnId: 'turn_1' },
      }),
    );
  });

  it('keeps settlement intent recoverable and refunds before terminalizing when billing throws', async () => {
    harness.billing.settleTurn.mockRejectedValueOnce(new Error('billing outcome unknown'));

    await harness.service.chatProcess(
      { prompt: 'hi' },
      user,
      harness.emitter as any,
      undefined,
      'web',
    );

    expect(harness.operationSession.beginSettlement).toHaveBeenCalledWith({
      mode: 'full',
      totalTokens: 12,
      toolCost: 0,
    });
    expect(harness.operationSession.completeSettlement).not.toHaveBeenCalled();
    expect(harness.operationSession.beginRefund).toHaveBeenCalledTimes(1);
    expect(harness.billing.refundTurn).toHaveBeenCalledWith(11);
    expect(harness.operationSession.completeRefund).toHaveBeenCalledTimes(1);
    expect(harness.operationSession.terminalize).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'failed', terminalReason: 'process_error' }),
    );
    expect(harness.operationSession.beginSettlement.mock.invocationCallOrder[0]).toBeLessThan(
      harness.billing.settleTurn.mock.invocationCallOrder[0],
    );
    expect(harness.billing.settleTurn.mock.invocationCallOrder[0]).toBeLessThan(
      harness.operationSession.beginRefund.mock.invocationCallOrder[0],
    );
    expect(harness.operationSession.completeRefund.mock.invocationCallOrder[0]).toBeLessThan(
      harness.operationSession.terminalize.mock.invocationCallOrder[0],
    );
  });

  it('marks a visitor full settlement unknown before terminalizing when billing throws', async () => {
    const visitor = { id: 7, role: 'visitor' };
    harness.billing.settleTurn.mockRejectedValueOnce(new Error('visitor billing outcome unknown'));

    await harness.service.chatProcess(
      { prompt: 'hi' },
      visitor,
      harness.emitter as any,
      undefined,
      'web',
    );

    expect(harness.operationSession.beginSettlement).toHaveBeenCalledWith({
      mode: 'full',
      totalTokens: 12,
      toolCost: 0,
    });
    expect(harness.operationSession.completeSettlement).not.toHaveBeenCalled();
    expect(harness.operationSession.markBillingUnknown).toHaveBeenCalledTimes(1);
    expect(harness.operationSession.beginRefund).not.toHaveBeenCalled();
    expect(harness.billing.refundTurn).not.toHaveBeenCalled();
    expect(harness.chatPreflight.prepareAdmission).toHaveBeenCalledTimes(1);
    expect(harness.operationSession.beginSettlement.mock.invocationCallOrder[0]).toBeLessThan(
      harness.billing.settleTurn.mock.invocationCallOrder[0],
    );
    expect(harness.billing.settleTurn.mock.invocationCallOrder[0]).toBeLessThan(
      harness.operationSession.markBillingUnknown.mock.invocationCallOrder[0],
    );
    expect(harness.operationSession.markBillingUnknown.mock.invocationCallOrder[0]).toBeLessThan(
      harness.operationSession.terminalize.mock.invocationCallOrder[0],
    );
  });

  it('charges only the tool cost and keeps the partial answer when the model stream went silent', async () => {
    harness = createHarness(async options => {
      options.currentMessage.content = 'partial answer';
      return {
        success: false,
        message: options.currentMessage,
        finishReason: 'error',
        error: '模型长时间没有输出，已中断，请重试',
        tokenUsage: { totalInputTokens: 9, totalOutputTokens: 2, totalTokens: 11 },
        toolCost: 2,
      };
    });
    const { service, emitter, chatLogService, billing, operationSession } = harness;

    await service.chatProcess({ prompt: 'hi' }, user, emitter as any, undefined, 'web');

    expect(emittedTypes(emitter)).toEqual(['turn.start', 'agent.error']);
    expect(emitter.emit.mock.calls[1][0]).toMatchObject({
      data: {
        code: 'AI_ERROR',
        message: '模型长时间没有输出，已中断，请重试',
        retryable: true,
        turnStatus: 'failed',
      },
    });
    // 已成功的工具费照常结算，基础对话费退回
    expect(operationSession.beginSettlement).toHaveBeenCalledWith({
      mode: 'tools_only',
      totalTokens: 11,
      toolCost: 2,
    });
    expect(billing.settleTurn).toHaveBeenCalledTimes(1);
    expect(billing.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ toolsOnly: true, toolCost: 2, totalTokens: 11, relatedId: 11 }),
    );
    expect(billing.refundTurn).toHaveBeenCalledWith(11);
    // 终态为失败；已经输出的正文留在这条消息里
    const updates = chatLogService.updateChatLog.mock.calls.map((call: any[]) => call[1]);
    expect(updates.at(-1)).toMatchObject({ status: ChatLogStatus.FAILED });
    expect(JSON.stringify(updates.at(-1).message)).toContain('partial answer');
  });

  it('marks a visitor tools-only settlement unknown before terminalizing when billing throws', async () => {
    harness = createHarness(async options => ({
      success: false,
      message: options.currentMessage,
      finishReason: 'error',
      error: 'provider exploded after tool success',
      tokenUsage: { totalInputTokens: 9, totalOutputTokens: 0, totalTokens: 9 },
      toolCost: 2,
    }));
    const visitor = { id: 7, role: 'visitor' };
    harness.billing.settleTurn.mockRejectedValueOnce(new Error('visitor tool billing unknown'));

    await harness.service.chatProcess(
      { prompt: 'hi' },
      visitor,
      harness.emitter as any,
      undefined,
      'web',
    );

    // 循环结果先落库再结算：工具费结算带上已持久化的用量，与生产路径一致
    expect(harness.operationSession.beginSettlement).toHaveBeenCalledWith({
      mode: 'tools_only',
      totalTokens: 9,
      toolCost: 2,
    });
    expect(harness.operationSession.completeSettlement).not.toHaveBeenCalled();
    expect(harness.operationSession.markBillingUnknown).toHaveBeenCalledTimes(1);
    expect(harness.operationSession.beginRefund).not.toHaveBeenCalled();
    expect(harness.billing.refundTurn).not.toHaveBeenCalled();
    expect(harness.chatPreflight.prepareAdmission).toHaveBeenCalledTimes(1);
    expect(harness.operationSession.beginSettlement.mock.invocationCallOrder[0]).toBeLessThan(
      harness.billing.settleTurn.mock.invocationCallOrder[0],
    );
    expect(harness.billing.settleTurn.mock.invocationCallOrder[0]).toBeLessThan(
      harness.operationSession.markBillingUnknown.mock.invocationCallOrder[0],
    );
    expect(harness.operationSession.markBillingUnknown.mock.invocationCallOrder[0]).toBeLessThan(
      harness.operationSession.terminalize.mock.invocationCallOrder[0],
    );
  });

  it('never calls the agent when current context source loading fails', async () => {
    const sourceError = new Error('context source unavailable');
    harness.contextBuilder.buildMessageFromParentMessageId.mockRejectedValue(sourceError);

    await harness.service.chatProcess(
      { prompt: 'hi' },
      user,
      harness.emitter as any,
      undefined,
      'web',
    );

    expect(harness.agentLoopService.execute).not.toHaveBeenCalled();
    expect(harness.chatLogService.updateChatLog).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ status: ChatLogStatus.FAILED }),
    );
    expect(emittedTypes(harness.emitter)).toEqual(['agent.error']);
  });

  it('returns the duplicate marker without running the agent', async () => {
    const { service, emitter, agentLoopService, interactionDispatcher, records } = harness;
    interactionDispatcher.commit.mockResolvedValue({ duplicate: true, records });

    await expect(
      service.chatProcess({ prompt: 'hi' }, user, emitter as any, undefined, 'web'),
    ).resolves.toEqual({
      accepted: false,
      duplicate: true,
      cid: 'c_assistant',
      turnId: 'turn_1',
    });
    expect(agentLoopService.execute).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('claims the durable follow-up before parent terminalization and launches only afterward', async () => {
    const claim = queuedTurn();
    harness.conversationTurnQueue.claimForParent.mockResolvedValue(claim);
    const launch = jest
      .spyOn(harness.service as any, 'runQueuedConversationTurn')
      .mockImplementation((): void => undefined);

    await harness.service.chatProcess(
      { prompt: 'hi' },
      user,
      harness.emitter as any,
      undefined,
      'web',
    );

    expect(harness.conversationTurnQueue.claimForParent).toHaveBeenCalledWith({
      operationId: 'op_turn_1',
      parentAssistantLogId: 11,
      parentTurnId: 'turn_1',
      ownerType: 'user',
      ownerKey: '7',
      groupId: 1,
      conversationGid: CONVERSATION_GID,
      generation: 1,
    });
    expect(harness.operationSession.terminalize.mock.invocationCallOrder[0]).toBeLessThan(
      launch.mock.invocationCallOrder[0],
    );
    expect(launch).toHaveBeenCalledWith(claim, harness.emitter, undefined);
    expect(
      harness.emitter.emit.mock.calls.find((call: any[]) => call[0].type === 'turn.end')[0],
    ).toMatchObject({ data: { finishReason: 'handoff', nextAction: 'start_queued_turn' } });
  });

  it('keeps the output-limit reason and charges once when a queued follow-up takes over', async () => {
    harness = createHarness(async options => {
      options.onProgress?.({ type: 'text', data: { roundIndex: 0, content: 'hello' } });
      options.currentMessage.content = 'hello';
      return {
        success: true,
        message: options.currentMessage,
        finishReason: 'length',
        stopReason: 'length',
        tokenUsage: { totalInputTokens: 8, totalOutputTokens: 4, totalTokens: 12 },
        toolCost: 0,
      };
    });
    const claim = queuedTurn();
    harness.conversationTurnQueue.claimForParent.mockResolvedValue(claim);
    const launch = jest
      .spyOn(harness.service as any, 'runQueuedConversationTurn')
      .mockImplementation((): void => undefined);

    await harness.service.chatProcess(
      { prompt: 'hi' },
      user,
      harness.emitter as any,
      undefined,
      'web',
    );

    // 对外的收尾原因换成 handoff 交给排队的下一轮，但本轮的截断原因仍随 turn 保存，且只计费一次
    expect(harness.billing.settleTurn).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(1);
    const turnEnd = harness.emitter.emit.mock.calls.find(
      (call: any[]) => call[0].type === 'turn.end',
    )[0];
    expect(turnEnd).toMatchObject({
      data: {
        finishReason: 'handoff',
        nextAction: 'start_queued_turn',
        turn: { status: 'completed', stopReason: 'length' },
      },
    });
  });

  it('cancels before settlement without a new charge or follow-up and persists an interrupted turn', async () => {
    harness.operationSession.isCancelRequested.mockResolvedValue(true);

    await harness.service.chatProcess(
      { prompt: 'hi' },
      user,
      harness.emitter as any,
      undefined,
      'web',
    );

    expect(harness.operationSession.beginSettlement).not.toHaveBeenCalled();
    expect(harness.billing.settleTurn).not.toHaveBeenCalled();
    expect(harness.operationSession.beginRefund).toHaveBeenCalledTimes(1);
    expect(harness.billing.refundTurn).toHaveBeenCalledTimes(1);
    expect(harness.conversationTurnQueue.claimForParent).not.toHaveBeenCalled();
    expect(harness.operationSession.terminalize).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'interrupted', terminalReason: 'user_cancelled' }),
    );
    const terminal = harness.operationSession.terminalize.mock.calls[0][0];
    expect(JSON.parse(terminal.chatLogPatch.message).turn.status).toBe('interrupted');
  });

  it('converges and refunds an in-flight settlement when cancel arrives after the charge outcome', async () => {
    harness.operationSession.isCancelRequested
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await harness.service.chatProcess(
      { prompt: 'hi' },
      user,
      harness.emitter as any,
      undefined,
      'web',
    );

    expect(harness.billing.settleTurn).toHaveBeenCalledTimes(1);
    expect(harness.operationSession.completeSettlement).toHaveBeenCalledTimes(1);
    expect(harness.billing.refundTurn).toHaveBeenCalledTimes(1);
    expect(harness.operationSession.completeSettlement.mock.invocationCallOrder[0]).toBeLessThan(
      harness.operationSession.beginRefund.mock.invocationCallOrder[0],
    );
    expect(harness.operationSession.terminalize).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'interrupted', terminalReason: 'user_cancelled' }),
    );
  });

  it('lets a last-moment durable cancel defeat completion and clears the claimed launch', async () => {
    const claim = queuedTurn();
    harness.conversationTurnQueue.claimForParent.mockResolvedValue(claim);
    const launch = jest
      .spyOn(harness.service as any, 'runQueuedConversationTurn')
      .mockImplementation((): void => undefined);
    harness.operationSession.terminalize
      .mockRejectedValueOnce(new AgentOperationCancelledError())
      .mockResolvedValueOnce(true);

    await harness.service.chatProcess(
      { prompt: 'hi' },
      user,
      harness.emitter as any,
      undefined,
      'web',
    );

    expect(
      harness.operationSession.terminalize.mock.calls.map((call: any[]) => call[0].phase),
    ).toEqual(['completed', 'interrupted']);
    expect(harness.billing.refundTurn).toHaveBeenCalledTimes(1);
    expect(harness.conversationTurnQueue.clear).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'op_turn_1' }),
      'parent_cancelled',
    );
    expect(launch).not.toHaveBeenCalled();
  });

  it('does not launch a stale claim when post-terminal event projection fails', async () => {
    const claim = queuedTurn();
    harness.conversationTurnQueue.claimForParent.mockResolvedValue(claim);
    const launch = jest
      .spyOn(harness.service as any, 'runQueuedConversationTurn')
      .mockImplementation((): void => undefined);
    harness.emitter.emit.mockImplementation((event: any) => {
      if (event.type === 'turn.end') throw new Error('transport projection failed');
    });

    await harness.service.chatProcess(
      { prompt: 'hi' },
      user,
      harness.emitter as any,
      undefined,
      'web',
    );

    expect(harness.operationSession.terminalize).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'completed' }),
    );
    expect(harness.conversationTurnQueue.clear).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'op_turn_1' }),
      'parent_projection_failed',
    );
    expect(launch).not.toHaveBeenCalled();
  });

  it('rehydrates the current registered user and admits the exact claimed payload', async () => {
    const claim = queuedTurn({ clientIp: '127.0.0.1', sourceSocketId: 'socket-follow-up' });
    const process = jest.spyOn(harness.service, 'chatProcess').mockResolvedValue(undefined);

    (harness.service as any).runQueuedConversationTurn(claim, harness.emitter);
    await flushAsyncWork();

    expect(harness.userService.getUserById).toHaveBeenCalledWith(7);
    expect(process).toHaveBeenCalledWith(
      {
        ...claim.payload,
        __clientIp: '127.0.0.1',
        __socketId: 'socket-follow-up',
      },
      user,
      expect.objectContaining({ emit: expect.any(Function) }),
      undefined,
      'web',
      { operation: 'continue', continuationClaim: claim },
    );
    expect(harness.conversationTurnQueue.discardClaim).toHaveBeenCalledWith(
      claim,
      'launch_not_admitted',
    );
  });

  it('rehydrates a visitor from its durable owner without persisting transport identity', async () => {
    const claim = queuedTurn({
      ownerType: 'visitor',
      ownerKey: 'visitor-continuation-7',
    });
    const process = jest.spyOn(harness.service, 'chatProcess').mockResolvedValue(undefined);

    (harness.service as any).runQueuedConversationTurn(claim, harness.emitter);
    await flushAsyncWork();

    expect(harness.userService.getUserById).not.toHaveBeenCalled();
    expect(process).toHaveBeenCalledWith(
      claim.payload,
      { id: 'visitor-continuation-7', role: 'visitor' },
      expect.objectContaining({ emit: expect.any(Function) }),
      undefined,
      'web',
      { operation: 'continue', continuationClaim: claim },
    );
    expect(process.mock.calls[0][0]).not.toHaveProperty('__clientIp');
    expect(process.mock.calls[0][0]).not.toHaveProperty('__socketId');
  });

  it('keeps a transient pre-admission failure claimed for lease-based recovery', async () => {
    const claim = queuedTurn();
    jest
      .spyOn(harness.service, 'chatProcess')
      .mockRejectedValue(new Error('temporary database fault'));

    (harness.service as any).runQueuedConversationTurn(claim, harness.emitter);
    await flushAsyncWork();

    expect(harness.conversationTurnQueue.discardClaim).not.toHaveBeenCalled();
    expect(harness.emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.error',
        data: expect.objectContaining({ message: '接续消息暂未启动，将自动重试' }),
      }),
    );
  });

  it('does not retry a continuation whose mutable preflight was terminalized', async () => {
    const claim = queuedTurn();
    jest
      .spyOn(harness.service, 'chatProcess')
      .mockRejectedValue(new ContinuationPreflightTerminatedError());

    (harness.service as any).runQueuedConversationTurn(claim, harness.emitter);
    await flushAsyncWork();

    expect(harness.conversationTurnQueue.discardClaim).toHaveBeenCalledWith(
      claim,
      'launch_rejected',
    );
    expect(harness.emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.error',
        data: expect.objectContaining({ message: '接续消息处理失败，请稍后重试' }),
      }),
    );
  });

  it('surfaces the public reason of a rejected continuation preflight (quota, violation) instead of a generic error', async () => {
    const claim = queuedTurn();
    jest
      .spyOn(harness.service, 'chatProcess')
      .mockRejectedValue(
        new ContinuationPreflightTerminatedError(
          new HttpException('积分不足，请购买套餐后继续', HttpStatus.PAYMENT_REQUIRED),
        ),
      );

    (harness.service as any).runQueuedConversationTurn(claim, harness.emitter);
    await flushAsyncWork();

    expect(harness.emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.error',
        data: {
          code: 'PAYMENT_REQUIRED',
          message: '积分不足，请购买套餐后继续',
          parentTurnId: 'turn_1',
        },
      }),
    );
  });

  it('keeps internal preflight failures generic', async () => {
    const claim = queuedTurn();
    jest
      .spyOn(harness.service, 'chatProcess')
      .mockRejectedValue(new ContinuationPreflightTerminatedError(new Error('db exploded')));

    (harness.service as any).runQueuedConversationTurn(claim, harness.emitter);
    await flushAsyncWork();

    expect(harness.emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.error',
        data: {
          code: 'QUEUE_TURN_ERROR',
          message: '接续消息处理失败，请稍后重试',
          parentTurnId: 'turn_1',
        },
      }),
    );
  });

  it('discards a permanent continuation when the registered owner no longer exists', async () => {
    const claim = queuedTurn();
    harness.userService.getUserById.mockResolvedValue(null);

    (harness.service as any).runQueuedConversationTurn(claim, harness.emitter);
    await flushAsyncWork();

    expect(harness.agentLoopService.execute).not.toHaveBeenCalled();
    expect(harness.conversationTurnQueue.discardClaim).toHaveBeenCalledWith(
      claim,
      'launch_rejected',
    );
  });

  it('claims terminal-parent recovery candidates once without manufacturing a client transport', async () => {
    const claim = queuedTurn();
    harness.conversationTurnQueue.listRecoveryCandidates = jest
      .fn()
      .mockResolvedValueOnce([{ id: 9 }])
      .mockResolvedValueOnce([]);
    harness.conversationTurnQueue.claimForRecovery = jest.fn().mockResolvedValue(claim);
    const launch = jest
      .spyOn(harness.service as any, 'runQueuedConversationTurn')
      .mockImplementation((): void => undefined);

    await expect(harness.service.recoverQueuedConversationTurns()).resolves.toBe(1);

    expect(harness.conversationTurnQueue.expireDue).toHaveBeenCalledTimes(1);
    expect(harness.conversationTurnQueue.claimForRecovery).toHaveBeenCalledWith(9);
    expect(launch).toHaveBeenCalledWith(
      claim,
      expect.objectContaining({ emit: expect.any(Function) }),
    );
  });
});
