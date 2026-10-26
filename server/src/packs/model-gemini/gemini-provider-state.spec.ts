import { Logger } from '@nestjs/common';
import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import { ModelStreamRegistry } from '@/modules/modelGateway/model-stream';
import { collectModelStream } from '@/modules/modelGateway/model-stream/model-stream.collector';
import { mapGatewayMessagesToGeminiContent } from './gemini-content.mapper';
import { GeminiGenerateContentAdapter } from './gemini-generate-content.adapter';
import {
  GEMINI_SKIP_THOUGHT_SIGNATURE,
  GeminiProviderStateCollector,
  rebuildGeminiParts,
} from './gemini-provider-state';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/** Gemini 思考签名：按 part 记录、按记录回放；确知丢失且不能回放时只在 gemini-3 上给原本带签名的调用补占位 */

const G3 = 'gemini-3-pro';
const G25 = 'gemini-2.5-pro';

function collect(model: string, chunks: any[][]) {
  const collector = new GeminiProviderStateCollector(model);
  for (const parts of chunks) for (const part of parts) collector.onPart(part);
  return collector.finish();
}

const call = (name: string, args: unknown, signature?: string) => ({
  functionCall: { name, args },
  ...(signature ? { thoughtSignature: signature } : {}),
});

/** 平台历史里的助手消息（工具调用 id 已被归一化改名，参数是紧凑 JSON） */
const assistant = (state: unknown, text: string, calls: Array<[string, unknown]>) => ({
  role: 'assistant' as const,
  content: text || null,
  tool_calls: calls.map(([name, args], index) => ({
    id: `call_${index}_renamed`,
    type: 'function' as const,
    function: { name, arguments: JSON.stringify(args) },
  })),
  ...(state === undefined ? {} : { provider_state: state }),
});

const toolResult = (index: number) => ({
  role: 'tool' as const,
  tool_call_id: `call_${index}_renamed`,
  content: `result ${index}`,
});

describe('Gemini thought signatures', () => {
  let warn: any;
  beforeEach(() => {
    warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  describe('capture', () => {
    it('records parts in order: unsigned text fragments merge, a signed part stays separate', () => {
      const state = collect(G3, [
        [{ text: 'Let me ' }],
        [{ text: 'check.' }],
        [call('search', { q: 'a' }, 'SIG_CALL')],
        [{ text: '', thoughtSignature: 'SIG_TAIL' }],
      ]);
      expect(state).toEqual({
        v: 1,
        protocol: 'gemini_generate_content',
        model: G3,
        replayable: true,
        signedCalls: [0],
        parts: [
          { kind: 'text', text: 'Let me check.' },
          { kind: 'call', index: 0, name: 'search', args: '{"q":"a"}', signature: 'SIG_CALL' },
          { kind: 'text', text: '', signature: 'SIG_TAIL' },
        ],
      });
    });

    it('keeps a signed text part apart from the unsigned text before it', () => {
      const state = collect(G3, [
        [{ text: 'plain ' }],
        [{ text: 'signed', thoughtSignature: 'SIG' }],
      ]);
      expect(state?.parts).toEqual([
        { kind: 'text', text: 'plain ' },
        { kind: 'text', text: 'signed', signature: 'SIG' },
      ]);
    });

    it('records that only the first of parallel calls carries a signature', () => {
      const state = collect(G3, [[call('a', {}, 'SIG_1'), call('b', {}), call('c', {})]]);
      expect(state?.signedCalls).toEqual([0]);
    });

    it('does not record or replay thought summaries', () => {
      const state = collect(G3, [
        [{ text: 'thinking...', thought: true, thoughtSignature: 'SIG_THOUGHT' }],
        [call('a', {}, 'SIG_1')],
      ]);
      expect(state?.parts).toEqual([
        { kind: 'call', index: 0, name: 'a', args: '{}', signature: 'SIG_1' },
      ]);
    });

    it('needs no state when nothing was signed', () => {
      expect(collect(G3, [[{ text: 'hi' }], [call('a', {})]])).toBeUndefined();
    });

    it('keeps a stub when the recorded parts exceed 4 MB', () => {
      const state = collect(G3, [
        [{ text: 'x'.repeat(4 * 1024 * 1024 + 1) }],
        [call('a', {}, 'SIG_1')],
      ]);
      expect(state).toEqual({
        v: 1,
        protocol: 'gemini_generate_content',
        model: G3,
        replayable: false,
        signedCalls: [0],
      });
      expect(warn).toHaveBeenCalledWith(
        '本次回复的思考签名无法完整记录，之后的请求不回放它',
        'GeminiGenerateContentAdapter',
      );
    });

    it('keeps a stub of which calls were signed when a part cannot be rebuilt', () => {
      const state = collect(G3, [
        [call('a', {}, 'SIG_1')],
        [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }],
      ]);
      expect(state).toEqual({
        v: 1,
        protocol: 'gemini_generate_content',
        model: G3,
        replayable: false,
        signedCalls: [0],
      });
    });
  });

  describe('rebuild', () => {
    const state = collect(G3, [
      [{ text: 'before ' }],
      [call('search', { q: 'a', n: 1 }, 'SIG_CALL')],
      [{ text: 'after', thoughtSignature: 'SIG_TEXT' }],
    ])!;

    it('rebuilds the original parts with their signatures when text and calls match', () => {
      expect(
        rebuildGeminiParts(state, assistant(state, 'before after', [['search', { q: 'a', n: 1 }]])),
      ).toEqual([
        { text: 'before ' },
        { functionCall: { name: 'search', args: { q: 'a', n: 1 } }, thoughtSignature: 'SIG_CALL' },
        { text: 'after', thoughtSignature: 'SIG_TEXT' },
      ]);
    });

    it.each([
      ['the text changed', 'before AFTER', [['search', { q: 'a', n: 1 }]]],
      ['an argument changed', 'before after', [['search', { q: 'b', n: 1 }]]],
      ['the call name changed', 'before after', [['lookup', { q: 'a', n: 1 }]]],
      ['a call is missing', 'before after', []],
    ])('does not rebuild when %s', (_name: string, text: string, calls: any) => {
      expect(rebuildGeminiParts(state, assistant(state, text, calls))).toBeUndefined();
    });
  });

  describe('mapping', () => {
    it('replays the recorded parts for the same model', () => {
      const state = collect(G3, [[call('search', { q: 'a' }, 'SIG_CALL')]]);
      const mapped = mapGatewayMessagesToGeminiContent(
        [
          { role: 'user', content: 'question' },
          assistant(state, '', [['search', { q: 'a' }]]),
          toolResult(0),
        ],
        { model: G3 },
      );
      expect(mapped.contents[1]).toEqual({
        role: 'model',
        parts: [
          { functionCall: { name: 'search', args: { q: 'a' } }, thoughtSignature: 'SIG_CALL' },
        ],
      });
      // 工具结果仍按调用名对上
      expect(mapped.contents[2].parts[0].functionResponse.name).toBe('search');
    });

    it('fills the documented placeholder only for calls known to have lost their signature on gemini-3', () => {
      const state = collect(G3, [[call('a', {}, 'SIG_1'), call('b', {})]]);
      // 参数被改过：不能按记录回放
      const message = assistant(state, '', [
        ['a', { changed: true }],
        ['b', {}],
      ]);
      const mapped = mapGatewayMessagesToGeminiContent(
        [{ role: 'user', content: 'q' }, message, toolResult(0), toolResult(1)],
        { model: G3 },
      );
      expect(mapped.contents[1].parts).toEqual([
        {
          functionCall: { name: 'a', args: { changed: true } },
          thoughtSignature: GEMINI_SKIP_THOUGHT_SIGNATURE,
        },
        { functionCall: { name: 'b', args: {} } },
      ]);
    });

    it('fills the placeholder for a stub but never on gemini-2.5, without a state or for another model', () => {
      const stub = collect(G3, [
        [call('a', {}, 'SIG_1')],
        [{ inlineData: { mimeType: 'x', data: 'y' } }],
      ]);
      const g3 = mapGatewayMessagesToGeminiContent(
        [{ role: 'user', content: 'q' }, assistant(stub, '', [['a', {}]]), toolResult(0)],
        { model: G3 },
      );
      expect(g3.contents[1].parts[0].thoughtSignature).toBe(GEMINI_SKIP_THOUGHT_SIGNATURE);

      const g25State = collect(G25, [
        [call('a', {}, 'SIG_1')],
        [{ inlineData: { mimeType: 'x', data: 'y' } }],
      ]);
      const g25 = mapGatewayMessagesToGeminiContent(
        [{ role: 'user', content: 'q' }, assistant(g25State, '', [['a', {}]]), toolResult(0)],
        { model: G25 },
      );
      expect(g25.contents[1].parts[0]).not.toHaveProperty('thoughtSignature');

      for (const [state, model] of [
        [undefined, G3],
        [stub, 'gemini-3-flash'],
      ] as const) {
        const mapped = mapGatewayMessagesToGeminiContent(
          [{ role: 'user', content: 'q' }, assistant(state, '', [['a', {}]]), toolResult(0)],
          { model },
        );
        expect(mapped.contents[1].parts[0]).not.toHaveProperty('thoughtSignature');
      }
    });
  });

  describe('adapter', () => {
    const createAdapter = () => {
      const registry = new ModelStreamRegistry();
      return new GeminiGenerateContentAdapter(new ModelGatewayUrlBuilder(registry), registry);
    };
    const request: any = {
      config: {
        protocol: 'gemini_generate_content',
        model: G3,
        apiKey: 'gemini-test-key',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'search', parameters: {} } }],
      toolChoice: 'auto',
      stream: true,
      purpose: 'agent_loop',
    };
    const sse = (chunks: any[]) => ({
      ok: true,
      body: (async function* () {
        yield Buffer.from(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join(''));
      })(),
    });

    it('shows thought summaries as reasoning and emits the state after the stream ends', async () => {
      const adapter = createAdapter();
      (adapter as any).post = jest.fn().mockResolvedValue(
        sse([
          { candidates: [{ content: { parts: [{ text: 'weighing options', thought: true }] } }] },
          {
            candidates: [
              {
                content: { parts: [call('search', { q: 'docs' }, 'SIG_CALL')] },
                finishReason: 'STOP',
              },
            ],
          },
          // 结束标志之后才到的签名与用量
          {
            candidates: [{ content: { parts: [{ text: '', thoughtSignature: 'SIG_TAIL' }] } }],
            usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 },
          },
        ]),
      );
      const events: any[] = [];
      for await (const event of adapter.stream(request)) events.push(event);

      expect(events[0]).toEqual({ type: 'reasoning_delta', delta: 'weighing options' });
      expect(events.some(event => event.type === 'text_delta')).toBe(false);
      expect(events.at(-2)).toMatchObject({ type: 'usage' });
      const last = events.at(-1);
      expect(last.type).toBe('provider_state');
      expect(last.state.parts).toEqual([
        { kind: 'call', index: 0, name: 'search', args: '{"q":"docs"}', signature: 'SIG_CALL' },
        { kind: 'text', text: '', signature: 'SIG_TAIL' },
      ]);
      const publicEvents = events.filter(event => event.type !== 'provider_state');
      expect(JSON.stringify(publicEvents)).not.toContain('SIG_');
    });

    it('keeps the signatures out of results collected outside the agent runtime', async () => {
      const adapter = createAdapter();
      (adapter as any).post = jest.fn().mockResolvedValue(
        sse([
          {
            candidates: [
              {
                content: { parts: [{ text: 'answer', thoughtSignature: 'SIG_COLLECT' }] },
                finishReason: 'STOP',
              },
            ],
          },
        ]),
      );
      const collected = await collectModelStream(adapter.stream(request));
      expect(collected).toMatchObject({ content: 'answer', done: true });
      expect(JSON.stringify(collected)).not.toContain('SIG_COLLECT');
    });

    it('leaves thought summaries out of non-stream content', async () => {
      const adapter = createAdapter();
      (adapter as any).post = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'private reasoning', thought: true }, { text: 'answer' }],
              },
            },
          ],
        }),
      });
      await expect(adapter.complete(request)).resolves.toMatchObject({ content: 'answer' });
    });

    it('reports a rejected request carrying signatures as the original error (no stripped retry)', async () => {
      const adapter = createAdapter();
      const state = collect(G3, [[call('search', { q: 'a' }, 'SIG_CALL')]]);
      (adapter as any).post = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => null },
        text: jest.fn().mockResolvedValue('bad signature'),
      });
      let thrown: any;
      try {
        for await (const unused of adapter.stream({
          ...request,
          messages: [
            { role: 'user', content: 'hi' },
            assistant(state, '', [['search', { q: 'a' }]]),
            toolResult(0),
          ],
        }))
          void unused;
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ category: 'invalid_request', requestOutcome: 'rejected' });
      expect(thrown.code).not.toBe('provider_state_rejected');
    });
  });
});
