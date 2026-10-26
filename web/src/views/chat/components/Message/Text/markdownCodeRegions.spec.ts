import { describe, expect, it } from 'vitest'
import { scanCodeRegions } from './markdownCodeRegions'

const slices = (value: string, regions = scanCodeRegions(value)) =>
  regions.map(region => value.slice(region.start, region.end))

describe('markdownCodeRegions', () => {
  it('只有同种字符且不短于开头的一行才闭合围栏', () => {
    const backtick = ['```js', 'a', '~~~', '```~~~', 'b', '```', 'after'].join('\n')
    expect(slices(backtick)).toEqual([['```js', 'a', '~~~', '```~~~', 'b', '```'].join('\n')])

    const long = ['````md', '```js', 'x', '```', '````', 'after'].join('\n')
    expect(slices(long)).toEqual([['````md', '```js', 'x', '```', '````'].join('\n')])

    const tilde = ['~~~', '```', 'x', '~~~'].join('\n')
    expect(slices(tilde)).toEqual([tilde])
  })

  it('未闭合的围栏到结尾为止；语言标注里带反引号的一行不是围栏', () => {
    const unclosed = ['text', '```py', 'a', 'b'].join('\n')
    expect(slices(unclosed)).toEqual([['```py', 'a', 'b'].join('\n')])
    expect(scanCodeRegions('```js ` not a fence\nplain')).toEqual([])
  })

  it('识别引用块里的围栏，引用块结束时代码块随之结束', () => {
    const quoted = ['> ```js', '> a', '> ```', 'after'].join('\n')
    expect(slices(quoted)).toEqual([['> ```js', '> a', '> ```'].join('\n')])

    const leaving = ['> ```js', '> a', 'outside', '```js', 'b', '```'].join('\n')
    expect(slices(leaving)).toEqual([
      ['> ```js', '> a'].join('\n'),
      ['```js', 'b', '```'].join('\n'),
    ])
  })

  it('与 markdown-it 一致：代码正文里的「> ```」不闭合，列表首行的围栏与缩进代码块都算代码', () => {
    const quotedLine = ['```', 'c', '> ```', 'd', '```', 'after'].join('\n')
    expect(slices(quotedLine)).toEqual([['```', 'c', '> ```', 'd', '```'].join('\n')])

    const listed = ['- ```js', '  a', '  ```', 'after'].join('\n')
    expect(slices(listed)).toEqual([['- ```js', '  a', '  ```'].join('\n')])

    const indented = ['para', '', '    \\(x\\)', '', 'after'].join('\n')
    expect(slices(indented)).toEqual(['    \\(x\\)'])
  })

  it('行内代码按反引号串长度配对，未配对与被转义的反引号是普通文字', () => {
    expect(slices('a `x` b ``y ` z`` c')).toEqual(['`x`', '``y ` z``'])
    expect(slices('lonely ` tick and `code`')).toEqual(['` tick and `'])
    // 与 markdown-it 一致：被转义的反引号是普通文字，之后的一对组成行内代码
    expect(slices('escaped \\`not code` but `code`')).toEqual(['` but `'])
    // 行内代码不跨段落
    expect(slices('a `open\n\nnext` b')).toEqual([])
  })

  it('超长单行保持线性耗时', () => {
    for (const value of ['~'.repeat(200_000), '`a'.repeat(100_000), '`'.repeat(200_000)]) {
      const started = performance.now()
      scanCodeRegions(value)
      expect(performance.now() - started).toBeLessThan(500)
    }
  })
})
