import { AgentContinuationEntity } from './agent-continuation.entity';
import {
  AgentContinuationConflictError,
  AgentContinuationStateError,
  AgentContinuationStore,
} from './continuation-inbox.store';
import { AgentOperationEntity } from './agent-operation.entity';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const GID = 'g_0123456789abcdefghijklmn';
const NOW = new Date('2026-09-10T00:00:00.000Z');

function matchesOperator(value: any, expected: any): boolean {
  if (!expected || typeof expected !== 'object' || !('_type' in expected)) {
    return value === expected;
  }
  if (expected._type === 'in') return expected._value.includes(value);
  if (expected._type === 'moreThan') return value > expected._value;
  if (expected._type === 'lessThanOrEqual') return value <= expected._value;
  if (expected._type === 'isNull') return value === null || value === undefined;
  throw new Error(`unsupported operator: ${expected._type}`);
}

function matches(row: any, where: Record<string, any>): boolean {
  return Object.entries(where || {}).every(([key, expected]) =>
    matchesOperator(row[key], expected),
  );
}

class MemoryRepository<T extends Record<string, any>> {
  rows: T[] = [];
  nextId = 1;
  manager: any;
  readonly findOne = jest.fn(async (input: { where: Record<string, any> }) => {
    return this.rows.find(row => matches(row, input.where)) || null;
  });

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

  async find(input: {
    where?: Record<string, any> | Record<string, any>[];
    order?: Record<string, string>;
    take?: number;
    select?: string[];
  }): Promise<T[]> {
    const clauses = Array.isArray(input.where) ? input.where : input.where ? [input.where] : [];
    let rows = clauses.length
      ? this.rows.filter(row => clauses.some(clause => matches(row, clause)))
      : [...this.rows];
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

  async count(input: { where: Record<string, any> | Record<string, any>[] }): Promise<number> {
    const clauses = Array.isArray(input.where) ? input.where : [input.where];
    return this.rows.filter(row => clauses.some(clause => matches(row, clause))).length;
  }
}

function operation(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    operationId: 'op_turn_continuation_1',
    assistantLogId: 11,
    turnId: 'turn_continuation_1',
    ownerType: 'user' as const,
    ownerKey: '7',
    groupId: 3,
    generation: 1,
    phase: 'running',
    leaseOwner: 'runtime-test',
    leaseExpiresAt: new Date(NOW.getTime() + 60_000),
    cancelRequestedAt: null as Date | null,
    cancelRequestedGeneration: null as number | null,
    ...overrides,
  };
}

function binding(overrides: Record<string, any> = {}) {
  return {
    operationId: 'op_turn_continuation_1',
    parentAssistantLogId: 11,
    parentTurnId: 'turn_continuation_1',
    ownerType: 'user' as const,
    ownerKey: '7',
    groupId: 3,
    conversationGid: GID,
    generation: 1,
    ...overrides,
  };
}

function payload(overrides: Record<string, any> = {}) {
  return {
    prompt: 'next question',
    submissionId: 'submission_continuation_0001',
    parentTurnId: 'turn_continuation_1',
    gid: GID,
    modelId: 2,
    ...overrides,
  };
}

function expectTerminalScrub(row: Record<string, any>): void {
  expect(row.payload).toBe('{}');
  expect(row.claimedGeneration).toBeNull();
  expect(row.claimToken).toBeNull();
  expect(row.claimExpiresAt).toBeNull();
  expect(String(row.payload)).not.toContain('next question');
}

describe('AgentContinuationStore conformance', () => {
  let operations: MemoryRepository<any>;
  let continuations: MemoryRepository<any>;
  let manager: any;
  let store: AgentContinuationStore;

  beforeEach(() => {
    operations = new MemoryRepository();
    continuations = new MemoryRepository();
    operations.rows.push(operation());
    operations.nextId = 2;
    manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === AgentOperationEntity) return operations;
        if (entity === AgentContinuationEntity) return continuations;
        throw new Error('unknown repository');
      }),
    };
    const rootManager = {
      transaction: jest.fn(async (callback: (entityManager: typeof manager) => unknown) =>
        callback(manager),
      ),
    };
    operations.manager = rootManager;
    continuations.manager = rootManager;
    store = new AgentContinuationStore(continuations as any, operations as any);
  });

  it('keeps an enqueue across facade recreation and stores only the normalized payload', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    const recreated = new AgentContinuationStore(continuations as any, operations as any);

    await expect(recreated.peek({ binding: binding(), now: NOW })).resolves.toEqual(payload());
    expect(continuations.rows).toHaveLength(1);
    expect(JSON.parse(continuations.rows[0].payload)).toEqual(payload());
    expect(continuations.rows[0]).not.toHaveProperty('user');
    expect(continuations.rows[0]).not.toHaveProperty('rawBody');
  });

  it('makes the same submission idempotent, rejects payload reuse and replaces only with a new id', async () => {
    await expect(
      store.enqueue({ binding: binding(), payload: payload(), now: NOW }),
    ).resolves.toMatchObject({ replaced: false, duplicate: false, sequence: 1 });
    await expect(
      store.enqueue({ binding: binding(), payload: payload(), now: NOW }),
    ).resolves.toMatchObject({ replaced: false, duplicate: true, sequence: 1 });
    await expect(
      store.enqueue({
        binding: binding(),
        payload: payload({ prompt: 'different' }),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(AgentContinuationConflictError);

    const replacement = payload({
      prompt: 'latest',
      submissionId: 'submission_continuation_0002',
    });
    await expect(
      store.enqueue({ binding: binding(), payload: replacement, now: NOW }),
    ).resolves.toMatchObject({ replaced: true, duplicate: false, sequence: 2 });
    expect(continuations.rows).toHaveLength(1);
    expect(JSON.parse(continuations.rows[0].payload)).toEqual(replacement);
  });

  it.each([
    ['owner', { ownerKey: '8' }],
    ['group', { groupId: 4 }],
    ['turn', { parentTurnId: 'turn_continuation_other' }],
    ['generation', { generation: 2 }],
  ])(
    'rejects a %s binding mismatch under the parent operation lock',
    async (_label: string, patch: Record<string, unknown>) => {
      await expect(
        store.enqueue({
          binding: binding(patch),
          payload: payload(patch.parentTurnId ? { parentTurnId: patch.parentTurnId } : undefined),
          now: NOW,
        }),
      ).rejects.toBeInstanceOf(AgentContinuationStateError);
      expect(continuations.rows).toHaveLength(0);
    },
  );

  it('allows only one parent claim and expires stale pending work', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    const first = await store.claimForParent({ binding: binding(), now: NOW });

    expect(first).toMatchObject({ inboxId: 1, sequence: 1, generation: 1 });
    expect(first?.claimToken).toMatch(/^[a-f0-9]{64}$/u);
    await expect(store.claimForParent({ binding: binding(), now: NOW })).resolves.toBeUndefined();

    continuations.rows[0].status = 'pending';
    continuations.rows[0].expiresAt = new Date(NOW.getTime() - 1);
    await expect(store.claimForParent({ binding: binding(), now: NOW })).resolves.toBeUndefined();
    expect(continuations.rows[0]).toMatchObject({
      status: 'expired',
      terminalReason: 'ttl_expired',
    });
    expectTerminalScrub(continuations.rows[0]);
  });

  it('claims terminal-parent recovery in operation-first lock order and rejects nonlaunchable parents', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    operations.rows[0].phase = 'completed';
    operations.rows[0].leaseOwner = null;
    operations.rows[0].leaseExpiresAt = null;
    const lockOrder: string[] = [];
    operations.findOne.mockImplementation(async (input: { where: Record<string, unknown> }) => {
      if ((input as any).lock) lockOrder.push('operation');
      return operations.rows.find(row => matches(row, input.where)) || null;
    });
    continuations.findOne.mockImplementation(async (input: { where: Record<string, unknown> }) => {
      if ((input as any).lock) lockOrder.push('continuation');
      return continuations.rows.find(row => matches(row, input.where)) || null;
    });

    await expect(store.claimForRecovery(1, NOW)).resolves.toMatchObject({ inboxId: 1 });
    expect(lockOrder).toEqual(['operation', 'continuation']);

    continuations.rows[0].status = 'pending';
    continuations.rows[0].claimToken = null;
    continuations.rows[0].claimExpiresAt = null;
    operations.rows[0].phase = 'failed';
    await expect(store.claimForRecovery(1, NOW)).resolves.toBeUndefined();
    expect(continuations.rows[0]).toMatchObject({
      status: 'discarded',
      terminalReason: 'parent_not_launchable',
    });
    expectTerminalScrub(continuations.rows[0]);
  });

  it('scans only pending or reclaimable rows without requiring their payloads', async () => {
    continuations.rows = [
      { id: 1, status: 'pending', claimExpiresAt: null },
      { id: 2, status: 'claimed', claimExpiresAt: null },
      { id: 3, status: 'claimed', claimExpiresAt: new Date(NOW.getTime() - 1) },
      { id: 4, status: 'claimed', claimExpiresAt: new Date(NOW.getTime() + 1) },
      { id: 5, status: 'discarded', claimExpiresAt: null },
    ];

    await expect(store.listRecoveryCandidates(NOW)).resolves.toEqual([
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ id: 2 }),
      expect.objectContaining({ id: 3 }),
    ]);
  });

  it('recovers startup-interrupted parents but not a user-cancelled parent', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    operations.rows[0].phase = 'interrupted';
    operations.rows[0].terminalReason = 'startup_recovery';
    operations.rows[0].leaseOwner = null;
    operations.rows[0].leaseExpiresAt = null;
    await expect(store.claimForRecovery(1, NOW)).resolves.toMatchObject({ inboxId: 1 });

    continuations.rows[0].status = 'pending';
    continuations.rows[0].claimToken = null;
    continuations.rows[0].claimExpiresAt = null;
    operations.rows[0].cancelRequestedAt = NOW;
    await expect(store.claimForRecovery(1, NOW)).resolves.toBeUndefined();
    expect(continuations.rows[0]).toMatchObject({
      status: 'discarded',
      terminalReason: 'parent_cancelled',
    });
    expectTerminalScrub(continuations.rows[0]);
  });

  it.each([
    ['ttl_expired', 'expired'],
    ['parent_missing', 'discarded'],
    ['parent_cancelled', 'discarded'],
    ['parent_not_launchable', 'discarded'],
  ])(
    'scrubs prompt and capability on recovery terminal reason %s',
    async (reason: string, status: string) => {
      await store.enqueue({
        binding: binding(),
        payload: payload({ prompt: `sensitive-${reason}` }),
        now: NOW,
      });
      operations.rows[0].phase = 'completed';
      operations.rows[0].leaseOwner = null;
      operations.rows[0].leaseExpiresAt = null;
      if (reason === 'ttl_expired') {
        continuations.rows[0].expiresAt = new Date(NOW.getTime() - 1);
      } else if (reason === 'parent_missing') {
        operations.rows = [];
      } else if (reason === 'parent_cancelled') {
        operations.rows[0].cancelRequestedAt = NOW;
      } else {
        operations.rows[0].phase = 'failed';
      }

      await expect(store.claimForRecovery(1, NOW)).resolves.toBeUndefined();
      expect(continuations.rows[0]).toMatchObject({ status, terminalReason: reason });
      expectTerminalScrub(continuations.rows[0]);
      expect(JSON.stringify(continuations.rows[0])).not.toContain(`sensitive-${reason}`);
    },
  );

  it('scrubs a manually cleared pending continuation', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });

    await expect(store.discardForParent(binding(), 'manual_clear')).resolves.toBe(true);

    expect(continuations.rows[0]).toMatchObject({
      status: 'discarded',
      terminalReason: 'manual_clear',
    });
    expectTerminalScrub(continuations.rows[0]);
  });

  it('consumes a claim only with the exact owner/group/payload after the parent terminalizes', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    const claim = await store.claimForParent({ binding: binding(), now: NOW });
    expect(claim).toBeDefined();
    operations.rows[0].phase = 'completed';
    operations.rows[0].leaseOwner = null;
    operations.rows[0].leaseExpiresAt = null;

    await expect(
      store.consumeForAdmissionInTransaction(manager, claim!, {
        ownerType: 'user',
        ownerKey: '7',
        groupId: 3,
        conversationGid: GID,
        payload: payload(),
        now: NOW,
      }),
    ).resolves.toBeUndefined();
    expect(continuations.rows[0]).toMatchObject({
      status: 'consumed',
      claimToken: null,
      terminalReason: 'child_admitted',
    });
    expectTerminalScrub(continuations.rows[0]);
  });

  it('rejects consume after total TTL even while the claim lease is still live', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    const nearExpiry = new Date(NOW.getTime() + 10 * 60_000 - 1_000);
    operations.rows[0].leaseExpiresAt = new Date(nearExpiry.getTime() + 60_000);
    const claim = await store.claimForParent({ binding: binding(), now: nearExpiry });
    operations.rows[0].phase = 'completed';
    operations.rows[0].leaseOwner = null;
    operations.rows[0].leaseExpiresAt = null;
    const afterTotalTtl = new Date(NOW.getTime() + 10 * 60_000 + 10_000);
    expect(continuations.rows[0].claimExpiresAt).toEqual(new Date(nearExpiry.getTime() + 60_000));

    await expect(
      store.consumeForAdmissionInTransaction(manager, claim!, {
        ownerType: 'user',
        ownerKey: '7',
        groupId: 3,
        conversationGid: GID,
        payload: payload(),
        now: afterTotalTtl,
      }),
    ).rejects.toBeInstanceOf(AgentContinuationStateError);
    expect(continuations.rows[0].status).toBe('claimed');

    await expect(store.expireDue(afterTotalTtl)).resolves.toBe(1);
    expect(continuations.rows[0].status).toBe('expired');
    expectTerminalScrub(continuations.rows[0]);
  });

  it('rejects expired admission and discard claims until recovery issues a fresh lease', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    const claim = await store.claimForParent({ binding: binding(), now: NOW });
    operations.rows[0].phase = 'completed';
    operations.rows[0].leaseOwner = null;
    operations.rows[0].leaseExpiresAt = null;
    continuations.rows[0].claimExpiresAt = new Date(NOW.getTime() - 1);

    await expect(
      store.consumeForAdmissionInTransaction(manager, claim!, {
        ownerType: 'user',
        ownerKey: '7',
        groupId: 3,
        conversationGid: GID,
        payload: payload(),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(AgentContinuationStateError);
    await expect(store.discardClaim(claim!, 'launch_rejected', NOW)).resolves.toBe(false);
    expect(continuations.rows[0].status).toBe('claimed');

    const recovered = await store.claimForRecovery(1, NOW);
    expect(recovered?.claimToken).not.toBe(claim?.claimToken);
  });

  it('discards only the exact live claim and clears its capability token', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    const claim = await store.claimForParent({ binding: binding(), now: NOW });

    await expect(
      store.discardClaim({ ...claim!, payloadFingerprint: 'c'.repeat(64) }, 'launch_rejected', NOW),
    ).resolves.toBe(false);
    await expect(store.discardClaim(claim!, 'launch_rejected', NOW)).resolves.toBe(true);
    expect(continuations.rows[0]).toMatchObject({
      status: 'discarded',
      claimToken: null,
      terminalReason: 'launch_rejected',
    });
    expectTerminalScrub(continuations.rows[0]);
  });

  it('holds and later discards the exact admission claim even after its lease elapsed', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    const claim = await store.claimForParent({ binding: binding(), now: NOW });
    operations.rows[0].phase = 'completed';
    operations.rows[0].leaseOwner = null;
    operations.rows[0].leaseExpiresAt = null;

    await expect(
      store.lockForAdmissionInTransaction(manager, claim!, {
        ownerType: 'user',
        ownerKey: '7',
        groupId: 3,
        conversationGid: GID,
        payload: payload(),
        now: NOW,
      }),
    ).resolves.toBeUndefined();
    continuations.rows[0].claimExpiresAt = new Date(NOW.getTime() - 1);
    await expect(
      store.discardAdmissionInTransaction(manager, claim!, 'preflight_failed'),
    ).resolves.toBe(true);
    expect(continuations.rows[0]).toMatchObject({
      status: 'discarded',
      terminalReason: 'preflight_failed',
    });
    expectTerminalScrub(continuations.rows[0]);
  });

  it('consumes a prelocked admission after claim lease expiry but before total TTL', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    const claim = await store.claimForParent({ binding: binding(), now: NOW });
    operations.rows[0].phase = 'completed';
    operations.rows[0].leaseOwner = null;
    operations.rows[0].leaseExpiresAt = null;

    await store.lockForAdmissionInTransaction(manager, claim!, {
      ownerType: 'user',
      ownerKey: '7',
      groupId: 3,
      conversationGid: GID,
      payload: payload(),
      now: NOW,
    });
    const afterClaimLease = new Date(NOW.getTime() + 2 * 60_000);
    await expect(
      store.consumeLockedForAdmissionInTransaction(manager, claim!, {
        ownerType: 'user',
        ownerKey: '7',
        groupId: 3,
        conversationGid: GID,
        payload: payload(),
        now: afterClaimLease,
      }),
    ).resolves.toBeUndefined();
    expect(continuations.rows[0].status).toBe('consumed');
    expectTerminalScrub(continuations.rows[0]);
  });

  it('rejects a mismatched or cancelled admission without consuming the claim', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    const claim = await store.claimForParent({ binding: binding(), now: NOW });
    operations.rows[0].phase = 'completed';
    operations.rows[0].leaseOwner = null;
    operations.rows[0].leaseExpiresAt = null;

    await expect(
      store.consumeForAdmissionInTransaction(manager, claim!, {
        ownerType: 'user',
        ownerKey: '8',
        groupId: 3,
        conversationGid: GID,
        payload: payload(),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(AgentContinuationStateError);
    expect(continuations.rows[0].status).toBe('claimed');

    operations.rows[0].cancelRequestedAt = NOW;
    await expect(
      store.consumeForAdmissionInTransaction(manager, claim!, {
        ownerType: 'user',
        ownerKey: '7',
        groupId: 3,
        conversationGid: GID,
        payload: payload(),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(AgentContinuationStateError);
    expect(continuations.rows[0].status).toBe('claimed');
  });

  it('persists cancel with the current generation and discards the queued continuation atomically', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });

    await expect(
      store.requestCancel({
        parentAssistantLogId: 11,
        ownerType: 'user',
        ownerKey: '7',
        expectedTurnId: 'turn_continuation_1',
        expectedGeneration: 1,
        now: NOW,
      }),
    ).resolves.toEqual({
      requested: true,
      alreadyRequested: false,
      continuationDiscarded: true,
    });
    expect(operations.rows[0]).toMatchObject({
      cancelRequestedAt: NOW,
      cancelRequestedGeneration: 1,
    });
    expect(continuations.rows[0]).toMatchObject({
      status: 'discarded',
      terminalReason: 'parent_cancelled',
    });
    expectTerminalScrub(continuations.rows[0]);

    await expect(
      store.requestCancel({
        parentAssistantLogId: 11,
        ownerType: 'user',
        ownerKey: '7',
        now: new Date(NOW.getTime() + 1),
      }),
    ).resolves.toMatchObject({
      requested: true,
      alreadyRequested: true,
      continuationDiscarded: false,
    });
  });

  it('lets cancel discard a claimed follow-up even after the parent has completed', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    await store.claimForParent({ binding: binding(), now: NOW });
    operations.rows[0].phase = 'completed';
    operations.rows[0].leaseOwner = null;
    operations.rows[0].leaseExpiresAt = null;

    await expect(
      store.requestCancel({
        parentAssistantLogId: 11,
        ownerType: 'user',
        ownerKey: '7',
        now: NOW,
      }),
    ).resolves.toEqual({
      requested: false,
      alreadyRequested: false,
      continuationDiscarded: true,
      terminalPhase: 'completed',
    });
    expect(operations.rows[0].cancelRequestedAt).toBeNull();
    expect(continuations.rows[0].status).toBe('discarded');
  });

  it('expires only due active rows and reports active count', async () => {
    await store.enqueue({ binding: binding(), payload: payload(), now: NOW });
    await expect(store.countActive(NOW)).resolves.toBe(1);
    await expect(store.expireDue(new Date(NOW.getTime() + 10 * 60_000 + 1))).resolves.toBe(1);
    await expect(store.countActive(new Date(NOW.getTime() + 10 * 60_000 + 1))).resolves.toBe(0);
    expect(continuations.rows[0]).toMatchObject({
      status: 'expired',
      terminalReason: 'ttl_expired',
    });
    expectTerminalScrub(continuations.rows[0]);
  });
});
