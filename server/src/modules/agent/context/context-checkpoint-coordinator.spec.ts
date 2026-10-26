import {
  AgentRuntimeCore,
  type AgentRuntimeModelMessage,
  type AgentRuntimePorts,
} from '@99agent/runtime-core';
import {
  ContextCheckpointCoordinator,
  INTERRUPTED_HISTORY_CHECKPOINT_FACT,
} from './context-checkpoint-coordinator';
import { ChatLogService } from '../../chatLog/chatLog.service';
import type { ContextBackfillSource } from '../../chat/types/context.types';
import type { ModelGatewayRequest } from '../../modelGateway/model-gateway.types';
import type { SaveContextCheckpointInput } from '../../contextCheckpoint/context-checkpoint.store';
import type {
  AgentRuntimeOwner,
  ContextCheckpointV1,
} from '../../contextCheckpoint/context-checkpoint.types';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

type BackfillPageInput = Parameters<ContextBackfillSource['loadPage']>[0];
type RuntimeMessagePreparation = AgentRuntimePorts['messagePreparation'];

const SUMMARY: ContextCheckpointV1 = {
  version: 1 as const,
  goals: ['保留旧目标'],
  constraints: [],
  done: ['完成旧步骤'],
  inProgress: [],
  blocked: [],
  decisions: [],
  nextSteps: ['处理当前请求'],
  criticalContext: [],
  fileRefs: [],
  artifactRefs: [],
};

const LARGE_SUMMARY = {
  ...SUMMARY,
  goals: Array.from({ length: 12 }, (_, index) => `large-goal-${index + 1}-`.padEnd(1050, 'g')),
};

const MODEL_CONFIG = {
  protocol: 'test',
  model: 'test-model',
  apiKey: 'not-used',
  baseUrl: 'https://example.invalid',
} as any;

function history() {
  return [
    { role: 'system', content: 'system policy' },
    {
      role: 'user',
      content: 'old request '.repeat(700),
      __agent_context: { chatLogId: 1 },
    },
    {
      role: 'assistant',
      content: 'old response '.repeat(300),
      __agent_context: { chatLogId: 2 },
    },
    {
      role: 'user',
      content: 'current request',
      __agent_context: { chatLogId: 3, required: true },
    },
  ] as any[];
}

function secondProjectionClosureHistory() {
  const toolCalls = Array.from({ length: 5 }, (_, index) => ({
    id: `closure-${index + 1}`,
    type: 'function',
    function: { name: `closure_tool_${index + 1}`, arguments: '{}' },
  }));
  return [
    { role: 'system', content: 'policy' },
    {
      role: 'assistant',
      content: 'first-prefix'.padEnd(9000, 'p'),
      __agent_context: { chatLogId: 1 },
    },
    {
      role: 'assistant',
      content: '',
      tool_calls: toolCalls,
      __agent_context: { chatLogId: 2 },
    },
    ...toolCalls.map((call, index) => ({
      role: 'tool',
      tool_call_id: call.id,
      content: `closure-observation-${index + 1}`.padEnd(6000, 'o'),
      __agent_context: { chatLogId: 2 },
    })),
    {
      role: 'assistant',
      content: 'retained-tail'.padEnd(2000, 't'),
      __agent_context: { chatLogId: 3 },
    },
    {
      role: 'user',
      content: 'current request',
      __agent_context: { chatLogId: 4, required: true },
    },
  ] as any[];
}

function createHarness(result: any, inputOverrides: Record<string, any> = {}) {
  const gateway = { completeOnce: jest.fn().mockResolvedValue(result) };
  const store = {
    loadValid: jest.fn().mockResolvedValue(null),
    replace: jest.fn().mockResolvedValue({}),
    invalidateGroup: jest.fn().mockResolvedValue(1),
    invalidateAtRevision: jest.fn().mockResolvedValue(1),
  };
  const usage: any[] = [];
  const session = new ContextCheckpointCoordinator(gateway as any, store as any).createSession({
    modelConfig: MODEL_CONFIG,
    contextWindowTokens: 1000,
    contextBoundary: {
      timestamp: 1,
      groupId: 11,
      currentUserLogId: 3,
      sourceRevision: 1,
      sourceStartLogId: 1,
      candidateLogIds: [1, 2, 3],
      pureRoundsCount: 3,
      toolRoundsCount: 0,
    },
    owner: { ownerType: 'user', ownerKey: '7' },
    onCompactionUsage: value => usage.push(value),
    ...inputOverrides,
  });
  return { gateway, store, session, usage };
}

describe('ContextCheckpointCoordinator', () => {
  it('rejects a candidate boundary with an unrepresented historical source', async () => {
    const harness = createHarness({
      content: JSON.stringify(SUMMARY),
      finishReason: 'stop',
    });

    await expect(
      harness.session.prepareInitial([
        { role: 'system', content: 'policy' },
        { role: 'assistant', content: 'source-1', __agent_context: { chatLogId: 1 } },
        {
          role: 'user',
          content: 'current request',
          __agent_context: { chatLogId: 3, required: true },
        },
      ] as any),
    ).rejects.toThrow(/候选来源没有完整投影/);
    expect(harness.gateway.completeOnce).not.toHaveBeenCalled();
    expect(harness.store.replace).not.toHaveBeenCalled();
  });

  function createBackfillHarness(loadPage: ContextBackfillSource['loadPage'], tailLogId: number) {
    const currentUserLogId = tailLogId + 1;
    const harness = createHarness(
      { content: JSON.stringify(SUMMARY), finishReason: 'stop' },
      {
        contextWindowTokens: 16_000,
        contextBoundary: {
          timestamp: 1,
          groupId: 11,
          currentUserLogId,
          sourceRevision: 1,
          sourceStartLogId: 1,
          candidateLogIds: [tailLogId, currentUserLogId],
          pureRoundsCount: currentUserLogId,
          toolRoundsCount: 0,
        },
        contextBackfill: { loadPage },
      },
    );
    const messages = [
      { role: 'system' as const, content: 'policy' },
      {
        role: 'assistant' as const,
        content: 'raw-tail',
        __agent_context: { chatLogId: tailLogId },
      },
      {
        role: 'user' as const,
        content: 'current request',
        __agent_context: { chatLogId: currentUserLogId, required: true },
      },
    ];
    return { ...harness, messages };
  }

  it('does not summarize or advance a backfill page with an unrepresented source', async () => {
    const loadPage = jest.fn().mockResolvedValue({
      messages: [{ role: 'assistant', content: 'source-1', __agent_context: { chatLogId: 1 } }],
      sourceLogIds: [1, 2],
      nextAfterLogId: 2,
      complete: true,
    });
    const harness = createBackfillHarness(loadPage, 3);

    const projected = await harness.session.prepareInitial(harness.messages);

    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(harness.gateway.completeOnce).not.toHaveBeenCalled();
    expect(harness.store.replace).not.toHaveBeenCalled();
    expect(projected.some(message => message.content === 'raw-tail')).toBe(true);
    expect(projected.some(message => message.content === 'current request')).toBe(true);
  });

  it.each([
    ['reversed', [2, 1]],
    ['split source group', [1, 2, 1]],
  ])(
    'does not advance a backfill page with %s message IDs',
    async (_name: string, messageIds: number[]) => {
      const loadPage = jest.fn().mockResolvedValue({
        messages: messageIds.map((id, index) => ({
          role: 'assistant',
          content: `source-${id}-${index}`,
          __agent_context: { chatLogId: id },
        })),
        sourceLogIds: [1, 2],
        nextAfterLogId: 2,
        complete: true,
      });
      const harness = createBackfillHarness(loadPage, 3);

      await harness.session.prepareInitial(harness.messages);

      expect(harness.gateway.completeOnce).not.toHaveBeenCalled();
      expect(harness.store.replace).not.toHaveBeenCalled();
    },
  );

  it('accepts contiguous message groups in source ID order during backfill', async () => {
    const loadPage = jest.fn().mockResolvedValue({
      messages: [1, 1, 2, 2].map((id, index) => ({
        role: 'assistant',
        content: `source-${id}-${index}`,
        __agent_context: { chatLogId: id },
      })),
      sourceLogIds: [1, 2],
      nextAfterLogId: 2,
      complete: true,
    });
    const harness = createBackfillHarness(loadPage, 3);

    await harness.session.prepareInitial(harness.messages);

    expect(harness.gateway.completeOnce).toHaveBeenCalled();
    expect(harness.store.replace).toHaveBeenCalledWith(
      expect.objectContaining({ compactedThroughLogId: 2, backfillComplete: true }),
    );
  });

  it('deterministically preserves an interrupted fact omitted by a backfill summary', async () => {
    const loadPage = jest.fn().mockResolvedValue({
      messages: [
        {
          role: 'assistant',
          content: '[历史助手消息为空、格式不完整或执行已中断]',
          __agent_context: { chatLogId: 1 },
        },
      ],
      sourceLogIds: [1],
      nextAfterLogId: 1,
      complete: true,
    });
    const harness = createBackfillHarness(loadPage, 2);

    const projected = await harness.session.prepareInitial(harness.messages);

    expect(harness.store.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        compactedThroughLogId: 1,
        summary: expect.objectContaining({
          criticalContext: expect.arrayContaining([INTERRUPTED_HISTORY_CHECKPOINT_FACT]),
        }),
      }),
    );
    expect(
      projected.some(message =>
        String(message.content || '').includes(INTERRUPTED_HISTORY_CHECKPOINT_FACT),
      ),
    ).toBe(true);
  });

  it('summarizes only droppable source groups and atomically persists their boundary', async () => {
    const modelUsage = { inputTokens: 50, outputTokens: 10, totalTokens: 60 };
    const harness = createHarness({
      content: JSON.stringify(SUMMARY),
      finishReason: 'stop',
      usage: modelUsage,
    });

    const projected = await harness.session.prepareInitial(history());

    expect(projected.some(message => String(message.content).includes('历史对话语义检查点'))).toBe(
      true,
    );
    expect(projected.some(message => message.content === 'current request')).toBe(true);
    expect(projected.some(message => String(message.content).includes('old request'))).toBe(false);
    expect(harness.store.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 11,
        ownerType: 'user',
        ownerKey: '7',
        expectedSourceRevision: 1,
        sourceStartLogId: 1,
        compactedThroughLogId: 2,
        backfillComplete: true,
        compactionInputTokens: 50,
        compactionOutputTokens: 10,
      }),
    );
    expect(harness.usage).toEqual([modelUsage]);
  });

  it('falls back to atomic trimming and does not persist an invalid summary', async () => {
    const harness = createHarness({
      content: '{"version":1,"goals":"not-an-array"}',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
    });

    const projected = await harness.session.prepareInitial(history());

    expect(projected.some(message => message.content === 'current request')).toBe(true);
    expect(harness.store.replace).not.toHaveBeenCalled();
  });

  it('rolls back to the safe projection when a generated checkpoint exceeds required headroom', async () => {
    const harness = createHarness(
      {
        content: JSON.stringify(LARGE_SUMMARY),
        finishReason: 'stop',
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      },
      { contextWindowTokens: 9000 },
    );

    const projected = await harness.session.prepareInitial(history());

    expect(harness.gateway.completeOnce).toHaveBeenCalledTimes(1);
    expect(harness.store.replace).not.toHaveBeenCalled();
    expect(projected.some(message => message.content === 'current request')).toBe(true);
    expect(
      projected.some(message => String(message.content || '').includes('历史对话语义检查点')),
    ).toBe(false);
  });

  it('stages a first complete backfill until headroom validation and safely retries next revision', async () => {
    let state: any = null;
    const usage = { inputTokens: 20, outputTokens: 10, totalTokens: 30 };
    const observedUsage: any[] = [];
    const gateway = {
      completeOnce: jest.fn().mockResolvedValue({
        content: JSON.stringify(LARGE_SUMMARY),
        finishReason: 'stop',
        usage,
      }),
    };
    const store = {
      loadValid: jest.fn(async (_groupId: number, _owner: AgentRuntimeOwner, revision?: number) =>
        state?.valid && state.sourceRevision === revision ? state : null,
      ),
      replace: jest.fn(async (input: SaveContextCheckpointInput) => {
        state = {
          ...input,
          sourceRevision: input.expectedSourceRevision,
          summary: JSON.stringify(input.summary),
          valid: true,
        };
        return state;
      }),
      invalidateAtRevision: jest.fn().mockResolvedValue(1),
      invalidateGroup: jest.fn().mockResolvedValue(1),
    };
    const loadPage = jest.fn(async () => ({
      messages: [{ role: 'assistant', content: 'old-prefix', __agent_context: { chatLogId: 1 } }],
      sourceLogIds: [1],
      nextAfterLogId: 1,
      complete: true,
    }));
    const run = (sourceRevision: number) =>
      new ContextCheckpointCoordinator(gateway as any, store as any)
        .createSession({
          modelConfig: MODEL_CONFIG,
          contextWindowTokens: 16000,
          contextBoundary: {
            timestamp: sourceRevision,
            groupId: 11,
            currentUserLogId: 3,
            sourceRevision,
            sourceStartLogId: 1,
            candidateLogIds: [2, 3],
            pureRoundsCount: 3,
            toolRoundsCount: 0,
          },
          contextBackfill: { loadPage },
          owner: { ownerType: 'user', ownerKey: '7' },
          onCompactionUsage: value => observedUsage.push(value),
        })
        .prepareInitial([
          { role: 'system', content: 'policy' },
          { role: 'assistant', content: 'raw-tail', __agent_context: { chatLogId: 2 } },
          {
            role: 'user',
            content: 'current'.padEnd(30000, 'c'),
            __agent_context: { chatLogId: 3, required: true },
          },
        ] as any);

    for (const revision of [1, 2]) {
      const projected = await run(revision);
      expect(projected.some(message => String(message.content).startsWith('current'))).toBe(true);
      expect(
        projected.some(message => String(message.content || '').includes('历史对话语义检查点')),
      ).toBe(false);
    }
    expect(store.replace).not.toHaveBeenCalled();
    expect(state).toBeNull();
    expect(observedUsage).toEqual([usage, usage]);
  });

  it('keeps the last persisted partial backfill when its completing page exceeds headroom', async () => {
    let state: any = null;
    const usage = { inputTokens: 20, outputTokens: 10, totalTokens: 30 };
    const gateway = {
      completeOnce: jest
        .fn()
        .mockResolvedValueOnce({
          content: JSON.stringify(SUMMARY),
          finishReason: 'stop',
          usage,
        })
        .mockResolvedValueOnce({
          content: JSON.stringify(LARGE_SUMMARY),
          finishReason: 'stop',
          usage,
        }),
    };
    const store = {
      loadValid: jest.fn().mockResolvedValue(null),
      replace: jest.fn(async (input: SaveContextCheckpointInput) => {
        state = {
          ...input,
          sourceRevision: input.expectedSourceRevision,
          summary: JSON.stringify(input.summary),
          valid: true,
        };
        return state;
      }),
      invalidateAtRevision: jest.fn().mockResolvedValue(1),
      invalidateGroup: jest.fn().mockResolvedValue(1),
    };
    const sourceIds = Array.from({ length: 9 }, (_, index) => index + 1);
    const loadPage = jest.fn(async ({ afterLogId, limit }: BackfillPageInput) => {
      const eligible = sourceIds.filter(id => id > afterLogId);
      const selected = eligible.slice(0, limit);
      return {
        messages: selected.map(id => ({
          role: 'assistant',
          content: `old-${id}`,
          __agent_context: { chatLogId: id },
        })),
        sourceLogIds: selected,
        nextAfterLogId: selected.at(-1) || afterLogId,
        complete: eligible.length <= limit,
      };
    });
    const session = new ContextCheckpointCoordinator(gateway as any, store as any).createSession({
      modelConfig: MODEL_CONFIG,
      contextWindowTokens: 16000,
      contextBoundary: {
        timestamp: 1,
        groupId: 11,
        currentUserLogId: 11,
        sourceRevision: 1,
        sourceStartLogId: 1,
        candidateLogIds: [10, 11],
        pureRoundsCount: 11,
        toolRoundsCount: 0,
      },
      contextBackfill: { loadPage },
      owner: { ownerType: 'user', ownerKey: '7' },
    });

    const projected = await session.prepareInitial([
      { role: 'system', content: 'policy' },
      { role: 'assistant', content: 'raw-tail', __agent_context: { chatLogId: 10 } },
      {
        role: 'user',
        content: 'current'.padEnd(30000, 'c'),
        __agent_context: { chatLogId: 11, required: true },
      },
    ] as any);

    expect(store.replace).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ compactedThroughLogId: 8, backfillComplete: false });
    expect(projected.some(message => String(message.content).startsWith('current'))).toBe(true);
    expect(
      projected.some(message => String(message.content || '').includes('历史对话语义检查点')),
    ).toBe(false);
  });

  it('does not advance an existing checkpoint when sliding-tail backfill exceeds headroom', async () => {
    const originalState: any = {
      summary: JSON.stringify(SUMMARY),
      sourceStartLogId: 1,
      compactedThroughLogId: 1,
      sourceRevision: 1,
      backfillComplete: true,
      retainedTailStartLogId: 2,
      retainedTailEndLogId: 2,
      retainedTailGroupCount: 1,
      estimatedInputTokens: 100,
      compactionInputTokens: 20,
      compactionOutputTokens: 5,
      valid: true,
    };
    const state = { ...originalState };
    const gateway = {
      completeOnce: jest.fn().mockResolvedValue({
        content: JSON.stringify(LARGE_SUMMARY),
        finishReason: 'stop',
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      }),
    };
    const store = {
      loadValid: jest.fn().mockResolvedValue(state),
      replace: jest.fn().mockResolvedValue({}),
      invalidateAtRevision: jest.fn().mockResolvedValue(1),
      invalidateGroup: jest.fn().mockResolvedValue(1),
    };
    const loadPage = jest.fn(async () => ({
      messages: [{ role: 'assistant', content: 'gap-2', __agent_context: { chatLogId: 2 } }],
      sourceLogIds: [2],
      nextAfterLogId: 2,
      complete: true,
    }));
    const session = new ContextCheckpointCoordinator(gateway as any, store as any).createSession({
      modelConfig: MODEL_CONFIG,
      contextWindowTokens: 16000,
      contextBoundary: {
        timestamp: 1,
        groupId: 11,
        currentUserLogId: 4,
        sourceRevision: 1,
        sourceStartLogId: 1,
        candidateLogIds: [3, 4],
        pureRoundsCount: 4,
        toolRoundsCount: 0,
      },
      contextBackfill: { loadPage },
      owner: { ownerType: 'user', ownerKey: '7' },
    });

    const projected = await session.prepareInitial([
      { role: 'system', content: 'policy' },
      { role: 'assistant', content: 'raw-tail', __agent_context: { chatLogId: 3 } },
      {
        role: 'user',
        content: 'current'.padEnd(30000, 'c'),
        __agent_context: { chatLogId: 4, required: true },
      },
    ] as any);

    expect(store.replace).not.toHaveBeenCalled();
    expect(state).toEqual(originalState);
    expect(projected.some(message => String(message.content).startsWith('current'))).toBe(true);
    expect(
      projected.some(message => String(message.content || '').includes('历史对话语义检查点')),
    ).toBe(false);
  });

  it('still rejects a current request that exceeds required headroom without a checkpoint', async () => {
    const harness = createHarness(
      { content: JSON.stringify(SUMMARY), finishReason: 'stop' },
      {
        contextWindowTokens: 16000,
        contextBoundary: undefined,
        owner: undefined,
      },
    );

    await expect(
      harness.session.prepareInitial([
        { role: 'system', content: 'policy' },
        { role: 'user', content: 'current'.padEnd(45000, 'c') },
      ] as any),
    ).rejects.toThrow(/系统策略与当前请求超过模型上下文窗口/);
  });

  it('does not advance an existing checkpoint when the next summary fails', async () => {
    const usage = { inputTokens: 5, outputTokens: 2, totalTokens: 7 };
    const harness = createHarness({
      content: '{"version":1,"goals":"invalid"}',
      finishReason: 'stop',
      usage,
    });
    harness.store.loadValid.mockResolvedValue({
      summary: JSON.stringify(SUMMARY),
      sourceStartLogId: 1,
      compactedThroughLogId: 1,
      sourceRevision: 1,
      backfillComplete: true,
      retainedTailStartLogId: 2,
      estimatedInputTokens: 100,
      compactionInputTokens: 20,
      compactionOutputTokens: 5,
    });

    const projected = await harness.session.prepareInitial(history());

    expect(harness.gateway.completeOnce).toHaveBeenCalledTimes(1);
    expect(harness.store.replace).not.toHaveBeenCalled();
    expect(harness.usage).toEqual([usage]);
    expect(projected.some(message => message.content === 'current request')).toBe(true);
  });

  it.each([
    [
      'incomplete finish',
      {
        content: JSON.stringify(SUMMARY),
        finishReason: 'length',
        usage: { inputTokens: 6, outputTokens: 2, totalTokens: 8 },
      },
    ],
    [
      'gateway rejection',
      Object.assign(new Error('provider rejected compaction'), {
        usage: { inputTokens: 7, outputTokens: 1, totalTokens: 8 },
      }),
    ],
  ])(
    'does not advance an existing checkpoint after %s',
    async (_name: string, outcome: Record<string, unknown> | Error) => {
      const harness = createHarness({});
      harness.store.loadValid.mockResolvedValue({
        summary: JSON.stringify(SUMMARY),
        sourceStartLogId: 1,
        compactedThroughLogId: 1,
        sourceRevision: 1,
        backfillComplete: true,
        retainedTailStartLogId: 2,
        estimatedInputTokens: 100,
        compactionInputTokens: 20,
        compactionOutputTokens: 5,
      });
      if (outcome instanceof Error) {
        harness.gateway.completeOnce.mockRejectedValue(outcome);
      } else {
        harness.gateway.completeOnce.mockResolvedValue(outcome);
      }

      await harness.session.prepareInitial(history());

      expect(harness.store.replace).not.toHaveBeenCalled();
      expect(harness.usage).toEqual([(outcome as any).usage]);
    },
  );

  it('keeps an existing checkpoint boundary unchanged when a later summary chunk fails', async () => {
    const firstUsage = { inputTokens: 10, outputTokens: 2, totalTokens: 12 };
    const failedUsage = { inputTokens: 11, outputTokens: 1, totalTokens: 12 };
    const harness = createHarness(
      {},
      {
        contextBoundary: {
          timestamp: 1,
          groupId: 11,
          currentUserLogId: 7,
          sourceRevision: 1,
          sourceStartLogId: 1,
          candidateLogIds: [1, 2, 3, 4, 5, 6, 7],
          pureRoundsCount: 7,
          toolRoundsCount: 0,
        },
      },
    );
    harness.store.loadValid.mockResolvedValue({
      summary: JSON.stringify(SUMMARY),
      sourceStartLogId: 1,
      compactedThroughLogId: 1,
      sourceRevision: 1,
      backfillComplete: true,
      retainedTailStartLogId: 2,
      estimatedInputTokens: 100,
      compactionInputTokens: 20,
      compactionOutputTokens: 5,
    });
    harness.gateway.completeOnce
      .mockResolvedValueOnce({
        content: JSON.stringify(SUMMARY),
        finishReason: 'stop',
        usage: firstUsage,
      })
      .mockResolvedValueOnce({
        content: '{"version":1,"goals":"invalid"}',
        finishReason: 'stop',
        usage: failedUsage,
      });
    const messages = [
      { role: 'system', content: 'policy' },
      ...Array.from({ length: 5 }, (_, index) => ({
        role: 'assistant',
        content: `${index + 2}:`.padEnd(5000, 'x'),
        __agent_context: { chatLogId: index + 2 },
      })),
      {
        role: 'user',
        content: 'current request',
        __agent_context: { chatLogId: 7, required: true },
      },
    ] as any[];

    const projected = await harness.session.prepareInitial(messages);

    expect(harness.gateway.completeOnce).toHaveBeenCalledTimes(2);
    expect(harness.store.replace).not.toHaveBeenCalled();
    expect(harness.usage).toEqual([firstUsage, failedUsage]);
    expect(projected.some(message => message.content === 'current request')).toBe(true);
  });

  it('projects from a valid stored checkpoint and excludes its covered raw prefix', async () => {
    const harness = createHarness({ content: JSON.stringify(SUMMARY) });
    harness.store.loadValid.mockResolvedValue({
      summary: JSON.stringify(SUMMARY),
      sourceStartLogId: 1,
      compactedThroughLogId: 2,
      sourceRevision: 1,
      backfillComplete: true,
      estimatedInputTokens: 100,
      compactionInputTokens: 20,
      compactionOutputTokens: 5,
    });

    const projected = await harness.session.prepareInitial(history());

    expect(harness.gateway.completeOnce).not.toHaveBeenCalled();
    expect(projected.some(message => String(message.content).includes('历史对话语义检查点'))).toBe(
      true,
    );
    expect(projected.some(message => String(message.content).includes('old request'))).toBe(false);
    expect(projected.some(message => message.content === 'current request')).toBe(true);
  });

  it.each([undefined, 'length', 'content_filter', 'tool_calls'])(
    'fails closed for non-complete summary finish reason %p while retaining usage',
    async (finishReason: string | undefined) => {
      const modelUsage = { inputTokens: 5, outputTokens: 2, totalTokens: 7 };
      const harness = createHarness({
        content: JSON.stringify(SUMMARY),
        finishReason,
        usage: modelUsage,
      });

      await harness.session.prepareInitial(history());

      expect(harness.store.replace).not.toHaveBeenCalled();
      expect(harness.usage).toEqual([modelUsage]);
    },
  );

  it('disables native tools and extra provider parameters for compaction', async () => {
    const harness = createHarness(
      { content: JSON.stringify(SUMMARY), finishReason: 'stop' },
      {
        modelConfig: {
          ...MODEL_CONFIG,
          additionalParams: { include: ['web_search_call.action.sources'] },
          capabilities: {
            nativeTools: { webSearch: { enabled: true, mode: 'force' } },
          },
        },
      },
    );

    await harness.session.prepareInitial(history());

    expect(harness.gateway.completeOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        toolChoice: 'none',
        purpose: 'context_compaction',
        sessionId: expect.stringMatching(/^99agent-[a-f0-9]{32}$/),
        config: expect.objectContaining({
          additionalParams: undefined,
          reasoningEffort: 'off',
          capabilities: expect.objectContaining({ nativeTools: undefined }),
        }),
      }),
    );
    // 不设温度：按模型服务自己的默认值
    expect(harness.gateway.completeOnce.mock.calls[0][0]).not.toHaveProperty('temperature');
  });

  it('does not persist a tool-forbidden compaction failure but accounts for its usage', async () => {
    const usage = { inputTokens: 12, outputTokens: 2, totalTokens: 14 };
    const error = Object.assign(new Error('unexpected hosted tool'), {
      code: 'unexpected_tool_call',
      usage,
    });
    const harness = createHarness({});
    harness.gateway.completeOnce.mockRejectedValue(error);

    const projected = await harness.session.prepareInitial(history());

    expect(projected.some(message => message.content === 'current request')).toBe(true);
    expect(harness.store.replace).not.toHaveBeenCalled();
    expect(harness.usage).toEqual([usage]);
  });

  it.each([
    {
      name: 'rejects credential-shaped compaction JSON while retaining observed usage',
      credentialShape: 'JSON {"apiKey":"REDACTED_VALUE"}',
    },
    ...[
      'password：SYNTHETIC_VALUE_1234567890',
      'password∶SYNTHETIC_VALUE_1234567890',
      'password꞉SYNTHETIC_VALUE_1234567890',
      'passwordːSYNTHETIC_VALUE_1234567890',
      '凭证：password∶SYNTHETIC_VALUE_1234567890',
      '说明（password꞉SYNTHETIC_VALUE_1234567890',
      ';passwordːSYNTHETIC_VALUE_1234567890',
      '说明：“password”∶“SYNTHETIC_VALUE_1234567890”',
      '说明：“ password ”∶“SYNTHETIC_VALUE_1234567890”',
      '说明：「token」ː「SYNTHETIC_VALUE_1234567890」',
      '说明：`clientSecret`：`SYNTHETIC_VALUE_1234567890`',
      '说明：**password**：**SYNTHETIC_VALUE_1234567890**',
      '说明：``clientSecret``：``SYNTHETIC_VALUE_1234567890``',
      '说明：**password**：\n**SYNTHETIC_VALUE_1234567890**',
      '说明：“password”\r\n∶\r\n“SYNTHETIC_VALUE_1234567890”',
      '说明：``clientSecret``：\n``SYNTHETIC_VALUE_1234567890``',
    ].map(credentialShape => ({
      name: `rejects Unicode credential separator ${credentialShape} while retaining compaction usage`,
      credentialShape,
    })),
    {
      name: 'rejects compound credential keys from compaction while retaining observed usage',
      credentialShape: 'JSON {"refresh_token":"REDACTED_VALUE"}',
    },
  ])('$name', async ({ credentialShape }: { credentialShape: string }) => {
    const usage = { inputTokens: 13, outputTokens: 3, totalTokens: 16 };
    const harness = createHarness({
      content: JSON.stringify({ ...SUMMARY, criticalContext: [credentialShape] }),
      finishReason: 'stop',
      usage,
    });

    const projected = await harness.session.prepareInitial(history());

    expect(projected.some(message => message.content === 'current request')).toBe(true);
    expect(harness.store.replace).not.toHaveBeenCalled();
    expect(harness.usage).toEqual([usage]);
  });

  it('rejects non-string summary items instead of persisting a fake completed backfill', async () => {
    const usage = { inputTokens: 13, outputTokens: 3, totalTokens: 16 };
    const harness = createHarness({
      content: JSON.stringify({ ...SUMMARY, goals: [{ text: 'THE_IMPORTANT_FACT' }] }),
      finishReason: 'stop',
      usage,
    });

    const projected = await harness.session.prepareInitial(history());

    expect(projected.some(message => message.content === 'current request')).toBe(true);
    expect(harness.store.replace).not.toHaveBeenCalled();
    expect(harness.usage).toEqual([usage]);
  });

  it('backfills more than 120 logs and 40 tool rounds without exposing a partial summary', async () => {
    const sourceRows = Array.from({ length: 130 }, (_, index) => {
      const id = index + 1;
      if (id <= 45) {
        const toolCalls =
          id === 1
            ? [
                {
                  id: 'call_1a',
                  name: 'lookup_1a',
                  status: 'success',
                  arguments: { credential: 'must-not-forward' },
                  model: { content: 'observation-1a' },
                },
                {
                  id: 'call_1b',
                  name: 'lookup_1b',
                  status: 'success',
                  arguments: { credential: 'must-not-forward' },
                  model: { content: 'observation-1b' },
                },
              ]
            : [
                {
                  id: `call_${id}`,
                  name: `lookup_${id}`,
                  status: 'success',
                  arguments: { credential: 'must-not-forward' },
                  model: { content: `observation-${id}` },
                },
              ];
        return {
          id,
          userId: 7,
          groupId: 11,
          direction: 'out',
          content: `assistant-${id}`,
          message: JSON.stringify({
            role: 'assistant',
            rounds: [{ text: `assistant-${id}`, toolCalls }],
          }),
        };
      }
      return {
        id,
        userId: 7,
        groupId: 11,
        direction: id % 2 ? 'in' : 'out',
        content: `source-${id}`,
        message: JSON.stringify({
          role: id % 2 ? 'user' : 'assistant',
          content: `source-${id}`,
          rounds: [],
        }),
      };
    });
    const sourceIds = sourceRows.map(row => row.id);
    const repository = {
      createQueryBuilder: jest.fn(() => {
        let afterLogId = 0;
        let beforeLogId = Number.MAX_SAFE_INTEGER;
        let take = 0;
        const capture = (parameters: Record<string, any> = {}) => {
          if (parameters.afterLogId !== undefined) afterLogId = parameters.afterLogId;
          if (parameters.beforeLogId !== undefined) beforeLogId = parameters.beforeLogId;
        };
        const query: any = {
          where: (_clause: string, parameters?: Record<string, any>) => {
            capture(parameters);
            return query;
          },
          andWhere: (_clause: string, parameters?: Record<string, any>) => {
            capture(parameters);
            return query;
          },
          orderBy: () => query,
          limit: (value: number) => {
            take = value;
            return query;
          },
          getMany: async () =>
            sourceRows.filter(row => row.id > afterLogId && row.id < beforeLogId).slice(0, take),
        };
        return query;
      }),
    };
    const chatLogs = new ChatLogService(repository as any, {} as any);
    let state: any = null;
    const gateway = {
      completeOnce: jest.fn().mockResolvedValue({
        content: JSON.stringify(SUMMARY),
        finishReason: 'stop',
        usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
      }),
    };
    const store = {
      loadValid: jest.fn(async (_groupId: number, _owner: AgentRuntimeOwner, revision?: number) =>
        state?.valid && state.sourceRevision === revision ? state : null,
      ),
      replace: jest.fn(async (input: SaveContextCheckpointInput) => {
        if (input.expectedSourceRevision !== state?.sourceRevision && state) return null;
        state = {
          ...input,
          sourceRevision: input.expectedSourceRevision,
          summary: JSON.stringify(input.summary),
          valid: true,
        };
        return state;
      }),
      invalidateAtRevision: jest.fn().mockResolvedValue(1),
      invalidateGroup: jest.fn().mockResolvedValue(1),
    };
    const loadPage = jest.fn((input: BackfillPageInput) =>
      chatLogs.collectContextBackfillPage({ id: 7, role: 'user' }, 11, input),
    );
    const tail = Array.from({ length: 120 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `tail-${index + 131}`,
      __agent_context: { chatLogId: index + 131 },
    }));
    const projections: any[][] = [];

    for (let run = 1; run <= 5; run += 1) {
      if (state) state.sourceRevision = run;
      const session = new ContextCheckpointCoordinator(gateway as any, store as any).createSession({
        modelConfig: MODEL_CONFIG,
        contextWindowTokens: 16000,
        contextBoundary: {
          timestamp: 1,
          groupId: 11,
          currentUserLogId: 251,
          sourceRevision: run,
          sourceStartLogId: 1,
          candidateLogIds: [...tail.map(message => message.__agent_context.chatLogId), 251],
          pureRoundsCount: 76,
          toolRoundsCount: 45,
        },
        contextBackfill: { loadPage },
        owner: { ownerType: 'user', ownerKey: '7' },
      });
      projections.push(
        await session.prepareInitial([
          { role: 'system', content: 'policy' },
          ...tail,
          {
            role: 'user',
            content: 'current',
            __agent_context: { chatLogId: 251, required: true },
          },
        ] as any),
      );
    }

    expect(state).toMatchObject({
      sourceStartLogId: 1,
      compactedThroughLogId: 130,
      backfillComplete: true,
      valid: true,
    });
    expect(loadPage.mock.calls.length).toBe(17);
    expect(loadPage.mock.calls.map((call: [BackfillPageInput]) => call[0].afterLogId)).toEqual([
      0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128,
    ]);
    for (const projected of projections.slice(0, -1)) {
      expect(
        projected.some(message => String(message.content || '').includes('历史对话语义检查点')),
      ).toBe(false);
      expect(projected.some(message => message.content === 'tail-131')).toBe(true);
      expect(projected.some(message => message.content === 'current')).toBe(true);
    }
    const finalProjection = projections.at(-1)!;
    expect(
      finalProjection.some(message => String(message.content || '').includes('历史对话语义检查点')),
    ).toBe(true);

    const summaryInputs = gateway.completeOnce.mock.calls.map((call: [ModelGatewayRequest]) =>
      String(call[0].messages[1].content),
    );
    const joinedSummaryInputs = summaryInputs.join('\n');
    expect(joinedSummaryInputs).not.toContain('must-not-forward');
    for (const id of sourceIds.slice(45)) {
      expect(joinedSummaryInputs.match(new RegExp(`source-${id}(?!\\d)`, 'g'))).toHaveLength(1);
    }
    for (let id = 2; id <= 45; id += 1) {
      const toolPattern = new RegExp(`lookup_${id}(?!\\d)`);
      const matchingInputs = summaryInputs.filter((input: string) => toolPattern.test(input));
      expect(matchingInputs).toHaveLength(1);
      expect(matchingInputs[0]).toContain(`observation-${id}`);
    }
    const firstToolInput = summaryInputs.filter((input: string) => input.includes('lookup_1a'));
    expect(firstToolInput).toHaveLength(1);
    expect(firstToolInput[0]).toContain('lookup_1b');
    expect(firstToolInput[0]).toContain('observation-1a');
    expect(firstToolInput[0]).toContain('observation-1b');
  });

  it('reopens bounded backfill when the previous retained tail slides out of the window', async () => {
    const visibleGapIds = Array.from({ length: 41 }, (_, index) => index + 131).filter(
      id => id !== 138 && id !== 150,
    );
    const gateway = {
      completeOnce: jest.fn().mockResolvedValue({
        content: JSON.stringify(SUMMARY),
        finishReason: 'stop',
        usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
      }),
    };
    let state: any = {
      summary: JSON.stringify(SUMMARY),
      sourceStartLogId: 1,
      compactedThroughLogId: 130,
      sourceRevision: 1,
      backfillComplete: true,
      retainedTailStartLogId: 131,
      retainedTailEndLogId: 250,
      retainedTailGroupCount: 120,
      estimatedInputTokens: 100,
      compactionInputTokens: 20,
      compactionOutputTokens: 5,
      valid: true,
    };
    const store = {
      loadValid: jest.fn(async (_groupId: number, _owner: AgentRuntimeOwner, revision?: number) =>
        state.valid && state.sourceRevision === revision ? state : null,
      ),
      replace: jest.fn(async (input: SaveContextCheckpointInput) => {
        if (input.expectedSourceRevision !== state.sourceRevision) return null;
        state = {
          ...input,
          sourceRevision: input.expectedSourceRevision,
          summary: JSON.stringify(input.summary),
          valid: true,
        };
        return state;
      }),
      invalidateAtRevision: jest.fn().mockResolvedValue(1),
      invalidateGroup: jest.fn().mockResolvedValue(1),
    };
    const loadPage = jest.fn(async ({ afterLogId, beforeLogId, limit }: BackfillPageInput) => {
      const eligible = visibleGapIds.filter(id => id > afterLogId && id < beforeLogId);
      const selected = eligible.slice(0, limit);
      return {
        messages: selected.map(id => ({
          role: 'assistant',
          content: `gap-${id}`,
          __agent_context: { chatLogId: id },
        })),
        sourceLogIds: selected,
        nextAfterLogId: selected.at(-1) || afterLogId,
        complete: eligible.length <= limit,
      };
    });
    const coordinator = new ContextCheckpointCoordinator(gateway as any, store as any);

    const firstSession = coordinator.createSession({
      modelConfig: MODEL_CONFIG,
      contextWindowTokens: 16000,
      contextBoundary: {
        timestamp: 1,
        groupId: 11,
        currentUserLogId: 291,
        sourceRevision: 1,
        sourceStartLogId: 1,
        candidateLogIds: [171, 291],
        pureRoundsCount: 120,
        toolRoundsCount: 0,
      },
      contextBackfill: { loadPage },
      owner: { ownerType: 'user', ownerKey: '7' },
    });
    const firstProjection = await firstSession.prepareInitial([
      { role: 'system', content: 'policy' },
      { role: 'assistant', content: 'raw-tail-171', __agent_context: { chatLogId: 171 } },
      {
        role: 'user',
        content: 'current-291',
        __agent_context: { chatLogId: 291, required: true },
      },
    ] as any);

    expect(loadPage).toHaveBeenCalledTimes(4);
    expect(state.backfillComplete).toBe(false);
    expect(
      firstProjection.some(message => String(message.content || '').includes('历史对话语义检查点')),
    ).toBe(false);
    expect(firstProjection.some(message => message.content === 'raw-tail-171')).toBe(true);
    expect(firstProjection.some(message => message.content === 'current-291')).toBe(true);

    state.sourceRevision = 2;
    const secondSession = coordinator.createSession({
      modelConfig: MODEL_CONFIG,
      contextWindowTokens: 16000,
      contextBoundary: {
        timestamp: 2,
        groupId: 11,
        currentUserLogId: 292,
        sourceRevision: 2,
        sourceStartLogId: 1,
        candidateLogIds: [172, 292],
        pureRoundsCount: 120,
        toolRoundsCount: 0,
      },
      contextBackfill: { loadPage },
      owner: { ownerType: 'user', ownerKey: '7' },
    });
    const secondProjection = await secondSession.prepareInitial([
      { role: 'system', content: 'policy' },
      { role: 'assistant', content: 'raw-tail-172', __agent_context: { chatLogId: 172 } },
      {
        role: 'user',
        content: 'current-292',
        __agent_context: { chatLogId: 292, required: true },
      },
    ] as any);

    expect(loadPage).toHaveBeenCalledTimes(5);
    expect(state).toMatchObject({
      compactedThroughLogId: 171,
      backfillComplete: true,
      retainedTailStartLogId: 172,
    });
    expect(
      secondProjection.some(message =>
        String(message.content || '').includes('历史对话语义检查点'),
      ),
    ).toBe(true);
    expect(secondProjection.some(message => message.content === 'raw-tail-172')).toBe(true);
    expect(secondProjection.some(message => message.content === 'current-292')).toBe(true);

    const summaryInputs = gateway.completeOnce.mock.calls.map((call: [ModelGatewayRequest]) =>
      String(call[0].messages[1].content),
    );
    const joinedSummaryInputs = summaryInputs.join('\n');
    for (const id of visibleGapIds) {
      expect(joinedSummaryInputs.match(new RegExp(`gap-${id}(?!\\d)`, 'g'))).toHaveLength(1);
    }
    expect(joinedSummaryInputs).not.toContain('gap-138');
    expect(joinedSummaryInputs).not.toContain('gap-150');
  });

  it('fails closed instead of slicing an oversized atomic tool group', async () => {
    const harness = createHarness({});
    harness.store.loadValid.mockResolvedValue({
      summary: JSON.stringify(SUMMARY),
      sourceStartLogId: 1,
      compactedThroughLogId: 1,
      sourceRevision: 1,
      backfillComplete: true,
      retainedTailStartLogId: 2,
      estimatedInputTokens: 100,
      compactionInputTokens: 20,
      compactionOutputTokens: 5,
    });
    const toolCalls = Array.from({ length: 5 }, (_, index) => ({
      id: `oversized-${index + 1}`,
      type: 'function',
      function: { name: `oversized_tool_${index + 1}`, arguments: '{}' },
    }));
    const messages = [
      { role: 'system', content: 'policy' },
      {
        role: 'assistant',
        content: 'assistant-head'.padEnd(6000, 'a'),
        tool_calls: toolCalls,
        __agent_context: { chatLogId: 2 },
      },
      ...toolCalls.map((call, index) => ({
        role: 'tool',
        tool_call_id: call.id,
        content: `observation-${index + 1}`.padEnd(6000, 'o'),
        __agent_context: { chatLogId: 2 },
      })),
      {
        role: 'user',
        content: 'current request',
        __agent_context: { chatLogId: 3, required: true },
      },
    ] as any[];

    const projected = await harness.session.prepareInitial(messages);

    expect(harness.gateway.completeOnce).not.toHaveBeenCalled();
    expect(harness.store.replace).not.toHaveBeenCalled();
    expect(projected.some(message => message.content === 'current request')).toBe(true);
    expect(
      projected.some(message => String(message.content || '').includes('历史对话语义检查点')),
    ).toBe(true);
  });

  it.each([
    [
      'plain source',
      [
        {
          role: 'assistant',
          content: `prefix-${'x'.repeat(6000)}CRITICAL_LATE_FACT${'y'.repeat(30000)}`,
        },
      ],
    ],
    [
      'text part',
      [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `prefix-${'x'.repeat(3000)}CRITICAL_LATE_FACT${'y'.repeat(30000)}`,
            },
          ],
        },
      ],
    ],
    [
      'tool observation',
      [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'long-tool', type: 'function', function: { name: 'long_tool', arguments: '{}' } },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'long-tool',
          content: `prefix-${'x'.repeat(6000)}CRITICAL_LATE_FACT${'y'.repeat(30000)}`,
        },
      ],
    ],
  ])(
    'does not advance a boundary from a truncated oversized %s',
    async (_label: string, source: unknown[]) => {
      const harness = createHarness(
        { content: JSON.stringify(SUMMARY), finishReason: 'stop' },
        {
          contextWindowTokens: 16000,
          contextBoundary: {
            timestamp: 1,
            groupId: 11,
            currentUserLogId: 3,
            sourceRevision: 1,
            sourceStartLogId: 1,
            candidateLogIds: [1, 2, 3],
            pureRoundsCount: 3,
            toolRoundsCount: 1,
          },
        },
      );
      const sourceMessages = (source as any[]).map(message => ({
        ...message,
        __agent_context: { chatLogId: 1 },
      }));

      const projected = await harness.session.prepareInitial([
        { role: 'system', content: 'policy' },
        ...sourceMessages,
        { role: 'assistant', content: 'raw-tail', __agent_context: { chatLogId: 2 } },
        {
          role: 'user',
          content: 'current request',
          __agent_context: { chatLogId: 3, required: true },
        },
      ] as any);

      expect(harness.gateway.completeOnce).not.toHaveBeenCalled();
      expect(harness.store.replace).not.toHaveBeenCalled();
      expect(projected.some(message => message.content === 'current request')).toBe(true);
    },
  );

  it('does not complete backfill from an oversized source that cannot be read in full', async () => {
    const harness = createHarness(
      { content: JSON.stringify(SUMMARY), finishReason: 'stop' },
      {
        contextWindowTokens: 16000,
        contextBoundary: {
          timestamp: 1,
          groupId: 11,
          currentUserLogId: 3,
          sourceRevision: 1,
          sourceStartLogId: 1,
          candidateLogIds: [2, 3],
          pureRoundsCount: 3,
          toolRoundsCount: 0,
        },
        contextBackfill: {
          loadPage: jest.fn().mockResolvedValue({
            messages: [
              {
                role: 'assistant',
                content: `prefix-${'x'.repeat(6000)}CRITICAL_LATE_FACT${'y'.repeat(30000)}`,
                __agent_context: { chatLogId: 1 },
              },
            ],
            sourceLogIds: [1],
            nextAfterLogId: 1,
            complete: true,
          }),
        },
      },
    );

    const projected = await harness.session.prepareInitial([
      { role: 'system', content: 'policy' },
      { role: 'assistant', content: 'raw-tail', __agent_context: { chatLogId: 2 } },
      {
        role: 'user',
        content: 'current request',
        __agent_context: { chatLogId: 3, required: true },
      },
    ] as any);

    expect(harness.gateway.completeOnce).not.toHaveBeenCalled();
    expect(harness.store.replace).not.toHaveBeenCalled();
    expect(projected.some(message => message.content === 'current request')).toBe(true);
  });

  it('strictly reduces a small-window projection for overflow recovery', async () => {
    const harness = createHarness(
      { content: JSON.stringify(SUMMARY), finishReason: 'stop' },
      {
        contextWindowTokens: 16000,
        contextBoundary: {
          timestamp: 1,
          groupId: 11,
          currentUserLogId: 4,
          sourceRevision: 1,
          sourceStartLogId: 1,
          candidateLogIds: [1, 2, 4],
          pureRoundsCount: 4,
          toolRoundsCount: 0,
        },
      },
    );
    const initial = (await harness.session.prepareInitial([
      { role: 'system', content: 'policy' },
      {
        role: 'assistant',
        content: `old-source-${'x'.repeat(30000)}`,
        __agent_context: { chatLogId: 1 },
      },
      { role: 'assistant', content: 'tail', __agent_context: { chatLogId: 2 } },
      {
        role: 'user',
        content: 'current request',
        __agent_context: { chatLogId: 4, required: true },
      },
    ] as any)) as any[];
    const firstPayload = JSON.stringify(initial);

    const recovered = (await harness.session.prepareForModel(initial, {
      roundIndex: 0,
      reason: 'context_overflow',
      overflowRecoveryUsed: true,
    })) as any[];

    expect(JSON.stringify(recovered).length).toBeLessThan(firstPayload.length);
    expect(recovered.some(message => String(message.content).includes('old-source-'))).toBe(false);
    expect(harness.store.replace).not.toHaveBeenCalled();
  });

  it('keeps the opaque provider replay state on the messages it projects', async () => {
    const harness = createHarness({}, { contextWindowTokens: 64000, contextBoundary: undefined });
    const state = { opaque: 'replay-state', blocks: [{ signature: 'kept' }] };
    const projected = (await harness.session.prepareForModel(
      [
        { role: 'system', content: 'policy' },
        { role: 'user', content: 'current' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
          ],
          provider_state: state,
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
      ] as any,
      { roundIndex: 1, reason: 'round', overflowRecoveryUsed: false },
    )) as any[];
    // 投影按 JSON 复制消息：回放状态随消息一起保留（是否回放由协议包决定）
    expect(projected.find(message => message.role === 'assistant').provider_state).toEqual(state);
  });

  it('keeps usage calibration stable across repeated rounds with the same actual ratio', async () => {
    const harness = createHarness({}, { contextWindowTokens: 64000, contextBoundary: undefined });
    let projected = (await harness.session.prepareInitial([
      { role: 'system', content: 'policy' },
      { role: 'user', content: 'current'.padEnd(30000, '中') },
    ] as any)) as any[];
    const initialEstimate = Number((harness.session as any).previousProjectedEstimate);
    const actualInputTokens = initialEstimate * 3;

    for (let roundIndex = 1; roundIndex <= 3; roundIndex += 1) {
      projected = (await harness.session.prepareForModel(projected, {
        roundIndex,
        reason: 'round',
        previousUsage: { inputTokens: actualInputTokens },
        overflowRecoveryUsed: false,
      })) as any[];
      expect((harness.session as any).tokenScale).toBe(3);
      expect((harness.session as any).previousProjectedEstimate).toBe(actualInputTokens);
    }
  });

  it('does not consume the same previous usage again during overflow recovery', async () => {
    const harness = createHarness({}, { contextWindowTokens: 16000, contextBoundary: undefined });
    await harness.session.prepareInitial([
      { role: 'system', content: 'policy' },
      { role: 'user', content: 'current'.padEnd(4000, '中') },
    ] as any);
    const previousEstimate = Number((harness.session as any).previousProjectedEstimate);
    const previousUsage = { inputTokens: previousEstimate * 3 };
    const grownMessages = [
      { role: 'system', content: 'policy' },
      { role: 'assistant', content: 'droppable-history'.padEnd(6000, 'h') },
      { role: 'user', content: 'current'.padEnd(4000, '中') },
    ] as any;

    const normal = await harness.session.prepareForModel(grownMessages, {
      roundIndex: 1,
      reason: 'round',
      previousUsage,
      overflowRecoveryUsed: false,
    });
    const normalPayload = JSON.stringify(normal);
    expect((harness.session as any).tokenScale).toBe(3);

    const recovered = await harness.session.prepareForModel(normal, {
      roundIndex: 1,
      reason: 'context_overflow',
      previousUsage,
      overflowRecoveryUsed: true,
    });

    expect((harness.session as any).tokenScale).toBe(3);
    expect(JSON.stringify(recovered).length).toBeLessThan(normalPayload.length);
    expect(
      recovered.some(message => String(message.content || '').startsWith('droppable-history')),
    ).toBe(false);
  });

  it.each([1000, 5000, 7000])(
    'fails before a real runtime retry when a %i-character active tool result cannot be safely reduced',
    async (observationLength: number) => {
      const harness = createHarness({}, { contextWindowTokens: 16000, contextBoundary: undefined });
      const initial = await harness.session.prepareInitial([
        { role: 'system', content: 'policy' },
        { role: 'user', content: 'current'.padEnd(4000, '中') },
      ] as any);
      const streamPayloads: any[][] = [];
      let streamIndex = 0;
      const runtime = new AgentRuntimeCore({
        modelStream: async function* (input: Parameters<AgentRuntimePorts['modelStream']>[0]) {
          streamPayloads.push(JSON.parse(JSON.stringify(input.messages)));
          if (streamIndex === 0) {
            streamIndex += 1;
            const estimate = Number((harness.session as any).previousProjectedEstimate);
            yield {
              type: 'tool_call_delta',
              index: 0,
              id: 'call_large',
              nameDelta: 'read',
              argumentsDelta: '{}',
            } as const;
            yield {
              type: 'usage',
              usage: {
                inputTokens: estimate * 3,
                outputTokens: 10,
                totalTokens: estimate * 3 + 10,
              },
            } as const;
            yield { type: 'done', finishReason: 'tool_calls' } as const;
            return;
          }
          if (streamIndex === 1) {
            streamIndex += 1;
            yield {
              type: 'error',
              error: {
                category: 'context_overflow',
                requestOutcome: 'rejected',
                message: 'context limit exceeded',
              },
            } as const;
            return;
          }
          streamIndex += 1;
          yield { type: 'done', finishReason: 'stop' } as const;
        },
        capabilityExecutor: async () => [
          {
            callId: 'call_large',
            status: 'success' as const,
            modelContent: 'tool-observation'.padEnd(observationLength, 'o'),
          },
        ],
        progress: (): void => undefined,
        trace: (): void => undefined,
        messagePreparation: {
          prepareForModel: (
            messages: AgentRuntimeModelMessage[],
            context: Parameters<RuntimeMessagePreparation['prepareForModel']>[1],
          ) => harness.session.prepareForModel(messages, context),
          projectAssistantMessage: (
            input: Parameters<RuntimeMessagePreparation['projectAssistantMessage']>[0],
          ) => ({
            role: 'assistant',
            content: input.content || '',
            tool_calls: input.toolCalls,
          }),
        },
        lifecycle: {
          prepareCapabilityCommit: (): void => undefined,
          afterToolRound: (): void => undefined,
          onMessagesReplaced: (): void => undefined,
          closeRun: (): void => undefined,
        },
        logger: (): void => undefined,
        clock: {
          nowMs: () => 1,
          nowIso: () => '2026-09-09T00:00:00.000Z',
          nextId: (prefix: string) => `${prefix}_fixed`,
          schedule: () => ({}),
          cancel: (): void => undefined,
        },
      } as any);

      const result = await runtime.run({
        model: 'test-model',
        messages: initial as any,
        tools: [],
        maxRounds: 3,
        contextWindowTokens: 16000,
      });

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          finishReason: 'error',
          error: expect.stringMatching(/未能安全缩小|超过模型上下文窗口/),
        }),
      );
      expect(streamPayloads).toHaveLength(2);
      expect((harness.session as any).tokenScale).toBe(3);
      expect(JSON.stringify(streamPayloads[1])).toContain('tool-observation');
    },
  );

  it.each(['prepareInitial', 'prepareForModel'])(
    'rolls back the summary attempt when %s discovers a new oversized dropped group',
    async (entrypoint: string) => {
      const harness = createHarness(
        {
          content: JSON.stringify(LARGE_SUMMARY),
          finishReason: 'stop',
          usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        },
        {
          contextWindowTokens: 16000,
          contextBoundary: {
            timestamp: 1,
            groupId: 11,
            currentUserLogId: 4,
            sourceRevision: 1,
            sourceStartLogId: 1,
            candidateLogIds: entrypoint === 'prepareInitial' ? [1, 2, 3, 4] : [4],
            pureRoundsCount: 4,
            toolRoundsCount: 1,
          },
        },
      );
      let projected: any[];
      if (entrypoint === 'prepareInitial') {
        projected = await harness.session.prepareInitial(secondProjectionClosureHistory());
      } else {
        await harness.session.prepareInitial([
          { role: 'system', content: 'policy' },
          {
            role: 'user',
            content: 'current request',
            __agent_context: { chatLogId: 4, required: true },
          },
        ] as any);
        harness.gateway.completeOnce.mockClear();
        projected = (await harness.session.prepareForModel(secondProjectionClosureHistory(), {
          roundIndex: 1,
          reason: 'round',
          overflowRecoveryUsed: false,
        })) as any[];
      }

      expect(harness.gateway.completeOnce).toHaveBeenCalledTimes(1);
      expect(harness.store.replace).not.toHaveBeenCalled();
      expect(
        projected.some(message => String(message.content || '').startsWith('first-prefix')),
      ).toBe(false);
      for (let index = 1; index <= 5; index += 1) {
        expect(
          projected.some(message =>
            String(message.content || '').startsWith(`closure-observation-${index}`),
          ),
        ).toBe(true);
      }
      expect(
        projected.some(message => String(message.content || '').startsWith('retained-tail')),
      ).toBe(true);
      expect(projected.some(message => message.content === 'current request')).toBe(true);
      expect(
        projected.some(message => String(message.content || '').includes('历史对话语义检查点')),
      ).toBe(false);
    },
  );

  it.each([false, true])(
    'rejects a stale compaction after deletion advances the source revision (stored=%s)',
    async (hasStoredCheckpoint: boolean) => {
      let resolveSummary!: (value: any) => void;
      let revision = 1;
      let valid = hasStoredCheckpoint;
      const gateway = {
        completeOnce: jest.fn(
          () =>
            new Promise(resolve => {
              resolveSummary = resolve;
            }),
        ),
      };
      const store = {
        loadValid: jest.fn().mockResolvedValue(
          hasStoredCheckpoint
            ? {
                summary: JSON.stringify(SUMMARY),
                sourceStartLogId: 1,
                compactedThroughLogId: 1,
                sourceRevision: 1,
                backfillComplete: true,
                estimatedInputTokens: 10,
                compactionInputTokens: 3,
                compactionOutputTokens: 1,
              }
            : null,
        ),
        replace: jest.fn(async (input: SaveContextCheckpointInput) => {
          if (input.expectedSourceRevision !== revision) return null;
          valid = true;
          return {};
        }),
        invalidateAtRevision: jest.fn(async () => {
          revision += 1;
          valid = false;
          return 1;
        }),
        invalidateGroup: jest.fn(),
      };
      const session = new ContextCheckpointCoordinator(gateway as any, store as any).createSession({
        modelConfig: MODEL_CONFIG,
        contextWindowTokens: 1000,
        contextBoundary: {
          timestamp: 1,
          groupId: 11,
          currentUserLogId: 3,
          sourceRevision: 1,
          sourceStartLogId: 1,
          candidateLogIds: [1, 2, 3],
          pureRoundsCount: 3,
          toolRoundsCount: 0,
        },
        owner: { ownerType: 'user', ownerKey: '7' },
      });

      const pending = session.prepareInitial(history());
      for (let i = 0; i < 1000 && !gateway.completeOnce.mock.calls.length; i += 1)
        await Promise.resolve();
      expect(gateway.completeOnce).toHaveBeenCalledTimes(1);
      await store.invalidateAtRevision();
      resolveSummary({ content: JSON.stringify(SUMMARY), finishReason: 'stop' });

      await expect(pending).rejects.toThrow(/上下文源在压缩期间发生变化/);
      expect(valid).toBe(false);
    },
  );

  describe('compaction time limit', () => {
    // 有上界的等待：调用没有发生时让断言失败，而不是在微任务里空转
    const untilCalled = async (mock: any) => {
      for (let i = 0; i < 1000 && !mock.mock.calls.length; i += 1) await Promise.resolve();
      expect(mock).toHaveBeenCalledTimes(1);
    };
    const untilAborted = ({ signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('summary call aborted')), {
          once: true,
        });
      });

    it('gives the summary call a live signal when the turn has none and compacts as usual', async () => {
      const harness = createHarness({ content: JSON.stringify(SUMMARY), finishReason: 'stop' });
      await harness.session.prepareInitial(history());
      const { signal } = harness.gateway.completeOnce.mock.calls[0][0];
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
      expect(harness.store.replace).toHaveBeenCalledTimes(1);
    });

    it('falls back to trimming when the limit is reached instead of hanging the turn', async () => {
      const limit = new AbortController();
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(limit.signal);
      try {
        const harness = createHarness({});
        harness.gateway.completeOnce.mockImplementation(untilAborted);
        const pending = harness.session.prepareInitial(history());
        await untilCalled(harness.gateway.completeOnce);
        limit.abort();
        const projected = await pending;
        expect(timeoutSpy).toHaveBeenCalledWith(300_000);
        expect(projected.some(message => message.content === 'current request')).toBe(true);
        expect(harness.store.replace).not.toHaveBeenCalled();
      } finally {
        timeoutSpy.mockRestore();
      }
    });

    it('shares one limit across every summary call of a preparation and starts a new one next time', async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      try {
        // 回填两页：同一次 prepareInitial 里压缩两次
        const loadPage = jest
          .fn()
          .mockResolvedValueOnce({
            messages: [
              { role: 'assistant', content: 'source-1', __agent_context: { chatLogId: 1 } },
            ],
            sourceLogIds: [1],
            nextAfterLogId: 1,
            complete: false,
          })
          .mockResolvedValueOnce({
            messages: [
              { role: 'assistant', content: 'source-2', __agent_context: { chatLogId: 2 } },
            ],
            sourceLogIds: [2],
            nextAfterLogId: 2,
            complete: true,
          });
        const harness = createBackfillHarness(loadPage, 3);
        await harness.session.prepareInitial(harness.messages);
        const signals = harness.gateway.completeOnce.mock.calls.map(
          ([request]: [{ signal: AbortSignal }]) => request.signal,
        );
        expect(signals).toHaveLength(2);
        expect(signals[1]).toBe(signals[0]);
        expect(timeoutSpy).toHaveBeenCalledTimes(1);

        // 时限已到时，这次整理里之后的压缩调用拿到的是同一个已中止的信号：不会各自再等一轮
        const expired = AbortSignal.abort();
        timeoutSpy.mockReturnValue(expired);
        const second = createBackfillHarness(
          jest
            .fn()
            .mockResolvedValueOnce({
              messages: [
                { role: 'assistant', content: 'source-1', __agent_context: { chatLogId: 1 } },
              ],
              sourceLogIds: [1],
              nextAfterLogId: 1,
              complete: false,
            })
            .mockResolvedValue({
              messages: [],
              sourceLogIds: [],
              nextAfterLogId: 1,
              complete: true,
            }),
          3,
        );
        second.gateway.completeOnce.mockImplementation(
          async ({ signal }: { signal: AbortSignal }) => {
            if (signal.aborted) throw new Error('summary call aborted');
            return { content: JSON.stringify(SUMMARY), finishReason: 'stop' };
          },
        );
        await second.session.prepareInitial(second.messages);
        expect(second.gateway.completeOnce.mock.calls[0][0].signal).toBe(expired);
        expect(second.store.replace).not.toHaveBeenCalled();
      } finally {
        timeoutSpy.mockRestore();
      }
    });

    it('starts a fresh limit for each preparation of the same run', async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      try {
        // 这份历史在初次整理和之后每一轮整理时都需要压缩一次
        const harness = createHarness(
          { content: '{}', finishReason: 'stop' },
          {
            contextWindowTokens: 16000,
            contextBoundary: {
              timestamp: 1,
              groupId: 11,
              currentUserLogId: 4,
              sourceRevision: 1,
              sourceStartLogId: 1,
              candidateLogIds: [1, 2, 3, 4],
              pureRoundsCount: 4,
              toolRoundsCount: 1,
            },
          },
        );
        await harness.session.prepareInitial(secondProjectionClosureHistory());
        expect(harness.gateway.completeOnce).toHaveBeenCalledTimes(1);
        expect(timeoutSpy).toHaveBeenCalledTimes(1);

        await harness.session.prepareForModel(secondProjectionClosureHistory(), {
          roundIndex: 1,
          reason: 'round',
          overflowRecoveryUsed: false,
        });
        const calls = harness.gateway.completeOnce.mock.calls;
        expect(calls).toHaveLength(2);
        // 上一次整理的时限不带到下一次：否则运行超过五分钟后，之后每一轮的压缩都会立刻被中止
        expect(timeoutSpy).toHaveBeenCalledTimes(2);
        expect(calls[1][0].signal).not.toBe(calls[0][0].signal);
      } finally {
        timeoutSpy.mockRestore();
      }
    });

    it('still stops the turn when the user aborts during compaction', async () => {
      const controller = new AbortController();
      const harness = createHarness({}, { signal: controller.signal });
      harness.gateway.completeOnce.mockImplementation(untilAborted);
      const pending = harness.session.prepareInitial(history());
      await untilCalled(harness.gateway.completeOnce);
      controller.abort();
      await expect(pending).rejects.toThrow('summary call aborted');
    });
  });
});
