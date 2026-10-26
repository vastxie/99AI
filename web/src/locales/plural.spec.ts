import { afterEach, describe, expect, it } from 'vitest'
import i18n, { tp } from '@/locales'

const initialLocale = i18n.global.locale.value

afterEach(() => {
  i18n.global.locale.value = initialLocale
})

describe('带数量的翻译 tp', () => {
  it('英文按单复数选择形式（包括 0）', () => {
    i18n.global.locale.value = 'en-US'
    expect(tp('activity.toolCallsCount', 1)).toBe('1 tool call')
    expect(tp('activity.toolCallsCount', 3)).toBe('3 tool calls')
    expect(tp('activity.toolCallsCount', 0)).toBe('0 tool calls')
    expect(tp('activity.toolCallsWithUnsuccessful', 2, { failed: 1 })).toBe(
      '2 tool calls (1 unsuccessful)'
    )
  })

  it('中文只有一种形式，数量照常插入', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(tp('activity.toolCallsCount', 1)).toBe('1 次工具调用')
    expect(tp('activity.toolCallsWithUnsuccessful', 3, { failed: 2 })).toBe(
      '3 次工具调用（2 次未成功）'
    )
  })
})
