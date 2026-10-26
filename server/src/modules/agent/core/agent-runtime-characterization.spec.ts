import { readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  createAssistantTurnMessage,
  summarizeAgentLoopResult,
  toPersistedAssistantMessage,
} from './agent-turn-outcome';
import { createAgentLoopEventProjector } from '../events/agent-loop-event-projector';
import { WorkflowProcessManager } from '../../chat/workflowManager.service';
import { AgentLoopService } from './agent-loop.service';

declare const afterAll: any;
declare const beforeAll: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const FIXED_NOW = Date.parse('2026-08-30T05:30:00.000Z');
const EXPECTED_PATH = `${__dirname}/fixtures/agent-runtime-characterization.expected.json`;

type ScenarioOptions = {
  name: string;
  model?: string;
  maxRounds?: number;
  providerScripts?: any[][];
  providerStreamFactory?: (input: any, callIndex: number) => AsyncIterable<any>;
  deferredTools?: boolean;
  alreadyAborted?: boolean;
  handoff?: boolean;
  drive?: (state: { streamCalls: () => number }) => Promise<void>;
  /** 运行结束后查看内存里的助手消息（不进比对产物） */
  inspect?: (state: { currentMessage: any }) => void;
  /** 每次执行工具时查看交给工具的上下文（不进比对产物） */
  onToolExecute?: (context: any) => void;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map(key => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value: any): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function eventStream(events: any[]): AsyncIterable<any> {
  return (async function* () {
    for (const event of events) yield cloneJson(event);
  })();
}

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error(`characterization wait timed out: ${label}`);
}

function makeToolResult(toolName: string, args: any, toolCallId: string): any {
  const label = toolName === 'second_tool' ? '第二能力' : '搜索能力';
  return {
    type: 'tool',
    name: label,
    displayName: label,
    status: 'success',
    output: {
      summary: `${label}完成:${String(args?.query || args?.value || '')}`,
      details: [{ title: `${label}证据`, snippet: '固定可观察结果' }],
    },
    model: {
      content: `${label}模型结果`,
      output: { kind: 'search' },
    },
    display: {
      summary: `${label}公开结果`,
      kind: 'search',
    },
    toolResult: {
      status: 'success',
      modelContent: `${label}模型结果`,
      display: { summary: `${label}公开结果` },
      trace: {
        code: 'TOOL_COMPLETED',
        message: `${label}执行完成`,
        retryable: false,
      },
    },
    time: FIXED_NOW,
    duration: 0,
    id: toolCallId,
  };
}

async function runScenario(options: ScenarioOptions, ordinal: number): Promise<any> {
  jest.setSystemTime(FIXED_NOW);
  const chatId = 7300 + ordinal;
  const publicCid = `cid_p3_${options.name}`;
  const turnId = `turn_p3_${options.name}`;
  const controller = new AbortController();
  if (options.alreadyAborted) controller.abort(new Error('fixed_user_abort'));

  const workflowManager = new WorkflowProcessManager();
  const workflowFence = workflowManager.register(
    chatId,
    controller,
    77,
    publicCid,
    turnId,
    {
      id: turnId,
      status: 'running',
      startedAt: new Date(FIXED_NOW).toISOString(),
    },
    `g_p3_${options.name}`,
  );

  const providerScripts = options.providerScripts || [];
  const providerMessageSnapshots: any[] = [];
  let streamCallCount = 0;
  let finalToolContext: any;
  const registryExecutions: any[] = [];
  const resolutionOrder: string[] = [];
  const pendingResolutions = new Map<string, () => void>();

  const modelGatewayService = {
    stream: jest.fn((input: any) => {
      providerMessageSnapshots.push(cloneJson(input.messages));
      const callIndex = streamCallCount;
      streamCallCount += 1;
      if (options.providerStreamFactory) {
        return options.providerStreamFactory(input, callIndex);
      }
      return eventStream(providerScripts[callIndex] || []);
    }),
    completeOnce: jest.fn(async () => ({
      content: JSON.stringify({
        usePlan: true,
        steps: ['检索第一项', '核对第二项', '形成答复'],
      }),
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      raw: {},
    })),
  };

  const toolProviderRegistry = {
    prepareTurn: jest.fn().mockResolvedValue(undefined),
    finishTurn: jest.fn().mockResolvedValue(undefined),
    collectSystemPromptSections: jest.fn().mockResolvedValue([]),
    getToolCost: jest.fn().mockResolvedValue(2),
    getAllToolDefinitions: jest.fn(async (context: any) => {
      finalToolContext = context;
      return [
        {
          type: 'function',
          function: {
            name: 'search_tool',
            description: '搜索固定资料',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string' } },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'second_tool',
            description: '核对第二项',
            parameters: {
              type: 'object',
              properties: { value: { type: 'string' } },
            },
          },
        },
      ];
    }),
    getToolProviderInfo: jest.fn((toolName: string) => ({
      metadata: { category: 'search', runtime: 'http_api', toolName },
    })),
    getDisplayName: jest.fn((toolName: string) =>
      toolName === 'second_tool' ? '第二能力' : '搜索能力',
    ),
    execute: jest.fn((toolName: string, args: any, context: any) => {
      options.onToolExecute?.(context);
      registryExecutions.push({
        args: cloneJson(args),
        toolCallId: context.toolCallId,
        toolName,
      });
      const result = makeToolResult(toolName, args, context.toolCallId);
      if (!options.deferredTools) return Promise.resolve(result);
      return new Promise(resolve => {
        pendingResolutions.set(toolName, () => {
          resolutionOrder.push(toolName);
          resolve(result);
        });
      });
    }),
  };

  const loopService = new AgentLoopService(
    {
      getConfigs: jest.fn().mockResolvedValue({
        maxToolCallsPerRequest: options.maxRounds ?? 4,
        // 快照里的超时场景按 30 秒推进：显式配置，不随站点默认值变化
        modelFirstResponseTimeoutSec: 30,
      }),
    } as any,
    toolProviderRegistry as any,
    {} as any,
    modelGatewayService as any,
  );
  // 与 ChatTurnRun.runAgent 相同的组合：骨架消息 → 投影回调 → 循环 → 结果摘要 → 落库消息
  const model = options.model || 'gpt-test';
  const currentMessage = createAssistantTurnMessage({
    model,
    turnId,
    turnStartedAt: new Date(FIXED_NOW).toISOString(),
  });
  const publicEvents: any[] = [];
  let persistedMessage = '';

  const runPromise = (async () => {
    const loopResult = await loopService.execute(
      [
        { role: 'system', content: 'P3 characterization fixed system.' },
        { role: 'user', content: `fixed request:${options.name}` },
      ],
      {
        chatId: publicCid,
        messageId: publicCid,
        turnId,
        turnStartedAt: new Date(FIXED_NOW).toISOString(),
        model,
        modelConfig: {
          protocol: 'openai_chat_completions',
          apiKey: 'characterization-key-not-serialized',
          baseUrl: 'https://provider.invalid/v1',
          model,
          capabilities: { streaming: true, toolCalling: true },
        },
        additionalParams: options.model?.includes('deepseek')
          ? { thinking: { type: 'enabled' } }
          : { thinking: { type: 'disabled' } },
        abortController: controller,
        fileRefMapping: { entries: [], counters: {} } as any,
        shouldHandoffAfterToolRound: options.handoff ? () => true : undefined,
        currentMessage,
        tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, details: [] },
        onProgress: createAgentLoopEventProjector({
          currentMessage,
          chatId: publicCid,
          messageId: publicCid,
          onEvent: event => {
            const stamped = workflowManager.stampOutboundEvent(chatId, event, workflowFence);
            if (stamped) publicEvents.push(stamped);
          },
        }),
      },
    );
    const outcome = summarizeAgentLoopResult(loopResult, currentMessage);
    outcome.currentMessage = toPersistedAssistantMessage(outcome.currentMessage, {
      model,
      tokenUsage: outcome.tokenUsage,
    });
    persistedMessage = JSON.stringify(outcome.currentMessage);
    return outcome;
  })();

  if (options.deferredTools) {
    await waitUntil(() => pendingResolutions.has('search_tool'), `${options.name}:first tool`);
    expect(pendingResolutions.has('second_tool')).toBe(false);
    pendingResolutions.get('search_tool')!();
    await waitUntil(() => pendingResolutions.has('second_tool'), `${options.name}:second tool`);
    pendingResolutions.get('second_tool')!();
  }
  await options.drive?.({ streamCalls: () => streamCallCount });
  const result = await runPromise;
  options.inspect?.({ currentMessage });

  const artifact = {
    finalMessages: cloneJson(finalToolContext?.input?.messages || []),
    model,
    persistedMessage,
    providerEvents: cloneJson(providerScripts),
    providerMessageSnapshots,
    publicEvents,
    registryExecutions,
    resolutionOrder,
    result,
    streamCallCount,
    workflowSeq: workflowManager.getEventSeq(chatId),
  };
  const serialized = JSON.stringify(artifact);
  expect(serialized).not.toContain('characterization-key-not-serialized');
  expect(serialized).not.toContain('provider.invalid');
  expect(serialized).not.toContain(`scope_${options.name}`);
  return artifact;
}

describe('Agent runtime end-to-end contract', () => {
  let randomBytesSpy: any;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    randomBytesSpy = jest
      .spyOn(crypto as any, 'randomBytes')
      .mockImplementation((size: number) => Buffer.alloc(size, 7));
  });

  afterAll(() => {
    randomBytesSpy?.mockRestore();
    jest.useRealTimers();
  });

  it('verifies the turn-level projection to AgentLoop observable behavior', async () => {
    const textReasoning = await runScenario(
      {
        name: 'text_reasoning',
        providerScripts: [
          [
            { type: 'reasoning_delta', delta: '先核对。' },
            { type: 'text_delta', delta: '固定回答。' },
            {
              type: 'usage',
              usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
            },
            { type: 'done', finishReason: 'stop' },
          ],
        ],
      },
      1,
    );

    const toolHostedAndPlan = await runScenario(
      {
        name: 'tool_hosted_plan',
        model: 'deepseek-r1',
        deferredTools: true,
        providerScripts: [
          [
            { type: 'reasoning_delta', delta: '准备调用。' },
            { type: 'text_delta', delta: '先检索。' },
            {
              type: 'hosted_tool_call',
              toolCall: {
                id: 'hosted_1',
                name: 'openai_web_search',
                displayName: '原生网页搜索',
                type: 'hosted_tool',
                status: 'running',
                inputSummary: 'fixed hosted query',
              },
            },
            {
              type: 'tool_call_delta',
              index: 0,
              id: 'call_search_1',
              nameDelta: 'search_',
              argumentsDelta: '{"query":"al',
            },
            {
              type: 'tool_call_delta',
              index: 1,
              id: 'call_second_1',
              nameDelta: 'second_',
              argumentsDelta: '{"value":"be',
            },
            {
              type: 'tool_call_delta',
              index: 0,
              nameDelta: 'tool',
              argumentsDelta: 'pha"}',
            },
            {
              type: 'tool_call_delta',
              index: 1,
              nameDelta: 'tool',
              argumentsDelta: 'ta"}',
            },
            {
              type: 'hosted_tool_call',
              toolCall: {
                id: 'hosted_1',
                name: 'openai_web_search',
                displayName: '原生网页搜索',
                type: 'hosted_tool',
                status: 'success',
                output: { summary: '原生搜索固定结果' },
                display: { summary: '原生搜索固定结果' },
              },
            },
            {
              type: 'usage',
              usage: { inputTokens: 5, outputTokens: 4, totalTokens: 9 },
            },
            { type: 'done' },
          ],
          [
            { type: 'reasoning_delta', delta: '综合证据。' },
            { type: 'text_delta', delta: '工具后的最终回答。' },
            {
              type: 'usage',
              usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
            },
            { type: 'done' },
          ],
        ],
      },
      2,
    );

    const handoff = await runScenario(
      {
        name: 'handoff',
        handoff: true,
        providerScripts: [
          [
            {
              type: 'tool_call_delta',
              index: 0,
              id: 'call_handoff_1',
              nameDelta: 'search_tool',
              argumentsDelta: '{"query":"handoff"}',
            },
            { type: 'done' },
          ],
        ],
      },
      3,
    );

    const providerError = await runScenario(
      {
        name: 'provider_error',
        providerScripts: [
          [
            {
              type: 'error',
              error: { code: 'UPSTREAM_FAILED', message: 'fixed provider failure' },
            },
          ],
        ],
      },
      4,
    );

    const streamAbort = await runScenario(
      {
        name: 'stream_abort',
        providerScripts: [[{ type: 'abort', reason: 'fixed upstream abort' }]],
      },
      5,
    );

    const alreadyAborted = await runScenario(
      {
        name: 'already_aborted',
        alreadyAborted: true,
        providerScripts: [[{ type: 'text_delta', delta: 'must-not-surface' }]],
      },
      6,
    );

    const firstEventTimeout = await runScenario(
      {
        name: 'first_event_timeout',
        providerStreamFactory: input =>
          (async function* () {
            await new Promise<void>(resolve => {
              if (input.signal.aborted) resolve();
              else input.signal.addEventListener('abort', () => resolve(), { once: true });
            });
            yield { type: 'abort', reason: 'attempt timeout' };
          })(),
        drive: async state => {
          await waitUntil(() => state.streamCalls() === 1, 'timeout:only attempt');
          await jest.advanceTimersByTimeAsync(30_000);
        },
      },
      7,
    );

    const maxRounds = await runScenario(
      {
        name: 'max_rounds',
        maxRounds: 1,
        providerScripts: [
          [
            { type: 'reasoning_delta', delta: '第一轮思考。' },
            {
              type: 'tool_call_delta',
              index: 0,
              id: 'call_max_1',
              nameDelta: 'search_tool',
              argumentsDelta: '{"query":"one"}',
            },
            { type: 'done' },
          ],
          [
            { type: 'reasoning_delta', delta: '第二轮思考。' },
            {
              type: 'tool_call_delta',
              index: 0,
              id: 'call_max_2',
              nameDelta: 'search_tool',
              argumentsDelta: '{"query":"two"}',
            },
            { type: 'done' },
          ],
        ],
      },
      8,
    );

    // 输出达到上限：照常收尾但带 stopReason，宿主据此提示回复可能没写完
    const outputLimit = await runScenario(
      {
        name: 'output_limit',
        providerScripts: [
          [
            { type: 'text_delta', delta: '写到一半' },
            {
              type: 'usage',
              usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
            },
            { type: 'done', finishReason: 'length' },
          ],
        ],
      },
      9,
    );

    expect(outputLimit.result).toMatchObject({ finishReason: 'length', stopReason: 'length' });
    expect(toolHostedAndPlan.resolutionOrder).toEqual(['search_tool', 'second_tool']);
    expect(
      toolHostedAndPlan.publicEvents
        .filter((event: any) => event.type === 'tool.end')
        .map((event: any) => event.toolCallId),
    ).toEqual(['hosted_1', 'call_search_1', 'call_second_1']);
    expect(
      toolHostedAndPlan.finalMessages.find(
        (message: any) => message.role === 'assistant' && message.tool_calls?.length,
      )?.reasoning_content,
    ).toBe('准备调用。');
    expect(
      maxRounds.finalMessages.find(
        (message: any) => message.role === 'assistant' && message.tool_calls?.length,
      ),
    ).not.toHaveProperty('reasoning_content');
    expect(handoff.streamCallCount).toBe(1);
    expect(firstEventTimeout.streamCallCount).toBe(1);
    expect(alreadyAborted.publicEvents.some((event: any) => event.data?.delta)).toBe(false);

    const artifact = {
      contractVersion: 1,
      scenarios: {
        alreadyAborted,
        firstEventTimeout,
        handoff,
        maxRounds,
        outputLimit,
        providerError,
        streamAbort,
        textReasoning,
        toolHostedAndPlan,
      },
    };
    const serialized = canonicalJson(artifact);
    const outputPath = process.env.P3_CHARACTERIZATION_OUT;
    if (outputPath) writeFileSync(outputPath, serialized);

    if (process.env.P3_CHARACTERIZATION_RECORD === '1') return;
    expect(serialized).toBe(readFileSync(EXPECTED_PATH, 'utf8'));
  });

  it('fails a turn whose stream goes silent after partial output, keeping the tool cost and the text', async () => {
    const stalled = await runScenario(
      {
        name: 'stream_idle_timeout',
        providerStreamFactory: (input, callIndex) =>
          (async function* () {
            if (callIndex === 0) {
              // 第一轮：调用一次工具并正常结束
              yield {
                type: 'tool_call_delta',
                index: 0,
                id: 'call_search_1',
                nameDelta: 'search_tool',
                argumentsDelta: '{"query":"alpha"}',
              };
              yield { type: 'done', finishReason: 'tool_calls' };
              return;
            }
            // 第二轮：出一段正文后不再有任何事件
            yield { type: 'text_delta', delta: 'partial answer' };
            await new Promise<void>(resolve => {
              if (input.signal.aborted) resolve();
              else input.signal.addEventListener('abort', () => resolve(), { once: true });
            });
            yield { type: 'abort', reason: 'attempt timeout' };
          })(),
        drive: async state => {
          await waitUntil(() => state.streamCalls() === 2, 'idle:second round');
          // 首次响应上限（30 秒）随第一个事件取消，之后按十分钟的空闲上限计时
          await jest.advanceTimersByTimeAsync(599_000);
          expect(state.streamCalls()).toBe(2);
          await jest.advanceTimersByTimeAsync(1_000);
        },
      },
      11,
    );
    // 停住的那次请求没有被重发
    expect(stalled.streamCallCount).toBe(2);
    expect(stalled.registryExecutions).toHaveLength(1);
    expect(stalled.result).toMatchObject({
      finishReason: 'error',
      errMsg: '模型长时间没有输出，已中断，请重试',
      // 已经成功的工具调用照常计费（结算时走只结算工具费的路径）
      toolCost: 2,
    });
    // 已经输出的正文随失败的这一条保留
    expect(stalled.persistedMessage).toContain('partial answer');
    expect(stalled.publicEvents.some((event: any) => event.data?.delta === 'partial answer')).toBe(
      true,
    );
  });

  it('keeps provider replay state private while thinking text stays public', async () => {
    // 私有标记只在回放状态里；公开标记在思考正文里（F-c 既定的展示口径）
    const PRIVATE = 'PRIVATE_STATE_MARK';
    const PUBLIC = 'PUBLIC_THINKING_MARK';
    const logged: string[] = [];
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(level =>
      jest.spyOn(Logger, level).mockImplementation((...args: unknown[]) => {
        logged.push(JSON.stringify(args));
      }),
    );
    let memorySnapshot = '';
    const toolContexts: string[] = [];
    let leak: any;
    try {
      leak = await runScenario(
        {
          name: 'provider_state_leak',
          providerScripts: [
            [
              { type: 'reasoning_delta', delta: `${PUBLIC} 先检索。` },
              {
                type: 'tool_call_delta',
                index: 0,
                id: 'call_search_1',
                nameDelta: 'search_tool',
                argumentsDelta: '{"query":"alpha"}',
              },
              { type: 'usage', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
              {
                type: 'provider_state',
                state: {
                  signature: `${PRIVATE}_signature`,
                  blocks: [{ type: 'redacted_thinking', data: `${PRIVATE}_redacted` }],
                },
              },
              { type: 'done' },
            ],
            // 第二轮再调一次工具：这时运行历史里已有带状态的助手消息
            [
              {
                type: 'tool_call_delta',
                index: 0,
                id: 'call_search_2',
                nameDelta: 'search_tool',
                argumentsDelta: '{"query":"beta"}',
              },
              { type: 'usage', usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } },
              { type: 'provider_state', state: { signature: `${PRIVATE}_second` } },
              { type: 'done' },
            ],
            [
              { type: 'text_delta', delta: '工具后的最终回答。' },
              { type: 'usage', usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } },
              { type: 'provider_state', state: { signature: `${PRIVATE}_final` } },
              { type: 'done', finishReason: 'stop' },
            ],
          ],
          inspect: ({ currentMessage }) => {
            memorySnapshot = JSON.stringify(currentMessage);
          },
          onToolExecute: context => {
            toolContexts.push(JSON.stringify(context.input?.messages ?? null));
          },
        },
        10,
      );
    } finally {
      spies.forEach(spy => spy.mockRestore());
    }

    // 发给模型的下一次请求带着回放状态（供应商投影保留）
    expect(JSON.stringify(leak.providerMessageSnapshots[1])).toContain(`${PRIVATE}_signature`);
    expect(JSON.stringify(leak.providerMessageSnapshots[2])).toContain(`${PRIVATE}_second`);
    // 每次执行工具时交给工具的消息都没有（第二次执行时历史里已有带状态的助手消息）
    expect(toolContexts).toHaveLength(2);
    expect(toolContexts[1]).toContain('call_search_1');
    for (const snapshot of toolContexts) expect(snapshot).not.toContain(PRIVATE);
    // 其余出口一律没有：落库的助手消息与轮次、公开事件（含结束事件）、运行结果、内存快照与追踪、工具上下文、工具输入、日志
    for (const [exit, value] of [
      ['persisted', leak.persistedMessage],
      ['public events', JSON.stringify(leak.publicEvents)],
      ['result', JSON.stringify(leak.result)],
      ['memory snapshot', memorySnapshot],
      ['tool context', JSON.stringify(leak.finalMessages)],
      ['tool inputs', JSON.stringify(leak.registryExecutions)],
      ['logs', logged.join('\n')],
    ] as const) {
      expect([exit, String(value).includes(PRIVATE)]).toEqual([exit, false]);
    }
    expect(memorySnapshot).toContain('"trace"');
    // 公开的思考正文照常出现在推理过程里，且只在这些位置
    expect(leak.persistedMessage).toContain(PUBLIC);
    expect(leak.publicEvents.some((event: any) => JSON.stringify(event).includes(PUBLIC))).toBe(
      true,
    );
    expect(JSON.stringify(leak.providerMessageSnapshots)).not.toContain(PUBLIC);
    expect(JSON.stringify(leak.finalMessages)).not.toContain(PUBLIC);
  });
});
