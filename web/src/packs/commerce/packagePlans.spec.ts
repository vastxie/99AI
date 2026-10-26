import { describe, expect, it, vi } from 'vitest'

vi.mock('@/locales', () => ({
  t: (key: string) => key,
  tp: (key: string, count: number) => `${key}|${count}`,
}))

import { billingCycleText, usdPriceText } from './packagePlans'

describe('套餐周期文案', () => {
  it('一个周期只写单位，多个周期带数量（中文「3 个月」，英文按单复数）', () => {
    expect(billingCycleText({ billingCycle: 'month', billingCycleCount: 1 } as any)).toBe(
      'member.cycleMonth'
    )
    expect(billingCycleText({ billingCycle: 'month', billingCycleCount: 3 } as any)).toBe(
      'member.cycleMonths|3'
    )
    expect(billingCycleText({ billingCycle: 'year' } as any)).toBe('member.cycleYear')
    expect(billingCycleText({ billingCycle: 'one_time' } as any)).toBe('member.cycleOneTime')
  })
})

describe('usdPriceText', () => {
  it('formats the DECIMAL string the API returns and falls back to the CNY estimate', () => {
    expect(usdPriceText({ priceUsd: '9.99', price: '72' })).toBe('9.99')
    expect(usdPriceText({ priceUsd: 12.5 })).toBe('12.50')
    expect(usdPriceText({ priceUsd: '0', price: '73' })).toBe('10.00')
    expect(usdPriceText({ priceUsd: null, price: 'abc' })).toBe('0.00')
  })
})
