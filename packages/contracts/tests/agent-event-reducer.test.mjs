import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const contractsRoot = resolve(testDirectory, '..');
const serviceRequire = createRequire(new URL('../../../server/package.json', import.meta.url));
const ts = serviceRequire('typescript');
const fixture = JSON.parse(
  readFileSync(join(contractsRoot, 'fixtures/agent-event-reducer.json'), 'utf8'),
);

const outDir = mkdtempSync(join(tmpdir(), '99agent-reducer-'));
const program = ts.createProgram(
  ts.sys.readDirectory(contractsRoot, ['.ts'], ['tests', 'node_modules'], ['src/**/*.ts']),
  {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    outDir,
  },
);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(
  diagnostics.length,
  0,
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => contractsRoot,
    getNewLine: () => '\n',
  }),
);
assert.equal(program.emit().emitSkipped, false);
const reducer = serviceRequire(join(outDir, 'agent-event-reducer.js'));
const reply = serviceRequire(join(outDir, 'agent-reply.js'));

test.after(() => rmSync(outDir, { recursive: true, force: true }));

function reduceAll(events) {
  return events.reduce(
    (state, event) => reducer.reduceAgentEvent(state, event).state,
    reducer.createAgentEventReducerState(),
  );
}

function summary(state) {
  return {
    workflowSeq: state.workflowSeq,
    content: state.content,
    thinking: state.thinking,
    roundCount: state.rounds.length,
    toolCount: state.rounds.reduce((count, round) => count + round.toolCalls.length, 0),
    status: state.status,
    finishReason: state.finishReason,
    terminal: state.terminal,
    ...(state.usage ? { usage: state.usage } : {}),
  };
}

test('fixed conformance cases converge from a full stream or snapshot barrier', () => {
  assert.equal(fixture.contractVersion, 1);
  for (const scenario of fixture.cases) {
    const full = reduceAll(scenario.fullEvents);
    const fromSnapshot = reduceAll([
      scenario.snapshotEvent,
      ...scenario.fullEvents.slice(scenario.suffixStart),
    ]);
    assert.deepEqual(summary(full), scenario.expected, scenario.name);
    assert.deepEqual(fromSnapshot, full, scenario.name);
  }
});

test('shared fixture declares every required reducer behavior', () => {
  const covered = new Set(fixture.cases.flatMap((scenario) => scenario.covers || []));
  for (const behavior of [
    'text',
    'stop',
    'length',
    'handoff',
    'abort',
    'error',
    'usage_before_barrier',
    'multi_tool_rounds',
    'object_output',
    'primitive_string_output',
    'primitive_object_output',
    'process_phase',
    'phase_correction',
  ]) {
    assert.equal(covered.has(behavior), true, `missing shared coverage: ${behavior}`);
  }
});

test('every prefix can be replaced by its canonical snapshot without changing the final state', () => {
  for (const scenario of fixture.cases) {
    const full = reduceAll(scenario.fullEvents);
    for (let cut = 0; cut <= scenario.fullEvents.length; cut += 1) {
      const prefix = reduceAll(scenario.fullEvents.slice(0, cut));
      const snapshot = {
        type: 'snapshot.sync',
        workflowSeq: prefix.workflowSeq,
        chatId: prefix.chatId || scenario.snapshotEvent.chatId,
        ...(prefix.messageId ? { messageId: prefix.messageId } : {}),
        ...(prefix.turnId ? { turnId: prefix.turnId } : {}),
        timestamp: scenario.snapshotEvent.timestamp,
        data: reducer.toSnapshotSyncEventData(prefix),
      };
      const fromPrefixSnapshot = reduceAll([snapshot, ...scenario.fullEvents.slice(cut)]);
      assert.deepEqual(fromPrefixSnapshot, full, `${scenario.name}; cut=${cut}`);
    }
  }
});

test('duplicates and stale events are idempotent', () => {
  const events = fixture.cases[0].fullEvents;
  const first = reducer.reduceAgentEvent(reducer.createAgentEventReducerState(), events[0]);
  const duplicate = reducer.reduceAgentEvent(first.state, events[0]);
  assert.equal(duplicate.disposition, 'ignored');
  assert.deepEqual(duplicate.state, first.state);

  const snapshot = reducer.reduceAgentEvent(first.state, {
    ...fixture.cases[0].snapshotEvent,
    workflowSeq: 1,
  });
  const repeatedSnapshot = reducer.reduceAgentEvent(snapshot.state, {
    ...fixture.cases[0].snapshotEvent,
    workflowSeq: 1,
  });
  assert.deepEqual(repeatedSnapshot.state, snapshot.state);

  const terminal = reduceAll(events);
  const duplicateTerminal = reducer.reduceAgentEvent(terminal, events.at(-1));
  const staleAfterTerminal = reducer.reduceAgentEvent(duplicateTerminal.state, events.at(-2));
  assert.equal(duplicateTerminal.disposition, 'ignored');
  assert.equal(staleAfterTerminal.disposition, 'ignored');
  assert.deepEqual(staleAfterTerminal.state, terminal);

  const postTerminal = reducer.reduceAgentEvent(terminal, {
    type: 'message.delta',
    workflowSeq: terminal.workflowSeq + 1,
    chatId: terminal.chatId,
    timestamp: 99,
    data: { delta: 'must-not-reopen' },
  });
  assert.equal(postTerminal.disposition, 'ignored');
  assert.equal(postTerminal.state.content, terminal.content);
  assert.equal(postTerminal.state.workflowSeq, terminal.workflowSeq + 1);
});

test('legal primitive tool output converges with its snapshot representation', () => {
  const full = reduceAll([
    {
      type: 'tool.start',
      workflowSeq: 1,
      chatId: 'assistant-output',
      roundId: '0',
      toolCallId: 'call-output',
      timestamp: 1,
      data: { name: 'echo', status: 'running' },
    },
    {
      type: 'tool.end',
      workflowSeq: 2,
      chatId: 'assistant-output',
      roundId: '0',
      toolCallId: 'call-output',
      timestamp: 2,
      data: { name: 'echo', status: 'success', output: 'plain output' },
    },
  ]);
  const snapshot = reduceAll([
    {
      type: 'snapshot.sync',
      workflowSeq: 2,
      chatId: 'assistant-output',
      timestamp: 2,
      data: {
        reason: 'resync',
        content: '',
        message: {
          role: 'assistant',
          content: '',
          rounds: [
            {
              text: null,
              thinking: null,
              completed: false,
              toolCalls: [
                {
                  id: 'call-output',
                  name: 'echo',
                  toolName: 'echo',
                  status: 'success',
                  arguments: {},
                  output: 'plain output',
                },
              ],
            },
          ],
        },
      },
    },
  ]);

  assert.deepEqual(snapshot, full);
});

test('a gap freezes increments until a snapshot establishes a new barrier', () => {
  const events = fixture.cases[0].fullEvents;
  const first = reducer.reduceAgentEvent(reducer.createAgentEventReducerState(), events[0]);
  const gap = reducer.reduceAgentEvent(first.state, events[2]);
  assert.equal(gap.disposition, 'gap');
  assert.equal(gap.state.requiresSnapshot, true);
  assert.equal(gap.state.workflowSeq, 1);

  const late = reducer.reduceAgentEvent(gap.state, events[1]);
  assert.equal(late.disposition, 'gap');
  assert.deepEqual(late.state, gap.state);

  const recovered = reducer.reduceAgentEvent(gap.state, fixture.cases[0].snapshotEvent);
  assert.equal(recovered.disposition, 'applied');
  assert.equal(recovered.state.requiresSnapshot, false);
  assert.equal(recovered.state.workflowSeq, 9);
});

test('the reducer and snapshot projector never mutate their inputs', () => {
  const event = structuredClone(fixture.cases[0].fullEvents[2]);
  const originalEvent = structuredClone(event);
  const initial = reducer.createAgentEventReducerState();
  const originalState = structuredClone(initial);
  const result = reducer.reduceAgentEvent(initial, {
    ...event,
    workflowSeq: 1,
  });
  const projected = reducer.toSnapshotSyncEventData(result.state);

  assert.deepEqual(event, originalEvent);
  assert.deepEqual(initial, originalState);
  projected.message.rounds.push({ unsafe: true });
  assert.equal(result.state.rounds[0].toolCalls.length, 1);
});

test('answer rounds start after the last process round and join with a blank line', () => {
  const cases = [
    // 没有 phase 的旧消息：全部轮次都是回答
    [[{ text: 'a' }, { text: 'b' }], 0, 'a\n\nb'],
    // 过程轮之后才是回答；只调会话控制工具的轮次没有 phase，仍是回答
    [
      [{ text: '先读数据', phase: 'process' }, { text: '结论' }, { text: '以上' }],
      1,
      '结论\n\n以上',
    ],
    // 回答写在过程轮之前也不算：最后一个过程轮之后才是回答
    [[{ text: 'A' }, { text: 'B', phase: 'process' }, { text: 'C' }], 2, 'C'],
    // 全是过程轮（例如达到轮次上限）：没有回答
    [
      [
        { text: '先搜一下', phase: 'process' },
        { text: '再看看', phase: 'process' },
      ],
      2,
      '',
    ],
    // 空文字、null 与空白都跳过
    [[{ text: null, phase: 'process' }, { text: '  ' }, { text: '答' }, null], 1, '答'],
    // 各段末尾的空白不叠加成多余空行
    [[{ text: '先展示文件。\n\n' }, { text: '结论。\n' }], 0, '先展示文件。\n\n结论。'],
    // 段首的空行也不叠加；首行缩进（例如缩进代码块）保留
    [[{ text: 'A\n' }, { text: '\n\n  B' }], 0, 'A\n\n  B'],
  ];
  for (const [rounds, start, text] of cases) {
    assert.equal(reply.answerRoundStart(rounds), start, JSON.stringify(rounds));
    assert.equal(reply.projectAnswerText(rounds), text, JSON.stringify(rounds));
  }
});

test('message.phase applies only to an explicit round and moves text out of the content', () => {
  const base = [
    {
      type: 'message.delta',
      workflowSeq: 1,
      chatId: 'assistant-phase',
      roundId: '0',
      timestamp: 1,
      data: { delta: '先看看' },
    },
  ];
  const withoutRound = reduceAll([
    ...base,
    {
      type: 'message.phase',
      workflowSeq: 2,
      chatId: 'assistant-phase',
      timestamp: 2,
      data: { phase: 'process' },
    },
  ]);
  assert.equal(withoutRound.content, '先看看');
  assert.equal(withoutRound.rounds[0].phase, undefined);

  const processed = reduceAll([
    ...base,
    {
      type: 'message.phase',
      workflowSeq: 2,
      chatId: 'assistant-phase',
      roundId: '0',
      timestamp: 2,
      data: { phase: 'process' },
    },
  ]);
  assert.equal(processed.content, '');
  assert.equal(processed.rounds[0].phase, 'process');
  assert.equal(reducer.toSnapshotSyncEventData(processed).message.rounds[0].phase, 'process');
});

test('a running snapshot recomputes the answer from its rounds while a terminal one keeps the final reply', () => {
  const snapshot = (data) => ({
    type: 'snapshot.sync',
    workflowSeq: 1,
    chatId: 'assistant-snapshot',
    timestamp: 1,
    data: {
      message: {
        role: 'assistant',
        content: 'PROCESS',
        rounds: [
          { text: 'PROCESS', thinking: null, toolCalls: [], completed: true, phase: 'process' },
        ],
      },
      ...data,
    },
  });
  const running = reduceAll([
    snapshot({ reason: 'resync', content: 'PROCESS', status: 'streaming' }),
  ]);
  assert.equal(running.content, '');
  const final = reduceAll([
    snapshot({
      reason: 'workflow_complete',
      content: '要哪种？\n1. A\n2. B',
      finishReason: 'stop',
    }),
  ]);
  assert.equal(final.content, '要哪种？\n1. A\n2. B');
});

test('the effective presentation is the last successful valid one and failures never override it', () => {
  const presentation = (files, status = 'success') => ({
    type: 'presentation',
    status,
    display: { json: { presentation: files } },
  });
  const message = {
    rounds: [
      {
        toolCalls: [presentation([{ fileId: 'file_a', caption: ' 终稿 ' }, { fileId: 'file_a' }])],
      },
      {
        toolCalls: [
          presentation([{ fileId: 'file_b' }], 'error'),
          presentation([{ caption: '缺 fileId' }]),
          { type: 'tool', status: 'success', display: { json: { presentation: [] } } },
        ],
      },
    ],
  };
  assert.deepEqual(reply.findPresentedFiles(message), [{ fileId: 'file_a', caption: '终稿' }]);
  // 空清单是有效选择：本次没有成果文件
  message.rounds.push({ toolCalls: [presentation([])] });
  assert.deepEqual(reply.findPresentedFiles(message), []);
  assert.equal(reply.findPresentedFiles({ rounds: [{ toolCalls: [] }] }), undefined);
});

test('only a successful question in the last round counts and becomes plain reply text', () => {
  const question = (text, options, status = 'success') => ({
    type: 'question',
    status,
    display: { json: { question: { text, options } } },
  });
  const earlier = {
    rounds: [{ toolCalls: [question('旧问题', [])] }, { text: '继续', toolCalls: [] }],
  };
  assert.equal(reply.findQuestion(earlier), undefined);

  const asked = {
    rounds: [
      { text: '先看数据', phase: 'process', toolCalls: [] },
      {
        text: '初稿已完成。',
        toolCalls: [
          question('第一个', ['A', 'B']),
          question('要哪种风格？', ['科技感', ' ', '手绘']),
          question('失败', ['x', 'y'], 'error'),
        ],
      },
    ],
  };
  assert.deepEqual(reply.findQuestion(asked), {
    text: '要哪种风格？',
    options: ['科技感', '手绘'],
  });
  assert.equal(reply.projectReplyText(asked), '初稿已完成。\n\n要哪种风格？\n1. 科技感\n2. 手绘');
  assert.equal(
    reply.projectReplyText({ rounds: [{ text: null, toolCalls: [question('预算多少？', [])] }] }),
    '预算多少？',
  );
});

test('a completed output-limit turn keeps its stop reason through the stream and a snapshot barrier', () => {
  const scenario = fixture.cases.find((item) => (item.covers || []).includes('length'));
  assert.ok(scenario, 'fixture must cover a length terminal');
  // 服务端在 turn 上补 stopReason: length（状态仍是 completed），刷新与重连后都要能看到
  const withStopReason = (event) =>
    event.data?.turn
      ? { ...event, data: { ...event.data, turn: { ...event.data.turn, stopReason: 'length' } } }
      : event;

  const streamed = reduceAll(scenario.fullEvents.map(withStopReason));
  assert.equal(streamed.finishReason, 'length');
  assert.equal(streamed.turn.status, 'completed');
  assert.equal(streamed.turn.stopReason, 'length');

  const barrier = reduceAll([withStopReason(scenario.snapshotEvent)]);
  assert.equal(barrier.turn.status, 'completed');
  assert.equal(barrier.turn.stopReason, 'length');
});
