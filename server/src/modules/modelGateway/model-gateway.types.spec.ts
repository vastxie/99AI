import {
  normalizeModelGatewayReasoningControl,
  normalizeModelGatewayReasoningEffort,
  resolveModelGatewayReasoningEffort,
  withNormalizedModelGatewayReasoningControl,
} from './model-gateway.types';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('Model Gateway reasoning levels', () => {
  it('accepts only the seven canonical levels', () => {
    expect(normalizeModelGatewayReasoningEffort('off')).toBe('off');
    expect(normalizeModelGatewayReasoningEffort('minimal')).toBe('minimal');
    expect(normalizeModelGatewayReasoningEffort('low')).toBe('low');
    expect(normalizeModelGatewayReasoningEffort('medium')).toBe('medium');
    expect(normalizeModelGatewayReasoningEffort('high')).toBe('high');
    expect(normalizeModelGatewayReasoningEffort('xhigh')).toBe('xhigh');
    expect(normalizeModelGatewayReasoningEffort('max')).toBe('max');
    expect(normalizeModelGatewayReasoningEffort('fast')).toBeUndefined();
    expect(normalizeModelGatewayReasoningEffort('balanced')).toBeUndefined();
    expect(normalizeModelGatewayReasoningEffort('pro')).toBeUndefined();
  });

  it('sorts configured levels, removes null-mapped levels and repairs the default', () => {
    expect(
      normalizeModelGatewayReasoningControl({
        levels: ['max', 'off', 'medium', 'xhigh'],
        defaultLevel: 'xhigh',
        levelMap: { xhigh: null, max: 'xhigh' },
      }),
    ).toEqual({
      levels: ['off', 'medium', 'max'],
      defaultLevel: 'medium',
      levelMap: { xhigh: null, max: 'xhigh' },
    });
  });

  it('uses only the canonical medium level when a model has no config', () => {
    expect(withNormalizedModelGatewayReasoningControl({ vision: true })).toEqual({
      vision: true,
      reasoningControl: {
        levels: ['medium'],
        defaultLevel: 'medium',
      },
    });
  });

  it('falls unsupported or malformed requests back to the model default', () => {
    const capabilities = {
      reasoningControl: {
        levels: ['off', 'high'],
        defaultLevel: 'high',
      },
    } as const;

    expect(resolveModelGatewayReasoningEffort('off', capabilities as any)).toBe('off');
    expect(resolveModelGatewayReasoningEffort('xhigh', capabilities as any)).toBe('high');
    expect(resolveModelGatewayReasoningEffort('unknown', capabilities as any)).toBe('high');
  });
});
