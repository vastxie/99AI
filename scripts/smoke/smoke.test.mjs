// 冒烟工具自身的单元测试：断言必须能拦住回归，Socket.IO 客户端不能在异常时挂住连接。
// 运行：node --test scripts/smoke/*.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bashExitCode,
  checkModelRequests,
  checkPersistedAssistant,
  checkPositiveId,
  checkWebTurnEvents,
  PRIMITIVE_TOOLS,
  SmokeError,
} from './checks.mjs';
import {
  MOCK_SLOW_MARKER,
  MOCK_TABLE_MARKER,
  MOCK_TABLE_TEXT,
  SMOKE_ARTIFACT_NAME,
  SMOKE_FINAL_TEXT,
} from './constants.mjs';
import { decide } from './mock-scenarios.mjs';
import { MiniSocketIo } from './socketio-client.mjs';

const agentRequest = (overrides = {}) => ({
  index: 1,
  phase: 'tool_call',
  stream: true,
  tools: [...PRIMITIVE_TOOLS],
  lastToolResult: null,
  ...overrides,
});
const finalRequest = (overrides = {}) =>
  agentRequest({
    index: 2,
    phase: 'final',
    lastToolResult: '6.8.0\n[exit 0，12 ms]',
    ...overrides,
  });

describe('bashExitCode', () => {
  it('从 bash 输出摘要里读出退出码', () => {
    assert.equal(bashExitCode('ok\n[exit 0，12 ms]'), 0);
    assert.equal(bashExitCode('boom\n[exit 2，输出已截断，3 ms]'), 2);
    assert.equal(bashExitCode('no marker'), undefined);
    // 命令输出里伪造的摘要不能冒充真实退出码
    assert.equal(bashExitCode('[exit 0，fake stdout]\n[exit 1，5 ms]'), 1);
  });
});

describe('checkModelRequests', () => {
  it('合格的流式 Agent 请求通过', () => {
    const result = checkModelRequests([
      agentRequest(),
      finalRequest(),
      { index: 3, phase: 'plain', stream: true, tools: [] },
    ]);
    assert.deepEqual(result, { total: 3, agent: 2 });
  });

  it('bash 退出码非零时失败（即使产物已写出）', () => {
    assert.throws(
      () =>
        checkModelRequests([agentRequest(), finalRequest({ lastToolResult: 'x\n[exit 1，5 ms]' })]),
      SmokeError,
    );
  });

  it('工具结果里没有退出码摘要时失败', () => {
    assert.throws(
      () => checkModelRequests([agentRequest(), finalRequest({ lastToolResult: 'x' })]),
      SmokeError,
    );
  });

  it('Agent 请求退化为非流式时失败', () => {
    assert.throws(
      () => checkModelRequests([agentRequest({ stream: false }), finalRequest()]),
      SmokeError,
    );
    assert.throws(
      () => checkModelRequests([agentRequest(), finalRequest({ stream: false })]),
      SmokeError,
    );
  });

  it('缺少任一原语工具时失败', () => {
    const tools = PRIMITIVE_TOOLS.filter((name) => name !== 'edit');
    assert.throws(() => checkModelRequests([agentRequest({ tools }), finalRequest()]), SmokeError);
  });

  it('出现没有 bash 的 Agent 请求或没有工具结果时失败', () => {
    assert.throws(
      () => checkModelRequests([agentRequest(), finalRequest(), { index: 3, phase: 'no_bash' }]),
      SmokeError,
    );
    assert.throws(() => checkModelRequests([agentRequest()]), SmokeError);
  });

  it('要求 gVisor 内核时校验工具输出', () => {
    const gvisor = finalRequest({ lastToolResult: '4.19.0-gvisor\n[exit 0，9 ms]' });
    assert.doesNotThrow(() =>
      checkModelRequests([agentRequest(), gvisor], { expectKernel: 'gvisor' }),
    );
    assert.throws(
      () => checkModelRequests([agentRequest(), finalRequest()], { expectKernel: 'gvisor' }),
      SmokeError,
    );
  });

  it('要求代理例外时分别校验大小写两个变量，未要求时不检查', () => {
    const loopback = 'localhost,127.0.0.1,::1';
    const withEnv = (...lines) =>
      finalRequest({ lastToolResult: ['[exit 0，9 ms]', '4.19.0', ...lines].join('\n') });
    const expectNoProxy = { expectNoProxy: loopback };
    assert.doesNotThrow(() =>
      checkModelRequests(
        [agentRequest(), withEnv(`NO_PROXY=${loopback}`, `no_proxy=${loopback}`)],
        expectNoProxy,
      ),
    );
    for (const lines of [
      [`NO_PROXY=${loopback}`],
      [`no_proxy=${loopback}`],
      [`NO_PROXY=${loopback}`, 'no_proxy='],
      [`NO_PROXY=${loopback},extra`, `no_proxy=${loopback}`],
    ]) {
      assert.throws(
        () => checkModelRequests([agentRequest(), withEnv(...lines)], expectNoProxy),
        SmokeError,
      );
    }
    // 本机驱动不下发这两个变量：没有设置期望值时不检查
    assert.doesNotThrow(() =>
      checkModelRequests([agentRequest(), withEnv('NO_PROXY=', 'no_proxy=')]),
    );
  });
});

describe('checkPersistedAssistant', () => {
  const message = JSON.stringify({
    rounds: [{ toolCalls: [{ assets: [{ fileId: 'file_1' }] }] }],
  });
  const row = { role: 'assistant', cid: 'c_1', status: 3, content: SMOKE_FINAL_TEXT, message };

  it('完成、正文与产物都已落库时通过', () => {
    assert.doesNotThrow(() => checkPersistedAssistant([{ role: 'user' }, row], 'c_1', 'file_1'));
  });

  it('正文为空时失败', () => {
    assert.throws(
      () => checkPersistedAssistant([{ ...row, content: '' }], 'c_1', 'file_1'),
      SmokeError,
    );
  });

  it('状态未完成或产物缺失时失败', () => {
    assert.throws(
      () => checkPersistedAssistant([{ ...row, status: 2 }], 'c_1', 'file_1'),
      SmokeError,
    );
    assert.throws(() => checkPersistedAssistant([row], 'c_1', 'file_2'), SmokeError);
  });
});

describe('checkWebTurnEvents', () => {
  const events = [
    {
      chatId: 'c_1',
      type: 'tool.end',
      data: { status: 'success', assets: [{ displayName: SMOKE_ARTIFACT_NAME, fileId: 'file_1' }] },
    },
    { chatId: 'c_1', type: 'message.delta', data: { delta: SMOKE_FINAL_TEXT } },
    { chatId: 'c_1', type: 'agent.end', data: { turnStatus: 'completed' } },
  ];

  it('完整的一轮通过并返回产物 id', () => {
    assert.equal(checkWebTurnEvents(events, 'c_1').fileId, 'file_1');
  });

  it('以 agent.error 结束、工具失败或没有产物时失败', () => {
    const errorEnd = [...events.slice(0, 2), { chatId: 'c_1', type: 'agent.error', data: {} }];
    assert.throws(() => checkWebTurnEvents(errorEnd, 'c_1'), SmokeError);
    const toolFailed = [
      { ...events[0], data: { ...events[0].data, status: 'error' } },
      ...events.slice(1),
    ];
    assert.throws(() => checkWebTurnEvents(toolFailed, 'c_1'), SmokeError);
    const noAsset = [{ ...events[0], data: { status: 'success', assets: [] } }, ...events.slice(1)];
    assert.throws(() => checkWebTurnEvents(noAsset, 'c_1'), SmokeError);
  });
});

describe('checkPositiveId', () => {
  it('只接受正整数', () => {
    assert.equal(checkPositiveId(5, 'x'), 5);
    for (const value of [null, undefined, '', '5', 0, -1, 1.5]) {
      assert.throws(() => checkPositiveId(value, 'x'), SmokeError);
    }
  });
});

class FakeWebSocket {
  static last;
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closeCalls = 0;
    this.handlers = new Map();
    FakeWebSocket.last = this;
  }
  addEventListener(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(handler);
  }
  dispatch(type, event = {}) {
    for (const handler of this.handlers.get(type) || []) handler(event);
  }
  serverSend(data) {
    this.dispatch('message', { data });
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.closeCalls += 1;
    this.dispatch('close');
  }
}

async function connected() {
  const socket = new MiniSocketIo('http://127.0.0.1:9520', {
    path: '/api/socket.io',
    auth: { token: 't' },
    WebSocketImpl: FakeWebSocket,
  });
  const promise = socket.connect(1000);
  const ws = FakeWebSocket.last;
  ws.serverSend('0{"sid":"e1","pingInterval":25000,"pingTimeout":20000}');
  assert.equal(ws.sent[0], '40{"token":"t"}');
  ws.serverSend('40{"sid":"s1"}');
  await promise;
  return { socket, ws };
}

describe('MiniSocketIo', () => {
  it('按 Engine.IO v4 路径连接，握手、心跳与 ack 正确', async () => {
    const { socket, ws } = await connected();
    assert.equal(ws.url, 'ws://127.0.0.1:9520/api/socket.io/?EIO=4&transport=websocket');
    ws.serverSend('2');
    assert.equal(ws.sent.at(-1), '3');
    const ack = socket.emitWithAck('chat:start', [{ gid: 'g' }], 1000);
    assert.equal(ws.sent.at(-1), '421["chat:start",{"gid":"g"}]');
    ws.serverSend('431[{"ok":true}]');
    assert.deepEqual(await ack, [{ ok: true }]);
    const seen = [];
    socket.on('agent:event', (event) => seen.push(event.type));
    ws.serverSend('42["agent:event",{"type":"agent.end"}]');
    assert.deepEqual(seen, ['agent.end']);
    socket.close();
    assert.equal(ws.sent.at(-1), '41');
    assert.equal(ws.closeCalls, 1);
  });

  it('连接超时会关闭底层连接', async () => {
    const socket = new MiniSocketIo('http://127.0.0.1:9520', { WebSocketImpl: FakeWebSocket });
    await assert.rejects(socket.connect(20), /连接超时/);
    assert.equal(FakeWebSocket.last.closeCalls, 1);
    assert.equal(socket.transportClosed, true);
  });

  it('CONNECT 被拒会关闭底层连接', async () => {
    const socket = new MiniSocketIo('http://127.0.0.1:9520', { WebSocketImpl: FakeWebSocket });
    const promise = socket.connect(1000);
    const ws = FakeWebSocket.last;
    ws.serverSend('0{"sid":"e1"}');
    ws.serverSend('44{"message":"unauthorized"}');
    await assert.rejects(promise, /connect_error/);
    assert.equal(ws.closeCalls, 1);
  });

  it('命名空间断开会关闭底层连接并拒绝待决 ack', async () => {
    const { socket, ws } = await connected();
    const ack = socket.emitWithAck('chat:start', [{}], 1000);
    ws.serverSend('41');
    await assert.rejects(ack, /断开/);
    assert.equal(ws.closeCalls, 1);
    assert.equal(socket.transportClosed, true);
    await assert.rejects(socket.emitWithAck('chat:start', [{}], 1000), /未连接/);
  });
});

describe('模拟模型的剧本选择', () => {
  const tools = PRIMITIVE_TOOLS.map((name) => ({ type: 'function', function: { name } }));
  const user = (content) => ({ role: 'user', content });

  it('默认剧本：先调用一次 bash，拿到工具结果后给出最终回复', () => {
    assert.equal(decide({ tools, messages: [user('hi')] }).phase, 'tool_call');
    const done = decide({ tools, messages: [user('hi'), { role: 'tool', content: 'ok' }] });
    assert.deepEqual(done, { phase: 'final', text: SMOKE_FINAL_TEXT });
    assert.equal(decide({ messages: [user('hi')] }).phase, 'plain');
    assert.equal(decide({ tools: [tools[0]], messages: [user('hi')] }).phase, 'no_bash');
  });

  it('最后一条用户消息带标记时按对应剧本回复，不调工具', () => {
    assert.equal(decide({ tools, messages: [user(`慢一点 ${MOCK_SLOW_MARKER}`)] }).phase, 'slow');
    assert.deepEqual(decide({ tools, messages: [user(`${MOCK_TABLE_MARKER} 列个表`)] }), {
      phase: 'table',
      text: MOCK_TABLE_TEXT,
    });
    // 多模态消息的内容是数组
    const parts = [{ type: 'text', text: `看图 ${MOCK_SLOW_MARKER}` }];
    assert.equal(decide({ tools, messages: [user(parts)] }).phase, 'slow');
  });

  it('只看最后一条用户消息：之前轮次的标记不影响后面的普通提问', () => {
    const history = [
      user(`前一轮 ${MOCK_SLOW_MARKER}`),
      { role: 'assistant', content: '片段 1。' },
      user('普通提问'),
    ];
    assert.equal(decide({ tools, messages: history }).phase, 'tool_call');
    // 没有工具的辅助请求（标题生成等）不看标记
    assert.equal(decide({ messages: [user(MOCK_SLOW_MARKER)] }).phase, 'plain');
  });
});
