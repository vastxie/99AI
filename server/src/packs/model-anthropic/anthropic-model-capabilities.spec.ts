import { resolveModelGatewayReasoningEffort } from '@/modules/modelGateway/model-gateway.types';
import {
  anthropicCatalogReasoningControl,
  closestAnthropicEffortAtOrBelow,
  normalizeAnthropicModelId,
  resolveAnthropicModelCapabilities,
} from './anthropic-model-capabilities';
import { ANTHROPIC_MESSAGES_PROFILES } from './anthropic-messages.profiles';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('Anthropic model capabilities', () => {
  describe('model ID resolution (only for the table; the sent ID stays as configured)', () => {
    it.each([
      ['claude-opus-5-5', 'claude-opus-5-5'],
      ['Claude-Sonnet-5-5', 'claude-sonnet-5-5'],
      ['claude-fable-5-1', 'claude-fable-5-1'],
      ['claude-opus-4.5', 'claude-opus-4-5'],
      ['claude-opus-4-5-20251101', 'claude-opus-4-5'],
      ['us.anthropic.claude-opus-4-5-20251101-v1:0', 'claude-opus-4-5'],
      ['anthropic.claude-3-5-sonnet-20241022-v2:0', 'claude-3-5-sonnet'],
      ['anthropic/claude-sonnet-4-5@20250929', 'claude-sonnet-4-5'],
      ['openrouter/anthropic/claude-sonnet-4.6', 'claude-sonnet-4-6'],
      ['claude-haiku-4-5-latest', 'claude-haiku-4-5'],
      ['claude-3-5-haiku-latest', 'claude-3-5-haiku'],
      ['claude-opus-4-0', 'claude-opus-4'],
      ['claude-sonnet-4-0', 'claude-sonnet-4'],
      ['claude-3-7-sonnet-20250219', 'claude-3-7-sonnet'],
    ])('resolves %s to the %s family', (model: string, family: string) => {
      expect(normalizeAnthropicModelId(model)).toBe(family);
      expect(resolveAnthropicModelCapabilities(model)?.family).toBe(family);
    });

    it.each([
      'claude-opus-4-60',
      'claude-opus-4-6-custom',
      'claude-sonnet-9',
      'gpt-claude-opus-4-5',
      'my-claude',
      '',
    ])('treats %j as an unknown model', (model: string) => {
      expect(resolveAnthropicModelCapabilities(model)).toBeUndefined();
    });
  });

  describe('family table', () => {
    const caps = (model: string) => resolveAnthropicModelCapabilities(model)!;

    it('records which families cannot turn thinking off and what off means elsewhere', () => {
      for (const model of [
        'claude-opus-5-5',
        'claude-fable-5-1',
        'claude-mythos-5-1',
        'claude-fable-5',
        'claude-mythos-5',
      ]) {
        expect(caps(model).off).toBe('unsupported');
      }
      expect(caps('claude-sonnet-5-5').off).toBe('between_tools');
      for (const model of [
        'claude-opus-5',
        'claude-sonnet-5',
        'claude-opus-4-8',
        'claude-opus-4-6',
      ]) {
        expect(caps(model).off).toBe('disabled');
      }
    });

    it('lists effort levels per family', () => {
      expect(caps('claude-opus-5-5').efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
      expect(caps('claude-sonnet-4-6').efforts).toEqual(['low', 'medium', 'high', 'max']);
      expect(caps('claude-opus-4-5').efforts).toEqual(['low', 'medium', 'high']);
      expect(caps('claude-sonnet-4-5').efforts).toEqual([]);
      expect(caps('claude-haiku-4-5').efforts).toEqual([]);
    });

    it('separates thinking styles, sampling rules, forced tools and default thinking', () => {
      expect(caps('claude-opus-4-5').thinking).toBe('manual');
      expect(caps('claude-3-7-sonnet').thinking).toBe('manual');
      expect(caps('claude-3-5-sonnet').thinking).toBe('none');
      expect(caps('claude-opus-4-7').sampling).toBe('always');
      expect(caps('claude-opus-4-6').sampling).toBe('thinking');
      expect(caps('claude-3-haiku').sampling).toBe('none');
      for (const model of [
        'claude-opus-5-5',
        'claude-sonnet-5-5',
        'claude-fable-5-1',
        'claude-mythos-5-1',
      ]) {
        expect(caps(model).forcedTool).toBe(false);
      }
      expect(caps('claude-fable-5').forcedTool).toBe(true);
      expect(caps('claude-sonnet-5').thinkingByDefault).toBe(true);
      expect(caps('claude-opus-4-8').thinkingByDefault).toBe(false);
    });

    it('returns a copy so callers cannot change the table', () => {
      caps('claude-opus-5-5').efforts.pop();
      expect(caps('claude-opus-5-5').efforts).toHaveLength(5);
    });
  });

  it('picks the closest effort at or below the request, and the lowest one for minimal', () => {
    expect(closestAnthropicEffortAtOrBelow('xhigh', ['low', 'medium', 'high', 'max'])).toBe('high');
    expect(closestAnthropicEffortAtOrBelow('max', ['low', 'medium', 'high'])).toBe('high');
    expect(closestAnthropicEffortAtOrBelow('minimal', ['low', 'medium'])).toBe('low');
    expect(closestAnthropicEffortAtOrBelow('medium', [])).toBeUndefined();
  });

  describe('catalog', () => {
    const catalogEntry = (id: string) =>
      ANTHROPIC_MESSAGES_PROFILES.catalog.find(item => item.id === id);

    it('adds the new families with a 1M context window', () => {
      for (const id of [
        'claude-opus-5-5',
        'claude-sonnet-5-5',
        'claude-fable-5-1',
        'claude-mythos-5-1',
        'claude-fable-5',
        'claude-mythos-5',
        'claude-opus-5',
        'claude-sonnet-5',
      ]) {
        expect(catalogEntry(id)).toMatchObject({ id, maxTokens: 1000000 });
      }
    });

    it('writes reasoning levels: adaptive families default to medium, manual ones to off', () => {
      expect(catalogEntry('claude-opus-5-5')?.capabilities.reasoningControl).toEqual({
        levels: ['low', 'medium', 'high', 'xhigh', 'max'],
        defaultLevel: 'medium',
      });
      expect(catalogEntry('claude-sonnet-5-5')?.capabilities.reasoningControl).toEqual({
        levels: ['off', 'low', 'medium', 'high', 'xhigh', 'max'],
        defaultLevel: 'medium',
      });
      expect(catalogEntry('claude-sonnet-4-6')?.capabilities.reasoningControl).toEqual({
        levels: ['off', 'low', 'medium', 'high', 'max'],
        defaultLevel: 'medium',
      });
      for (const id of [
        'claude-opus-4-5-20251101',
        'claude-sonnet-4-5',
        'claude-3-7-sonnet-20250219',
      ]) {
        expect(catalogEntry(id)?.capabilities.reasoningControl).toEqual({
          levels: ['off', 'low', 'medium', 'high'],
          defaultLevel: 'off',
        });
      }
      expect(
        catalogEntry('claude-3-5-sonnet-20241022')?.capabilities.reasoningControl,
      ).toBeUndefined();
      expect(anthropicCatalogReasoningControl('my-claude')).toBeUndefined();
    });

    it('leaves a saved manual-thinking model without reasoning levels on the kernel default (medium)', () => {
      // 目录默认「关闭」只作用于新选择的目录条目；已保存、没有推理档位的配置在入口仍解析为「中」
      expect(resolveModelGatewayReasoningEffort(undefined, { reasoning: 'summary' })).toBe(
        'medium',
      );
    });
  });
});
