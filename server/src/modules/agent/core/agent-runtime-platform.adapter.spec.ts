import { AgentRuntimeCore } from '@99agent/runtime-core';
import { Logger } from '@nestjs/common';
import { AgentRuntimePlatformAdapter, roundBudgetNote } from './agent-runtime-platform.adapter';
import { AgentToolExecutor } from './agent-tool-executor.adapter';
import { FileRefMappingStore } from '../../fileAsset/file-refs';
import type { AgentLoopOptions } from './agent-loop.service';
import type {
  AgentEffectState,
  AgentModelEffectIntent,
} from '../runtime-state/operation-ledger.types';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

type AgentLoopProgressEvent = Parameters<NonNullable<AgentLoopOptions['onProgress']>>[0];

function createAdapter(toolResults: any[] = [], overrides: any = {}) {
  const projected: any[] = [];
  const currentMessage: any = {
    role: 'assistant',
    content: '',
    rounds: [],
    trace: { rounds: [] },
  };
  const toolContext: any = {
    input: { messages: [], config: {}, context: { options: {} } },
  };
  const options: any = {
    onProgress: (event: AgentLoopProgressEvent) => {
      projected.push(event);
      overrides.onProgress?.(event);
    },
    tokenUsage: overrides.tokenUsage || {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      details: [],
    },
    additionalParams: {},
    toolCost: overrides.toolCost ?? 0,
  };
  const adapter = new AgentRuntimePlatformAdapter({
    model: 'provider-neutral-model',
    modelConfig: { model: 'provider-neutral-model' } as any,
    options,
    currentMessage,
    toolContext,
    sanitizedNameMap: new Map([
      ['private_file_tool', 'private_file_tool'],
      ['deferred_tool', 'deferred_tool'],
    ]),
    modelGateway: overrides.modelGateway || ({ stream: jest.fn() } as any),
    toolExecutor:
      overrides.toolExecutor ||
      ({ executeToolCalls: jest.fn().mockResolvedValue(toolResults) } as any),
    prepareMedia: async messages => messages,
    createRoundTrace: roundIndex => ({
      roundIndex,
      startedAt: '2026-08-30T00:00:00.000Z',
      status: 'success',
      toolCalls: [],
    }),
    summarizeModelOutput: content => (content ? `chars=${content.length}` : undefined),
    contextProjection: overrides.contextProjection,
    operationSession: overrides.operationSession,
    maxRounds: overrides.maxRounds,
  });
  return {
    adapter,
    projected,
    currentMessage,
    toolContext,
    options,
  };
}

function layeredResult(callId: string) {
  return {
    id: callId,
    status: 'success',
    type: 'tool',
    name: callId,
    toolName: callId,
    toolResult: { status: 'success', modelContent: `model:${callId}` },
    internal: { trace: { callId, toolName: callId, status: 'success' } },
  };
}

async function resolveExternalBatch(
  adapter: AgentRuntimePlatformAdapter,
  callIds: string[],
): Promise<void> {
  adapter.ports.progress({
    type: 'round.started',
    data: { roundIndex: 0, messages: [], tools: [] },
  });
  callIds.forEach((callId, ordinal) =>
    adapter.startExternal({
      callId,
      ordinal,
      roundIndex: 0,
      functionName: callId,
      displayName: callId,
      toolType: 'tool',
    }),
  );
  await adapter.ports.capabilityExecutor({
    toolCalls: callIds.map(callId => ({
      id: callId,
      type: 'function',
      function: { name: callId, arguments: '{}' },
    })),
    roundIndex: 0,
  });
}

describe('AgentRuntimePlatformAdapter round budget', () => {
  it('tells the model how many tool rounds remain near the cap and to answer at the end', () => {
    expect(roundBudgetNote(3, 10)).toBe('');
    expect(roundBudgetNote(4, 10)).toContain('最多还能再调用 5 轮工具');
    expect(roundBudgetNote(8, 10)).toContain('最多还能再调用 1 轮工具');
    expect(roundBudgetNote(9, 10)).toContain('工具调用轮次已用完：请直接给出最终答复');
    expect(roundBudgetNote(9, undefined)).toBe('');
  });

  it('merges the note into array content without exceeding the runtime part limit', async () => {
    const media = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        type: 'image_file' as const,
        file: { fileRef: `output_image_${index + 1}`, name: `${index + 1}.png`, mime: 'image/png' },
      }));
    const withResult = async (modelContent: any[]) => {
      const { adapter } = createAdapter(
        [{ ...layeredResult('m_1'), toolResult: { status: 'success', modelContent } }],
        { maxRounds: 1 },
      );
      adapter.ports.progress({
        type: 'round.started',
        data: { roundIndex: 0, messages: [], tools: [] },
      });
      adapter.startExternal({
        callId: 'm_1',
        ordinal: 0,
        roundIndex: 0,
        functionName: 'private_file_tool',
        displayName: 'm_1',
        toolType: 'tool',
      });
      const [result] = await adapter.ports.capabilityExecutor({
        toolCalls: [
          { id: 'm_1', type: 'function', function: { name: 'private_file_tool', arguments: '{}' } },
        ],
        roundIndex: 0,
      });
      return result.modelContent as any[];
    };
    const merged = await withResult([{ type: 'text', text: '说明' }, ...media(31)]);
    expect(merged).toHaveLength(32);
    expect(merged[0].text).toMatch(/^\[轮次提醒\].*\n说明$/su);
    const full = await withResult(media(32));
    expect(full).toHaveLength(32);
    expect(JSON.stringify(full)).not.toContain('轮次提醒');
    const room = await withResult(media(2));
    expect(room).toHaveLength(3);
    expect(room[0].text).toContain('轮次提醒');
  });

  it('puts the note in front of the first tool result of a round near the cap only', async () => {
    const { adapter } = createAdapter([layeredResult('call_a'), layeredResult('call_b')], {
      maxRounds: 10,
    });
    const run = async (roundIndex: number) => {
      const callIds = [`a_${roundIndex}`, `b_${roundIndex}`];
      adapter.ports.progress({
        type: 'round.started',
        data: { roundIndex, messages: [], tools: [] },
      });
      callIds.forEach((callId, ordinal) =>
        adapter.startExternal({
          callId,
          ordinal,
          roundIndex,
          functionName: 'private_file_tool',
          displayName: callId,
          toolType: 'tool',
        }),
      );
      return adapter.ports.capabilityExecutor({
        toolCalls: callIds.map(callId => ({
          id: callId,
          type: 'function' as const,
          function: { name: 'private_file_tool', arguments: '{}' },
        })),
        roundIndex,
      });
    };
    const early = await run(2);
    expect(JSON.stringify(early)).not.toContain('轮次提醒');
    const late = await run(9);
    expect(String(late[0].modelContent)).toMatch(/^\[轮次提醒\] 本次回复的工具调用轮次已用完/u);
    expect(String(late[1].modelContent)).not.toContain('轮次提醒');
  });
});

describe('AgentRuntimePlatformAdapter correlation and writer boundaries', () => {
  it('does not expose provider retries without a durable operation session', () => {
    const { adapter } = createAdapter();
    expect(adapter.ports.modelRetry).toBeUndefined();
  });

  it('persists provider intent before the call and commits a bounded checkpoint before done', async () => {
    const order: string[] = [];
    const operationSession = {
      beginModelEffect: jest.fn(async (input: AgentModelEffectIntent) => {
        order.push('intent');
        expect(JSON.stringify(input)).not.toContain('PRIVATE_PROMPT_SENTINEL');
        return { action: 'execute', effectKey: 'provider:r2:a0' };
      }),
      checkpointModelEffect: jest.fn(async () => {
        order.push('checkpoint');
      }),
      finishModelEffect: jest.fn(async (_key: string, state: AgentEffectState) => {
        order.push(`finish:${state}`);
      }),
    };
    const modelGateway = {
      stream: jest.fn(() =>
        (async function* () {
          order.push('provider');
          yield { type: 'text_delta', delta: 'x'.repeat(2_100) };
          yield {
            type: 'usage',
            usage: {
              inputTokens: 3,
              outputTokens: 2,
              totalTokens: 5,
              raw: { provider: { sentinel: 'PRIVATE_AGENT_USAGE' } },
              providerPrivate: { sentinel: 'PRIVATE_AGENT_USAGE' },
            },
          };
          yield { type: 'done', finishReason: 'stop' };
        })(),
      ),
    };
    const { adapter, options } = createAdapter([], { modelGateway, operationSession });
    const events: any[] = [];
    for await (const event of adapter.ports.modelStream({
      messages: [{ role: 'user', content: 'PRIVATE_PROMPT_SENTINEL' }],
      tools: [],
      roundIndex: 2,
      attemptIndex: 0,
    })) {
      events.push(event);
    }

    expect(order[0]).toBe('intent');
    expect(order[1]).toBe('provider');
    expect(order).toContain('checkpoint');
    expect(order.at(-1)).toBe('finish:committed');
    expect(operationSession.finishModelEffect).toHaveBeenCalledWith(
      'provider:r2:a0',
      'committed',
      expect.objectContaining({
        textChars: 2_100,
        textTail: expect.any(String),
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      }),
    );
    adapter.ports.trace({
      type: 'usage',
      data: {
        roundIndex: 2,
        usage: {
          inputTokens: 3,
          outputTokens: 2,
          totalTokens: 5,
          raw: { provider: { sentinel: 'PRIVATE_AGENT_USAGE' } },
          providerPrivate: { sentinel: 'PRIVATE_AGENT_USAGE' },
        },
      },
    } as any);
    expect(JSON.stringify(operationSession.checkpointModelEffect.mock.calls)).not.toContain(
      'PRIVATE_AGENT_USAGE',
    );
    expect(JSON.stringify(operationSession.finishModelEffect.mock.calls)).not.toContain(
      'PRIVATE_AGENT_USAGE',
    );
    expect(JSON.stringify(options.tokenUsage)).not.toContain('PRIVATE_AGENT_USAGE');
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'stop' });
  });

  it('marks an interrupted provider stream unknown and never calls it again', async () => {
    const operationSession = {
      beginModelEffect: jest
        .fn()
        .mockResolvedValue({ action: 'execute', effectKey: 'provider:r0:a0' }),
      checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
      finishModelEffect: jest.fn().mockResolvedValue(undefined),
    };
    const modelGateway = {
      stream: jest.fn(() =>
        (async function* () {
          yield { type: 'text_delta', delta: 'partial' };
          throw new Error('connection disappeared');
        })(),
      ),
    };
    const { adapter } = createAdapter([], { modelGateway, operationSession });
    const events: any[] = [];
    const consume = async () => {
      for await (const _event of adapter.ports.modelStream({
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        roundIndex: 0,
        attemptIndex: 0,
      })) {
        events.push(_event);
      }
    };

    await expect(consume()).resolves.toBeUndefined();
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { category: 'unknown', requestOutcome: 'unknown' },
    });
    expect(JSON.stringify(events)).not.toContain('connection disappeared');
    expect(modelGateway.stream).toHaveBeenCalledTimes(1);
    expect(operationSession.finishModelEffect).toHaveBeenCalledWith(
      'provider:r0:a0',
      'unknown',
      expect.objectContaining({ textTail: 'partial', textChars: 7 }),
    );
  });

  it('settles a stream that went silent as unknown and fails the run without calling the provider again', async () => {
    jest.useFakeTimers();
    try {
      const operationSession = {
        beginModelEffect: jest
          .fn()
          .mockResolvedValue({ action: 'execute', effectKey: 'provider:r0:a0' }),
        checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
        finishModelEffect: jest.fn().mockResolvedValue(undefined),
      };
      const modelGateway = {
        // 与真实网关一致：信号中止后给出 abort 收尾
        stream: jest.fn((input: { signal: AbortSignal }) =>
          (async function* () {
            yield { type: 'text_delta', delta: 'partial' };
            await new Promise<void>(resolve =>
              input.signal.addEventListener('abort', () => resolve(), { once: true }),
            );
            yield { type: 'abort', reason: 'aborted' };
          })(),
        ),
      };
      const { adapter } = createAdapter([], { modelGateway, operationSession });
      const running = new AgentRuntimeCore(adapter.ports).run({
        model: 'provider-neutral-model',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        maxRounds: 2,
        firstEventTimeoutMs: 120_000,
        idleTimeoutMs: 600_000,
      });
      await jest.advanceTimersByTimeAsync(599_000);
      expect(operationSession.finishModelEffect).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1_000);
      const result = await running;

      expect(result).toMatchObject({
        success: false,
        finishReason: 'error',
        error: '模型长时间没有输出，已中断，请重试',
      });
      // 账本：这次请求的结果记为未知；没有重发
      expect(modelGateway.stream).toHaveBeenCalledTimes(1);
      expect(operationSession.beginModelEffect).toHaveBeenCalledTimes(1);
      expect(
        operationSession.finishModelEffect.mock.calls.map((call: [string, AgentEffectState]) => [
          call[0],
          call[1],
        ]),
      ).toEqual([['provider:r0:a0', 'unknown']]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('marks the provider effect unknown when the stream consumer stops early', async () => {
    const operationSession = {
      beginModelEffect: jest
        .fn()
        .mockResolvedValue({ action: 'execute', effectKey: 'provider:r0:a0' }),
      checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
      finishModelEffect: jest.fn().mockResolvedValue(undefined),
    };
    const modelGateway = {
      stream: jest.fn(() =>
        (async function* () {
          yield { type: 'text_delta', delta: 'partial' };
          yield { type: 'done', finishReason: 'stop' };
        })(),
      ),
    };
    const { adapter } = createAdapter([], { modelGateway, operationSession });
    const stream = adapter.ports.modelStream({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      roundIndex: 0,
      attemptIndex: 0,
    }) as AsyncGenerator<any>;

    await expect(stream.next()).resolves.toMatchObject({
      value: { type: 'text_delta', delta: 'partial' },
      done: false,
    });
    await stream.return?.(undefined);

    expect(modelGateway.stream).toHaveBeenCalledTimes(1);
    expect(operationSession.finishModelEffect).toHaveBeenCalledWith(
      'provider:r0:a0',
      'unknown',
      expect.objectContaining({ textTail: 'partial', textChars: 7 }),
    );
  });

  it('persists and clears the durable retry gate around a completed wait', async () => {
    const operationSession = {
      setRetryNotBefore: jest.fn().mockResolvedValue(undefined),
      clearRetryNotBefore: jest.fn().mockResolvedValue(undefined),
    };
    const { adapter } = createAdapter([], { operationSession });
    const plan = adapter.ports.modelRetry!.plan({
      category: 'rate_limit',
      retryAfterMs: 2_000,
      retryIndex: 0,
    });
    expect(plan).toMatchObject({ delayMs: 2_000, notBeforeMs: expect.any(Number) });

    await adapter.ports.modelRetry!.wait({
      delayMs: 0,
      notBeforeMs: 12_345,
      roundIndex: 0,
      attemptIndex: 1,
      retryIndex: 0,
    });

    expect(operationSession.setRetryNotBefore).toHaveBeenCalledWith(new Date(12_345));
    expect(operationSession.clearRetryNotBefore).toHaveBeenCalledTimes(1);
    expect(operationSession.setRetryNotBefore.mock.invocationCallOrder[0]).toBeLessThan(
      operationSession.clearRetryNotBefore.mock.invocationCallOrder[0],
    );
  });

  it('leaves the durable retry gate for terminal convergence when a wait is aborted', async () => {
    const operationSession = {
      setRetryNotBefore: jest.fn().mockResolvedValue(undefined),
      clearRetryNotBefore: jest.fn().mockResolvedValue(undefined),
    };
    const { adapter } = createAdapter([], { operationSession });
    const controller = new AbortController();
    const reason = Object.assign(new Error('user stopped'), { name: 'AbortError' });
    const pending = adapter.ports.modelRetry!.wait({
      delayMs: 30_000,
      notBeforeMs: 40_000,
      roundIndex: 0,
      attemptIndex: 1,
      retryIndex: 0,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(operationSession.setRetryNotBefore).toHaveBeenCalledWith(new Date(40_000));
    expect(operationSession.clearRetryNotBefore).not.toHaveBeenCalled();
  });

  it('runs a durable rejected retry with a new effect key before committing output', async () => {
    const operationSession = {
      beginModelEffect: jest.fn(async (input: AgentModelEffectIntent) => ({
        action: 'execute',
        effectKey: `provider:r${input.roundIndex}:a${input.attemptIndex}`,
      })),
      checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
      finishModelEffect: jest.fn().mockResolvedValue(undefined),
      setRetryNotBefore: jest.fn().mockResolvedValue(undefined),
      clearRetryNotBefore: jest.fn().mockResolvedValue(undefined),
    };
    let providerCall = 0;
    const modelGateway = {
      stream: jest.fn(() => {
        providerCall += 1;
        return (async function* () {
          if (providerCall === 1) {
            yield {
              type: 'error',
              error: {
                code: 'MODEL_TRANSIENT_ERROR',
                message: '模型服务暂时不可用，请稍后再试',
                category: 'transient',
                retryable: true,
                requestOutcome: 'rejected',
                status: 503,
              },
            };
            return;
          }
          yield { type: 'text_delta', delta: 'recovered' };
          yield { type: 'done', finishReason: 'stop' };
        })();
      }),
    };
    const { adapter } = createAdapter([], { modelGateway, operationSession });
    adapter.ports.modelRetry!.plan = () => ({ delayMs: 0, notBeforeMs: Date.now() });
    const runtime = new AgentRuntimeCore(adapter.ports);

    const result = await runtime.run({
      model: 'provider-neutral-model',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      maxRounds: 2,
    });

    expect(result.finishReason).toBe('stop');
    expect(modelGateway.stream).toHaveBeenCalledTimes(2);
    expect(
      operationSession.beginModelEffect.mock.calls.map(
        (call: [AgentModelEffectIntent]) => call[0].attemptIndex,
      ),
    ).toEqual([0, 1]);
    expect(
      operationSession.finishModelEffect.mock.calls.map((call: [string, AgentEffectState]) => [
        call[0],
        call[1],
      ]),
    ).toEqual([
      ['provider:r0:a0', 'rejected'],
      ['provider:r0:a1', 'committed'],
    ]);
    expect(operationSession.setRetryNotBefore).toHaveBeenCalledTimes(1);
    expect(operationSession.clearRetryNotBefore).toHaveBeenCalledTimes(1);
  });

  it('blocks provider replay when the same durable effect already exists', async () => {
    const operationSession = {
      beginModelEffect: jest
        .fn()
        .mockResolvedValue({ action: 'unknown', effectKey: 'provider:r0:a0' }),
      checkpointModelEffect: jest.fn(),
      finishModelEffect: jest.fn(),
    };
    const modelGateway = { stream: jest.fn(async function* () {}) };
    const { adapter } = createAdapter([], { modelGateway, operationSession });
    const consume = async () => {
      for await (const _event of adapter.ports.modelStream({
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        roundIndex: 0,
        attemptIndex: 0,
      })) {
        /* consume */
      }
    };
    await expect(consume()).rejects.toThrow(/阻止重复调用/u);
    expect(modelGateway.stream).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'intent',
      failIntent: true,
      failCheckpoint: false,
      failFinish: false,
      emitCheckpoint: false,
      providerCalls: 0,
      checkpointCalls: 0,
      finishCalls: 0,
    },
    {
      label: 'checkpoint',
      failIntent: false,
      failCheckpoint: true,
      failFinish: false,
      emitCheckpoint: true,
      providerCalls: 1,
      checkpointCalls: 1,
      finishCalls: 1,
    },
    {
      label: 'checkpoint and unknown finish',
      failIntent: false,
      failCheckpoint: true,
      failFinish: true,
      emitCheckpoint: true,
      providerCalls: 1,
      checkpointCalls: 1,
      finishCalls: 1,
    },
    {
      label: 'committed finish',
      failIntent: false,
      failCheckpoint: false,
      failFinish: true,
      emitCheckpoint: false,
      providerCalls: 1,
      checkpointCalls: 0,
      finishCalls: 1,
    },
  ])(
    'keeps a $label persistence failure fixed across the real runtime',
    async ({
      label,
      failIntent,
      failCheckpoint,
      failFinish,
      emitCheckpoint,
      providerCalls,
      checkpointCalls,
      finishCalls,
    }: {
      label: string;
      failIntent: boolean;
      failCheckpoint: boolean;
      failFinish: boolean;
      emitCheckpoint: boolean;
      providerCalls: number;
      checkpointCalls: number;
      finishCalls: number;
    }) => {
      const privateDetail = `synthetic ${label} persistence diagnostic`;
      const operationSession = {
        beginModelEffect: jest.fn(async () => {
          if (failIntent) throw new Error(privateDetail);
          return { action: 'execute', effectKey: 'provider:r0:a0' };
        }),
        checkpointModelEffect: jest.fn(async () => {
          if (failCheckpoint) throw new Error(privateDetail);
        }),
        finishModelEffect: jest.fn(async () => {
          if (failFinish) throw new Error(privateDetail);
        }),
      };
      const modelGateway = {
        stream: jest.fn(() =>
          (async function* () {
            if (emitCheckpoint) yield { type: 'text_delta', delta: 'x'.repeat(2_100) };
            else yield { type: 'done', finishReason: 'stop' };
          })(),
        ),
      };
      const errorLog = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
      const { adapter, projected, currentMessage } = createAdapter([], {
        modelGateway,
        operationSession,
      });
      let result: any;
      let logged = '';
      try {
        result = await new AgentRuntimeCore(adapter.ports).run({
          model: 'provider-neutral-model',
          messages: [{ role: 'user', content: 'hello' }],
          tools: [],
          maxRounds: 1,
        });
        logged = JSON.stringify(errorLog.mock.calls);
      } finally {
        errorLog.mockRestore();
      }

      expect(result).toMatchObject({
        success: false,
        finishReason: 'error',
        error: '模型请求结果无法确认，已停止自动重试',
      });
      expect(modelGateway.stream).toHaveBeenCalledTimes(providerCalls);
      expect(operationSession.checkpointModelEffect).toHaveBeenCalledTimes(checkpointCalls);
      expect(operationSession.finishModelEffect).toHaveBeenCalledTimes(finishCalls);
      expect(JSON.stringify({ result, projected, currentMessage, logged })).not.toContain(
        privateDetail,
      );
    },
  );

  it('does not throw a raw finalizer persistence failure when the stream consumer closes', async () => {
    const privateDetail = 'synthetic finalizer persistence diagnostic';
    const operationSession = {
      beginModelEffect: jest
        .fn()
        .mockResolvedValue({ action: 'execute', effectKey: 'provider:r0:a0' }),
      checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
      finishModelEffect: jest.fn().mockRejectedValue(new Error(privateDetail)),
    };
    const modelGateway = {
      stream: jest.fn(() =>
        (async function* () {
          yield { type: 'text_delta', delta: 'partial' };
          yield { type: 'done', finishReason: 'stop' };
        })(),
      ),
    };
    const errorLog = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
    const { adapter } = createAdapter([], { modelGateway, operationSession });
    const stream = adapter.ports.modelStream({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      roundIndex: 0,
      attemptIndex: 0,
    }) as AsyncGenerator<any>;
    let logged = '';
    try {
      await expect(stream.next()).resolves.toMatchObject({
        value: { type: 'text_delta', delta: 'partial' },
        done: false,
      });
      await expect(stream.return?.(undefined)).resolves.toMatchObject({ done: true });
      logged = JSON.stringify(errorLog.mock.calls);
    } finally {
      errorLog.mockRestore();
    }

    expect(operationSession.finishModelEffect).toHaveBeenCalledTimes(1);
    expect(logged).not.toContain(privateDetail);
  });

  it('keeps the replay state for the provider but never in the tool context', async () => {
    const state = { opaque: 'PRIVATE_REPLAY_STATE' };
    const modelGateway = {
      stream: jest.fn(async function* () {
        yield { type: 'done', finishReason: 'stop' };
      }),
    };
    const { adapter, toolContext } = createAdapter([], { modelGateway });
    const toolCalls = [
      { id: 'call_1', type: 'function' as const, function: { name: 'search', arguments: '{}' } },
    ];
    const projected = adapter.ports.messagePreparation.projectAssistantMessage({
      content: '',
      reasoningContent: 'public reasoning',
      toolCalls,
      providerState: state,
    });
    expect(projected.provider_state).toBe(state);
    expect(
      adapter.ports.messagePreparation.projectAssistantMessage({
        content: '',
        reasoningContent: '',
        toolCalls,
      }),
    ).not.toHaveProperty('provider_state');

    const history: any[] = [
      { role: 'user', content: 'hello' },
      projected,
      { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
    ];
    // 两次历史归一化（按来源身份 + 已清理标记）之后仍在，发给网关的请求里也在
    const prepared = await adapter.ports.messagePreparation.prepareForModel(history, {
      roundIndex: 1,
      reason: 'round',
      overflowRecoveryUsed: false,
    });
    expect(prepared[1].provider_state).toBe(state);
    for await (const _event of adapter.ports.modelStream({
      messages: prepared,
      tools: [],
      roundIndex: 1,
      attemptIndex: 0,
    } as any)) {
      /* drain */
    }
    expect(modelGateway.stream.mock.calls[0][0].messages[1].provider_state).toBe(state);

    // 工具看到的消息里没有
    adapter.ports.lifecycle.onMessagesReplaced(history);
    expect(toolContext.input.messages[1]).not.toHaveProperty('provider_state');
    expect(JSON.stringify(toolContext.input.messages)).not.toContain('PRIVATE_REPLAY_STATE');
  });

  it('retries a rejected replay-state request once with a new durable effect and no state', async () => {
    const operationSession = {
      beginModelEffect: jest.fn(async (input: AgentModelEffectIntent) => ({
        action: 'execute',
        effectKey: `provider:r${input.roundIndex}:a${input.attemptIndex}`,
      })),
      checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
      finishModelEffect: jest.fn().mockResolvedValue(undefined),
    };
    const sent: any[] = [];
    const modelGateway = {
      stream: jest.fn((request: any) => {
        sent.push(request.messages);
        return (async function* () {
          if (sent.length === 1) {
            yield {
              type: 'error',
              error: {
                code: 'provider_state_rejected',
                message: '模型服务拒绝了回放的思考状态',
                category: 'invalid_request',
                retryable: false,
                requestOutcome: 'rejected',
                status: 400,
              },
            };
            return;
          }
          yield { type: 'text_delta', delta: 'recovered' };
          yield { type: 'done', finishReason: 'stop' };
        })();
      }),
    };
    const { adapter, projected } = createAdapter([], { modelGateway, operationSession });
    const runtime = new AgentRuntimeCore(adapter.ports);
    const result = await runtime.run({
      model: 'provider-neutral-model',
      messages: [
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
          ],
          provider_state: { opaque: 'PRIVATE_REPLAY_STATE' },
          // 本次运行里投影出来的消息：带来源身份，历史归一化才会保留状态
          __agent_context: { sourceModelIdentity: ':provider-neutral-model' },
        } as any,
        { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
      ],
      tools: [],
      maxRounds: 2,
    });

    expect(result.finishReason).toBe('stop');
    expect(sent).toHaveLength(2);
    expect(JSON.stringify(sent[1])).not.toContain('PRIVATE_REPLAY_STATE');
    expect(
      operationSession.finishModelEffect.mock.calls.map((call: [string, AgentEffectState]) => [
        call[0],
        call[1],
      ]),
    ).toEqual([
      ['provider:r0:a0', 'rejected'],
      ['provider:r0:a1', 'committed'],
    ]);
    expect(projected).toContainEqual(
      expect.objectContaining({
        type: 'progress',
        data: expect.objectContaining({ code: 'provider_state_retry' }),
      }),
    );
  });

  it('does not retry when the rejected outcome could not be recorded', async () => {
    const operationSession = {
      beginModelEffect: jest.fn(async (input: AgentModelEffectIntent) => ({
        action: 'execute',
        effectKey: `provider:r${input.roundIndex}:a${input.attemptIndex}`,
      })),
      checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
      finishModelEffect: jest.fn().mockRejectedValue(new Error('PRIVATE_LEDGER_DETAIL')),
    };
    const modelGateway = {
      stream: jest.fn(() =>
        (async function* () {
          yield {
            type: 'error',
            error: {
              code: 'provider_state_rejected',
              message: '模型服务拒绝了回放的思考状态',
              category: 'invalid_request',
              retryable: false,
              requestOutcome: 'rejected',
              status: 400,
            },
          };
        })(),
      ),
    };
    const { adapter } = createAdapter([], { modelGateway, operationSession });
    const errorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    try {
      const runtime = new AgentRuntimeCore(adapter.ports);
      const result = await runtime.run({
        model: 'provider-neutral-model',
        messages: [
          { role: 'user', content: 'hello' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
            ],
            provider_state: { opaque: 'PRIVATE_REPLAY_STATE' },
            // 本次运行里投影出来的消息：带来源身份，历史归一化才会保留状态
            __agent_context: { sourceModelIdentity: ':provider-neutral-model' },
          } as any,
          { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
        ],
        tools: [],
        maxRounds: 2,
      });
      // 终态落库失败转为 unknown：不重发
      expect(modelGateway.stream).toHaveBeenCalledTimes(1);
      expect(result.finishReason).toBe('error');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('strips internal context metadata before the provider request', async () => {
    const modelGateway = { stream: jest.fn(async function* () {}) };
    const { adapter } = createAdapter([], { modelGateway });

    for await (const _event of adapter.ports.modelStream({
      messages: [
        {
          role: 'user',
          content: 'hello',
          __agent_context: { chatLogId: 7, required: true },
        } as any,
      ],
      tools: [],
      model: 'fixture',
    } as any)) {
      /* empty stream */
    }

    expect(modelGateway.stream.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'hello' },
    ]);
  });

  it('projects every round with the explicit preparation context', async () => {
    const projected = [{ role: 'user', content: 'projected' }];
    const contextProjection = {
      prepareForModel: jest.fn().mockResolvedValue(projected),
    };
    const { adapter } = createAdapter([], { contextProjection });
    const context = {
      roundIndex: 2,
      reason: 'round' as const,
      previousUsage: { inputTokens: 90, outputTokens: 10, totalTokens: 100 },
      overflowRecoveryUsed: false,
    };

    await expect(
      adapter.ports.messagePreparation.prepareForModel([{ role: 'user', content: 'raw' }], context),
    ).resolves.toEqual(projected);
    expect(contextProjection.prepareForModel).toHaveBeenCalledWith(
      [{ role: 'user', content: 'raw' }],
      context,
    );
  });

  it('classifies a provider-rejected context overflow without exposing raw details', async () => {
    const modelGateway = {
      stream: jest.fn(async function* () {
        const error: any = new Error('maximum context length contains private payload');
        error.code = 'context_length_exceeded';
        throw error;
      }),
    };
    const operationSession = {
      beginModelEffect: jest
        .fn()
        .mockResolvedValue({ action: 'execute', effectKey: 'provider:r0:a0' }),
      checkpointModelEffect: jest.fn(),
      finishModelEffect: jest.fn().mockResolvedValue(undefined),
    };
    const { adapter } = createAdapter([], { modelGateway, operationSession });
    const events: any[] = [];

    for await (const event of adapter.ports.modelStream({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      roundIndex: 0,
      attemptIndex: 0,
      model: 'fixture',
    } as any)) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: 'error',
        error: {
          code: 'MODEL_CONTEXT_OVERFLOW',
          message: '模型上下文超过限制',
          category: 'context_overflow',
          retryable: false,
          requestOutcome: 'rejected',
        },
      },
    ]);
    expect(operationSession.finishModelEffect).toHaveBeenCalledWith('provider:r0:a0', 'rejected', {
      textChars: 0,
      reasoningChars: 0,
    });
  });

  it.each([
    ['text', { type: 'text_delta', delta: 'partial' }],
    ['reasoning', { type: 'reasoning_delta', delta: 'thinking' }],
    [
      'tool call',
      {
        type: 'tool_call_delta',
        index: 0,
        id: 'call_1',
        nameDelta: 'ls',
        argumentsDelta: '{}',
      },
    ],
    [
      'hosted tool call',
      {
        type: 'hosted_tool_call',
        toolCall: { id: 'hosted_1', name: 'search', status: 'running' },
      },
    ],
    [
      'usage',
      {
        type: 'usage',
        usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
      },
    ],
  ])(
    'marks context overflow after a %s effect unknown',
    async (_label: string, visibleEvent: Record<string, unknown>) => {
      const overflow: any = new Error('maximum context length contains private payload');
      overflow.code = 'context_length_exceeded';
      const modelGateway = {
        stream: jest.fn(async function* () {
          yield visibleEvent;
          yield { type: 'error', error: overflow };
        }),
      };
      const operationSession = {
        beginModelEffect: jest
          .fn()
          .mockResolvedValue({ action: 'execute', effectKey: 'provider:r0:a0' }),
        checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
        finishModelEffect: jest.fn().mockResolvedValue(undefined),
      };
      const { adapter } = createAdapter([], { modelGateway, operationSession });
      const events: any[] = [];

      for await (const event of adapter.ports.modelStream({
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        roundIndex: 0,
        attemptIndex: 0,
        model: 'fixture',
      } as any)) {
        events.push(event);
      }

      expect(modelGateway.stream).toHaveBeenCalledTimes(1);
      expect(events.at(-1)).toMatchObject({
        type: 'error',
        error: { category: 'context_overflow', requestOutcome: 'unknown' },
      });
      expect(operationSession.finishModelEffect).toHaveBeenCalledWith(
        'provider:r0:a0',
        'unknown',
        expect.any(Object),
      );
    },
  );

  it('marks a thrown context overflow after partial output unknown', async () => {
    const modelGateway = {
      stream: jest.fn(async function* () {
        yield { type: 'text_delta', delta: 'partial' };
        const error: any = new Error('maximum context length contains private payload');
        error.code = 'context_length_exceeded';
        throw error;
      }),
    };
    const operationSession = {
      beginModelEffect: jest
        .fn()
        .mockResolvedValue({ action: 'execute', effectKey: 'provider:r0:a0' }),
      checkpointModelEffect: jest.fn().mockResolvedValue(undefined),
      finishModelEffect: jest.fn().mockResolvedValue(undefined),
    };
    const { adapter } = createAdapter([], { modelGateway, operationSession });
    const events: any[] = [];

    for await (const event of adapter.ports.modelStream({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      roundIndex: 0,
      attemptIndex: 0,
      model: 'fixture',
    } as any)) {
      events.push(event);
    }

    expect(modelGateway.stream).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { category: 'context_overflow', requestOutcome: 'unknown' },
    });
    expect(operationSession.finishModelEffect).toHaveBeenCalledWith(
      'provider:r0:a0',
      'unknown',
      expect.objectContaining({ textTail: 'partial', textChars: 7 }),
    );
  });
  it('uses newly registered tool file references for the next model request', async () => {
    const modelGateway = { stream: jest.fn(async function* () {}) };
    const { adapter, toolContext } = createAdapter([], { modelGateway });
    toolContext.fileRefMappingStore = new FileRefMappingStore();
    toolContext.fileRefMappingStore.registerFile('file_aaaaaaaaaaaaaaaaaaaaaaaa', {
      type: 'image',
    });
    for await (const _event of adapter.ports.modelStream({
      messages: [],
      tools: [],
      model: 'fixture',
    } as any)) {
      /* empty stream */
    }
    expect(modelGateway.stream.mock.calls[0][0].fileContext.fileRefMapping.entries).toEqual([
      expect.objectContaining({
        fileRef: 'output_image_1',
        fileId: 'file_aaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ]);
  });
  it('commits one external capability exactly once through the ordered writer', async () => {
    const layered = {
      id: 'call_1',
      status: 'success',
      type: 'tool',
      name: 'Demo',
      toolName: 'demo',
      toolResult: { status: 'success', modelContent: 'model result' },
      internal: { trace: { callId: 'call_1', toolName: 'demo', status: 'success' } },
    };
    const { adapter, projected, currentMessage } = createAdapter([layered]);
    adapter.ports.progress({
      type: 'round.started',
      data: { roundIndex: 0, messages: [], tools: [] },
    });
    adapter.startExternal({
      callId: 'call_1',
      ordinal: 0,
      roundIndex: 0,
      functionName: 'demo',
      displayName: 'Demo',
      toolType: 'tool',
    });
    const pure = await adapter.ports.capabilityExecutor({
      toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'demo', arguments: '{}' } }],
      roundIndex: 0,
    });
    adapter.ports.lifecycle.prepareCapabilityCommit(['call_1']);
    expect(currentMessage.rounds[0].toolCalls).toHaveLength(0);
    expect(currentMessage.rounds[0].trace.toolCalls).toHaveLength(0);
    expect(projected.filter(event => event.type === 'tool_result')).toHaveLength(0);
    adapter.ports.progress({
      type: 'capability.completed',
      data: { origin: 'external', roundIndex: 0, ...pure[0] },
    });

    expect(projected.filter(event => event.type === 'tool_call')).toHaveLength(1);
    expect(projected.filter(event => event.type === 'tool_result')).toHaveLength(1);
    expect(currentMessage.rounds[0].toolCalls).toHaveLength(1);
    expect(currentMessage.rounds[0].trace.toolCalls).toHaveLength(1);
    expect(() =>
      adapter.ports.progress({
        type: 'capability.completed',
        data: { origin: 'external', roundIndex: 0, ...pure[0] },
      }),
    ).toThrow(/commit rejected/);
  });

  it.each([
    ['duplicate', ['first', 'first']],
    ['unknown', ['first', 'unknown']],
    ['missing', ['first']],
    ['wrong ordinal', ['second', 'first']],
  ])(
    'rejects a %s prepare set before any platform projection',
    async (_label: string, preparedIds: string[]) => {
      const { adapter, projected, currentMessage } = createAdapter([
        layeredResult('first'),
        layeredResult('second'),
      ]);
      await resolveExternalBatch(adapter, ['first', 'second']);

      expect(() => adapter.ports.lifecycle.prepareCapabilityCommit(preparedIds)).toThrow(
        /prepare rejected/,
      );
      expect(projected.filter(event => event.type === 'tool_result')).toHaveLength(0);
      expect(currentMessage.rounds[0].toolCalls).toHaveLength(0);
      expect(currentMessage.rounds[0].trace.toolCalls).toHaveLength(0);
      adapter.ports.lifecycle.closeRun('error');
    },
  );

  it('rejects out-of-order external commit without platform prewrite', async () => {
    const { adapter, projected, currentMessage } = createAdapter([
      layeredResult('first'),
      layeredResult('second'),
    ]);
    await resolveExternalBatch(adapter, ['first', 'second']);
    adapter.ports.lifecycle.prepareCapabilityCommit(['first', 'second']);

    expect(() =>
      adapter.ports.progress({
        type: 'capability.completed',
        data: { origin: 'external', roundIndex: 0, callId: 'second', status: 'success' },
      }),
    ).toThrow(/commit rejected/);
    expect(projected.filter(event => event.type === 'tool_result')).toHaveLength(0);
    expect(currentMessage.rounds[0].toolCalls).toHaveLength(0);
    expect(currentMessage.rounds[0].trace.toolCalls).toHaveLength(0);
    adapter.ports.lifecycle.closeRun('error');
  });

  it.each([1, 2])(
    'keeps only earlier committed entries when tool-result projection %i fails',
    async (failingProjection: number) => {
      let toolResultAttempt = 0;
      const { adapter, projected, currentMessage } = createAdapter(
        [layeredResult('first'), layeredResult('second')],
        {
          onProgress: (event: any) => {
            if (event.type !== 'tool_result') return;
            toolResultAttempt += 1;
            if (toolResultAttempt === failingProjection) {
              throw new Error(`projection ${failingProjection} failed`);
            }
          },
        },
      );
      await resolveExternalBatch(adapter, ['first', 'second']);
      adapter.ports.lifecycle.prepareCapabilityCommit(['first', 'second']);

      const commit = (callId: string) =>
        adapter.ports.progress({
          type: 'capability.completed',
          data: { origin: 'external', roundIndex: 0, callId, status: 'success' },
        });
      if (failingProjection === 1) {
        expect(() => commit('first')).toThrow(/projection 1 failed/);
      } else {
        commit('first');
        expect(() => commit('second')).toThrow(/projection 2 failed/);
      }

      const committedBeforeFailure = failingProjection - 1;
      expect(currentMessage.rounds[0].toolCalls).toHaveLength(committedBeforeFailure);
      expect(currentMessage.rounds[0].trace.toolCalls).toHaveLength(committedBeforeFailure);
      expect(projected.filter(event => event.type === 'tool_result')).toHaveLength(
        failingProjection,
      );
      adapter.ports.lifecycle.closeRun('error');
      const beforeLateWrite = JSON.stringify({ projected, currentMessage });
      expect(() => commit(failingProjection === 1 ? 'first' : 'second')).toThrow(/closed/);
      expect(JSON.stringify({ projected, currentMessage })).toBe(beforeLateWrite);
    },
  );

  it('rejects duplicate start and closed late writes without projecting anything new', () => {
    const { adapter, projected, currentMessage } = createAdapter();
    adapter.startExternal({
      callId: 'call_late',
      ordinal: 0,
      roundIndex: 0,
      functionName: 'demo',
      displayName: 'Demo',
      toolType: 'tool',
    });
    expect(() =>
      adapter.startExternal({
        callId: 'call_late',
        ordinal: 0,
        roundIndex: 0,
        functionName: 'demo',
        displayName: 'Demo',
        toolType: 'tool',
      }),
    ).toThrow(/start rejected/);
    adapter.ports.lifecycle.closeRun('abort');
    const before = JSON.stringify({ projected, currentMessage });
    expect(() =>
      adapter.ports.progress({
        type: 'capability.completed',
        data: { origin: 'external', roundIndex: 0, callId: 'call_late', status: 'success' },
      }),
    ).toThrow(/closed/);
    expect(JSON.stringify({ projected, currentMessage })).toBe(before);
  });

  it('routes an arbitrarily named hosted capability solely by structured origin', () => {
    const { adapter, projected } = createAdapter();
    adapter.ports.progress({
      type: 'capability.started',
      data: {
        origin: 'hosted',
        roundIndex: 0,
        callId: 'hosted_any',
        toolCall: {
          id: 'hosted_any',
          name: 'arbitrary_provider_capability',
          status: 'running',
          type: 'hosted_tool',
        },
      },
    });
    adapter.ports.progress({
      type: 'capability.completed',
      data: {
        origin: 'hosted',
        roundIndex: 0,
        callId: 'hosted_any',
        status: 'success',
        toolCall: {
          id: 'hosted_any',
          name: 'arbitrary_provider_capability',
          status: 'success',
          type: 'hosted_tool',
          output: { summary: 'done' },
        },
      },
    });
    expect(projected.map(event => event.type)).toEqual(['tool_call', 'tool_result']);
    expect(projected.map(event => event.data.toolCall.id)).toEqual(['hosted_any', 'hosted_any']);
    const beforeDuplicate = JSON.stringify(projected);
    expect(() =>
      adapter.ports.progress({
        type: 'capability.completed',
        data: {
          origin: 'hosted',
          roundIndex: 0,
          callId: 'hosted_any',
          status: 'success',
          toolCall: {
            id: 'hosted_any',
            name: 'arbitrary_provider_capability',
            status: 'success',
            type: 'hosted_tool',
          },
        },
      }),
    ).toThrow(/commit rejected/);
    expect(JSON.stringify(projected)).toBe(beforeDuplicate);
  });

  it.each(['success', 'error'])(
    'projects a terminal-only hosted %s as one end event without synthesizing start',
    (status: string) => {
      const { adapter, projected } = createAdapter();
      adapter.ports.progress({
        type: 'capability.completed',
        data: {
          origin: 'hosted',
          roundIndex: 0,
          callId: `terminal_${status}`,
          status,
          toolCall: {
            id: `terminal_${status}`,
            name: `arbitrary_terminal_${status}`,
            status,
            type: 'hosted_tool',
            output: { status },
          },
        },
      });

      expect(projected.map(event => event.type)).toEqual(['tool_result']);
      expect(projected[0].data.toolCall).toMatchObject({
        id: `terminal_${status}`,
        name: `arbitrary_terminal_${status}`,
        status,
      });
      const beforeDuplicate = JSON.stringify(projected);
      expect(() =>
        adapter.ports.progress({
          type: 'capability.completed',
          data: {
            origin: 'hosted',
            roundIndex: 0,
            callId: `terminal_${status}`,
            status,
            toolCall: {
              id: `terminal_${status}`,
              name: `arbitrary_terminal_${status}`,
              status,
              type: 'hosted_tool',
            },
          },
        }),
      ).toThrow(/commit rejected/);
      expect(JSON.stringify(projected)).toBe(beforeDuplicate);
    },
  );

  it('keeps invalid JSON recoverable through the real Tool Adapter and Kernel loop', async () => {
    const scripts = [
      [
        {
          type: 'tool_call_delta',
          index: 0,
          id: 'invalid_json',
          nameDelta: 'private_file_tool',
          argumentsDelta: '{"broken":',
        },
        { type: 'done' },
      ],
      [{ type: 'text_delta', delta: 'recovered' }, { type: 'done' }],
    ];
    let scriptIndex = 0;
    const modelGateway = {
      stream: jest.fn(() => {
        const script = scripts[scriptIndex++] || [];
        return (async function* () {
          for (const event of script) yield event;
        })();
      }),
    };
    const execute = jest.fn();
    const getToolProviderInfo = jest.fn();
    const getDisplayName = jest.fn();
    const resolveToolCost = jest.fn();
    const withToolTrace = jest.fn((result: any) => result);
    let adapter!: AgentRuntimePlatformAdapter;
    const toolExecutor = new AgentToolExecutor({
      toolProviderRegistry: { execute, getToolProviderInfo, getDisplayName },
      resolveToolCost,
      withToolTrace,
      onStart: input => adapter.startExternal(input),
      onTerminal: input => adapter.registerExternalTerminal(input),
    });
    const built = createAdapter([], { modelGateway, toolExecutor });
    adapter = built.adapter;
    const runtime = new AgentRuntimeCore(adapter.ports);
    const messages: any[] = [{ role: 'user', content: 'use tool' }];

    const result = await runtime.run({
      model: 'provider-neutral-model',
      messages,
      tools: [],
      maxRounds: 3,
    });

    expect(result.finishReason).toBe('stop');
    expect(modelGateway.stream).toHaveBeenCalledTimes(2);
    expect(execute).not.toHaveBeenCalled();
    expect(getToolProviderInfo).not.toHaveBeenCalled();
    expect(getDisplayName).not.toHaveBeenCalled();
    expect(resolveToolCost).not.toHaveBeenCalled();
    expect(built.options.toolCost).toBe(0);
    expect(withToolTrace).toHaveBeenCalledTimes(1);
    expect(
      result.messages.filter(message => message.role === 'tool').map(message => message.content),
    ).toEqual(['工具参数解析失败，可能因输出长度限制被截断。请尝试缩短参数内容后重试。']);
    expect(built.projected.filter(event => event.type === 'tool_call')).toHaveLength(0);
    expect(built.projected.filter(event => event.type === 'tool_result')).toHaveLength(1);
    expect(built.projected.find(event => event.type === 'tool_result').data.toolCall).toMatchObject(
      {
        id: 'invalid_json',
        status: 'error',
      },
    );
    expect(built.currentMessage.rounds[0].toolCalls).toHaveLength(1);
    expect(built.currentMessage.content).toBe('recovered');
  });

  it.each(['resolve', 'reject'])(
    'discards a real deferred Registry %s after abort without any late authoritative write',
    async (settlement: string) => {
      let settleRegistry!: () => void;
      let markRegistryEntered!: () => void;
      const registryEntered = new Promise<void>(resolve => {
        markRegistryEntered = resolve;
      });
      const execute = jest.fn(
        () =>
          new Promise((resolve, reject) => {
            settleRegistry = () => {
              if (settlement === 'resolve') {
                resolve({
                  status: 'success',
                  type: 'tool',
                  name: 'deferred',
                  output: { value: 'LATE' },
                });
              } else {
                reject(new Error('late Registry rejection'));
              }
            };
            markRegistryEntered();
          }),
      );
      const modelGateway = {
        stream: jest.fn(() =>
          (async function* () {
            yield {
              type: 'tool_call_delta',
              index: 0,
              id: 'deferred_call',
              nameDelta: 'deferred_tool',
              argumentsDelta: '{}',
            };
            yield { type: 'done' };
          })(),
        ),
      };
      const controller = new AbortController();
      const tokenUsage: NonNullable<AgentLoopOptions['tokenUsage']> = {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      };
      let adapter!: AgentRuntimePlatformAdapter;
      const toolExecutor = new AgentToolExecutor({
        toolProviderRegistry: {
          execute,
          getToolProviderInfo: jest.fn().mockReturnValue({ metadata: { category: 'tool' } }),
          getDisplayName: jest.fn().mockReturnValue('Deferred'),
        },
        resolveToolCost: jest.fn().mockResolvedValue(5),
        withToolTrace: jest.fn((result: any) => result),
        onStart: input => adapter.startExternal(input),
        onTerminal: input => adapter.registerExternalTerminal(input),
      });
      const built = createAdapter([], {
        modelGateway,
        toolExecutor,
        tokenUsage,
        toolCost: 3,
      });
      adapter = built.adapter;
      const runtime = new AgentRuntimeCore(adapter.ports);
      const messages: any[] = [{ role: 'user', content: 'defer' }];
      const pending = runtime.run({
        model: 'provider-neutral-model',
        messages,
        tools: [],
        maxRounds: 3,
        signal: controller.signal,
      });
      await registryEntered;
      controller.abort(new Error('user stopped'));
      const atAbort = {
        toolMessages: messages.filter(message => message.role === 'tool').length,
        externalEnds: built.projected.filter(event => event.type === 'tool_result').length,
        currentMessage: JSON.stringify(built.currentMessage),
        usage: JSON.stringify(tokenUsage),
        toolCost: built.options.toolCost,
        modelCalls: modelGateway.stream.mock.calls.length,
      };

      settleRegistry();
      const result = await pending;

      expect(result.finishReason).toBe('abort');
      expect(execute).toHaveBeenCalledTimes(1);
      expect({
        toolMessages: result.messages.filter(message => message.role === 'tool').length,
        externalEnds: built.projected.filter(event => event.type === 'tool_result').length,
        currentMessage: JSON.stringify(built.currentMessage),
        usage: JSON.stringify(tokenUsage),
        toolCost: built.options.toolCost,
        modelCalls: modelGateway.stream.mock.calls.length,
      }).toEqual(atAbort);
      const beforeLateWriter = JSON.stringify({
        projected: built.projected,
        currentMessage: built.currentMessage,
      });
      expect(() =>
        adapter.ports.progress({
          type: 'capability.completed',
          data: {
            origin: 'external',
            roundIndex: 0,
            callId: 'deferred_call',
            status: 'success',
          },
        }),
      ).toThrow(/closed/);
      expect(
        JSON.stringify({ projected: built.projected, currentMessage: built.currentMessage }),
      ).toBe(beforeLateWriter);
    },
  );

  it('gives ToolExecutionContext a copied view without internal context metadata', async () => {
    const { adapter, toolContext } = createAdapter();
    const replacement: any[] = [
      {
        role: 'user',
        content: 'prepared',
        __agent_context: { chatLogId: 9, required: true },
      },
    ];
    adapter.ports.lifecycle.onMessagesReplaced(replacement);
    expect(toolContext.input.messages).not.toBe(replacement);
    expect(toolContext.input.messages).toEqual([{ role: 'user', content: 'prepared' }]);
    expect(
      await adapter.ports.messagePreparation.prepareForModel(replacement, {
        roundIndex: 0,
        reason: 'round',
        overflowRecoveryUsed: false,
      }),
    ).toEqual(replacement);
  });
});

describe('AgentRuntimePlatformAdapter reply phases', () => {
  function phasesOf(projected: any[]) {
    return projected
      .filter(event => event.type === 'round_phase')
      .map(event => [event.data.roundIndex, event.data.phase]);
  }

  function startRound(adapter: AgentRuntimePlatformAdapter, roundIndex: number) {
    adapter.ports.progress({
      type: 'round.started',
      data: { roundIndex, messages: [], tools: [] },
    });
  }

  function text(adapter: AgentRuntimePlatformAdapter, roundIndex: number, cumulative: string) {
    adapter.ports.progress({
      type: 'text.delta',
      data: { roundIndex, delta: cumulative, cumulative },
    });
  }

  function complete(
    adapter: AgentRuntimePlatformAdapter,
    roundIndex: number,
    toolCallNames: string[],
    malformedToolCalls = false,
  ) {
    adapter.ports.progress({
      type: 'round.completed',
      data: { roundIndex, fullContent: '', toolCallNames, malformedToolCalls },
    });
  }

  it('moves a tool round text out of the answer as soon as a tool call starts', () => {
    const { adapter, projected, currentMessage } = createAdapter();
    startRound(adapter, 0);
    text(adapter, 0, '先看看数据。');
    expect(currentMessage.content).toBe('先看看数据。');
    adapter.ports.progress({
      type: 'round.tool_call',
      data: { roundIndex: 0, index: 0, name: 'private_file_tool' },
    });
    expect(currentMessage.rounds[0].phase).toBe('process');
    expect(currentMessage.content).toBe('');
    complete(adapter, 0, ['private_file_tool']);
    startRound(adapter, 1);
    text(adapter, 1, '结论：一切正常。');
    complete(adapter, 1, []);

    expect(phasesOf(projected)).toEqual([[0, 'process']]);
    expect(currentMessage.rounds[1].phase).toBeUndefined();
    expect(currentMessage.content).toBe('结论：一切正常。');
    // 阶段事件排在这一轮的收尾之前
    const types = projected.map(event => event.type);
    expect(types.indexOf('round_phase')).toBeLessThan(types.indexOf('round_complete'));
  });

  it('keeps rounds that only call conversation controls in the answer and corrects a wrong early signal', () => {
    const { adapter, projected, currentMessage } = createAdapter();
    startRound(adapter, 0);
    text(adapter, 0, '分析完成，结论如下。');
    // 早期名字不完整、被当成普通工具：完成时按完整名单校正回回答
    adapter.ports.progress({
      type: 'round.tool_call',
      data: { roundIndex: 0, index: 0, name: 'present' },
    });
    expect(currentMessage.content).toBe('');
    complete(adapter, 0, ['present_files', 'ask_user']);

    expect(phasesOf(projected)).toEqual([
      [0, 'process'],
      [0, 'answer'],
    ]);
    expect(currentMessage.rounds[0].phase).toBeUndefined();
    expect(currentMessage.content).toBe('分析完成，结论如下。');
  });

  it('treats a malformed tool call as process and a hosted-only round as answer', () => {
    const { adapter, projected, currentMessage } = createAdapter();
    startRound(adapter, 0);
    text(adapter, 0, '我去查一下。');
    complete(adapter, 0, [], true);
    expect(currentMessage.rounds[0].phase).toBe('process');

    const hosted = createAdapter();
    startRound(hosted.adapter, 0);
    text(hosted.adapter, 0, '根据搜索结果，答案是 42。');
    complete(hosted.adapter, 0, []);
    expect(hosted.currentMessage.rounds[0].phase).toBeUndefined();
    expect(hosted.currentMessage.content).toBe('根据搜索结果，答案是 42。');
    expect(phasesOf(projected)).toEqual([[0, 'process']]);
    expect(phasesOf(hosted.projected)).toEqual([]);
  });
});
