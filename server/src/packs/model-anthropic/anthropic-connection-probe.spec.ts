import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

/** 一次成功的 Claude 流式回复：按探针问题给出正确答案（图片答颜色、PDF 答数字，其余 PROBE_OK） */
const probeReply = (text: string) =>
  [
    { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
    { type: 'message_stop' },
  ]
    .map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');

const answerFor = (body: any) => {
  const question = String(body.messages?.[0]?.content?.[0]?.text || '');
  if (question.includes('识别图片')) return 'red';
  if (question.includes('读取文档')) return '4827';
  return 'PROBE_OK';
};

/** 文件服务替身：探针素材都是内联数据，任何一次访问都说明走错了路径 */
const unreachable = new Proxy(
  {},
  {
    get: () => {
      throw new Error('探针不应访问文件服务');
    },
  },
);

/**
 * 真实的内核测试连接编排（ModelGatewayService.testConnection：签名去重、代表档位、512 上限）+ 真实的
 * 媒体预处理 + 真实的 Anthropic 适配器，只替换网络。「探到的档位」= 通过且未跳过；后台最终写回的结果
 * 由 admin/tests/model-key.test.mjs 用同一份结果（anthropic-probe-results.fixture.json）走真实的应用逻辑断言
 */
async function runProbe(model: string, additionalParams?: Record<string, unknown>) {
  const registry = new ModelStreamRegistry();
  const urlBuilder = new ModelGatewayUrlBuilder(registry);
  new AnthropicMessagesAdapter(urlBuilder, registry);
  const service = new ModelGatewayService(
    registry,
    urlBuilder,
    new ModelGatewayMediaPreparerService(unreachable as any, unreachable as any),
  );
  const sent: any[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url: unknown, init: any) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    return new Response(probeReply(answerFor(body)), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  });

  const result = await service.testConnection({
    protocol: 'anthropic_messages',
    model,
    apiKey: 'sk-ant-test',
    baseUrl: 'https://api.anthropic.com',
    additionalParams,
  });
  const reasoning = result.tests.filter(test => test.capability === 'reasoning');
  return {
    tests: result.tests,
    textProbe: sent[0],
    reasoningBodies: sent
      .filter(body => body.messages?.[0]?.content?.[0]?.text === '只回答 PROBE_OK')
      .slice(1),
    probed: reasoning.filter(test => !test.skipped).map(test => test.value),
    skipped: reasoning.filter(test => test.skipped).map(test => test.value),
    writtenBack: reasoning.filter(test => test.ok && !test.skipped).map(test => test.value),
  };
}

/** 后台契约场景：结果写进夹具，后台用例按真实的转换、汇总、应用逻辑断言最终档位 */
const CONTRACT_SCENARIOS: Array<[string, string, Record<string, unknown> | undefined]> = [
  ['opus-5-5', 'claude-opus-5-5', undefined],
  ['sonnet-4-5', 'claude-sonnet-4-5', undefined],
  ['claude-3-5', 'claude-3-5-sonnet-20241022', undefined],
  ['unknown-model', 'my-claude', undefined],
  [
    'opus-5-adaptive-medium-in-params',
    'claude-opus-5',
    { thinking: { type: 'adaptive' }, output_config: { effort: 'medium', verbosity: 'low' } },
  ],
  ['sonnet-4-5-disabled-in-params', 'claude-sonnet-4-5', { thinking: { type: 'disabled' } }],
  ['sonnet-4-6-disabled-in-params', 'claude-sonnet-4-6', { thinking: { type: 'disabled' } }],
  [
    'sonnet-4-5-large-budget-in-params',
    'claude-sonnet-4-5',
    { thinking: { type: 'enabled', budget_tokens: 30000 } },
  ],
];
const FIXTURE = join(__dirname, 'anthropic-probe-results.fixture.json');

describe('Anthropic connection probe through the real kernel orchestration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('produces the probe results the admin contract test applies', async () => {
    const actual: Record<string, unknown> = {};
    for (const [name, model, params] of CONTRACT_SCENARIOS) {
      const { tests } = await runProbe(model, params);
      actual[name] = tests.map(test => ({
        key: test.key,
        capability: test.capability,
        ...(test.value ? { value: test.value } : {}),
        ok: test.ok,
        ...(test.skipped ? { skipped: true } : {}),
      }));
      jest.restoreAllMocks();
    }
    if (process.env.UPDATE_ANTHROPIC_PROBE_FIXTURE === '1') {
      writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 2)}\n`);
    }
    expect(actual).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  });

  it('answers the media probes, so the full result is a realistic success', async () => {
    const { tests } = await runProbe('claude-opus-5');
    expect(
      tests.filter(test => test.capability === 'multimodal').map(test => [test.value, test.ok]),
    ).toEqual([
      ['image_url', true],
      ['document', true],
    ]);
  });

  it.each([
    ['claude-opus-5-5', ['low', 'medium', 'high', 'xhigh', 'max']],
    ['claude-fable-5-1', ['low', 'medium', 'high', 'xhigh', 'max']],
    ['claude-sonnet-5-5', ['off', 'low', 'medium', 'high', 'xhigh', 'max']],
    ['claude-opus-5', ['off', 'low', 'medium', 'high', 'xhigh', 'max']],
    ['claude-sonnet-4-6', ['off', 'low', 'medium', 'high', 'max']],
    ['claude-opus-4-5-20251101', ['off', 'low', 'medium', 'high']],
    ['claude-sonnet-4-5', ['off', 'low', 'medium', 'high']],
    ['claude-3-7-sonnet-20250219', ['off', 'low', 'medium', 'high']],
    ['claude-3-5-sonnet-20241022', []],
    ['my-claude', []],
  ])('writes back exactly the levels %s supports', async (model: string, levels: string[]) => {
    const { writtenBack, probed, skipped } = await runProbe(model);
    expect(writtenBack).toEqual(levels);
    expect(probed).toEqual(levels);
    expect([...probed, ...skipped].sort()).toEqual(
      ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].sort(),
    );
  });

  it('probes each supported level with its own request body', async () => {
    const opus = await runProbe('claude-opus-5-5');
    expect(opus.reasoningBodies.map(body => body.output_config?.effort).sort()).toEqual(
      ['high', 'low', 'max', 'medium', 'xhigh'].sort(),
    );
    expect(opus.reasoningBodies.every(body => body.thinking?.type === 'adaptive')).toBe(true);

    const sonnet = await runProbe('claude-sonnet-4-5');
    const budgets = sonnet.reasoningBodies.map(body => [
      body.thinking?.type,
      body.thinking?.budget_tokens,
      body.max_tokens,
    ]);
    expect(budgets).toEqual(
      expect.arrayContaining([
        ['disabled', undefined, 512],
        ['enabled', 2048, 3072],
        ['enabled', 8192, 9216],
        ['enabled', 16384, 17408],
      ]),
    );
    expect(budgets).toHaveLength(4);
  });

  it('still finds medium when the params already pin adaptive thinking at medium', async () => {
    const { writtenBack, textProbe } = await runProbe('claude-opus-5', {
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', verbosity: 'low' },
    });
    expect(writtenBack).toContain('medium');
    expect(writtenBack).toEqual(['off', 'low', 'medium', 'high', 'xhigh', 'max']);
    // 基线（文本探针）不带思考参数，output_config 的其他字段保留
    expect(textProbe).not.toHaveProperty('thinking');
    expect(textProbe.output_config).toEqual({ verbosity: 'low' });
  });

  it.each(['claude-sonnet-4-5', 'claude-sonnet-4-6'])(
    'still finds off on %s when the params already say disabled',
    async (model: string) => {
      const { writtenBack } = await runProbe(model, { thinking: { type: 'disabled' } });
      expect(writtenBack).toContain('off');
    },
  );

  it('keeps a large manual budget in the params out of the text probe', async () => {
    const { textProbe, writtenBack } = await runProbe('claude-sonnet-4-5', {
      thinking: { type: 'enabled', budget_tokens: 30000 },
    });
    expect(textProbe).not.toHaveProperty('thinking');
    expect(textProbe.max_tokens).toBe(512);
    expect(writtenBack).toEqual(['off', 'low', 'medium', 'high']);
  });
});
