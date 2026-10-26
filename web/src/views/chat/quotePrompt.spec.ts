import { describe, expect, it } from 'vitest'
import { buildQuotedPrompt, parseQuotedPrompt } from './quotePrompt'

describe('引用随提问发出的写法', () => {
  it('发出去的内容能原样拆回引用、来源与问题', () => {
    const plain = buildQuotedPrompt({ text: '第一段\n第二段' }, '这段什么意思？')
    expect(plain).toBe('引用内容：\n第一段\n第二段\n\n用户问题：\n这段什么意思？')
    expect(parseQuotedPrompt(plain)).toEqual({
      quote: '第一段\n第二段',
      source: undefined,
      question: '这段什么意思？',
    })

    const sourced = buildQuotedPrompt(
      { text: '表格第 3 行', sourceTitle: 'q3.xlsx' },
      '为什么下降？'
    )
    expect(parseQuotedPrompt(sourced)).toEqual({
      quote: '表格第 3 行',
      source: 'q3.xlsx',
      question: '为什么下降？',
    })
  })

  it('普通提问与不完整的写法按原文显示', () => {
    expect(parseQuotedPrompt('你好')).toBeNull()
    expect(parseQuotedPrompt('引用内容：\n只有引用没有问题')).toBeNull()
    expect(parseQuotedPrompt('引用内容吗？\n不是引用\n\n用户问题：\nx')).toBeNull()
  })

  it('被引用的文字里恰好也有「用户问题」那一行：按最后一个分隔行拆，问题不被截断', () => {
    const quote = '模型写过：\n\n用户问题：\n上次那个'
    const content = buildQuotedPrompt({ text: quote }, '这次的问题')
    expect(parseQuotedPrompt(content)).toMatchObject({ quote, question: '这次的问题' })
  })
})
