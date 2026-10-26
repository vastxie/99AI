import { createUnsafeFrontendMessageString } from '../../test/factories/chat-log.factory';
import { stringifyFrontendMessage } from '../chatLog/tool-result-payload';
import { WorkflowProcessManager, type WorkflowPublisherFence } from './workflowManager.service';
import {
  createAgentEventReducerState,
  reduceAgentEvent,
  type AgentEvent,
} from '@99agent/contracts';
import { sanitizeAgentEventForFrontend } from '../agent/events/agent-public-event-projector';
import { SequencedEmitter } from './emitters/sequenced-emitter';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const legacyRawMessage = createUnsafeFrontendMessageString();
const runningTurn = {
  id: 'turn_102',
  status: 'running',
  startedAt: '2026-05-29T00:00:00.000Z',
} as const;
const CONVERSATION_GID = 'g_0123456789abcdefghijklmn';
const reducerFixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../packages/contracts/fixtures/agent-event-reducer.json'),
    'utf8',
  ),
);

function expectNoRawToolSecrets(value: any) {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain('SECRET_TOKEN');
  expect(serialized).not.toContain('SECRET_API_KEY');
  expect(serialized).not.toContain('SECRET_BEARER');
  expect(serialized).not.toContain('STDOUT_SECRET');
  expect(serialized).not.toContain('RAW_SECRET');
  expect(serialized).not.toContain('PROVIDER_SECRET');
}

function makeDeltaEvent(delta: string): AgentEvent {
  return {
    type: 'message.delta',
    chatId: 'c_assistant000000000000000003',
    timestamp: Date.now(),
    data: { delta },
  };
}

function reduceAll(events: AgentEvent[]) {
  return events.reduce(
    (state, event) => reduceAgentEvent(state, event).state,
    createAgentEventReducerState(),
  );
}

describe('WorkflowProcessManager permission isolation', () => {
  let manager: WorkflowProcessManager;

  beforeEach(() => {
    manager = new WorkflowProcessManager();
  });

  it('does not expose another user workflow by chatId', () => {
    manager.register(
      100,
      new AbortController(),
      1,
      'c_assistant000000000000000001',
      'turn_100',
      undefined,
      CONVERSATION_GID,
    );

    expect(manager.getWorkflowForUser(100, { id: 1 })).toBeTruthy();
    expect(manager.getWorkflowForUser(100, { id: 2 })).toBeNull();
    expect(manager.getPublicCid(100)).toBe('c_assistant000000000000000001');
    expect(manager.getTurnId(100)).toBe('turn_100');
  });

  it('uses the authenticated visitor id without a separate ownership alias', () => {
    manager.register(
      101,
      new AbortController(),
      'visitor-test',
      'c_assistant000000000000000002',
      'turn_101',
    );

    expect(manager.getWorkflowForUser(101, { id: 'visitor-test' })).toBeTruthy();
    expect(manager.getWorkflowForUser(101, { id: 'another-visitor' })).toBeNull();
  });

  it('sanitizes running snapshots updated during streaming', () => {
    const fence = manager.register(
      102,
      new AbortController(),
      1,
      'c_assistant000000000000000003',
      'turn_102',
      runningTurn,
      CONVERSATION_GID,
    );

    manager.updateSnapshot(
      102,
      {
        content: 'done',
        message: legacyRawMessage,
      },
      fence,
    );

    const snapshot = manager.getRunningSnapshot(102);

    expect(snapshot?.content).toBe('done');
    expect(snapshot?.turnId).toBe('turn_102');
    expect(snapshot?.turn).toMatchObject(runningTurn);
    expect(snapshot?.conversationGid).toBe(CONVERSATION_GID);
    expect(JSON.parse(snapshot?.message || '{}').rounds[0].toolCalls[0].arguments).toEqual({});
    expectNoRawToolSecrets(snapshot);
  });
});

describe('WorkflowProcessManager event sequencing', () => {
  let manager: WorkflowProcessManager;
  let fence: WorkflowPublisherFence;

  beforeEach(() => {
    manager = new WorkflowProcessManager();
    fence = manager.register(
      102,
      new AbortController(),
      1,
      'c_assistant000000000000000003',
      'turn_102',
      runningTurn,
      CONVERSATION_GID,
    );
  });

  it('stamps outbound events with a monotonic seq', () => {
    const first = manager.stampOutboundEvent(102, makeDeltaEvent('a'), fence)!;
    const second = manager.stampOutboundEvent(102, makeDeltaEvent('b'), fence)!;

    expect(first.seq).toBe(1);
    expect(first.workflowSeq).toBe(1);
    expect(second.seq).toBe(2);
    expect(second.workflowSeq).toBe(2);
    expect(manager.getEventSeq(102)).toBe(2);
  });

  it('returns events without seq when the workflow is not registered', () => {
    const event = manager.stampOutboundEvent(999, makeDeltaEvent('a'), null)!;

    expect(event.seq).toBeUndefined();
  });

  it('replays buffered events after a given seq', () => {
    manager.stampOutboundEvent(102, makeDeltaEvent('a'), fence);
    manager.stampOutboundEvent(102, makeDeltaEvent('b'), fence);
    manager.stampOutboundEvent(102, makeDeltaEvent('c'), fence);

    const replayed = manager.getBufferedEventsAfter(102, 1);

    expect(replayed?.map(event => event.seq)).toEqual([2, 3]);
    expect(manager.getBufferedEventsAfter(102, 3)).toEqual([]);
  });

  it('signals uncoverable gaps with null so callers fall back to snapshots', () => {
    for (let i = 0; i < 805; i += 1) {
      manager.stampOutboundEvent(102, makeDeltaEvent(String(i)), fence);
    }

    // 缓冲上限 800：最旧事件 seq=6，afterSeq=2 已不可覆盖
    expect(manager.getBufferedEventsAfter(102, 2)).toBeNull();
    expect(manager.getBufferedEventsAfter(102, 5)?.length).toBe(800);
    expect(manager.getBufferedEventsAfter(999, 0)).toBeNull();
  });

  it('flushes pending outbound deltas before reading a resync snapshot baseline', () => {
    let flushed = false;
    manager.setPendingOutboundFlusher(
      102,
      () => {
        if (flushed) return;
        flushed = true;
        manager.stampOutboundEvent(102, makeDeltaEvent('pending'), fence);
        manager.updateSnapshot(102, { content: 'pending' }, fence);
      },
      fence,
    );

    const snapshot = manager.getResyncSnapshot(102);

    expect(snapshot).toMatchObject({
      content: 'pending',
      eventSeq: 1,
      turnId: 'turn_102',
      conversationGid: CONVERSATION_GID,
    });
    expect(manager.getBufferedEventsAfter(102, 0)?.map(event => event.seq)).toEqual([1]);
    expect(manager.getEventSeq(102)).toBe(1);
  });

  it('keeps known usage when a richer message snapshot replaces the running projection', () => {
    manager.stampOutboundEvent(
      102,
      {
        type: 'usage.update',
        chatId: 'c_assistant000000000000000003',
        timestamp: Date.now(),
        data: { inputTokens: 8, outputTokens: 5, totalTokens: 13 },
      },
      fence,
    );

    manager.updateSnapshot(
      102,
      {
        content: 'saved',
        message: stringifyFrontendMessage({
          role: 'assistant',
          content: 'saved',
          rounds: [],
          turn: runningTurn,
        }),
      },
      fence,
    );

    expect(manager.getResyncSnapshot(102)).toMatchObject({
      content: 'saved',
      usage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 },
    });
  });

  it('converges every shared fixture prefix through the real Service resync snapshot', () => {
    let checkedPrefixCount = 0;
    for (const scenario of reducerFixture.cases) {
      const full = reduceAll(scenario.fullEvents);
      for (let cut = 0; cut <= scenario.fullEvents.length; cut += 1) {
        const scenarioManager = new WorkflowProcessManager();
        const turn = scenario.fullEvents[0]?.data?.turn;
        const fence = scenarioManager.register(
          202,
          new AbortController(),
          1,
          scenario.snapshotEvent.chatId,
          scenario.snapshotEvent.turnId,
          turn,
          CONVERSATION_GID,
          {
            operationId: `op_${scenario.snapshotEvent.turnId}`,
            generation: 1,
            groupId: 1,
            ownerType: 'user',
            ownerKey: '1',
          },
        );
        for (const event of scenario.fullEvents.slice(0, cut)) {
          expect(scenarioManager.stampOutboundEvent(202, event, fence)).not.toBeNull();
        }

        const snapshot = scenarioManager.getResyncSnapshot(202)!;
        const serviceSnapshotEvent = sanitizeAgentEventForFrontend({
          type: 'snapshot.sync',
          seq: snapshot.eventSeq,
          workflowSeq: snapshot.eventSeq,
          chatId: scenario.snapshotEvent.chatId,
          ...(scenario.snapshotEvent.messageId
            ? { messageId: scenario.snapshotEvent.messageId }
            : {}),
          ...(scenario.snapshotEvent.turnId ? { turnId: scenario.snapshotEvent.turnId } : {}),
          timestamp: scenario.snapshotEvent.timestamp,
          data: {
            reason: 'resync',
            content: snapshot.content,
            thinking: snapshot.thinking,
            message: snapshot.message,
            status: snapshot.status ?? 'streaming',
            ...(snapshot.turn ? { turn: snapshot.turn, turnStatus: snapshot.turn.status } : {}),
            ...(snapshot.usage ? { usage: snapshot.usage } : {}),
            ...(snapshot.finishReason ? { finishReason: snapshot.finishReason } : {}),
          },
        } as AgentEvent);
        const fromServicePrefix = reduceAll([
          serviceSnapshotEvent,
          ...scenario.fullEvents.slice(cut),
        ]);

        expect(fromServicePrefix).toEqual(full);
        checkedPrefixCount += 1;
      }
    }
    expect(checkedPrefixCount).toBe(61);
  });

  it('fences stale sequenced emitters across a generation replacement', () => {
    const inner = { emit: jest.fn() };
    const operation = {
      operationId: 'op_turn_generation_fence',
      generation: 1,
      groupId: 1,
      ownerType: 'user' as const,
      ownerKey: '1',
    };
    manager.register(
      102,
      new AbortController(),
      1,
      'c_assistant000000000000000003',
      'turn_generation_fence',
      runningTurn,
      CONVERSATION_GID,
      operation,
    );
    const staleEmitter = new SequencedEmitter(inner, 102, manager);
    staleEmitter.emit(makeDeltaEvent('old-before-recovery'));
    staleEmitter.flushPendingDelta();

    manager.register(
      102,
      new AbortController(),
      1,
      'c_assistant000000000000000003',
      'turn_generation_fence',
      runningTurn,
      CONVERSATION_GID,
      { ...operation, generation: 2 },
    );
    const currentEmitter = new SequencedEmitter(inner, 102, manager);
    staleEmitter.emit(makeDeltaEvent('stale-after-recovery'));
    staleEmitter.flushPendingDelta();
    currentEmitter.emit(makeDeltaEvent('current'));
    currentEmitter.flushPendingDelta();

    expect(inner.emit).toHaveBeenCalledTimes(2);
    expect(inner.emit.mock.calls.map((call: any[]) => call[0].data.delta)).toEqual([
      'old-before-recovery',
      'current',
    ]);
    expect(inner.emit.mock.calls.map((call: any[]) => call[0].workflowSeq)).toEqual([1, 1]);
    expect(JSON.stringify(inner.emit.mock.calls)).not.toContain('generation');
  });

  it('rejects a tampered durable publisher binding and post-terminal timer flush', () => {
    const fence = manager.capturePublisherFence(102)!;
    expect(
      manager.stampOutboundEvent(102, makeDeltaEvent('tampered'), {
        ...fence,
        operationId: 'op_other',
      }),
    ).toBeNull();

    const inner = { emit: jest.fn() };
    const emitter = new SequencedEmitter(inner, 102, manager);
    emitter.emit(makeDeltaEvent('late'));
    manager.complete(102, fence);
    emitter.flushPendingDelta();
    expect(inner.emit).not.toHaveBeenCalled();
  });

  it('prevents stale generations from replacing snapshots or retiring the current workflow', () => {
    const staleFence = manager.capturePublisherFence(102)!;
    manager.updateSnapshot(102, { content: 'generation-one' }, staleFence);

    const currentFence = manager.register(
      102,
      new AbortController(),
      1,
      'c_assistant000000000000000003',
      'turn_generation_two',
      { ...runningTurn, id: 'turn_generation_two' },
      CONVERSATION_GID,
      {
        operationId: 'op_turn_generation_two',
        generation: 2,
        groupId: 1,
        ownerType: 'user',
        ownerKey: '1',
      },
    );

    manager.updateSnapshot(
      102,
      { content: 'must-not-replace-current', message: legacyRawMessage },
      staleFence,
    );
    manager.complete(102, staleFence);
    manager.fail(102, staleFence);

    expect(manager.getResyncSnapshot(102)).toMatchObject({
      content: '',
      turnId: 'turn_generation_two',
      eventSeq: 0,
    });
    expect(manager.capturePublisherFence(102)).toEqual(currentFence);

    manager.updateSnapshot(102, { content: 'current' }, currentFence);
    expect(manager.getRunningSnapshot(102)?.content).toBe('current');
    manager.complete(102, currentFence);
    expect(manager.getTurnId(102)).toBeNull();
  });
});
