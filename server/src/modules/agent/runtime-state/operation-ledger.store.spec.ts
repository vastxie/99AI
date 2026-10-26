import { AgentEffectEntity } from './agent-effect.entity';
import { AgentOperationEntity } from './agent-operation.entity';
import { AgentOperationStore } from './operation-ledger.store';
import { ChatLogEntity } from '../../chatLog/chatLog.entity';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function matches(row: any, where: Record<string, any>): boolean {
  return Object.entries(where || {}).every(([key, expected]: [string, any]) => {
    if (expected && typeof expected === 'object' && Array.isArray(expected._value)) {
      return expected._value.includes(row[key]);
    }
    if (expected && typeof expected === 'object' && expected._type === 'isNull') {
      return row[key] === null || row[key] === undefined;
    }
    return row[key] === expected;
  });
}

class MemoryRepository<T extends Record<string, any>> {
  rows: T[] = [];
  nextId = 1;
  manager: any;

  create(value: Partial<T>): T {
    return { ...value } as T;
  }

  async save(value: T): Promise<T> {
    if (!(value as any).id) (value as any).id = this.nextId++;
    const index = this.rows.findIndex(row => (row as any).id === (value as any).id);
    if (index >= 0) this.rows[index] = value;
    else this.rows.push(value);
    return value;
  }

  async findOne(input: { where: Record<string, any> }): Promise<T | null> {
    return this.rows.find(row => matches(row, input.where)) || null;
  }

  async find(
    input: { where?: Record<string, any>; order?: Record<string, string>; take?: number } = {},
  ): Promise<T[]> {
    let rows = input.where ? this.rows.filter(row => matches(row, input.where!)) : [...this.rows];
    if (input.order) {
      const keys = Object.keys(input.order);
      rows = [...rows].sort((left, right) => {
        for (const key of keys) {
          if (left[key] === right[key]) continue;
          return left[key] < right[key] ? -1 : 1;
        }
        return 0;
      });
    }
    return input.take ? rows.slice(0, input.take) : rows;
  }

  async update(
    where: Record<string, any>,
    patch: Record<string, any>,
  ): Promise<{ affected: number }> {
    const selected = this.rows.filter(row => matches(row, where));
    selected.forEach(row => Object.assign(row, patch));
    return { affected: selected.length };
  }
}

function identity() {
  return {
    operationId: 'op_turn_store_1',
    ownerType: 'user' as const,
    ownerKey: '7',
    groupId: 1,
    userLogId: 10,
    assistantLogId: 11,
    turnId: 'turn_store_1',
    modelKeyId: 5,
  };
}

describe('AgentOperationStore conformance', () => {
  let operations: MemoryRepository<any>;
  let effects: MemoryRepository<any>;
  let chatLogs: MemoryRepository<any>;
  let store: AgentOperationStore;
  let manager: any;

  beforeEach(() => {
    operations = new MemoryRepository();
    effects = new MemoryRepository();
    chatLogs = new MemoryRepository();
    chatLogs.rows.push({ id: 11, status: 3, content: '', message: '{}' });
    manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === AgentOperationEntity) return operations;
        if (entity === AgentEffectEntity) return effects;
        if (entity === ChatLogEntity) return chatLogs;
        throw new Error('unknown repository');
      }),
    };
    const rootManager = {
      transaction: jest.fn(async (callback: (entityManager: typeof manager) => unknown) =>
        callback(manager),
      ),
    };
    operations.manager = rootManager;
    effects.manager = rootManager;
    chatLogs.manager = rootManager;
    store = new AgentOperationStore(operations as any, effects as any);
  });

  async function admittedSession() {
    await store.admitInTransaction(manager, identity());
    return store.claim(identity());
  }

  it('admits one immutable identity and rejects a conflicting duplicate', async () => {
    await expect(store.admitInTransaction(manager, identity())).resolves.toEqual(identity());
    await expect(store.admitInTransaction(manager, identity())).resolves.toEqual(identity());
    expect(operations.rows).toHaveLength(1);
    await expect(
      store.admitInTransaction(manager, { ...identity(), assistantLogId: 12 }),
    ).rejects.toThrow(/identity mismatch/u);
  });

  it('reserves a new admission for the creating instance until its first claim', async () => {
    await store.admitInTransaction(manager, identity());
    const competingStore = new AgentOperationStore(operations as any, effects as any);

    await expect(competingStore.claim(identity(), { recovery: true })).rejects.toThrow(
      /lease is active/u,
    );
    const foreground = await store.claim(identity());

    expect(foreground.fence.generation).toBe(1);
    expect(operations.rows[0]).toMatchObject({ phase: 'running', generation: 1 });
    foreground.close();
  });

  it('leases by generation, allows expired takeover, and fences the stale writer', async () => {
    const first = await admittedSession();
    expect(first.fence.generation).toBe(1);
    await expect(store.claim(identity())).rejects.toThrow(/lease is active/u);
    operations.rows[0].leaseExpiresAt = new Date(Date.now() - 1);
    const recovery = await store.claim(identity(), { recovery: true });
    expect(recovery.fence.generation).toBe(2);
    await expect(
      first.beginModelEffect({
        roundIndex: 0,
        attemptIndex: 0,
        messageCount: 1,
        toolNames: [],
        providerPayloadChars: 10,
        requestShapeHash: 'a'.repeat(64),
      }),
    ).rejects.toThrow(/generation fence/u);
    first.close();
    recovery.close();
  });

  it('renews an expired same-generation heartbeat only until another claim takes over', async () => {
    const first = await admittedSession();
    operations.rows[0].leaseExpiresAt = new Date(Date.now() - 1);

    await expect(store.heartbeat(first.fence)).resolves.toBe(true);
    expect(operations.rows[0].leaseExpiresAt.getTime()).toBeGreaterThan(Date.now());

    operations.rows[0].leaseExpiresAt = new Date(Date.now() - 1);
    const recovery = await store.claim(identity(), { recovery: true });
    await expect(store.heartbeat(first.fence)).resolves.toBe(false);
    await expect(store.heartbeat(recovery.fence, true)).resolves.toBe(true);
    expect(operations.rows[0]).toMatchObject({
      generation: recovery.fence.generation,
      leaseOwner: recovery.fence.leaseOwner,
    });

    first.close();
    recovery.close();
  });

  it('persists a fenced retry gate and blocks crash recovery until it is due', async () => {
    const session = await admittedSession();
    const future = new Date(Date.now() + 30_000);
    await session.setRetryNotBefore(future);
    expect(operations.rows[0].retryNotBefore).toEqual(future);
    session.close();
    operations.rows[0].leaseExpiresAt = new Date(Date.now() - 1);

    const recoveryStore = new AgentOperationStore(operations as any, effects as any);
    await expect(recoveryStore.claim(identity(), { recovery: true })).rejects.toThrow(
      /retry is not ready/u,
    );

    operations.rows[0].retryNotBefore = new Date(Date.now() - 1);
    const recovery = await recoveryStore.claim(identity(), { recovery: true });
    expect(recovery.fence.generation).toBe(2);
    recovery.close();
  });

  it('sets and clears retry gates only while the generation is current and uncancelled', async () => {
    const session = await admittedSession();
    const first = new Date(Date.now() + 1_000);
    await session.setRetryNotBefore(first);
    await session.clearRetryNotBefore();
    expect(operations.rows[0].retryNotBefore).toBeNull();

    operations.rows[0].cancelRequestedAt = new Date();
    operations.rows[0].cancelRequestedGeneration = session.fence.generation;
    await expect(session.setRetryNotBefore(new Date(Date.now() + 2_000))).rejects.toMatchObject({
      name: 'AbortError',
      code: 'aborted',
    });
    await expect(session.clearRetryNotBefore()).rejects.toMatchObject({
      name: 'AbortError',
      code: 'aborted',
    });
    session.close();
  });

  it('never replays an existing provider intent and aggregates committed usage once', async () => {
    const session = await admittedSession();
    const intent = {
      roundIndex: 0,
      attemptIndex: 0,
      messageCount: 1,
      toolNames: ['ls'],
      providerPayloadChars: 20,
      requestShapeHash: 'b'.repeat(64),
    };
    await expect(session.beginModelEffect(intent)).resolves.toEqual({
      action: 'execute',
      effectKey: 'provider:r0:a0',
    });
    await expect(session.beginModelEffect(intent)).resolves.toEqual({
      action: 'unknown',
      effectKey: 'provider:r0:a0',
    });
    const checkpoint = {
      textTail: 'done',
      textChars: 4,
      reasoningChars: 0,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    };
    await session.finishModelEffect('provider:r0:a0', 'committed', checkpoint);
    await session.finishModelEffect('provider:r0:a0', 'committed', checkpoint);
    expect(operations.rows[0]).toMatchObject({
      usageInputTokens: 3,
      usageOutputTokens: 2,
      usageTotalTokens: 5,
    });
    session.close();
  });

  it('reuses one committed tool outcome without charging or executing twice', async () => {
    const session = await admittedSession();
    const intent = {
      roundIndex: 0,
      ordinal: 0,
      callId: 'call_1',
      toolName: 'ls',
      replayPolicy: 'safe' as const,
      replayPayload: { path: '', recursive: false },
      inputShape: { path: 'string', recursive: 'boolean' },
    };
    const decision = await session.beginToolEffect(intent);
    expect(decision.action).toBe('execute');
    const outcome = {
      callId: 'call_1',
      toolName: 'ls',
      displayName: 'ls',
      status: 'success' as const,
      modelContent: 'file.txt',
      toolCost: 2,
    };
    await session.commitToolEffect(decision.effectKey, outcome);
    await session.commitToolEffect(decision.effectKey, outcome);
    await expect(session.beginToolEffect(intent)).resolves.toMatchObject({
      action: 'reuse',
      outcome,
    });
    expect(Number(operations.rows[0].toolCost)).toBe(2);
    await expect(
      session.commitToolEffect(decision.effectKey, { ...outcome, modelContent: 'different' }),
    ).rejects.toThrow(/identity conflict/u);
    session.close();
  });

  it('claims a safe recovery replay at most once', async () => {
    const session = await admittedSession();
    const decision = await session.beginToolEffect({
      roundIndex: 1,
      ordinal: 0,
      callId: 'call_replay',
      toolName: 'ls',
      replayPolicy: 'safe',
      replayPayload: { path: '', recursive: false },
      inputShape: { path: 'string', recursive: 'boolean' },
    });
    expect(await store.claimToolReplay(session.fence, decision.effectKey)).toMatchObject({
      state: 'replaying',
      recoveryAttempts: 1,
    });
    await expect(store.claimToolReplay(session.fence, decision.effectKey)).resolves.toBeNull();
    session.close();
  });

  it('lets durable cancel reject a recovery replay claim under the operation lock', async () => {
    const session = await admittedSession();
    const decision = await session.beginToolEffect({
      roundIndex: 1,
      ordinal: 0,
      callId: 'call_replay_cancelled',
      toolName: 'ls',
      replayPolicy: 'safe',
      replayPayload: { path: '', recursive: false },
      inputShape: { path: 'string', recursive: 'boolean' },
    });
    operations.rows[0].cancelRequestedAt = new Date();
    operations.rows[0].cancelRequestedGeneration = session.fence.generation;

    await expect(store.claimToolReplay(session.fence, decision.effectKey)).rejects.toMatchObject({
      name: 'AbortError',
      code: 'aborted',
    });
    expect(effects.rows[0]).toMatchObject({ state: 'intent', recoveryAttempts: 0 });
    session.close();
  });

  it('records a tool that was stopped before dispatch as interrupted', async () => {
    const session = await admittedSession();
    const decision = await session.beginToolEffect({
      roundIndex: 1,
      ordinal: 0,
      callId: 'call_interrupted',
      toolName: 'remote_mutation',
      replayPolicy: 'never',
      inputShape: {},
    });

    await session.markToolEffectInterrupted(decision.effectKey);

    expect(effects.rows[0]).toMatchObject({ state: 'interrupted' });
    expect(effects.rows[0].terminalAt).toBeInstanceOf(Date);
    session.close();
  });

  it('settles a model effect even when its optional recovery checkpoint is corrupt', async () => {
    const session = await admittedSession();
    const decision = await session.beginModelEffect({
      roundIndex: 0,
      attemptIndex: 0,
      messageCount: 1,
      toolNames: [],
      providerPayloadChars: 10,
      requestShapeHash: 'c'.repeat(64),
    });
    effects.rows[0].checkpoint = '{corrupt';

    await expect(
      store.settleEffectForRecovery(session.fence, decision.effectKey, 'unknown'),
    ).resolves.toBeUndefined();
    expect(effects.rows[0]).toMatchObject({ state: 'unknown' });
    expect(operations.rows[0]).toMatchObject({
      usageInputTokens: 0,
      usageOutputTokens: 0,
      usageTotalTokens: 0,
    });
    session.close();
  });

  it('binds billing facts and makes the exact terminal transition idempotent', async () => {
    const session = await admittedSession();
    await session.setRetryNotBefore(new Date(Date.now() + 1_000));
    await session.beginSettlement({ mode: 'full', totalTokens: 9, toolCost: 1 });
    await session.beginSettlement({ mode: 'full', totalTokens: 9, toolCost: 1 });
    await expect(
      session.beginSettlement({ mode: 'full', totalTokens: 10, toolCost: 1 }),
    ).rejects.toThrow(/identity conflict/u);
    await session.completeSettlement(3);
    await session.completeSettlement(3);
    await session.beginRefund();
    await session.completeRefund();
    const terminal = {
      assistantLogId: 11,
      phase: 'completed' as const,
      terminalReason: 'stop',
      chatLogPatch: { status: 1, content: 'done' },
    };
    await expect(session.terminalize(terminal)).resolves.toBe(true);
    await expect(store.terminalizeWithAssistant(session.fence, terminal)).resolves.toBe(true);
    expect(chatLogs.rows[0]).toMatchObject({ status: 1, content: 'done' });
    expect(operations.rows[0].retryNotBefore).toBeNull();
    await expect(
      store.terminalizeWithAssistant(session.fence, {
        ...terminal,
        phase: 'failed',
      }),
    ).rejects.toThrow(/terminal identity conflict/u);
  });

  it('persists an unknown visitor settlement before the operation becomes terminal', async () => {
    const session = await admittedSession();
    await session.beginSettlement({ mode: 'full', totalTokens: 9, toolCost: 1 });
    await session.markBillingUnknown();
    await session.markBillingUnknown();
    await expect(session.completeSettlement(1)).rejects.toThrow(/settlement outcome rejected/u);
    await session.terminalize({
      assistantLogId: 11,
      phase: 'failed',
      terminalReason: 'process_error',
      chatLogPatch: { status: 2, content: 'failed' },
    });

    expect(operations.rows[0]).toMatchObject({
      phase: 'failed',
      billingPhase: 'unknown',
      terminalReason: 'process_error',
    });
  });

  it('rejects billing unknown without an uncertain settlement intent', async () => {
    const session = await admittedSession();

    await expect(session.markBillingUnknown()).rejects.toThrow(/unknown transition rejected/u);
    session.close();
  });

  it('lets a durable cancel win before any new model, tool, settlement or non-cancel terminal', async () => {
    const session = await admittedSession();
    operations.rows[0].cancelRequestedAt = new Date();
    operations.rows[0].cancelRequestedGeneration = session.fence.generation;

    await expect(
      session.beginModelEffect({
        roundIndex: 0,
        attemptIndex: 0,
        messageCount: 1,
        toolNames: [],
        providerPayloadChars: 10,
        requestShapeHash: 'd'.repeat(64),
      }),
    ).rejects.toMatchObject({ name: 'AbortError', code: 'aborted' });
    await expect(
      session.beginToolEffect({
        roundIndex: 0,
        ordinal: 0,
        callId: 'call_after_cancel',
        toolName: 'ls',
        replayPolicy: 'safe',
        replayPayload: { path: '', recursive: false },
        inputShape: { path: 'string', recursive: 'boolean' },
      }),
    ).rejects.toMatchObject({ name: 'AbortError', code: 'aborted' });
    await expect(
      session.beginSettlement({ mode: 'full', totalTokens: 1, toolCost: 0 }),
    ).rejects.toMatchObject({ name: 'AbortError', code: 'aborted' });
    await expect(
      session.terminalize({
        assistantLogId: 11,
        phase: 'completed',
        terminalReason: 'stop',
        chatLogPatch: { status: 1 },
      }),
    ).rejects.toMatchObject({ name: 'AbortError', code: 'aborted' });
    expect(effects.rows).toHaveLength(0);

    await expect(
      session.terminalize({
        assistantLogId: 11,
        phase: 'interrupted',
        terminalReason: 'user_cancelled',
        chatLogPatch: { status: 2 },
      }),
    ).resolves.toBe(true);
    expect(operations.rows[0]).toMatchObject({
      phase: 'interrupted',
      terminalReason: 'user_cancelled',
    });
  });

  it('preserves an already-dispatched effect outcome but blocks the next effect after cancel', async () => {
    const session = await admittedSession();
    const first = await session.beginToolEffect({
      roundIndex: 0,
      ordinal: 0,
      callId: 'call_before_cancel',
      toolName: 'write',
      replayPolicy: 'never',
      inputShape: { path: 'string' },
    });
    operations.rows[0].cancelRequestedAt = new Date();
    operations.rows[0].cancelRequestedGeneration = session.fence.generation;

    await expect(
      session.commitToolEffect(first.effectKey, {
        callId: 'call_before_cancel',
        toolName: 'write',
        displayName: 'write',
        status: 'success',
        modelContent: 'written',
        toolCost: 1,
      }),
    ).resolves.toBeUndefined();
    expect(effects.rows[0]).toMatchObject({ state: 'committed' });
    await expect(
      session.beginToolEffect({
        roundIndex: 0,
        ordinal: 1,
        callId: 'call_after_cancel',
        toolName: 'write',
        replayPolicy: 'never',
        inputShape: { path: 'string' },
      }),
    ).rejects.toMatchObject({ name: 'AbortError', code: 'aborted' });
    expect(effects.rows).toHaveLength(1);
    session.close();
  });

  it('converges a settlement already in flight before cancel, then permits refund only', async () => {
    const session = await admittedSession();
    await session.beginSettlement({ mode: 'full', totalTokens: 9, toolCost: 1 });
    operations.rows[0].cancelRequestedAt = new Date();
    operations.rows[0].cancelRequestedGeneration = session.fence.generation;

    await session.completeSettlement(3);
    await session.beginRefund();
    await session.completeRefund();
    expect(operations.rows[0]).toMatchObject({ billingPhase: 'refunded', chargedAmount: 3 });
    session.close();
  });
});
