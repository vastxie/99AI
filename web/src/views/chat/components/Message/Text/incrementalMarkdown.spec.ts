import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import {
  UNSTABLE_TAIL_BLOCKS,
  parseMarkdownFully,
  parseMarkdownIncrementally,
  type IncrementalParseCache,
  type IncrementalParseResult,
} from './incrementalMarkdown'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

function signature(tokens: any[]): string {
  return tokens
    .map(token => {
      const children = token.children ? `[${signature(token.children)}]` : ''
      return `${token.type}:${token.tag}:${token.nesting}:${token.level}:${token.content}${children}`
    })
    .join('|')
}

const DOCUMENT = [
  '# 标题',
  '',
  '第一段，包含 **加粗** 和 `code`。',
  '',
  '- 列表一',
  '- 列表二',
  '',
  '  列表二的续行段落',
  '',
  '```ts',
  'const a = 1',
  'function f() {',
  '  return a',
  '}',
  '```',
  '',
  '| 表头 | 值 |',
  '| --- | --- |',
  '| a | 1 |',
  '',
  '> 引用一行',
  '> 引用两行',
  '',
  '收尾段落 $x^2$ 结束。',
].join('\n')

function streamPrefixes(text: string, step: number) {
  const prefixes: string[] = []
  for (let length = step; length < text.length; length += step) prefixes.push(text.slice(0, length))
  prefixes.push(text)
  return prefixes
}

describe('parseMarkdownIncrementally', () => {
  it('matches a full parse at every streamed prefix for a mixed document', () => {
    let cache: IncrementalParseCache | null = null
    let reusedCount = 0
    for (const step of [3, 7, 11]) {
      cache = null
      for (const prefix of streamPrefixes(DOCUMENT, step)) {
        const incremental: IncrementalParseResult = parseMarkdownIncrementally(md, prefix, cache)
        cache = incremental.cache
        if (incremental.reusedPrefix) reusedCount += 1
        expect(signature(incremental.tokens)).toBe(signature(parseMarkdownFully(md, prefix).tokens))
      }
    }
    expect(reusedCount).toBeGreaterThan(0)
  })

  it('keeps the parse frontier open for lists that continue after blank lines and setext headings', () => {
    const text = [
      '段落一',
      '',
      '- a',
      '- b',
      '',
      '  b 的续行',
      '',
      '标题文本',
      '===',
      '',
      '尾段',
    ].join('\n')
    let cache: IncrementalParseCache | null = null
    for (const prefix of streamPrefixes(text, 2)) {
      const incremental: IncrementalParseResult = parseMarkdownIncrementally(md, prefix, cache)
      cache = incremental.cache
      expect(signature(incremental.tokens)).toBe(signature(parseMarkdownFully(md, prefix).tokens))
    }
  })

  it('handles an unclosed fence at the tail and closes it later', () => {
    const text = [
      '前言',
      '',
      '第二段',
      '',
      '第三段',
      '',
      '```js',
      'let x = 1',
      'x += 1',
      '```',
      '',
      '结尾',
    ].join('\n')
    let cache: IncrementalParseCache | null = null
    for (const prefix of streamPrefixes(text, 4)) {
      const incremental: IncrementalParseResult = parseMarkdownIncrementally(md, prefix, cache)
      cache = incremental.cache
      expect(signature(incremental.tokens)).toBe(signature(parseMarkdownFully(md, prefix).tokens))
    }
  })

  it('falls back to a full parse when the source is not append-only', () => {
    const first = parseMarkdownIncrementally(md, '段落一\n\n段落二\n\n段落三\n\n段落四', null)
    const rewritten = parseMarkdownIncrementally(md, '完全不同的内容', first.cache)
    expect(rewritten.reusedPrefix).toBe(false)
    expect(signature(rewritten.tokens)).toBe(
      signature(parseMarkdownFully(md, '完全不同的内容').tokens)
    )
  })

  it('reports how many leading tokens were reused by reference', () => {
    const base = Array.from({ length: UNSTABLE_TAIL_BLOCKS + 3 }, (_, i) => `段落 ${i}`).join(
      '\n\n'
    )
    const first = parseMarkdownIncrementally(md, base, null)
    expect(first.frozenTokenCount).toBe(0)
    const next = parseMarkdownIncrementally(md, `${base}\n\n新段落`, first.cache)
    expect(next.frozenTokenCount).toBeGreaterThan(0)
    for (let index = 0; index < next.frozenTokenCount; index += 1) {
      expect(next.tokens[index]).toBe(first.tokens[index])
    }
    expect(next.tokens[next.frozenTokenCount]).not.toBe(first.tokens[next.frozenTokenCount])
    const same = parseMarkdownIncrementally(md, `${base}\n\n新段落`, next.cache)
    expect(same.frozenTokenCount).toBe(same.tokens.length)
  })

  it('reuses the frozen prefix once more than the unstable tail blocks exist', () => {
    const base = Array.from({ length: UNSTABLE_TAIL_BLOCKS + 2 }, (_, i) => `段落 ${i}`).join(
      '\n\n'
    )
    const first = parseMarkdownIncrementally(md, base, null)
    const next = parseMarkdownIncrementally(md, `${base}\n\n新段落`, first.cache)
    expect(next.reusedPrefix).toBe(true)
    expect(signature(next.tokens)).toBe(
      signature(parseMarkdownFully(md, `${base}\n\n新段落`).tokens)
    )
  })
})
