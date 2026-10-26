import { describe, expect, it } from 'vitest'
import {
  getModelReasoningControl,
  normalizeReasoningEffort,
  resolveReasoningEffort,
} from './reasoning'

describe('reasoning level helpers', () => {
  it('只接受七档统一值', () => {
    expect(normalizeReasoningEffort('fast')).toBeUndefined()
    expect(normalizeReasoningEffort('balanced')).toBeUndefined()
    expect(normalizeReasoningEffort('pro')).toBeUndefined()
    expect(normalizeReasoningEffort('xhigh')).toBe('xhigh')
  })

  it('模型缺少配置时仅开放默认的中档', () => {
    expect(getModelReasoningControl({})).toEqual({
      levels: ['medium'],
      defaultLevel: 'medium',
    })
  })

  it('按模型配置限制档位并回落到默认值', () => {
    const capabilities = {
      reasoningControl: {
        levels: ['off', 'high'],
        defaultLevel: 'high',
      },
    }

    expect(resolveReasoningEffort('off', capabilities)).toBe('off')
    expect(resolveReasoningEffort('max', capabilities)).toBe('high')
    expect(resolveReasoningEffort('broken', capabilities)).toBe('high')
  })
})
