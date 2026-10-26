import { ContextCheckpointCoordinator } from '@/modules/agent/context/context-checkpoint-coordinator';
import { AgentLoopService } from '@/modules/agent/core/agent-loop.service';
import { createAssistantTurnMessage } from '@/modules/agent/core/agent-turn-outcome';
import { ModelGatewayMediaPreparerService } from '@/modules/modelGateway/model-gateway-media-preparer.service';
import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import { ModelGatewayService } from '@/modules/modelGateway/model-gateway.service';
import { ModelStreamRegistry } from '@/modules/modelGateway/model-stream';
import { AnthropicMessagesAdapter } from './anthropic-messages.adapter';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/**
 * 跨层链路：运行时 → 平台适配器（生产的上下文检查点投影、两次历史归一化）→ 网关（归一化、媒体准备）
 * → Anthropic 适配器（回放规划）→ fetch。替换的只有网络、工具执行、检查点存储与整理用的模型调用
 * （上下文很小，不会触发整理）；「附件这次没能读取」由包在真实媒体准备外层的一步模拟。
 */

const MODEL = 'claude-opus-5';

type Reply = { thinking?: string; signature?: string; toolId?: string; text?: string };

function replyEvents(reply: Reply): any[] {
  const events: any[] = [
    { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } },
  ];
  let index = 0;
  if (reply.signature !== undefined) {
    events.push(
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      },
      {
        type: 'content_block_delta',
        index,
        delta: { type: 'thinking_delta', thinking: reply.thinking ?? 'plan' },
      },
      {
        type: 'content_block_delta',
        index,
        delta: { type: 'signature_delta', signature: reply.signature },
      },
      { type: 'content_block_stop', index },
    );
    index += 1;
  }
  if (reply.text) {
    events.push(
      { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index, delta: { type: 'text_delta', text: reply.text } },
      { type: 'content_block_stop', index },
    );
    index += 1;
  }
  if (reply.toolId) {
    events.push(
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: reply.toolId, name: 'search_tool', input: {} },
      },
      {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: `{"query":"${reply.toolId}"}` },
      },
      { type: 'content_block_stop', index },
    );
  }
  events.push(
    {
      type: 'message_delta',
      delta: { stop_reason: reply.toolId ? 'tool_use' : 'end_turn' },
      usage: { output_tokens: 3 },
    },
    { type: 'message_stop' },
  );
  return events;
}

const sse = (events: any[]) =>
  events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');

type Step = { reply?: Reply; status?: number };

/** 按顺序返回每次请求的响应，记录发出的请求体 */
function installFetch(steps: Step[]) {
  const bodies: any[] = [];
  const previous = (global as any).fetch;
  (global as any).fetch = jest.fn(async (_url: string, init: any) => {
    bodies.push(JSON.parse(init.body));
    const step = steps[bodies.length - 1];
    if (!step) throw new Error('unexpected provider request');
    if (step.status) return new Response('PRIVATE_PROVIDER_DETAIL', { status: step.status });
    return new Response(sse(replyEvents(step.reply!)), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  });
  return { bodies, restore: () => ((global as any).fetch = previous) };
}

/** 一次请求体里回放的全部签名（按出现顺序） */
const signatures = (body: any): string[] =>
  body.messages.flatMap((message: any) =>
    message.content
      .filter((block: any) => block.type === 'thinking')
      .map((block: any) => block.signature),
  );

async function runAgent(options: { prepare?: (request: any, call: number) => any } = {}) {
  const registry = new ModelStreamRegistry();
  new AnthropicMessagesAdapter(new ModelGatewayUrlBuilder(registry), registry);
  let call = 0;
  // 纯文本消息不经过文件服务，两个依赖不会被调用
  const realMedia = new ModelGatewayMediaPreparerService({} as any, {} as any);
  const gateway = new ModelGatewayService(registry, new ModelGatewayUrlBuilder(registry), {
    prepare: jest.fn(async (request: any) => {
      const prepared = await realMedia.prepare(request);
      call += 1;
      return options.prepare ? options.prepare(prepared, call) : prepared;
    }),
  } as any);
  const checkpoints = new ContextCheckpointCoordinator(
    { completeOnce: jest.fn().mockRejectedValue(new Error('compaction not expected')) } as any,
    {
      loadValid: jest.fn().mockResolvedValue(null),
      replace: jest.fn().mockResolvedValue({}),
      invalidateGroup: jest.fn().mockResolvedValue(1),
      invalidateAtRevision: jest.fn().mockResolvedValue(1),
    } as any,
  );
  const toolProviderRegistry = {
    prepareTurn: jest.fn().mockResolvedValue(undefined),
    finishTurn: jest.fn().mockResolvedValue(undefined),
    collectSystemPromptSections: jest.fn().mockResolvedValue([]),
    getToolCost: jest.fn().mockResolvedValue(0),
    getAllToolDefinitions: jest.fn(async () => [
      {
        type: 'function',
        function: {
          name: 'search_tool',
          description: '搜索固定资料',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      },
    ]),
    getToolProviderInfo: jest.fn(() => ({ metadata: { category: 'search', runtime: 'http_api' } })),
    getDisplayName: jest.fn(() => '搜索能力'),
    execute: jest.fn(async (_name: string, args: any, context: any) => ({
      type: 'tool',
      name: '搜索能力',
      displayName: '搜索能力',
      status: 'success',
      toolResult: { status: 'success', modelContent: `结果:${args?.query}` },
      id: context.toolCallId,
    })),
  };
  // 记下生产检查点投影实际处理了几轮（确认每一轮都经过它）
  let projections = 0;
  const createSession = checkpoints.createSession.bind(checkpoints);
  jest.spyOn(checkpoints, 'createSession').mockImplementation((sessionInput: any) => {
    const session = createSession(sessionInput);
    const prepareForModel = session.prepareForModel.bind(session);
    session.prepareForModel = (async (...args: Parameters<typeof prepareForModel>) => {
      projections += 1;
      return prepareForModel(...args);
    }) as typeof session.prepareForModel;
    return session;
  });
  const loop = new AgentLoopService(
    { getConfigs: jest.fn().mockResolvedValue({ maxToolCallsPerRequest: 8 }) } as any,
    toolProviderRegistry as any,
    undefined,
    gateway,
    checkpoints,
  );
  const turnStartedAt = new Date().toISOString();
  const currentMessage = createAssistantTurnMessage({
    model: MODEL,
    turnId: 'turn_fd',
    turnStartedAt,
  });
  const progress: any[] = [];
  const result = await loop.execute(
    [
      { role: 'system', content: 'Fixed system prompt.' },
      { role: 'user', content: 'question' },
    ],
    {
      chatId: 'cid_fd',
      messageId: 'cid_fd',
      turnId: 'turn_fd',
      turnStartedAt,
      model: MODEL,
      modelConfig: {
        protocol: 'anthropic_messages',
        apiKey: 'sk-ant-test',
        baseUrl: 'https://provider.invalid',
        model: MODEL,
        capabilities: { streaming: true, toolCalling: true },
      } as any,
      reasoningEffort: 'high',
      abortController: new AbortController(),
      fileRefMapping: { entries: [], counters: {} } as any,
      currentMessage,
      tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, details: [] },
      onProgress: (event: any) => progress.push(event),
    },
  );
  return { result, progress, projections };
}

describe('Anthropic replay state across the runtime, platform and gateway', () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it('replays thinking blocks through the real chain on every following tool round', async () => {
    const fetchMock = installFetch([
      { reply: { signature: 'SIG_A', toolId: 't1' } },
      { reply: { signature: 'SIG_B', toolId: 't2' } },
      { reply: { text: 'final answer' } },
    ]);
    restore = fetchMock.restore;
    const { projections } = await runAgent();
    expect(fetchMock.bodies.map(signatures)).toEqual([[], ['SIG_A'], ['SIG_A', 'SIG_B']]);
    expect(projections).toBe(3);
  });

  it('keeps an unreplayable record through all normalizations so an excluded state never comes back', async () => {
    const fetchMock = installFetch([
      // A 在前缀 P0 下生成
      { reply: { signature: 'SIG_A', toolId: 't1' } },
      // 媒体占位让前缀变成 P1：A 不回放；B 的签名为空，只留谱系记录（谱系为空，排除 A）
      { reply: { signature: '', toolId: 't2' } },
      // 前缀恢复为 P0：A 的摘要又对上了，但已被 B 的记录排除
      { reply: { text: 'final answer' } },
    ]);
    restore = fetchMock.restore;
    const { projections } = await runAgent({
      prepare: (request, call) =>
        call === 2
          ? {
              ...request,
              messages: request.messages.map((message: any) =>
                message.role === 'user' && message.content === 'question'
                  ? { ...message, content: 'question [media unavailable]' }
                  : message,
              ),
            }
          : request,
    });
    expect(fetchMock.bodies.map(signatures)).toEqual([[], [], []]);
    expect(projections).toBe(3);
  });

  it('retries once without replay state after a rejection and never brings the old state back', async () => {
    const fetchMock = installFetch([
      { reply: { signature: 'SIG_A', toolId: 't1' } },
      // 带着 A 的思考块被拒（尚未开始返回）
      { status: 400 },
      // 运行时去掉全部回放状态后重发同一轮
      { reply: { signature: 'SIG_B', toolId: 't2' } },
      { reply: { signature: 'SIG_C', toolId: 't3' } },
      { reply: { text: 'final answer' } },
    ]);
    restore = fetchMock.restore;
    const { progress, result, projections } = await runAgent();
    expect(fetchMock.bodies.map(signatures)).toEqual([
      [],
      ['SIG_A'],
      [],
      ['SIG_B'],
      ['SIG_B', 'SIG_C'],
    ]);
    expect(
      progress.some(
        event => event.type === 'progress' && event.data?.code === 'provider_state_retry',
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PROVIDER_DETAIL');
    // 重发属于同一轮：4 轮、5 次请求
    expect(projections).toBe(4);
  });

  it('does not retry a rejection when the request carried no thinking blocks', async () => {
    const fetchMock = installFetch([{ reply: { toolId: 't1' } }, { status: 400 }]);
    restore = fetchMock.restore;
    const { progress } = await runAgent();
    expect(fetchMock.bodies).toHaveLength(2);
    expect(
      progress.some(
        event => event.type === 'progress' && event.data?.code === 'provider_state_retry',
      ),
    ).toBe(false);
  });
});
