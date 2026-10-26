import { Logger } from '@nestjs/common';
import {
  AnthropicProviderState,
  AnthropicProviderStateCollector,
  isLosslessJson,
  planAnthropicReplay,
} from './anthropic-provider-state';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const MODEL = 'claude-opus-5';
const SYSTEM = 'system prompt';
const TOOLS = [{ name: 'search', input_schema: {} }];

/** 模拟一次回复的流事件：思考（可带签名）、正文、工具调用 */
function capture(
  context: { digest: string; lineage: string[] },
  options: {
    thinking?: string;
    signature?: string;
    text?: string;
    toolId?: string;
    input?: string;
  } = {},
): AnthropicProviderState {
  const collector = new AnthropicProviderStateCollector({ model: MODEL, ...context });
  let index = 0;
  if (options.signature !== undefined) {
    collector.onEvent({
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    });
    if (options.thinking) {
      collector.onEvent({
        type: 'content_block_delta',
        index,
        delta: { type: 'thinking_delta', thinking: options.thinking },
      });
    }
    collector.onEvent({
      type: 'content_block_delta',
      index,
      delta: { type: 'signature_delta', signature: options.signature },
    });
    collector.onEvent({ type: 'content_block_stop', index });
    index += 1;
  }
  if (options.text) {
    collector.onEvent({
      type: 'content_block_start',
      index,
      content_block: { type: 'text', text: '' },
    });
    collector.onEvent({
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text: options.text },
    });
    collector.onEvent({ type: 'content_block_stop', index });
    index += 1;
  }
  if (options.toolId) {
    collector.onEvent({
      type: 'content_block_start',
      index,
      content_block: { type: 'tool_use', id: options.toolId, name: 'search', input: {} },
    });
    collector.onEvent({
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: options.input ?? '{"q":"x"}' },
    });
    collector.onEvent({ type: 'content_block_stop', index });
  }
  return collector.finish();
}

/** 平台里的助手消息（工具调用参数是归一化后的紧凑 JSON） */
const assistant = (state: AnthropicProviderState | undefined, toolId: string, text = '') => ({
  role: 'assistant' as const,
  content: text || null,
  tool_calls: [
    { id: toolId, type: 'function', function: { name: 'search', arguments: '{"q":"x"}' } },
  ],
  ...(state ? { provider_state: state } : {}),
});
const plainAssistant = (toolId: string, text = '') => ({
  role: 'assistant' as const,
  content: [
    ...(text ? [{ type: 'text', text }] : []),
    { type: 'tool_use', id: toolId, name: 'search', input: { q: 'x' } },
  ],
});
const toolResult = (toolId: string, content = 'result') => ({
  role: 'user' as const,
  content: [{ type: 'tool_result', tool_use_id: toolId, content }],
});
const userText = (text: string) => ({ role: 'user' as const, content: [{ type: 'text', text }] });

/** 一次请求：给出线上消息与对应的平台助手消息，返回回放计划 */
function plan(wire: any[], sources: any[], system = SYSTEM, tools: unknown = TOOLS) {
  return planAnthropicReplay({ model: MODEL, system, tools, messages: wire, sources });
}

describe('Anthropic provider state', () => {
  describe('lossless tool input', () => {
    it.each([
      ['{"q":"x","n":1}', true],
      ['{ "q" : "x" }', true],
      ['{"n":1.0}', true],
      ['{"n":1e2}', true],
      ['{"n":0.1234567890123456}', true],
      ['{"a":{"k":1},"b":{"k":2}}', true],
      ['{"\\u0071":"x"}', true],
      ['{"n":9007199254740993}', false],
      ['{"n":1e-324}', false],
      ['{"n":3e-324}', false],
      ['{"n":1e400}', false],
      ['{"n":-0}', false],
      ['{"x":"before","x":"after","n":1}', false],
      ['{"x":1,"\\u0078":2}', false],
      ['{"o":{"x":1,"x":2}}', false],
      ['{"2":2,"1":1}', false],
      ['{"2":"b","1":"a"}', false],
      ['{"s":"9007199254740993"}', true],
      ['{bad json', false],
    ])('treats %s as lossless: %s', (raw: string, lossless: boolean) => {
      expect(isLosslessJson(raw)).toBe(lossless);
    });
  });

  describe('capture', () => {
    it('records the blocks in order with the raw tool input and is replayable', () => {
      const state = capture(
        { digest: 'd0', lineage: [] },
        { thinking: 'plan', signature: 'sig', text: 'ok', toolId: 't1' },
      );
      expect(state).toMatchObject({
        model: MODEL,
        digest: 'd0',
        lineage: [],
        replayable: true,
        blocks: [
          { type: 'thinking', thinking: 'plan', signature: 'sig' },
          { type: 'text', text: 'ok' },
          { type: 'tool_use', id: 't1', name: 'search', input: '{"q":"x"}' },
        ],
      });
    });

    it('keeps an omitted-display thinking block with an empty body but a signature', () => {
      expect(
        capture({ digest: 'd', lineage: [] }, { thinking: '', signature: 'sig', toolId: 't1' })
          .replayable,
      ).toBe(true);
    });

    it.each([
      ['an empty signature', { thinking: 'x', signature: '', toolId: 't1' }],
      ['a lossy tool input', { signature: 'sig', toolId: 't1', input: '{"n":9007199254740993}' }],
    ])('keeps only the lineage record for %s', (_name: string, options: any) => {
      const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
      try {
        const state = capture({ digest: 'd', lineage: ['earlier'] }, options);
        expect(state.replayable).toBe(false);
        expect(state.blocks).toBeUndefined();
        expect(state.lineage).toEqual(['earlier']);
        // 静态警告，不带任何内容
        expect(warn).toHaveBeenCalledWith(
          '本次回复的思考状态无法完整记录，之后的请求不回放它',
          'AnthropicMessagesAdapter',
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('keeps only the lineage record when the payload exceeds 4 MB', () => {
      const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
      try {
        const state = capture(
          { digest: 'd', lineage: ['earlier'] },
          { thinking: 'x'.repeat(4 * 1024 * 1024 + 1), signature: 'sig', toolId: 't1' },
        );
        expect(state).toMatchObject({ replayable: false, lineage: ['earlier'] });
        expect(state.blocks).toBeUndefined();
      } finally {
        warn.mockRestore();
      }
    });

    it('is not replayable when a block never stopped or has an unknown type', () => {
      const collector = new AnthropicProviderStateCollector({
        model: MODEL,
        digest: 'd',
        lineage: [],
      });
      collector.onEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      });
      collector.onEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 's' },
      });
      expect(collector.finish().replayable).toBe(false);

      const other = new AnthropicProviderStateCollector({ model: MODEL, digest: 'd', lineage: [] });
      other.onEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'server_tool_use', id: 'x' },
      });
      other.onEvent({ type: 'content_block_stop', index: 0 });
      expect(other.finish().replayable).toBe(false);
    });

    it('is not replayable with an empty text block or a redacted block without data', () => {
      const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
      try {
        const emptyText = new AnthropicProviderStateCollector({
          model: MODEL,
          digest: 'd',
          lineage: [],
        });
        emptyText.onEvent({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        });
        emptyText.onEvent({ type: 'content_block_stop', index: 0 });
        expect(emptyText.finish().replayable).toBe(false);

        const noData = new AnthropicProviderStateCollector({
          model: MODEL,
          digest: 'd',
          lineage: [],
        });
        noData.onEvent({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'redacted_thinking' },
        });
        noData.onEvent({ type: 'content_block_stop', index: 0 });
        expect(noData.finish().replayable).toBe(false);
      } finally {
        warn.mockRestore();
      }
    });

    it('captures redacted thinking from the block start', () => {
      const collector = new AnthropicProviderStateCollector({
        model: MODEL,
        digest: 'd',
        lineage: [],
      });
      collector.onEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'redacted_thinking', data: 'opaque' },
      });
      collector.onEvent({ type: 'content_block_stop', index: 0 });
      expect(collector.finish()).toMatchObject({
        replayable: true,
        blocks: [{ type: 'redacted_thinking', data: 'opaque' }],
      });
    });
  });

  describe('replay', () => {
    /** 跑一轮：第 1 次请求 → 回复 A；第 2 次请求带 A */
    function firstRound() {
      const wire1 = [userText('question')];
      const plan1 = plan(wire1, [undefined]);
      const stateA = capture(
        { digest: plan1.digestAfter, lineage: plan1.replayedIds },
        { thinking: 'a', signature: 'sigA', toolId: 't1' },
      );
      return { stateA, wire2: [userText('question'), plainAssistant('t1'), toolResult('t1')] };
    }

    it('replays the latest state with its thinking block in the original order', () => {
      const { stateA, wire2 } = firstRound();
      const result = plan(wire2, [undefined, assistant(stateA, 't1'), undefined]);
      expect(result.replayedIds).toEqual([stateA.id]);
      expect(result.messages[1].content).toEqual([
        { type: 'thinking', thinking: 'a', signature: 'sigA' },
        { type: 'tool_use', id: 't1', name: 'search', input: { q: 'x' } },
      ]);
    });

    it('keeps replaying earlier states through the lineage over several rounds', () => {
      const { stateA, wire2 } = firstRound();
      const plan2 = plan(wire2, [undefined, assistant(stateA, 't1'), undefined]);
      const stateB = capture(
        { digest: plan2.digestAfter, lineage: plan2.replayedIds },
        { signature: 'sigB', toolId: 't2' },
      );
      const wire3 = [...wire2, plainAssistant('t2'), toolResult('t2')];
      const plan3 = plan(wire3, [
        undefined,
        assistant(stateA, 't1'),
        undefined,
        assistant(stateB, 't2'),
        undefined,
      ]);
      expect(plan3.replayedIds.sort()).toEqual([stateA.id, stateB.id].sort());
    });

    it('does not replay anything when the system prompt or the tools changed', () => {
      const { stateA, wire2 } = firstRound();
      expect(
        plan(wire2, [undefined, assistant(stateA, 't1'), undefined], 'other system').replayedIds,
      ).toEqual([]);
      expect(
        plan(wire2, [undefined, assistant(stateA, 't1'), undefined], SYSTEM, []).replayedIds,
      ).toEqual([]);
    });

    it('does not replay a state whose message was changed (tool input or text)', () => {
      const { stateA, wire2 } = firstRound();
      const changed = assistant(stateA, 't1');
      changed.tool_calls[0].function.arguments = '{"q":"y"}';
      expect(plan(wire2, [undefined, changed, undefined]).replayedIds).toEqual([]);
      expect(
        plan(wire2, [undefined, assistant(stateA, 't1', 'extra'), undefined]).replayedIds,
      ).toEqual([]);
      // 工具调用 id 被历史归一化改了名：A 自己的摘要只覆盖它之前的前缀，只能靠 id 比较拦下
      const renamedWire = [
        userText('question'),
        plainAssistant('t1_renamed'),
        toolResult('t1_renamed'),
      ];
      expect(
        plan(renamedWire, [undefined, assistant(stateA, 't1_renamed'), undefined]).replayedIds,
      ).toEqual([]);
    });

    it('never resurrects a state excluded by a later record (prefix changed, then restored)', () => {
      const { stateA, wire2 } = firstRound();
      // 媒体占位让 A 之前的前缀变了（P1）：A 不回放，生成谱系为空的 B
      const changedWire2 = [
        userText('question (media placeholder)'),
        plainAssistant('t1'),
        toolResult('t1'),
      ];
      const plan2 = plan(changedWire2, [undefined, assistant(stateA, 't1'), undefined]);
      expect(plan2.replayedIds).toEqual([]);
      const stateB = capture(
        { digest: plan2.digestAfter, lineage: plan2.replayedIds },
        { signature: 'sigB', toolId: 't2' },
      );
      // 媒体恢复（P0）：B 失配，A 的摘要又匹配，但 A 已被 B 的谱系排除
      const wire3 = [...wire2, plainAssistant('t2'), toolResult('t2')];
      const plan3 = plan(wire3, [
        undefined,
        assistant(stateA, 't1'),
        undefined,
        assistant(stateB, 't2'),
        undefined,
      ]);
      expect(plan3.replayedIds).toEqual([]);
    });

    it('keeps the exclusion when the later record is not replayable itself', () => {
      const { stateA, wire2 } = firstRound();
      const changedWire2 = [
        userText('question (media placeholder)'),
        plainAssistant('t1'),
        toolResult('t1'),
      ];
      const plan2 = plan(changedWire2, [undefined, assistant(stateA, 't1'), undefined]);
      // B 超限 / 不完整：只留谱系记录
      const stateB = capture(
        { digest: plan2.digestAfter, lineage: plan2.replayedIds },
        { thinking: 'x', signature: '', toolId: 't2' },
      );
      expect(stateB.replayable).toBe(false);
      const wire3 = [...wire2, plainAssistant('t2'), toolResult('t2')];
      expect(
        plan(wire3, [
          undefined,
          assistant(stateA, 't1'),
          undefined,
          assistant(stateB, 't2'),
          undefined,
        ]).replayedIds,
      ).toEqual([]);
    });

    it('keeps excluding through several unreplayable records and replays the next good state', () => {
      const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
      try {
        const { stateA, wire2 } = firstRound();
        const changedWire2 = [
          userText('question (media placeholder)'),
          plainAssistant('t1'),
          toolResult('t1'),
        ];
        const sources2 = [undefined, assistant(stateA, 't1'), undefined];
        const plan2 = plan(changedWire2, sources2);
        // B、C 都不可回放（签名为空），谱系都为空
        const stateB = capture(
          { digest: plan2.digestAfter, lineage: plan2.replayedIds },
          { thinking: 'x', signature: '', toolId: 't2' },
        );
        const wire3 = [...changedWire2, plainAssistant('t2'), toolResult('t2')];
        const sources3 = [...sources2, assistant(stateB, 't2'), undefined];
        const plan3 = plan(wire3, sources3);
        expect(plan3.replayedIds).toEqual([]);
        const stateC = capture(
          { digest: plan3.digestAfter, lineage: plan3.replayedIds },
          { thinking: 'y', signature: '', toolId: 't3' },
        );
        const wire4 = [...wire3, plainAssistant('t3'), toolResult('t3')];
        const sources4 = [...sources3, assistant(stateC, 't3'), undefined];
        const plan4 = plan(wire4, sources4);
        expect(plan4.replayedIds).toEqual([]);
        const stateD = capture(
          { digest: plan4.digestAfter, lineage: plan4.replayedIds },
          { signature: 'sigD', toolId: 't4' },
        );
        const sources5 = [...sources4, assistant(stateD, 't4'), undefined];
        // 新状态 D 正常回放
        const wire5 = [...wire4, plainAssistant('t4'), toolResult('t4')];
        expect(plan(wire5, sources5).replayedIds).toEqual([stateD.id]);
        // 前缀恢复成 A 当时的样子：A 的摘要又对上了，但早已作废，D 也失配，什么都不回放
        const restored = [...wire2, ...wire5.slice(3)];
        expect(plan(restored, sources5).replayedIds).toEqual([]);
      } finally {
        warn.mockRestore();
      }
    });

    it('lets a fresh baseline continue after the old states were excluded', () => {
      const { stateA } = firstRound();
      const changedWire2 = [
        userText('question (media placeholder)'),
        plainAssistant('t1'),
        toolResult('t1'),
      ];
      const plan2 = plan(changedWire2, [undefined, assistant(stateA, 't1'), undefined]);
      const stateB = capture(
        { digest: plan2.digestAfter, lineage: plan2.replayedIds },
        { signature: 'sigB', toolId: 't2' },
      );
      const wire3 = [...changedWire2, plainAssistant('t2'), toolResult('t2')];
      const plan3 = plan(wire3, [
        undefined,
        assistant(stateA, 't1'),
        undefined,
        assistant(stateB, 't2'),
        undefined,
      ]);
      expect(plan3.replayedIds).toEqual([stateB.id]);
    });

    it('records the digest after the final messages and the replayed ids for the next state', () => {
      const { stateA, wire2 } = firstRound();
      const result = plan(wire2, [undefined, assistant(stateA, 't1'), undefined]);
      expect(result.digestAfter).toMatch(/^[0-9a-f]{64}$/);
      const again = plan(wire2, [undefined, assistant(stateA, 't1'), undefined]);
      expect(again.digestAfter).toBe(result.digestAfter);
    });

    it('tells whether the replayed content carries thinking blocks', () => {
      const { stateA, wire2 } = firstRound();
      expect(plan(wire2, [undefined, assistant(stateA, 't1'), undefined]).carriesThinking).toBe(
        true,
      );
      // 没开思考的回复：记录照常回放，但请求里没有思考块
      const plan1 = plan([userText('question')], [undefined]);
      const plain = capture(
        { digest: plan1.digestAfter, lineage: plan1.replayedIds },
        { toolId: 't1' },
      );
      const result = plan(wire2, [undefined, assistant(plain, 't1'), undefined]);
      expect(result.replayedIds).toEqual([plain.id]);
      expect(result.carriesThinking).toBe(false);
      expect(plan(wire2, [undefined, assistant(undefined, 't1'), undefined]).carriesThinking).toBe(
        false,
      );
    });

    /** 连续 n 轮正常回放：返回各轮的记录与最后一轮之后的线上消息、来源 */
    function rounds(count: number) {
      const states: AnthropicProviderState[] = [];
      let wire: any[] = [userText('question')];
      let sources: any[] = [undefined];
      for (let index = 1; index <= count; index += 1) {
        const result = plan(wire, sources);
        const state = capture(
          { digest: result.digestAfter, lineage: result.replayedIds },
          { signature: `sig${index}`, toolId: `t${index}` },
        );
        states.push(state);
        wire = [...wire, plainAssistant(`t${index}`), toolResult(`t${index}`)];
        sources = [...sources, assistant(state, `t${index}`), undefined];
      }
      return { states, wire, sources };
    }

    it('tries at most the three latest states as anchors', () => {
      // A 之后的工具结果被改：A 自己的前缀没变，之后的记录都失配
      const changeAfterFirst = (wire: any[]) =>
        wire.map((message, index) => (index === 2 ? toolResult('t1', 'changed') : message));
      const three = rounds(3);
      const fromThree = plan(changeAfterFirst(three.wire), three.sources);
      // 试了 C、B 之后，第三次试 A 成功：只回放 A（从尾部去掉后面的块是允许的）
      expect(fromThree.replayedIds).toEqual([three.states[0].id]);

      const four = rounds(4);
      // D、C、B 三次都失败，不再试 A
      expect(plan(changeAfterFirst(four.wire), four.sources).replayedIds).toEqual([]);
    });

    it('takes the latest state as the anchor and the others by its lineage', () => {
      const plan1 = plan([userText('question')], [undefined]);
      const stateA = capture(
        { digest: plan1.digestAfter, lineage: [] },
        { signature: 'sigA', toolId: 't1' },
      );
      const wire2 = [userText('question'), plainAssistant('t1'), toolResult('t1')];
      const sources2 = [undefined, assistant(stateA, 't1'), undefined];
      const plan2 = plan(wire2, sources2);
      // B 不可回放（签名为空），只留谱系 [A]
      const stateB = capture(
        { digest: plan2.digestAfter, lineage: plan2.replayedIds },
        { thinking: 'x', signature: '', toolId: 't2' },
      );
      const wire3 = [...wire2, plainAssistant('t2'), toolResult('t2')];
      const sources3 = [...sources2, assistant(stateB, 't2'), undefined];
      const plan3 = plan(wire3, sources3);
      expect(plan3.replayedIds).toEqual([stateA.id]);
      const stateC = capture(
        { digest: plan3.digestAfter, lineage: plan3.replayedIds },
        { signature: 'sigC', toolId: 't3' },
      );
      const wire4 = [...wire3, plainAssistant('t3'), toolResult('t3')];
      const plan4 = plan(wire4, [...sources3, assistant(stateC, 't3'), undefined]);
      // 锚点 C 的谱系是 [A]：回放 A 与 C，B 按普通消息发出
      expect(plan4.replayedIds.sort()).toEqual([stateA.id, stateC.id].sort());
      expect(plan4.messages[3].content[0].type).toBe('tool_use');
      expect(plan4.messages[5].content[0]).toMatchObject({ type: 'thinking', signature: 'sigC' });
    });

    it('lists only the records it actually replays when a lineage member is gone', () => {
      // A 没有思考块：回放形态与普通形态相同
      const plan1 = plan([userText('question')], [undefined]);
      const stateA = capture({ digest: plan1.digestAfter, lineage: [] }, { toolId: 't1' });
      const wire2 = [userText('question'), plainAssistant('t1'), toolResult('t1')];
      const plan2 = plan(wire2, [undefined, assistant(stateA, 't1'), undefined]);
      expect(plan2.replayedIds).toEqual([stateA.id]);
      const stateB = capture(
        { digest: plan2.digestAfter, lineage: plan2.replayedIds },
        { signature: 'sigB', toolId: 't2' },
      );
      // A 的状态不在了：B 的摘要仍然对上（前缀逐字相同），但只回放、只列出 B
      const wire3 = [...wire2, plainAssistant('t2'), toolResult('t2')];
      const plan3 = plan(wire3, [
        undefined,
        assistant(undefined, 't1'),
        undefined,
        assistant(stateB, 't2'),
        undefined,
      ]);
      expect(plan3.replayedIds).toEqual([stateB.id]);
      expect(plan3.messages[3].content[0]).toMatchObject({ type: 'thinking', signature: 'sigB' });
    });

    it('ignores states for another model', () => {
      const { stateA, wire2 } = firstRound();
      expect(
        planAnthropicReplay({
          model: 'claude-sonnet-5',
          system: SYSTEM,
          tools: TOOLS,
          messages: wire2,
          sources: [undefined, assistant(stateA, 't1'), undefined],
        }).replayedIds,
      ).toEqual([]);
    });
  });
});
