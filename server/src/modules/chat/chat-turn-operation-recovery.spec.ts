import { ChatLogStatus } from '@/common/constants/status.constant';
import { normalizeToolIntent } from '../agent/runtime-state/operation-ledger.types';
import { AgentOperationCancelledError } from '../agent/runtime-state/operation-ledger.store';
import { ChatTurnPersistenceService } from './chat-turn-persistence.service';
import type { ToolReplayIntent } from '../agent/tools/tool-provider.interface';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const identity = {
  operationId: 'op_turn_recovery_1',
  ownerType: 'user' as const,
  ownerKey: '7',
  groupId: 1,
  userLogId: 10,
  assistantLogId: 11,
  turnId: 'turn_recovery_1',
  modelKeyId: 5,
};

function operation(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    ...identity,
    phase: 'running',
    billingPhase: 'none',
    settlementMode: null,
    settlementTotalTokens: 0,
    settlementToolCost: '0',
    ...overrides,
  } as any;
}

function assistant() {
  return {
    id: 11,
    cid: 'c_assistant_recovery',
    status: ChatLogStatus.GENERATING,
    content: '',
    message: JSON.stringify({
      role: 'assistant',
      content: '',
      rounds: [],
      turn: {
        id: 'turn_recovery_1',
        status: 'running',
        startedAt: '2026-09-09T00:00:00.000Z',
      },
    }),
  } as any;
}

describe('ChatTurnPersistenceService durable recovery', () => {
  let logs: any;
  let operations: any;
  let session: any;
  let billing: any;
  let registry: any;
  let models: any;

  function createService(row: any, effects: any[]) {
    logs = {
      findOne: jest.fn().mockResolvedValue(assistant()),
      find: jest.fn().mockResolvedValue([assistant()]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = { getRepository: jest.fn().mockReturnValue(logs) };
    const repository = {
      findOne: logs.findOne,
      manager: {
        transaction: jest.fn(async (callback: (entityManager: typeof manager) => unknown) =>
          callback(manager),
        ),
      },
    };
    session = {
      identity,
      fence: { operationId: identity.operationId, generation: 2, leaseOwner: 'recovery' },
      commitToolEffect: jest.fn().mockResolvedValue(undefined),
      completeSettlement: jest.fn().mockResolvedValue(undefined),
      beginRefund: jest.fn().mockResolvedValue(undefined),
      completeRefund: jest.fn().mockResolvedValue(undefined),
      markBillingUnknown: jest.fn().mockResolvedValue(undefined),
      isCancelRequested: jest.fn().mockResolvedValue(false),
      terminalize: jest.fn().mockResolvedValue(true),
      close: jest.fn(),
    };
    operations = {
      loadIdentityByAssistantInTransaction: jest.fn().mockResolvedValue(identity),
      findRecoverable: jest.fn().mockResolvedValueOnce([row]).mockResolvedValue([]),
      identityFrom: jest.fn().mockReturnValue(identity),
      claim: jest.fn().mockResolvedValue(session),
      listEffects: jest.fn().mockResolvedValue(effects),
      settleEffectForRecovery: jest.fn().mockResolvedValue(undefined),
      claimToolReplay: jest.fn().mockResolvedValue(null),
    };
    billing = {
      settleTurn: jest.fn().mockResolvedValue({ charged: 4 }),
      refundTurn: jest.fn().mockResolvedValue(undefined),
      reconcileRefunds: jest.fn().mockResolvedValue(undefined),
    };
    registry = {
      getReplayIntent: jest.fn().mockReturnValue({ policy: 'never' }),
      execute: jest.fn(),
      getToolCost: jest.fn().mockResolvedValue(0),
    };
    models = {
      findByIdIncludingDisabled: jest.fn().mockResolvedValue({ id: 5, deduct: 1 }),
    };
    return new ChatTurnPersistenceService(
      repository as any,
      {} as any,
      { enrichUserUploadFileRefMappings: jest.fn() } as any,
      billing as any,
      operations as any,
      registry as any,
      models as any,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  it('never replays a provider request and materializes only its bounded partial', async () => {
    const service = createService(operation(), [
      {
        id: 1,
        operationId: identity.operationId,
        effectKey: 'provider:r0:a0',
        kind: 'model',
        roundIndex: 0,
        ordinal: 0,
        attemptIndex: 0,
        state: 'streaming',
        checkpoint: JSON.stringify({
          textTail: 'SAFE_PARTIAL',
          textChars: 12,
          reasoningChars: 0,
        }),
      },
    ]);

    await expect(service.recoverOrphanedTurns()).resolves.toEqual({ chatLogs: 1 });
    expect(registry.execute).not.toHaveBeenCalled();
    expect(operations.settleEffectForRecovery).toHaveBeenCalledWith(
      session.fence,
      'provider:r0:a0',
      'unknown',
    );
    const terminal = session.terminalize.mock.calls[0][0];
    expect(terminal.phase).toBe('interrupted');
    expect(terminal.chatLogPatch.status).toBe(ChatLogStatus.STOPPED);
    expect(terminal.chatLogPatch.content).toContain('SAFE_PARTIAL');
    expect(terminal.chatLogPatch.content).toContain('未自动重试');
    expect(logs.update).not.toHaveBeenCalled();
  });

  it('materializes an unknown provider effect with its bounded partial', async () => {
    const service = createService(operation(), [
      {
        id: 1,
        operationId: identity.operationId,
        effectKey: 'provider:r0:a0',
        kind: 'model',
        roundIndex: 0,
        ordinal: 0,
        attemptIndex: 0,
        state: 'unknown',
        checkpoint: JSON.stringify({
          textTail: 'SAFE_UNKNOWN_PARTIAL',
          textChars: 20,
          reasoningChars: 0,
        }),
      },
    ]);

    await service.recoverOrphanedTurns();

    expect(registry.execute).not.toHaveBeenCalled();
    expect(operations.settleEffectForRecovery).not.toHaveBeenCalled();
    const terminal = session.terminalize.mock.calls[0][0];
    expect(terminal.chatLogPatch.content).toContain('SAFE_UNKNOWN_PARTIAL');
    expect(terminal.chatLogPatch.content).toContain('结果未知，未自动重试');
  });

  it('keeps absolute host paths out of stored effect recovery projection', async () => {
    const privatePaths = ['/Users/example/private/report.txt', '/custom-root/private/report.txt'];
    const service = createService(operation(), [
      {
        id: 1,
        operationId: identity.operationId,
        effectKey: 'provider:r0:a0',
        kind: 'model',
        roundIndex: 0,
        ordinal: 0,
        attemptIndex: 0,
        state: 'unknown',
        checkpoint: JSON.stringify({
          textTail: `结果保存于${privatePaths[0]}`,
          textChars: 47,
          reasoningChars: 0,
        }),
      },
      {
        id: 2,
        operationId: identity.operationId,
        effectKey: 'tool:r0:o0',
        kind: 'tool',
        roundIndex: 0,
        ordinal: 0,
        attemptIndex: 0,
        callId: 'call_path',
        toolName: 'ls',
        state: 'committed',
        outcome: JSON.stringify({
          callId: 'call_path',
          toolName: 'ls',
          displayName: `saved ${privatePaths[1]}`,
          status: 'success',
          modelContent: `prefix${privatePaths[0]}`,
          inputSummary: `path:${privatePaths[1]}`,
          toolCost: 0,
        }),
      },
    ]);

    await service.recoverOrphanedTurns();

    const terminal = session.terminalize.mock.calls[0][0];
    const projected = JSON.stringify(terminal.chatLogPatch);
    expect(projected).toContain('[path omitted]');
    for (const privatePath of privatePaths) expect(projected).not.toContain(privatePath);
  });

  it('replays a stored/current-safe tool exactly once and keeps ordinal materialization', async () => {
    const replay = normalizeToolIntent({
      roundIndex: 0,
      ordinal: 1,
      callId: 'call_safe',
      toolName: 'ls',
      replayPolicy: 'safe',
      replayPayload: { path: '', recursive: false },
      inputShape: { path: 'string', recursive: 'boolean' },
    });
    const service = createService(operation(), [
      {
        id: 1,
        operationId: identity.operationId,
        effectKey: 'tool:r0:o0',
        kind: 'tool',
        roundIndex: 0,
        ordinal: 0,
        attemptIndex: 0,
        callId: 'call_committed',
        toolName: 'read',
        state: 'committed',
        outcome: JSON.stringify({
          callId: 'call_committed',
          toolName: 'read',
          displayName: 'Read',
          status: 'success',
          modelContent: 'FIRST_RESULT',
          toolCost: 0,
        }),
      },
      {
        id: 2,
        operationId: identity.operationId,
        effectKey: 'tool:r0:o1',
        kind: 'tool',
        roundIndex: 0,
        ordinal: 1,
        attemptIndex: 0,
        callId: 'call_safe',
        toolName: 'ls',
        replayPolicy: 'safe',
        state: 'intent',
        intentPayload: replay.serializedPayload,
        intentFingerprint: replay.fingerprint,
      },
    ]);
    registry.getReplayIntent.mockReturnValue({
      policy: 'safe',
      payload: { path: '', recursive: false },
    });
    registry.execute.mockResolvedValue({
      status: 'success',
      name: 'List',
      displayName: 'List',
      model: { content: 'SECOND_RESULT' },
    });
    operations.claimToolReplay.mockResolvedValue({ state: 'replaying', recoveryAttempts: 1 });

    await service.recoverOrphanedTurns();

    expect(registry.execute).toHaveBeenCalledTimes(1);
    expect(registry.execute.mock.calls[0][2].input.context.options).toEqual({
      userId: 7,
      userRole: 'user',
      role: 'user',
      messageId: 'c_assistant_recovery',
      turnId: 'turn_recovery_1',
    });
    expect(session.commitToolEffect).toHaveBeenCalledWith(
      'tool:r0:o1',
      expect.objectContaining({ modelContent: 'SECOND_RESULT' }),
    );
    const content = session.terminalize.mock.calls[0][0].chatLogPatch.content;
    expect(content.indexOf('FIRST_RESULT')).toBeLessThan(content.indexOf('SECOND_RESULT'));
  });

  it('converges cancellation committed after the first recovery sample before replay claim', async () => {
    const replay = normalizeToolIntent({
      roundIndex: 0,
      ordinal: 0,
      callId: 'call_cancel_race',
      toolName: 'ls',
      replayPolicy: 'safe',
      replayPayload: { path: '', recursive: false },
      inputShape: { path: 'string', recursive: 'boolean' },
    });
    const service = createService(operation({ billingPhase: 'settled' }), [
      {
        id: 1,
        operationId: identity.operationId,
        effectKey: 'tool:r0:o0',
        kind: 'tool',
        roundIndex: 0,
        ordinal: 0,
        attemptIndex: 0,
        callId: 'call_cancel_race',
        toolName: 'ls',
        replayPolicy: 'safe',
        state: 'intent',
        intentPayload: replay.serializedPayload,
        intentFingerprint: replay.fingerprint,
      },
    ]);
    registry.getReplayIntent.mockReturnValue({
      policy: 'safe',
      payload: { path: '', recursive: false },
    });
    session.isCancelRequested.mockResolvedValue(false);
    operations.claimToolReplay.mockRejectedValue(new AgentOperationCancelledError());

    await service.recoverOrphanedTurns();

    expect(registry.execute).not.toHaveBeenCalled();
    expect(operations.settleEffectForRecovery).toHaveBeenCalledWith(
      session.fence,
      'tool:r0:o0',
      'interrupted',
    );
    expect(session.beginRefund).toHaveBeenCalled();
    expect(session.terminalize).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'interrupted',
        terminalReason: 'user_cancelled_recovery',
      }),
    );
  });

  it('dispatches at most once when replay claim commits before a later cancel', async () => {
    const replay = normalizeToolIntent({
      roundIndex: 0,
      ordinal: 0,
      callId: 'call_claim_wins',
      toolName: 'ls',
      replayPolicy: 'safe',
      replayPayload: { path: '', recursive: false },
      inputShape: { path: 'string', recursive: 'boolean' },
    });
    const service = createService(operation({ billingPhase: 'settled' }), [
      {
        id: 1,
        operationId: identity.operationId,
        effectKey: 'tool:r0:o0',
        kind: 'tool',
        roundIndex: 0,
        ordinal: 0,
        attemptIndex: 0,
        callId: 'call_claim_wins',
        toolName: 'ls',
        replayPolicy: 'safe',
        state: 'intent',
        intentPayload: replay.serializedPayload,
        intentFingerprint: replay.fingerprint,
      },
    ]);
    registry.getReplayIntent.mockReturnValue({
      policy: 'safe',
      payload: { path: '', recursive: false },
    });
    registry.execute.mockResolvedValue({
      status: 'success',
      name: 'List',
      model: { content: 'ONE_RESULT' },
    });
    operations.claimToolReplay.mockResolvedValue({ state: 'replaying', recoveryAttempts: 1 });
    session.isCancelRequested
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await service.recoverOrphanedTurns();

    expect(registry.execute).toHaveBeenCalledTimes(1);
    expect(session.commitToolEffect).toHaveBeenCalledTimes(1);
    expect(session.terminalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalReason: 'user_cancelled_recovery' }),
    );
  });

  it.each([
    ['stored never', 'never', { policy: 'safe', payload: { path: '', recursive: false } }],
    ['current policy changed', 'safe', { policy: 'never' }],
  ])(
    'does not replay a %s tool effect',
    async (_label: string, storedPolicy: string, currentPolicy: ToolReplayIntent) => {
      const service = createService(operation(), [
        {
          id: 2,
          operationId: identity.operationId,
          effectKey: 'tool:r0:o0',
          kind: 'tool',
          roundIndex: 0,
          ordinal: 0,
          attemptIndex: 0,
          callId: 'call_never',
          toolName: 'mcp__remote',
          replayPolicy: storedPolicy,
          state: 'intent',
          intentPayload: storedPolicy === 'safe' ? '{"path":"","recursive":false}' : null,
          intentFingerprint: 'a'.repeat(64),
        },
      ]);
      registry.getReplayIntent.mockReturnValue(currentPolicy);

      await service.recoverOrphanedTurns();

      expect(registry.execute).not.toHaveBeenCalled();
      expect(operations.claimToolReplay).not.toHaveBeenCalled();
      expect(operations.settleEffectForRecovery).toHaveBeenCalledWith(
        session.fence,
        'tool:r0:o0',
        'interrupted',
        expect.objectContaining({ status: 'error', toolCost: 0 }),
      );
    },
  );

  it('retries registered billing with the same relatedId, then refunds before terminal', async () => {
    const service = createService(
      operation({
        billingPhase: 'settle_intent',
        settlementMode: 'tools_only',
        settlementTotalTokens: 9,
        settlementToolCost: '2',
      }),
      [],
    );

    await service.recoverOrphanedTurns();

    expect(billing.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        totalTokens: 9,
        toolCost: 2,
        relatedId: 11,
        toolsOnly: true,
      }),
    );
    expect(session.completeSettlement).toHaveBeenCalledWith(4);
    expect(session.beginRefund).toHaveBeenCalled();
    expect(billing.refundTurn).toHaveBeenCalledWith(11, 'Durable Agent 恢复退款');
    expect(session.completeRefund).toHaveBeenCalled();
    expect(session.terminalize).toHaveBeenCalled();
  });

  it('marks a visitor settle intent unknown without repeating quota or billing calls', async () => {
    const row = operation({
      ownerType: 'visitor',
      ownerKey: 'visitor-fixture',
      billingPhase: 'settle_intent',
      settlementMode: 'full',
      settlementTotalTokens: 9,
    });
    const visitorIdentity = { ...identity, ownerType: 'visitor', ownerKey: 'visitor-fixture' };
    const service = createService(row, []);
    operations.identityFrom.mockReturnValue(visitorIdentity);
    session.identity = visitorIdentity;

    await service.recoverOrphanedTurns();

    expect(session.markBillingUnknown).toHaveBeenCalled();
    expect(billing.settleTurn).not.toHaveBeenCalled();
    expect(billing.refundTurn).not.toHaveBeenCalled();
    expect(session.terminalize).toHaveBeenCalled();
  });

  it('does not revisit a terminal visitor operation whose billing outcome is unknown', async () => {
    const row = operation({
      ownerType: 'visitor',
      ownerKey: 'visitor-fixture',
      phase: 'failed',
      billingPhase: 'unknown',
    });
    const service = createService(row, []);
    operations.findByAssistantLogId = jest.fn().mockResolvedValue(row);

    await expect(service.recoverOrphanedTurn(row.assistantLogId)).resolves.toEqual({ chatLogs: 0 });

    expect(operations.claim).not.toHaveBeenCalled();
    expect(session.markBillingUnknown).not.toHaveBeenCalled();
    expect(billing.settleTurn).not.toHaveBeenCalled();
    expect(billing.refundTurn).not.toHaveBeenCalled();
  });

  it('does not replay a tool or start a new effect while recovering a cancelled operation', async () => {
    const replay = normalizeToolIntent({
      roundIndex: 0,
      ordinal: 0,
      callId: 'call_cancelled_replay',
      toolName: 'ls',
      replayPolicy: 'safe',
      replayPayload: { path: '', recursive: false },
      inputShape: { path: 'string', recursive: 'boolean' },
    });
    const service = createService(
      operation({
        cancelRequestedAt: new Date('2026-09-10T00:00:00.000Z'),
        cancelRequestedGeneration: 1,
        billingPhase: 'settled',
      }),
      [
        {
          id: 1,
          operationId: identity.operationId,
          effectKey: 'provider:r0:a0',
          kind: 'model',
          roundIndex: 0,
          ordinal: 0,
          attemptIndex: 0,
          state: 'streaming',
          checkpoint: JSON.stringify({
            textTail: 'PARTIAL_BEFORE_CANCEL',
            textChars: 21,
            reasoningChars: 0,
          }),
        },
        {
          id: 2,
          operationId: identity.operationId,
          effectKey: 'tool:r0:o0',
          kind: 'tool',
          roundIndex: 0,
          ordinal: 0,
          attemptIndex: 0,
          callId: 'call_cancelled_replay',
          toolName: 'ls',
          replayPolicy: 'safe',
          state: 'intent',
          intentPayload: replay.serializedPayload,
          intentFingerprint: replay.fingerprint,
        },
      ],
    );

    await service.recoverOrphanedTurns();

    expect(registry.execute).not.toHaveBeenCalled();
    expect(operations.claimToolReplay).not.toHaveBeenCalled();
    expect(operations.settleEffectForRecovery).toHaveBeenCalledWith(
      session.fence,
      'provider:r0:a0',
      'unknown',
    );
    expect(operations.settleEffectForRecovery).toHaveBeenCalledWith(
      session.fence,
      'tool:r0:o0',
      'interrupted',
    );
    expect(session.beginRefund).toHaveBeenCalled();
    expect(billing.refundTurn).toHaveBeenCalledTimes(1);
    expect(session.terminalize).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'interrupted',
        terminalReason: 'user_cancelled_recovery',
      }),
    );
    expect(session.terminalize.mock.calls[0][0].chatLogPatch.content).toContain(
      'PARTIAL_BEFORE_CANCEL',
    );
  });
});
