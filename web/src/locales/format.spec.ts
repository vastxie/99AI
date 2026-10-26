import { afterEach, describe, expect, it } from 'vitest'
import i18n, { formatDate, formatDateTime, formatNumber } from './index'

afterEach(() => {
  i18n.global.locale.value = 'zh-CN'
})

describe('数字与日期按界面语言书写', () => {
  it('跟随界面语言，不跟随浏览器语言', () => {
    const date = new Date(2026, 8, 28, 14, 5)
    i18n.global.locale.value = 'en-US'
    expect(formatDate(date)).toBe(date.toLocaleDateString('en-US'))
    expect(formatDateTime(date)).toBe(date.toLocaleString('en-US'))
    expect(formatNumber(1234567)).toBe('1,234,567')

    i18n.global.locale.value = 'zh-CN'
    expect(formatDate(date)).toBe(date.toLocaleDateString('zh-CN'))
    expect(formatDate(date)).not.toBe(date.toLocaleDateString('en-US'))
  })
})
