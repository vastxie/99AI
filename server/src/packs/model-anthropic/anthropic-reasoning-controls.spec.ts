import { Logger } from '@nestjs/common';
import { ModelGatewayUrlBuilder } from '@/modules/modelGateway/model-gateway-url.builder';
import { ModelStreamRegistry } from '@/modules/modelGateway/model-stream';
import { AnthropicMessagesAdapter } from './anthropic-messages.adapter';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const createAdapter = () => {
  const registry = new ModelStreamRegistry();
  return new AnthropicMessagesAdapter(new ModelGatewayUrlBuilder(registry), registry);
};

interface RequestOptions {
  level?: string;
  params?: Record<string, unknown>;
  purpose?: string;
  maxTokens?: number;
  temperature?: number;
  disableThinking?: boolean;
  toolChoice?: 'auto' | 'none' | 'required';
}

const request = (model: string, options: RequestOptions = {}): any => ({
  config: {
    protocol: 'anthropic_messages',
    model,
    apiKey: 'sk-ant-test',
    baseUrl: 'https://api.anthropic.com',
    reasoningEffort: options.level,
    additionalParams: options.params,
  },
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ type: 'function', function: { name: 'search', parameters: {} } }],
  toolChoice: options.toolChoice ?? 'auto',
  purpose: options.purpose ?? 'agent_loop',
  ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
  ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  ...(options.disableThinking ? { disableThinking: true } : {}),
});

describe('Anthropic reasoning controls by model capability', () => {
  let adapter: AnthropicMessagesAdapter;
  let warn: any;
  const body = (model: string, options: RequestOptions = {}) =>
    adapter.buildRequestBody(request(model, options), true);
  const warnings = () => warn.mock.calls.map((call: any[]) => call[0]);

  beforeEach(() => {
    adapter = createAdapter();
    warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('adaptive families', () => {
    it.each(['low', 'medium', 'high', 'xhigh', 'max'])(
      'sends adaptive thinking with effort %s to Opus 5.5',
      (level: string) => {
        expect(body('claude-opus-5-5', { level })).toMatchObject({
          thinking: { type: 'adaptive' },
          output_config: { effort: level },
        });
        expect(warnings()).toEqual([]);
      },
    );

    it('cannot turn Opus 5.5 off: a configured off becomes the lowest level with a static warning', () => {
      expect(body('claude-opus-5-5', { level: 'off' })).toMatchObject({
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
      });
      expect(warnings()).toEqual(['该 Claude 模型不能关闭思考，已按最低档发送']);
    });

    it('uses the lowest level without a warning when an internal task asks for no thinking', () => {
      expect(body('claude-fable-5-1', { level: 'high', disableThinking: true })).toMatchObject({
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
      });
      expect(warnings()).toEqual([]);
    });

    it('turns Sonnet 5.5 down to between_tools and drops any effort, including one in the params', () => {
      const sent = body('claude-sonnet-5-5', {
        level: 'off',
        params: { output_config: { effort: 'max', verbosity: 'low' } },
      });
      expect(sent.thinking).toEqual({ type: 'between_tools' });
      expect(sent.output_config).toEqual({ verbosity: 'low' });
    });

    it.each([
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
    ])('disables thinking on %s and drops any effort', (model: string) => {
      const sent = body(model, {
        level: 'off',
        params: { thinking: { type: 'adaptive' }, output_config: { effort: 'xhigh' } },
      });
      expect(sent.thinking).toEqual({ type: 'disabled' });
      expect(sent).not.toHaveProperty('output_config');
    });

    it('steps Sonnet 4.6 down from xhigh to high (it has no xhigh) and keeps max', () => {
      expect(body('claude-sonnet-4-6', { level: 'xhigh' }).output_config).toEqual({
        effort: 'high',
      });
      expect(warnings()).toEqual([
        '该 Claude 模型不支持所选推理档位，已改用不高于它的最高可用档位',
      ]);
      expect(body('claude-sonnet-4-6', { level: 'max' }).output_config).toEqual({ effort: 'max' });
    });

    it('maps minimal to the lowest level', () => {
      expect(body('claude-opus-5', { level: 'minimal' }).output_config).toEqual({ effort: 'low' });
      expect(warnings()).toEqual([
        '该 Claude 模型不支持所选推理档位，已改用不高于它的最高可用档位',
      ]);
    });

    it('overrides thinking and effort in the params with the platform intent, keeping other output_config fields', () => {
      const sent = body('claude-opus-5', {
        level: 'low',
        params: {
          thinking: { type: 'enabled', budget_tokens: 4096 },
          output_config: { effort: 'max', verbosity: 'medium' },
        },
      });
      expect(sent.thinking).toEqual({ type: 'adaptive' });
      expect(sent.output_config).toEqual({ effort: 'low', verbosity: 'medium' });
    });

    it('keeps the model ID exactly as configured', () => {
      expect(body('us.anthropic.claude-opus-5-5-v1:0', { level: 'high' })).toMatchObject({
        model: 'us.anthropic.claude-opus-5-5-v1:0',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
      });
    });
  });

  describe('manual families', () => {
    it.each([
      ['low', 2048],
      ['medium', 8192],
      ['high', 16384],
      ['xhigh', 16384],
      ['max', 16384],
    ])('gives Sonnet 4.5 a %s budget of %i without an effort', (level: string, budget: number) => {
      const sent = body('claude-sonnet-4-5-20250929', { level });
      expect(sent.thinking).toEqual({ type: 'enabled', budget_tokens: budget });
      expect(sent).not.toHaveProperty('output_config');
      expect(sent.max_tokens).toBe(budget + 4096);
    });

    it('sends an explicit disabled for off', () => {
      expect(body('claude-haiku-4-5', { level: 'off' }).thinking).toEqual({ type: 'disabled' });
      expect(body('claude-3-7-sonnet-20250219', { level: 'off' }).thinking).toEqual({
        type: 'disabled',
      });
    });

    it('adds the effort on Opus 4.5 and steps xhigh / max down to high', () => {
      expect(body('claude-opus-4-5', { level: 'medium' })).toMatchObject({
        thinking: { type: 'enabled', budget_tokens: 8192 },
        output_config: { effort: 'medium' },
      });
      expect(body('claude-opus-4-5', { level: 'max' })).toMatchObject({
        thinking: { type: 'enabled', budget_tokens: 16384 },
        output_config: { effort: 'high' },
      });
      expect(warnings()).toEqual([
        '该 Claude 模型不支持所选推理档位，已改用不高于它的最高可用档位',
      ]);
    });

    it('treats minimal as the low budget', () => {
      expect(body('claude-opus-4-1', { level: 'minimal' }).thinking).toEqual({
        type: 'enabled',
        budget_tokens: 2048,
      });
      expect(warnings()).toEqual([
        '该 Claude 模型不支持所选推理档位，已改用不高于它的最高可用档位',
      ]);
    });
  });

  describe('models without thinking', () => {
    it('never sends thinking to Claude 3.5 and drops thinking in the params once a level is chosen', () => {
      const sent = body('claude-3-5-sonnet-20241022', {
        level: 'high',
        temperature: 0.3,
        params: { thinking: { type: 'enabled', budget_tokens: 2048 }, top_p: 0.5 },
      });
      expect(sent).not.toHaveProperty('thinking');
      expect(sent).not.toHaveProperty('output_config');
      expect(sent).toMatchObject({ temperature: 0.3, top_p: 0.5, max_tokens: 4096 });
    });
  });

  it('does not send an empty output_config', () => {
    expect(
      body('claude-opus-5', { purpose: 'system_chat', params: { output_config: {} } }),
    ).not.toHaveProperty('output_config');
    expect(
      body('claude-opus-5', { level: 'off', params: { output_config: { effort: 'high' } } }),
    ).not.toHaveProperty('output_config');
  });

  describe('intent precedence', () => {
    it('lets disableThinking win over the configured level', () => {
      expect(body('claude-opus-5', { level: 'max', disableThinking: true }).thinking).toEqual({
        type: 'disabled',
      });
    });

    it('keeps explicit thinking and effort from the params when a caller sends no level', () => {
      expect(
        body('claude-opus-4-6', {
          purpose: 'system_chat',
          params: { thinking: { type: 'adaptive' }, output_config: { effort: 'high' } },
        }),
      ).toMatchObject({ thinking: { type: 'adaptive' }, output_config: { effort: 'high' } });
    });
  });

  describe('output limit and manual budget', () => {
    it('treats an explicit max_tokens as a hard cap and shrinks the manual budget to fit', () => {
      const sent = body('claude-sonnet-4-5', { level: 'high', maxTokens: 4096 });
      expect(sent.thinking).toEqual({ type: 'enabled', budget_tokens: 3072 });
      expect(sent.max_tokens).toBe(4096);
    });

    it('sends no thinking (and no error) when even the minimum budget does not fit', () => {
      const sent = body('claude-sonnet-4-5', { level: 'medium', maxTokens: 2047 });
      expect(sent.thinking).toEqual({ type: 'disabled' });
      expect(sent.max_tokens).toBe(2047);
      expect(warnings()).toEqual(['思考预算不足最低值（1024）或放不下输出上限，本次请求不开思考']);
      // 恰好放得下最低预算
      expect(body('claude-sonnet-4-5', { level: 'medium', maxTokens: 2048 }).thinking).toEqual({
        type: 'enabled',
        budget_tokens: 1024,
      });
    });

    it('turns thinking off when a manual budget from the params is below 1024, even without a cap', () => {
      const tooSmall = body('claude-sonnet-4-5', {
        purpose: 'system_chat',
        params: { thinking: { type: 'enabled', budget_tokens: 1023 } },
      });
      expect(tooSmall.thinking).toEqual({ type: 'disabled' });
      expect(tooSmall.max_tokens).toBe(4096);
      expect(warnings()).toEqual(['思考预算不足最低值（1024）或放不下输出上限，本次请求不开思考']);

      const smallest = body('claude-sonnet-4-5', {
        purpose: 'system_chat',
        params: { thinking: { type: 'enabled', budget_tokens: 1024 } },
      });
      expect(smallest.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
      expect(smallest.max_tokens).toBe(1024 + 4096);
    });

    it.each([
      ['zero', 0],
      ['negative', -5],
      ['fractional', 2048.5],
      ['text', '4096'],
      ['missing', undefined],
    ])(
      'never sends manual thinking with a %s budget from the params',
      (_name: string, budget: unknown) => {
        for (const maxTokens of [undefined, 8192]) {
          const sent = body('claude-sonnet-4-5', {
            purpose: 'system_chat',
            ...(maxTokens ? { maxTokens } : {}),
            params: { thinking: { type: 'enabled', budget_tokens: budget } },
          });
          expect(sent.thinking).toEqual({ type: 'disabled' });
          expect(sent.max_tokens).toBe(maxTokens ?? 4096);
        }
        expect(warnings()).toEqual([
          '思考预算不足最低值（1024）或放不下输出上限，本次请求不开思考',
          '思考预算不足最低值（1024）或放不下输出上限，本次请求不开思考',
        ]);
      },
    );

    it('applies the same limits to an explicit manual budget from the params', () => {
      const sent = body('claude-sonnet-4-5', {
        purpose: 'system_chat',
        maxTokens: 8192,
        params: { thinking: { type: 'enabled', budget_tokens: 30000 } },
      });
      expect(sent.thinking).toEqual({ type: 'enabled', budget_tokens: 7168 });
      expect(sent.max_tokens).toBe(8192);
      expect(
        body('claude-sonnet-4-5', {
          purpose: 'system_chat',
          params: { thinking: { type: 'enabled', budget_tokens: 30000 } },
        }).max_tokens,
      ).toBe(34096);
    });

    it('uses max_tokens from the params when the caller sets none, and the caller value over it', () => {
      expect(body('claude-opus-5', { level: 'low', params: { max_tokens: 9000 } }).max_tokens).toBe(
        9000,
      );
      expect(
        body('claude-opus-5', { level: 'low', params: { max_tokens: 9000 }, maxTokens: 700 })
          .max_tokens,
      ).toBe(700);
    });

    it('defaults to 16384 while an adaptive family may think, and 4096 otherwise', () => {
      expect(body('claude-opus-5', { level: 'medium' }).max_tokens).toBe(16384);
      expect(body('claude-sonnet-5-5', { level: 'off' }).max_tokens).toBe(16384);
      // 不带 thinking：5 系列默认思考，4.x 默认不思考
      expect(body('claude-opus-5', { purpose: 'system_chat' }).max_tokens).toBe(16384);
      expect(body('claude-opus-4-8', { purpose: 'system_chat' }).max_tokens).toBe(4096);
      expect(body('claude-opus-5', { level: 'off' }).max_tokens).toBe(4096);
      expect(body('my-claude', { level: 'high' }).max_tokens).toBe(4096);
    });
  });

  describe('sampling parameters', () => {
    it('drops temperature, top_p and top_k on 4.7 and later whether or not they think', () => {
      for (const level of ['off', 'high']) {
        const sent = body('claude-opus-4-7', {
          level,
          temperature: 1,
          params: { top_p: 0.99, top_k: 5, metadata: { user_id: 'u' } },
        });
        expect(sent).not.toHaveProperty('temperature');
        expect(sent).not.toHaveProperty('top_p');
        expect(sent).not.toHaveProperty('top_k');
        expect(sent.metadata).toEqual({ user_id: 'u' });
      }
      expect(warnings()).toEqual([
        '该 Claude 模型不接受部分采样参数，已从请求中去掉',
        '该 Claude 模型不接受部分采样参数，已从请求中去掉',
      ]);
    });

    it.each([
      [0.95, true],
      [1, true],
      [0.94, false],
      [1.01, false],
      ['0.97', false],
    ])(
      'keeps top_p %j on Opus 4.6 while thinking only inside [0.95, 1] (kept: %s)',
      (topP: unknown, kept: boolean) => {
        const sent = body('claude-opus-4-6', {
          level: 'high',
          temperature: 0.5,
          params: { top_p: topP, top_k: 5 },
        });
        expect(sent).not.toHaveProperty('temperature');
        expect(sent).not.toHaveProperty('top_k');
        expect('top_p' in sent).toBe(kept);
      },
    );

    it('leaves sampling alone on 4.6 and earlier while they do not think', () => {
      expect(
        body('claude-sonnet-4-6', {
          level: 'off',
          temperature: 0.5,
          params: { top_p: 0.5, top_k: 5 },
        }),
      ).toMatchObject({ temperature: 0.5, top_p: 0.5, top_k: 5 });
      expect(
        body('claude-opus-4-6', {
          purpose: 'system_chat',
          temperature: 0.5,
          params: { top_p: 0.5 },
        }),
      ).toMatchObject({ temperature: 0.5, top_p: 0.5 });
      expect(warnings()).toEqual([]);
    });

    it('limits sampling on manual thinking the same way', () => {
      const sent = body('claude-sonnet-4-5', {
        level: 'low',
        temperature: 0.5,
        params: { top_p: 0.96, top_k: 5 },
      });
      expect(sent).toMatchObject({ top_p: 0.96 });
      expect(sent).not.toHaveProperty('temperature');
      expect(sent).not.toHaveProperty('top_k');
    });

    it('leaves sampling of an unknown model alone', () => {
      expect(
        body('my-claude', { level: 'high', temperature: 0.5, params: { top_p: 0.5, top_k: 5 } }),
      ).toMatchObject({ temperature: 0.5, top_p: 0.5, top_k: 5 });
    });
  });

  describe('forced tool use', () => {
    it.each([
      ['claude-opus-5', 'high', 'any'],
      ['claude-sonnet-4-6', 'high', 'any'],
      ['claude-opus-5-5', 'high', 'auto'],
      ['claude-sonnet-5-5', 'high', 'auto'],
      ['claude-fable-5-1', 'high', 'auto'],
      ['claude-mythos-5-1', 'high', 'auto'],
      ['claude-fable-5', 'high', 'any'],
      ['claude-sonnet-4-5', 'high', 'auto'],
      ['claude-sonnet-4-5', 'off', 'any'],
      ['claude-3-5-sonnet', 'high', 'any'],
    ])('maps required on %s at %s to %s', (model: string, level: string, type: string) => {
      expect(body(model, { level, toolChoice: 'required' }).tool_choice).toEqual({ type });
    });

    it('downgrades forced tools when the params turn manual thinking on (deprecated enabled on 4.6)', () => {
      expect(
        body('claude-opus-4-6', {
          purpose: 'system_chat',
          toolChoice: 'required',
          params: { thinking: { type: 'enabled', budget_tokens: 2048 } },
        }).tool_choice,
      ).toEqual({ type: 'auto' });
    });

    it('keeps none as none', () => {
      expect(body('claude-opus-5-5', { level: 'high', toolChoice: 'none' }).tool_choice).toEqual({
        type: 'none',
      });
    });
  });

  it('builds the same controls for streaming and non-streaming requests', () => {
    const streamed = adapter.buildRequestBody(
      request('claude-sonnet-4-5', { level: 'high' }),
      true,
    );
    const single = adapter.buildRequestBody(request('claude-sonnet-4-5', { level: 'high' }), false);
    expect({ ...streamed, stream: undefined }).toEqual({ ...single, stream: undefined });
    expect(streamed.stream).toBe(true);
    expect(single.stream).toBe(false);
  });

  describe('connection probe (test_connection)', () => {
    const probe = (model: string, options: RequestOptions = {}) =>
      adapter.buildRequestBody(
        request(model, { purpose: 'test_connection', maxTokens: 512, ...options }),
        false,
      );

    it.each([
      ['claude-opus-5-5', 'off'],
      ['claude-fable-5', 'off'],
      ['claude-opus-5', 'minimal'],
      ['claude-sonnet-4-6', 'xhigh'],
      ['claude-opus-4-5', 'xhigh'],
      ['claude-opus-4-5', 'max'],
      ['claude-sonnet-4-5', 'minimal'],
    ])('reports %s %s as unsupported instead of mapping it', (model: string, level: string) => {
      expect(() => probe(model, { level })).toThrow('该 Claude 模型不支持这个推理档位');
    });

    it('raises the probe limit above the manual budget (and only there)', () => {
      expect(probe('claude-sonnet-4-5', { level: 'high' })).toMatchObject({
        thinking: { type: 'enabled', budget_tokens: 16384 },
        max_tokens: 16384 + 1024,
      });
      expect(probe('claude-opus-5', { level: 'high' }).max_tokens).toBe(512);
    });

    it('clears thinking and effort from the params on the baseline of a known family, keeping other fields', () => {
      const baseline = probe('claude-opus-5', {
        params: {
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium', verbosity: 'low' },
          top_k: 3,
        },
      });
      expect(baseline).not.toHaveProperty('thinking');
      expect(baseline.output_config).toEqual({ verbosity: 'low' });
      // 大预算的手动思考也被清掉，文本探针不会因为 512 放不下预算而失败
      expect(
        probe('claude-sonnet-4-5', {
          params: { thinking: { type: 'enabled', budget_tokens: 30000 } },
        }),
      ).not.toHaveProperty('thinking');
    });

    it('keeps the params of an unknown model on the probe baseline', () => {
      expect(
        probe('my-claude', { params: { thinking: { type: 'enabled', budget_tokens: 2048 } } })
          .thinking,
      ).toEqual({ type: 'enabled', budget_tokens: 2048 });
    });

    it('does not log warnings while probing', () => {
      probe('claude-opus-4-7', { level: 'high', temperature: 0.5, params: { top_p: 0.5 } });
      expect(warnings()).toEqual([]);
    });
  });
});
