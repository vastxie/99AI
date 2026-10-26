import {
  assertAgentContinuationClaim,
  assertAgentContinuationParentBinding,
  normalizeAgentContinuationPayload,
  serializeAgentContinuationPayload,
} from './continuation-inbox.types';

declare const describe: any;
declare const expect: any;
declare const it: any;

const GID = 'g_0123456789abcdefghijklmn';

function binding() {
  return {
    operationId: 'op_turn_continuation_1',
    parentAssistantLogId: 11,
    parentTurnId: 'turn_continuation_1',
    ownerType: 'user' as const,
    ownerKey: '7',
    groupId: 3,
    conversationGid: GID,
    generation: 1,
  };
}

function payload() {
  return {
    prompt: '  next question  ',
    submissionId: 'submission_continuation_0001',
    parentTurnId: 'turn_continuation_1',
    gid: GID,
    modelId: 2,
    model: '  current-model  ',
    modelName: '  Current Model  ',
    reasoningEffort: '  high  ',
  };
}

describe('Agent continuation payload contract', () => {
  it('normalizes only the current follow-up fields into a stable fingerprint', () => {
    const normalized = normalizeAgentContinuationPayload(payload());
    expect(normalized).toEqual({
      prompt: 'next question',
      submissionId: 'submission_continuation_0001',
      parentTurnId: 'turn_continuation_1',
      gid: GID,
      modelId: 2,
      model: 'current-model',
      modelName: 'Current Model',
      reasoningEffort: 'high',
    });
    expect(serializeAgentContinuationPayload(payload()).fingerprint).toBe(
      serializeAgentContinuationPayload(normalized).fingerprint,
    );
  });

  it.each([
    { ...payload(), rawBody: {} },
    { ...payload(), user: { id: 7 } },
    { ...payload(), headers: { authorization: 'redacted' } },
    { ...payload(), __clientIp: '127.0.0.1' },
    { ...payload(), __socketId: 'socket-1' },
    { ...payload(), attachments: '[]' },
  ])('rejects non-allowlisted transport or identity fields', (value: Record<string, unknown>) => {
    expect(() => normalizeAgentContinuationPayload(value)).toThrow(/payload field/u);
  });

  it('rejects malformed parent, conversation and submission identities', () => {
    expect(() => assertAgentContinuationParentBinding({ ...binding(), ownerKey: '' })).toThrow(
      /owner/u,
    );
    expect(() =>
      normalizeAgentContinuationPayload({ ...payload(), gid: 'g_client_supplied' }),
    ).toThrow(/conversation/u);
    expect(() =>
      normalizeAgentContinuationPayload({ ...payload(), submissionId: 'short' }),
    ).toThrow(/submission/u);
  });

  it('validates every field of a claimed continuation', () => {
    expect(
      assertAgentContinuationClaim({
        ...binding(),
        inboxId: 9,
        kind: 'follow_up',
        sequence: 1,
        claimToken: 'a'.repeat(64),
        payloadFingerprint: serializeAgentContinuationPayload(payload()).fingerprint,
        payload: payload(),
      }),
    ).toMatchObject({ inboxId: 9, sequence: 1, payload: { prompt: 'next question' } });
    expect(() =>
      assertAgentContinuationClaim({
        ...binding(),
        inboxId: 9,
        kind: 'follow_up',
        sequence: 1,
        claimToken: 'not-a-token',
        payloadFingerprint: 'b'.repeat(64),
        payload: payload(),
      }),
    ).toThrow(/claim/u);
  });

  it('bounds the UTF-8 payload before it reaches durable storage', () => {
    expect(() =>
      normalizeAgentContinuationPayload({
        ...payload(),
        prompt: '续'.repeat(400_000),
      }),
    ).toThrow(/too large/u);
  });
});
