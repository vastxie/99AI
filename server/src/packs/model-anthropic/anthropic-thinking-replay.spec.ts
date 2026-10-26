import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import {
  classifyProviderError,
  MODEL_PROVIDER_STATE_REJECTED,
  ModelStreamRegistry,
} from '@/modules/modelGateway/model-stream';
import { collectModelStream } from '@/modules/modelGateway/model-stream/model-stream.collector';
import { AnthropicMessagesAdapter } from './anthropic-messages.adapter';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/** 思考块回放：流里捕获记录、组装请求时按记录回放、带思考块的请求被拒时给出专用错误码、手动思考的续接降级 */

const createAdapter = () => {
  const registry = new ModelStreamRegistry();
  return new AnthropicMessagesAdapter(new ModelGatewayUrlBuilder(registry), registry);
};

function mockSseResponse(events: any[]) {
  const frames = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  return {
    ok: true,
    body: (async function* () {
      yield Buffer.from(frames.join(''));
    })(),
  };
}

type Reply = {
  thinking?: string;
  signature?: string;
  redacted?: string;
  text?: string;
  toolId?: string;
  input?: string;
};

/** 一次回复的 SSE 事件：思考（或 redacted）→ 正文 → 工具调用 */
function replyEvents(reply: Reply): any[] {
  const events: any[] = [
    { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } },
  ];
  let index = 0;
  if (reply.redacted !== undefined) {
    events.push(
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'redacted_thinking', data: reply.redacted },
      },
      { type: 'content_block_stop', index },
    );
    index += 1;
  }
  if (reply.signature !== undefined) {
    events.push({
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    });
    events.push({
      type: 'content_block_delta',
      index,
      delta: { type: 'thinking_delta', thinking: reply.thinking ?? '' },
    });
    events.push({
      type: 'content_block_delta',
      index,
      delta: { type: 'signature_delta', signature: reply.signature },
    });
    events.push({ type: 'content_block_stop', index });
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
        content_block: { type: 'tool_use', id: reply.toolId, name: 'search', input: {} },
      },
      {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: reply.input ?? '{"q":"x"}' },
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

const config = (model: string, reasoningEffort?: string) => ({
  protocol: 'anthropic_messages',
  model,
  apiKey: 'sk-ant-test',
  baseUrl: 'https://api.anthropic.com',
  ...(reasoningEffort ? { reasoningEffort } : {}),
});

const TOOLS = [{ type: 'function', function: { name: 'search', parameters: {} } }];

/** 平台历史里的一轮：带工具调用的助手消息（可带记录）+ 工具结果 */
const round = (toolId: string, state?: unknown, text = '') => [
  {
    role: 'assistant',
    content: text || null,
    tool_calls: [
      { id: toolId, type: 'function', function: { name: 'search', arguments: '{"q":"x"}' } },
    ],
    ...(state === undefined ? {} : { provider_state: state }),
  },
  { role: 'tool', tool_call_id: toolId, content: `result:${toolId}` },
];

/** 跑一次流式请求：返回发出的请求体、产出的事件与这次回复的记录 */
async function run(adapter: AnthropicMessagesAdapter, request: any, reply: Reply) {
  let sent: any;
  (adapter as any).post = jest.fn((_request: any, _stream: boolean, body: any) => {
    sent = body;
    return Promise.resolve(mockSseResponse(replyEvents(reply)));
  });
  const events: any[] = [];
  for await (const event of adapter.stream(request)) events.push(event);
  const state = events.find(event => event.type === 'provider_state')?.state;
  return { sent, events, state };
}

const baseMessages = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'question' },
];

const request = (model: string, messages: any[], reasoningEffort?: string): any => ({
  config: config(model, reasoningEffort),
  messages,
  tools: TOOLS,
  toolChoice: 'auto',
  stream: true,
  purpose: 'agent_loop',
});

const thinkingBlocks = (body: any) =>
  body.messages.flatMap((message: any) =>
    message.content.filter(
      (block: any) => block.type === 'thinking' || block.type === 'redacted_thinking',
    ),
  );

describe('Anthropic thinking block replay', () => {
  it('captures the reply as a private record right before done, without leaking the signature', async () => {
    const adapter = createAdapter();
    const { events, state } = await run(adapter, request('claude-opus-5', baseMessages, 'high'), {
      thinking: 'plan',
      signature: 'SIG_A',
      toolId: 't1',
    });
    const types = events.map(event => event.type);
    expect(types.slice(-2)).toEqual(['provider_state', 'done']);
    expect(state).toMatchObject({
      protocol: 'anthropic_messages',
      model: 'claude-opus-5',
      lineage: [],
      replayable: true,
      blocks: [
        { type: 'thinking', thinking: 'plan', signature: 'SIG_A' },
        { type: 'tool_use', id: 't1', name: 'search', input: '{"q":"x"}' },
      ],
    });
    // 签名只在记录里：公开的推理过程与其他事件都没有
    const publicEvents = events.filter(event => event.type !== 'provider_state');
    expect(JSON.stringify(publicEvents)).not.toContain('SIG_A');
    expect(publicEvents).toContainEqual({ type: 'reasoning_delta', delta: 'plan' });
  });

  it('keeps the record out of results collected outside the agent runtime', async () => {
    const adapter = createAdapter();
    (adapter as any).post = jest.fn(() =>
      Promise.resolve(
        mockSseResponse(replyEvents({ thinking: 'a', signature: 'SIG_COLLECT', text: 'answer' })),
      ),
    );
    const collected = await collectModelStream(
      adapter.stream(request('claude-opus-5', baseMessages, 'high')),
    );
    expect(collected).toMatchObject({ content: 'answer', done: true });
    expect(JSON.stringify(collected)).not.toContain('SIG_COLLECT');
  });

  it('replays the thinking blocks in order on the following tool rounds', async () => {
    const adapter = createAdapter();
    const model = 'claude-opus-5';
    const first = await run(adapter, request(model, baseMessages, 'high'), {
      thinking: 'a',
      signature: 'SIG_A',
      toolId: 't1',
    });
    const history2 = [...baseMessages, ...round('t1', first.state)];
    const second = await run(adapter, request(model, history2, 'high'), {
      thinking: 'b',
      signature: 'SIG_B',
      text: 'checking',
      toolId: 't2',
    });
    expect(second.sent.messages[1].content).toEqual([
      { type: 'thinking', thinking: 'a', signature: 'SIG_A' },
      { type: 'tool_use', id: 't1', name: 'search', input: { q: 'x' } },
    ]);
    expect(second.state.lineage).toEqual([first.state.id]);

    const history3 = [...history2, ...round('t2', second.state, 'checking')];
    const third = await run(adapter, request(model, history3, 'high'), {
      signature: 'SIG_C',
      toolId: 't3',
    });
    expect(thinkingBlocks(third.sent).map((block: any) => block.signature)).toEqual([
      'SIG_A',
      'SIG_B',
    ]);
    // 正文与工具调用保持原来的交错顺序
    expect(third.sent.messages[3].content.map((block: any) => block.type)).toEqual([
      'thinking',
      'text',
      'tool_use',
    ]);
    expect(third.state.lineage.sort()).toEqual([first.state.id, second.state.id].sort());
  });

  it('replays parallel tool calls and interleaved thinking in the original block order', async () => {
    const adapter = createAdapter();
    const model = 'claude-opus-5';
    // 一条回复里：思考 → 工具 1 → 进度思考（正文为空）→ 工具 2
    const thinking = (index: number, signature: string, text = '') => [
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      },
      { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: text } },
      { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } },
      { type: 'content_block_stop', index },
    ];
    const toolUse = (index: number, id: string, input: string) => [
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id, name: 'search', input: {} },
      },
      {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: input },
      },
      { type: 'content_block_stop', index },
    ];
    (adapter as any).post = jest.fn(() =>
      Promise.resolve(
        mockSseResponse([
          { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } },
          ...thinking(0, 'SIG_1', 'plan'),
          ...toolUse(1, 't1', '{"q":"a"}'),
          ...thinking(2, 'SIG_2'),
          ...toolUse(3, 't2', '{"q":"b"}'),
          {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use' },
            usage: { output_tokens: 3 },
          },
          { type: 'message_stop' },
        ]),
      ),
    );
    let state: any;
    for await (const event of adapter.stream(request(model, baseMessages, 'high'))) {
      if (event.type === 'provider_state') state = event.state;
    }
    const history = [
      ...baseMessages,
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 't1', type: 'function', function: { name: 'search', arguments: '{"q":"a"}' } },
          { id: 't2', type: 'function', function: { name: 'search', arguments: '{"q":"b"}' } },
        ],
        provider_state: state,
      },
      { role: 'tool', tool_call_id: 't1', content: 'result:t1' },
      { role: 'tool', tool_call_id: 't2', content: 'result:t2' },
    ];
    const body = adapter.buildRequestBody(request(model, history, 'high'), true);
    expect(
      body.messages[1].content.map((block: any) => [block.type, block.signature ?? block.id]),
    ).toEqual([
      ['thinking', 'SIG_1'],
      ['tool_use', 't1'],
      ['thinking', 'SIG_2'],
      ['tool_use', 't2'],
    ]);
    // 两个工具结果合并在同一条用户消息里
    expect(body.messages[2].content.map((block: any) => block.tool_use_id)).toEqual(['t1', 't2']);
  });

  it('does not replay a record for another model or a message that changed', async () => {
    const adapter = createAdapter();
    const first = await run(adapter, request('claude-opus-5', baseMessages, 'high'), {
      thinking: 'a',
      signature: 'SIG_A',
      toolId: 't1',
    });
    const other = adapter.buildRequestBody(
      request('claude-sonnet-5', [...baseMessages, ...round('t1', first.state)], 'high'),
      true,
    );
    expect(thinkingBlocks(other)).toEqual([]);

    const changed: any[] = round('t1', first.state);
    changed[0].tool_calls[0].function.arguments = '{"q":"y"}';
    const body = adapter.buildRequestBody(
      request('claude-opus-5', [...baseMessages, ...changed], 'high'),
      true,
    );
    expect(thinkingBlocks(body)).toEqual([]);
  });

  it('marks a rejected request that carried thinking blocks so the runtime can retry without them', async () => {
    const adapter = createAdapter();
    const first = await run(adapter, request('claude-opus-5', baseMessages, 'high'), {
      thinking: 'a',
      signature: 'SIG_A',
      toolId: 't1',
    });
    const rejected = () => ({
      ok: false,
      status: 400,
      headers: { get: () => null },
      text: jest.fn().mockResolvedValue('PRIVATE_SIGNATURE_DETAIL'),
    });
    const consume = async (messages: any[]) => {
      (adapter as any).post = jest.fn().mockResolvedValue(rejected());
      try {
        for await (const unused of adapter.stream(request('claude-opus-5', messages, 'high')))
          void unused;
      } catch (error) {
        return error;
      }
      return undefined;
    };

    const withState: any = await consume([...baseMessages, ...round('t1', first.state)]);
    expect(withState).toMatchObject({
      code: MODEL_PROVIDER_STATE_REJECTED,
      category: 'invalid_request',
      requestOutcome: 'rejected',
      retryable: false,
      status: 400,
    });
    expect(String(withState.message)).not.toContain('PRIVATE_SIGNATURE_DETAIL');
    // 网关与平台的安全化保留这个错误码
    expect(classifyProviderError(withState).code).toBe(MODEL_PROVIDER_STATE_REJECTED);

    // 没带思考块的 400 照旧
    const withoutState: any = await consume([...baseMessages, ...round('t1')]);
    expect(withoutState.code).not.toBe(MODEL_PROVIDER_STATE_REJECTED);
    expect(withoutState).toMatchObject({ category: 'invalid_request', requestOutcome: 'rejected' });

    // 带着思考块、但不是 400 的拒绝照常分类（限流与暂时故障仍走供应商重试）
    for (const [status, category] of [
      [429, 'rate_limit'],
      [500, 'transient'],
    ] as const) {
      (adapter as any).post = jest.fn().mockResolvedValue({ ...rejected(), status });
      let thrown: any;
      try {
        for await (const unused of adapter.stream(
          request('claude-opus-5', [...baseMessages, ...round('t1', first.state)], 'high'),
        ))
          void unused;
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ category, requestOutcome: 'rejected', retryable: true });
      expect(thrown.code).not.toBe(MODEL_PROVIDER_STATE_REJECTED);
    }

    // 回放的记录里没有思考块（没开思考的回复）时也照旧
    const plain = await run(adapter, request('claude-opus-5', baseMessages, 'high'), {
      toolId: 't1',
    });
    expect(plain.state.replayable).toBe(true);
    const plainRejected: any = await consume([...baseMessages, ...round('t1', plain.state)]);
    expect(plainRejected.code).not.toBe(MODEL_PROVIDER_STATE_REJECTED);
  });

  describe('manual thinking on a tool continuation', () => {
    const model = 'claude-sonnet-4-5';

    it('turns thinking off when the last assistant message does not start with a thinking block', () => {
      const adapter = createAdapter();
      const body = adapter.buildRequestBody(
        request(model, [...baseMessages, ...round('t1')], 'medium'),
        true,
      );
      expect(body.thinking).toEqual({ type: 'disabled' });
      expect(body.max_tokens).toBe(4096);
    });

    it('keeps the configured level on a new user message, even after an earlier downgrade', () => {
      const adapter = createAdapter();
      const fresh = adapter.buildRequestBody(request(model, baseMessages, 'medium') as any, true);
      expect(fresh.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
      const nextRun = adapter.buildRequestBody(
        request(
          model,
          [...baseMessages, ...round('t1'), { role: 'user', content: 'next question' }],
          'medium',
        ),
        true,
      );
      expect(nextRun.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
    });

    it('keeps thinking on when the replayed message starts with a thinking or redacted block', async () => {
      const adapter = createAdapter();
      for (const reply of [
        { thinking: 'a', signature: 'SIG_A', toolId: 't1' },
        { redacted: 'OPAQUE', toolId: 't1' },
      ] as Reply[]) {
        const first = await run(adapter, request(model, baseMessages, 'medium'), reply);
        const body = adapter.buildRequestBody(
          request(model, [...baseMessages, ...round('t1', first.state)], 'medium') as any,
          true,
        );
        expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
        expect(body.messages[1].content[0].type).toBe(
          reply.redacted ? 'redacted_thinking' : 'thinking',
        );
      }
    });

    it('stays off for the rest of the run after a reply without thinking', async () => {
      const adapter = createAdapter();
      // 去状态重发后（关思考）得到没有思考块的工具回复 B
      const history = [...baseMessages, ...round('t1')];
      const b = await run(adapter, request(model, history, 'medium'), { toolId: 't2' });
      expect(b.sent.thinking).toEqual({ type: 'disabled' });
      const history2 = [...history, ...round('t2', b.state)];
      const c = await run(adapter, request(model, history2, 'medium'), { toolId: 't3' });
      expect(c.sent.thinking).toEqual({ type: 'disabled' });
      const history3 = [...history2, ...round('t3', c.state)];
      const d = await run(adapter, request(model, history3, 'medium'), { text: 'done' });
      expect(d.sent.thinking).toEqual({ type: 'disabled' });
    });
  });

  it('keeps between_tools on Sonnet 5.5 and replays progress blocks with empty bodies', async () => {
    const adapter = createAdapter();
    const model = 'claude-sonnet-5-5';
    const first = await run(adapter, request(model, baseMessages, 'off'), {
      signature: 'SIG_PROGRESS',
      toolId: 't1',
    });
    expect(first.sent.thinking).toEqual({ type: 'between_tools' });
    expect(first.state.blocks[0]).toEqual({
      type: 'thinking',
      thinking: '',
      signature: 'SIG_PROGRESS',
    });
    const body = adapter.buildRequestBody(
      request(model, [...baseMessages, ...round('t1', first.state)], 'off'),
      true,
    );
    expect(body.thinking).toEqual({ type: 'between_tools' });
    expect(body.messages[1].content[0]).toEqual({
      type: 'thinking',
      thinking: '',
      signature: 'SIG_PROGRESS',
    });
    // 前缀变了：不回放，thinking 仍是 between_tools
    const changed = adapter.buildRequestBody(
      request(
        model,
        [
          { role: 'system', content: 'Another system prompt.' },
          { role: 'user', content: 'question' },
          ...round('t1', first.state),
        ],
        'off',
      ),
      true,
    );
    expect(thinkingBlocks(changed)).toEqual([]);
    expect(changed.thinking).toEqual({ type: 'between_tools' });
  });
});
