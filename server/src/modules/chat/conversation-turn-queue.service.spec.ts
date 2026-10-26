import { ConversationTurnQueue } from './conversation-turn-queue.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const GID = 'g_0123456789abcdefghijklmn';

function binding(parentAssistantLogId = 1) {
  return {
    operationId: `op_turn_${parentAssistantLogId}`,
    parentAssistantLogId,
    parentTurnId: `turn_${parentAssistantLogId}`,
    ownerType: 'user' as const,
    ownerKey: '7',
    groupId: 3,
    conversationGid: GID,
    generation: 1,
  };
}

function payload(parentAssistantLogId = 1, prompt = 'next') {
  return {
    prompt,
    submissionId: `submission_${String(parentAssistantLogId).padStart(8, '0')}`,
    parentTurnId: `turn_${parentAssistantLogId}`,
    gid: GID,
    modelId: 2,
  };
}

describe('ConversationTurnQueue durable facade', () => {
  let store: any;
  let queue: ConversationTurnQueue;

  beforeEach(() => {
    store = {
      enqueue: jest.fn(async ({ payload: current }: any) => ({
        replaced: false,
        duplicate: false,
        sequence: 1,
        payload: current,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      })),
      peek: jest.fn().mockResolvedValue(undefined),
      claimForParent: jest.fn().mockResolvedValue(undefined),
      discardForParent: jest.fn().mockResolvedValue(false),
      requestCancel: jest.fn().mockResolvedValue({
        requested: true,
        alreadyRequested: false,
        continuationDiscarded: true,
      }),
      listRecoveryCandidates: jest.fn().mockResolvedValue([]),
      claimForRecovery: jest.fn().mockResolvedValue(undefined),
      consumeForAdmissionInTransaction: jest.fn().mockResolvedValue(undefined),
      discardClaim: jest.fn().mockResolvedValue(false),
      expireDue: jest.fn().mockResolvedValue(0),
      countActive: jest.fn().mockResolvedValue(0),
    };
    queue = new ConversationTurnQueue(store);
  });

  it('keeps only a safe process-local hint after durable enqueue', async () => {
    await queue.enqueue({
      binding: binding(),
      payload: payload(),
      clientIp: '127.0.0.1',
      sourceSocketId: 'socket-1',
    });

    expect(store.enqueue).toHaveBeenCalledWith({ binding: binding(), payload: payload() });
    expect(queue.hasPending(1, 'turn_1')).toBe(true);
    expect(queue.peekHint(1, 'turn_1')).toMatchObject({
      binding: binding(),
      payload: payload(),
      clientIp: '127.0.0.1',
      sourceSocketId: 'socket-1',
    });
    expect(JSON.stringify(store.enqueue.mock.calls[0][0])).not.toContain('socket-1');
    expect(JSON.stringify(store.enqueue.mock.calls[0][0])).not.toContain('127.0.0.1');
  });

  it('merges matching ephemeral context into a durable claim and clears the hint', async () => {
    await queue.enqueue({
      binding: binding(),
      payload: payload(),
      clientIp: '127.0.0.1',
      sourceSocketId: 'socket-1',
    });
    store.claimForParent.mockResolvedValue({
      ...binding(),
      inboxId: 9,
      kind: 'follow_up',
      sequence: 1,
      claimToken: 'a'.repeat(64),
      payloadFingerprint: 'b'.repeat(64),
      payload: payload(),
    });

    await expect(queue.claimForParent(binding())).resolves.toMatchObject({
      inboxId: 9,
      channel: 'web',
      clientIp: '127.0.0.1',
      sourceSocketId: 'socket-1',
    });
    expect(queue.hasPending(1, 'turn_1')).toBe(false);
  });

  it('does not expose a hint for another parent turn', async () => {
    await queue.enqueue({ binding: binding(), payload: payload() });

    expect(queue.peekHint(1, 'turn_other')).toBeUndefined();
    expect(queue.hasPending(1, 'turn_other')).toBe(false);
    expect(queue.hasPending(1, 'turn_1')).toBe(true);
  });

  it('clears a stale hint after the durable store confirms there is no active row', async () => {
    await queue.enqueue({ binding: binding(), payload: payload() });
    store.discardForParent.mockResolvedValueOnce(false);

    await expect(queue.clear(binding())).resolves.toBe(false);
    expect(queue.hasPending(1, 'turn_1')).toBe(false);
  });

  it('uses the durable expiry for duplicate hints instead of extending their TTL', async () => {
    store.enqueue.mockResolvedValue({
      replaced: false,
      duplicate: true,
      sequence: 1,
      payload: payload(),
      expiresAt: new Date(Date.now() - 1),
    });

    await queue.enqueue({ binding: binding(), payload: payload() });

    expect(queue.hasPending(1, 'turn_1')).toBe(false);
  });

  it('retains the hint when the durable discard cannot be checked', async () => {
    await queue.enqueue({ binding: binding(), payload: payload() });
    store.discardForParent.mockRejectedValue(new Error('database unavailable'));

    await expect(queue.clear(binding())).rejects.toThrow('database unavailable');
    expect(queue.hasPending(1, 'turn_1')).toBe(true);
  });

  it('delegates recovery claims without manufacturing transport identity', async () => {
    store.claimForRecovery.mockResolvedValue({
      ...binding(),
      inboxId: 9,
      kind: 'follow_up',
      sequence: 1,
      claimToken: 'a'.repeat(64),
      payloadFingerprint: 'b'.repeat(64),
      payload: payload(),
    });

    const claim = await queue.claimForRecovery(9);

    expect(claim).toMatchObject({ inboxId: 9, channel: 'web' });
    expect(claim).not.toHaveProperty('clientIp');
    expect(claim).not.toHaveProperty('sourceSocketId');
  });

  it('clears a stale hint when the durable parent claim has no work', async () => {
    await queue.enqueue({ binding: binding(), payload: payload() });

    await expect(queue.claimForParent(binding())).resolves.toBeUndefined();

    expect(queue.hasPending(1, 'turn_1')).toBe(false);
  });

  it('drops the hint after any successful durable cancel check', async () => {
    await queue.enqueue({ binding: binding(), payload: payload() });

    await queue.requestCancel({
      parentAssistantLogId: 1,
      ownerType: 'user',
      ownerKey: '7',
      expectedTurnId: 'turn_1',
      expectedGeneration: 1,
    });

    expect(queue.hasPending(1, 'turn_1')).toBe(false);
  });
});
