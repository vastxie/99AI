import { describe, expect, it } from 'vitest'
import { getPlainMessageText } from './chatBase.helpers'
import { buildQuotedPrompt } from './quotePrompt'

describe('轮次导航里的提问文字', () => {
  it('带引用发出的提问显示问题本身，不露出拼接用的标签；超长截断', () => {
    const content = buildQuotedPrompt(
      { text: '表格第 3 行', sourceTitle: 'q3.xlsx' },
      '为什么下降？'
    )
    expect(getPlainMessageText({ role: 'user', cid: 'u1', content } as Chat.Chat)).toBe(
      '为什么下降？'
    )
    expect(
      getPlainMessageText({
        role: 'user',
        cid: 'u2',
        content: '一二三四五六七八九十一二三四五六七八九',
      } as Chat.Chat)
    ).toBe('一二三四五六七八九十一二三四五六七八...')
  })
})
