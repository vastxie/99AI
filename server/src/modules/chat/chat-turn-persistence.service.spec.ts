import { ChatLogStatus } from '@/common/constants/status.constant';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ChatTurnPersistenceService } from './chat-turn-persistence.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const CONVERSATION_GID = 'g_0123456789abcdefghijklmn';
const SUBMISSION_ID = 'sub_persistence_0123456789';
const group = { id: 1, gid: CONVERSATION_GID } as any;

function preflightFor(overrides: Record<string, any> = {}) {
  return {
    body: { prompt: 'hi', submissionId: SUBMISSION_ID, channelMessageId: null },
    user: { id: 7, role: 'user' },
    visitorId: null,
    chatUserId: 7,
    prompt: 'hi',
    chatChannel: 'web',
    submissionId: SUBMISSION_ID,
    submissionFingerprint: { version: 1, digest: 'digest-1' },
    useModel: 'gpt-test',
    useModeName: 'GPT',
    ...overrides,
  } as any;
}

describe('ChatTurnPersistenceService', () => {
  let logs: any;
  let manager: any;
  let repository: any;
  let billing: any;
  let operations: any;
  let service: ChatTurnPersistenceService;
  let nextId: number;
  let chatLogService: any;

  beforeEach(() => {
    nextId = 10;
    logs = {
      create: jest.fn((values: any) => ({ ...values })),
      save: jest.fn(async (values: any) => ({
        ...values,
        id: nextId++,
        status: values.status ?? ChatLogStatus.COMPLETED,
        createdAt: new Date('2026-09-02T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    manager = { getRepository: jest.fn((entity: any) => (entity === ChatLogEntity ? logs : null)) };
    repository = { manager: { transaction: jest.fn(async (callback: any) => callback(manager)) } };
    billing = {
      refundTurn: jest.fn().mockResolvedValue(undefined),
      reconcileRefunds: jest.fn().mockResolvedValue(undefined),
    };
    operations = {
      admitInTransaction: jest.fn(async (_manager: any, identity: any) => identity),
      loadIdentityByAssistantInTransaction: jest.fn().mockResolvedValue(null),
      findRecoverable: jest.fn().mockResolvedValue([]),
      findByAssistantLogId: jest.fn().mockResolvedValue(null),
    };
    chatLogService = {
      replaceFromCidInTransaction: jest.fn().mockResolvedValue(2),
      assertReplaceableInTransaction: jest.fn().mockResolvedValue(undefined),
    };
    service = new ChatTurnPersistenceService(
      repository,
      chatLogService,
      { enrichUserUploadFileRefMappings: jest.fn() } as any,
      billing,
      operations,
    );
  });

  it('writes the user message and a generating assistant placeholder as one turn', async () => {
    const userMessage = { role: 'user', content: 'hi', rounds: [] } as any;

    const records = await service.writeTurnInTransaction({
      preflight: preflightFor(),
      userMessage,
      group,
      manager,
    });

    expect(logs.save).toHaveBeenCalledTimes(2);
    expect(logs.save.mock.calls[0][0]).toMatchObject({
      direction: 'in',
      content: 'hi',
      submissionId: SUBMISSION_ID,
      submissionFingerprint: 'digest-1',
      groupId: 1,
    });
    expect(logs.save.mock.calls[1][0]).toMatchObject({
      direction: 'out',
      status: ChatLogStatus.GENERATING,
      submissionId: null,
      modelName: 'GPT',
    });
    expect(records).toMatchObject({
      chatGroupId: 1,
      conversationGid: CONVERSATION_GID,
      userLogId: 10,
      assistantLogId: 11,
    });
    expect(records.turnId).toMatch(/^turn_/u);
    expect(records.initialTurn).toMatchObject({ id: records.turnId, status: 'running' });
    expect(operations.admitInTransaction).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        operationId: `op_${records.turnId}`,
        ownerType: 'user',
        ownerKey: '7',
        userLogId: 10,
        assistantLogId: 11,
      }),
    );
    expect(records.initialMessages.assistant).toMatchObject({
      cid: records.assistantCid,
      turnId: records.turnId,
      loading: true,
      role: 'assistant',
    });
    expect(records).not.toHaveProperty('taskState');
  });

  it('replaces the regenerated turn inside the same transaction before writing the new one', async () => {
    const order: string[] = [];
    chatLogService.replaceFromCidInTransaction.mockImplementation(async () => {
      order.push('replace');
      return 2;
    });
    const save = logs.save.getMockImplementation();
    logs.save.mockImplementation(async (values: any) => {
      order.push(`save:${values.direction}`);
      return save(values);
    });

    await service.writeTurnInTransaction({
      preflight: preflightFor({
        body: {
          prompt: 'hi',
          submissionId: SUBMISSION_ID,
          replaceFromCid: 'c_0123456789abcdefghij',
          replaceLaterTurns: 2,
        },
      }),
      userMessage: { role: 'user', content: 'hi', rounds: [] } as any,
      group,
      manager,
    });

    expect(chatLogService.replaceFromCidInTransaction).toHaveBeenCalledWith(manager, {
      user: { id: 7, role: 'user' },
      groupId: 1,
      cid: 'c_0123456789abcdefghij',
      expectedLaterTurns: 2,
    });
    expect(order).toEqual(['replace', 'save:in', 'save:out']);
  });

  it('checks a replacement before preflight; a null or non-integer count is not a confirmed count', async () => {
    const body = {
      prompt: 'hi',
      submissionId: SUBMISSION_ID,
      replaceFromCid: 'c_0123456789abcdefghij',
    };
    for (const replaceLaterTurns of [null, '2', 1.5]) {
      chatLogService.assertReplaceableInTransaction.mockClear();
      await service.assertReplaceableInTransaction(
        manager,
        { body: { ...body, replaceLaterTurns }, user: { id: 7, role: 'user' } } as any,
        group,
      );
      expect(chatLogService.assertReplaceableInTransaction).toHaveBeenCalledWith(manager, {
        user: { id: 7, role: 'user' },
        groupId: 1,
        cid: 'c_0123456789abcdefghij',
      });
    }
    chatLogService.assertReplaceableInTransaction.mockClear();
    await service.assertReplaceableInTransaction(
      manager,
      { body: { prompt: 'hi' }, user: { id: 7, role: 'user' } } as any,
      group,
    );
    expect(chatLogService.assertReplaceableInTransaction).not.toHaveBeenCalled();
  });

  it('treats a continuation as stale when its parent turn was deleted by a replacement', async () => {
    logs.findOne.mockResolvedValueOnce({ id: 41, isDelete: true });
    await expect(
      service.isContinuationParentReplacedInTransaction(manager, {
        parentAssistantLogId: 41,
      } as any),
    ).resolves.toBe(true);
    logs.findOne.mockResolvedValueOnce({ id: 41, isDelete: false });
    await expect(
      service.isContinuationParentReplacedInTransaction(manager, {
        parentAssistantLogId: 41,
      } as any),
    ).resolves.toBe(false);
    logs.findOne.mockResolvedValueOnce(null);
    await expect(
      service.isContinuationParentReplacedInTransaction(manager, {
        parentAssistantLogId: 41,
      } as any),
    ).resolves.toBe(true);
  });

  it('writes an ordinary turn without touching earlier records', async () => {
    await service.writeTurnInTransaction({
      preflight: preflightFor(),
      userMessage: { role: 'user', content: 'hi', rounds: [] } as any,
      group,
      manager,
    });
    expect(chatLogService.replaceFromCidInTransaction).not.toHaveBeenCalled();
  });

  it('detects duplicate submissions only when the fingerprint matches', async () => {
    await expect(
      service.findDuplicateTurn(manager, group, preflightFor({ submissionId: null })),
    ).resolves.toBeNull();

    logs.findOne.mockResolvedValueOnce({
      id: 20,
      cid: 'c_user',
      direction: 'in',
      isDelete: false,
      submissionFingerprintVersion: 1,
      submissionFingerprint: 'other-digest',
      content: 'hi',
      message: JSON.stringify({ role: 'user', content: 'hi', rounds: [] }),
    });
    await expect(service.findDuplicateTurn(manager, group, preflightFor())).rejects.toMatchObject({
      response: { code: 'SUBMISSION_CONFLICT' },
    });

    const turn = { id: 'turn_dup', status: 'completed', startedAt: '2026-09-02T00:00:00.000Z' };
    logs.findOne
      .mockResolvedValueOnce({
        id: 20,
        cid: 'c_user',
        direction: 'in',
        isDelete: false,
        submissionFingerprintVersion: 1,
        submissionFingerprint: 'digest-1',
        content: 'hi',
        model: 'gpt-test',
        message: JSON.stringify({ role: 'user', content: 'hi', rounds: [] }),
        createdAt: new Date('2026-09-02T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 21,
        cid: 'c_assistant',
        direction: 'out',
        isDelete: false,
        status: ChatLogStatus.COMPLETED,
        modelName: 'GPT',
        content: 'done',
        message: JSON.stringify({ role: 'assistant', content: 'done', rounds: [], turn }),
        createdAt: new Date('2026-09-02T00:00:01.000Z'),
      });
    operations.loadIdentityByAssistantInTransaction.mockResolvedValueOnce({
      operationId: 'op_turn_dup',
      ownerType: 'user',
      ownerKey: '7',
      groupId: 1,
      userLogId: 20,
      assistantLogId: 21,
      turnId: 'turn_dup',
      modelKeyId: null,
    });

    const restored = await service.findDuplicateTurn(manager, group, preflightFor());
    expect(restored).toMatchObject({
      userLogId: 20,
      assistantLogId: 21,
      userCid: 'c_user',
      assistantCid: 'c_assistant',
      turnId: 'turn_dup',
      operation: expect.objectContaining({ operationId: 'op_turn_dup' }),
    });
    expect(restored?.initialMessages.assistant.loading).toBe(false);
  });

  it('interrupts orphaned generating turns at startup and reconciles refunds', async () => {
    logs.find.mockResolvedValue([
      {
        id: 30,
        status: ChatLogStatus.GENERATING,
        content: '',
        message: JSON.stringify({
          role: 'assistant',
          content: '',
          rounds: [],
          turn: { id: 'turn_orphan', status: 'running', startedAt: '2026-09-02T00:00:00.000Z' },
        }),
      },
    ]);

    await expect(service.recoverOrphanedTurns()).resolves.toEqual({ chatLogs: 1 });

    const [where, patch] = logs.update.mock.calls[0];
    expect(where).toEqual({ id: 30, status: ChatLogStatus.GENERATING });
    expect(patch.status).toBe(ChatLogStatus.STOPPED);
    const message = JSON.parse(patch.message);
    expect(message.turn).toMatchObject({ id: 'turn_orphan', status: 'interrupted' });
    expect(message.internal.chatTurnTerminalOrigin).toBe('service-recovery-v1');
    expect(billing.reconcileRefunds).toHaveBeenCalled();
  });

  it('rechecks the durable operation inside the legacy fallback transaction', async () => {
    logs.find.mockResolvedValue([
      {
        id: 31,
        status: ChatLogStatus.GENERATING,
        content: '',
        message: JSON.stringify({
          role: 'assistant',
          content: '',
          rounds: [],
          turn: { id: 'turn_live', status: 'running', startedAt: '2026-09-02T00:00:00.000Z' },
        }),
      },
    ]);
    operations.loadIdentityByAssistantInTransaction.mockResolvedValueOnce({
      operationId: 'op_turn_live',
      ownerType: 'user',
      ownerKey: '7',
      groupId: 1,
      userLogId: 30,
      assistantLogId: 31,
      turnId: 'turn_live',
      modelKeyId: 5,
    });

    await expect(service.recoverOrphanedTurns()).resolves.toEqual({ chatLogs: 0 });

    expect(operations.loadIdentityByAssistantInTransaction).toHaveBeenCalledWith(manager, 31);
    expect(logs.update).not.toHaveBeenCalled();
  });

  it('rechecks a single orphan inside the transaction before a legacy terminal update', async () => {
    const durableIdentity = {
      operationId: 'op_turn_live_single',
      ownerType: 'user',
      ownerKey: '7',
      groupId: 1,
      userLogId: 32,
      assistantLogId: 33,
      turnId: 'turn_live_single',
      modelKeyId: 5,
    };
    logs.findOne.mockResolvedValue({
      id: 33,
      status: ChatLogStatus.GENERATING,
      content: '',
      message: JSON.stringify({
        role: 'assistant',
        content: '',
        rounds: [],
        turn: {
          id: 'turn_live_single',
          status: 'running',
          startedAt: '2026-09-02T00:00:00.000Z',
        },
      }),
    });
    operations.findByAssistantLogId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...durableIdentity, phase: 'completed' });
    operations.loadIdentityByAssistantInTransaction.mockResolvedValueOnce(durableIdentity);

    await expect(service.recoverOrphanedTurn(33)).resolves.toEqual({ chatLogs: 0 });

    expect(operations.findByAssistantLogId).toHaveBeenCalledTimes(2);
    expect(operations.loadIdentityByAssistantInTransaction).toHaveBeenCalledWith(manager, 33);
    expect(logs.update).not.toHaveBeenCalled();
    expect(billing.reconcileRefunds).not.toHaveBeenCalled();
  });
});
