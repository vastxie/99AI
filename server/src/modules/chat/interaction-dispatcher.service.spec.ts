import { InteractionDispatcher } from './interaction-dispatcher.service';
import { ChatSubmissionService } from './chat-submission.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const CONVERSATION_GID = 'g_0123456789abcdefghijklmn';
const SUBMISSION_ID = 'sub_dispatcher_0123456789';

function admissionFor(overrides: Record<string, any> = {}) {
  return {
    body: { prompt: 'hi', submissionId: SUBMISSION_ID },
    user: { id: 7, role: 'user' },
    visitorId: null,
    chatUserId: 7,
    workflowOwnerId: 7,
    prompt: 'hi',
    chatChannel: 'web',
    operation: 'chat',
    submissionId: SUBMISSION_ID,
    submissionFingerprint: null,
    chatGroupId: 1,
    conversationGid: CONVERSATION_GID,
    ...overrides,
  } as any;
}

const userMessage = { role: 'user', content: 'hi', rounds: [] } as any;
const emitter = { emit: jest.fn() } as any;

function createDispatcher() {
  const group = { id: 1, gid: CONVERSATION_GID } as any;
  const manager = { name: 'manager' } as any;
  const chatGroups = {
    withConversationWriteLock: jest.fn(async (_gid: string, _user: any, operation: any) =>
      operation(group, manager),
    ),
  };
  const preflight = {
    prepareExecution: jest.fn(async (admission: any) => ({ ...admission, useModel: 'gpt-test' })),
  };
  const turns = {
    findDuplicateTurn: jest.fn().mockResolvedValue(null),
    writeExternalTurn: jest.fn(async () => ({ assistantCid: 'c_external' })),
    lockContinuationForAdmissionInTransaction: jest.fn().mockResolvedValue(undefined),
    consumeContinuationInTransaction: jest.fn().mockResolvedValue(undefined),
    consumeLockedContinuationInTransaction: jest.fn().mockResolvedValue(undefined),
    discardContinuationAdmissionInTransaction: jest.fn().mockResolvedValue(true),
    assertReplaceableInTransaction: jest.fn().mockResolvedValue(undefined),
    isContinuationParentReplacedInTransaction: jest.fn().mockResolvedValue(false),
  };
  const chatRunner = { run: jest.fn(async () => ({ assistantCid: 'c_web' })) };
  const dispatcher = new InteractionDispatcher(
    chatGroups as any,
    preflight as any,
    turns as any,
    chatRunner as any,
    new ChatSubmissionService(),
  );
  return { dispatcher, chatGroups, preflight, turns, chatRunner, group, manager };
}

describe('InteractionDispatcher', () => {
  it('writes external-channel turns without taking the conversation lock', async () => {
    const { dispatcher, chatGroups, preflight, turns } = createDispatcher();
    const admission = admissionFor({ chatChannel: 'demo_bot', submissionId: null });

    const committed = await dispatcher.commit({ admission, userMessage, emitter });

    expect(chatGroups.withConversationWriteLock).not.toHaveBeenCalled();
    expect(preflight.prepareExecution).toHaveBeenCalledWith(admission, emitter);
    expect(turns.writeExternalTurn).toHaveBeenCalledWith({
      preflight: expect.objectContaining({ useModel: 'gpt-test' }),
      userMessage,
    });
    expect(committed).toMatchObject({ duplicate: false, records: { assistantCid: 'c_external' } });
  });

  it('returns the recorded turn for a duplicate submission before any mutable preflight', async () => {
    const { dispatcher, preflight, turns, chatRunner } = createDispatcher();
    turns.findDuplicateTurn.mockResolvedValue({ assistantCid: 'c_existing' });

    const committed = await dispatcher.commit({ admission: admissionFor(), userMessage, emitter });

    expect(committed).toEqual({ duplicate: true, records: { assistantCid: 'c_existing' } });
    expect(preflight.prepareExecution).not.toHaveBeenCalled();
    expect(chatRunner.run).not.toHaveBeenCalled();
    const resolveFingerprint = turns.findDuplicateTurn.mock.calls[0][3];
    await expect(resolveFingerprint()).resolves.toMatchObject({ digest: expect.any(String) });
  });

  it('runs mutable preflight inside the lock and commits the turn with a locked fingerprint', async () => {
    const { dispatcher, chatGroups, preflight, chatRunner, group, manager } = createDispatcher();
    const admission = admissionFor();

    const committed = await dispatcher.commit({ admission, userMessage, emitter });

    expect(chatGroups.withConversationWriteLock).toHaveBeenCalledWith(
      CONVERSATION_GID,
      admission.user,
      expect.any(Function),
    );
    expect(preflight.prepareExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        chatGroupId: 1,
        conversationGid: CONVERSATION_GID,
      }),
      emitter,
    );
    expect(chatRunner.run).toHaveBeenCalledWith({
      preflight: expect.objectContaining({
        useModel: 'gpt-test',
        submissionFingerprint: expect.objectContaining({ digest: expect.any(String) }),
      }),
      userMessage,
      group,
      manager,
    });
    expect(committed).toMatchObject({ duplicate: false, records: { assistantCid: 'c_web' } });
  });

  it('returns null when the mutable preflight rejects the submission', async () => {
    const { dispatcher, preflight, chatRunner } = createDispatcher();
    preflight.prepareExecution.mockResolvedValue(null);

    await expect(
      dispatcher.commit({ admission: admissionFor(), userMessage, emitter }),
    ).resolves.toBeNull();
    expect(chatRunner.run).not.toHaveBeenCalled();
  });

  it('checks a replacement before the mutable preflight: a refused replacement never reaches it', async () => {
    const { dispatcher, preflight, turns, chatRunner, group, manager } = createDispatcher();
    const refused = Object.assign(new Error('gone'), { status: 409 });
    turns.assertReplaceableInTransaction.mockRejectedValue(refused);
    const admission = admissionFor({
      body: { prompt: 'hi', submissionId: SUBMISSION_ID, replaceFromCid: 'c_0123456789abcdefgh' },
    });

    await expect(dispatcher.commit({ admission, userMessage, emitter })).rejects.toBe(refused);
    expect(turns.assertReplaceableInTransaction).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ body: admission.body }),
      group,
    );
    expect(preflight.prepareExecution).not.toHaveBeenCalled();
    expect(chatRunner.run).not.toHaveBeenCalled();
  });

  it('drops a queued continuation whose parent turn was replaced meanwhile', async () => {
    const { dispatcher, preflight, turns, chatRunner, manager } = createDispatcher();
    turns.isContinuationParentReplacedInTransaction.mockResolvedValue(true);
    const claim = { inboxId: 9, parentAssistantLogId: 41 } as any;

    await expect(
      dispatcher.commit({
        admission: admissionFor({ operation: 'continue', parentTurnId: 'turn_parent_1' }),
        userMessage,
        emitter,
        continuationClaim: claim,
      }),
    ).resolves.toBeNull();
    expect(turns.discardContinuationAdmissionInTransaction).toHaveBeenCalledWith(
      manager,
      claim,
      'parent_replaced',
    );
    expect(preflight.prepareExecution).not.toHaveBeenCalled();
    expect(chatRunner.run).not.toHaveBeenCalled();
    // 发起的页面收到说明：补充要求没有执行（不再无声消失）
    expect(emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.error',
        data: expect.objectContaining({ code: 'QUEUE_TURN_DISCARDED' }),
      }),
    );
  });

  it('terminalizes a continuation claim in the same transaction when preflight rejects', async () => {
    const { dispatcher, preflight, turns, manager } = createDispatcher();
    preflight.prepareExecution.mockResolvedValue(null);
    const claim = { inboxId: 9 } as any;

    await expect(
      dispatcher.commit({
        admission: admissionFor({ operation: 'continue', parentTurnId: 'turn_parent_1' }),
        userMessage,
        emitter,
        continuationClaim: claim,
      }),
    ).resolves.toBeNull();
    expect(turns.discardContinuationAdmissionInTransaction).toHaveBeenCalledWith(
      manager,
      claim,
      'preflight_rejected',
    );
  });

  it('commits a safe terminal claim before surfacing a continuation preflight error', async () => {
    const { dispatcher, preflight, turns, manager } = createDispatcher();
    preflight.prepareExecution.mockRejectedValue(new Error('synthetic preflight failure'));
    const claim = { inboxId: 9 } as any;

    await expect(
      dispatcher.commit({
        admission: admissionFor({ operation: 'continue', parentTurnId: 'turn_parent_1' }),
        userMessage,
        emitter,
        continuationClaim: claim,
      }),
    ).rejects.toMatchObject({
      name: 'ContinuationPreflightTerminatedError',
      reason: expect.objectContaining({ message: 'synthetic preflight failure' }),
    });
    expect(turns.discardContinuationAdmissionInTransaction).toHaveBeenCalledWith(
      manager,
      claim,
      'preflight_failed',
    );
  });

  it('consumes a continuation in the same locked transaction after new child admission', async () => {
    const { dispatcher, turns, chatRunner, preflight, manager } = createDispatcher();
    const admission = admissionFor({
      operation: 'continue',
      parentTurnId: 'turn_parent_1',
    });
    const claim = { inboxId: 9 } as any;

    await dispatcher.commit({ admission, userMessage, emitter, continuationClaim: claim });

    expect(turns.lockContinuationForAdmissionInTransaction).toHaveBeenCalledWith(
      manager,
      claim,
      expect.objectContaining({ operation: 'continue' }),
    );
    expect(
      turns.lockContinuationForAdmissionInTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(preflight.prepareExecution.mock.invocationCallOrder[0]);
    expect(turns.consumeLockedContinuationInTransaction).toHaveBeenCalledWith(
      manager,
      claim,
      expect.objectContaining({ operation: 'continue' }),
    );
    expect(chatRunner.run.mock.invocationCallOrder[0]).toBeLessThan(
      turns.consumeLockedContinuationInTransaction.mock.invocationCallOrder[0],
    );
  });

  it('consumes a continuation alongside a duplicate child admission without rerunning preflight', async () => {
    const { dispatcher, turns, preflight, manager } = createDispatcher();
    turns.findDuplicateTurn.mockResolvedValue({ assistantCid: 'c_existing' });
    const admission = admissionFor({ operation: 'continue', parentTurnId: 'turn_parent_1' });
    const claim = { inboxId: 9 } as any;

    await expect(
      dispatcher.commit({ admission, userMessage, emitter, continuationClaim: claim }),
    ).resolves.toEqual({ duplicate: true, records: { assistantCid: 'c_existing' } });

    expect(turns.consumeContinuationInTransaction).toHaveBeenCalledWith(manager, claim, admission);
    expect(turns.lockContinuationForAdmissionInTransaction).not.toHaveBeenCalled();
    expect(preflight.prepareExecution).not.toHaveBeenCalled();
  });

  it('rejects the whole locked commit when continuation consumption loses its fence', async () => {
    const { dispatcher, turns } = createDispatcher();
    turns.consumeLockedContinuationInTransaction.mockRejectedValue(
      new Error('continuation fence lost'),
    );

    await expect(
      dispatcher.commit({
        admission: admissionFor({ operation: 'continue', parentTurnId: 'turn_parent_1' }),
        userMessage,
        emitter,
        continuationClaim: { inboxId: 9 } as any,
      }),
    ).rejects.toThrow('continuation fence lost');
  });
});
