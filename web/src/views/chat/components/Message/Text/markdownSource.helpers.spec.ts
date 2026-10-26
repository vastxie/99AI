import { describe, expect, it } from 'vitest'
import {
  MARKDOWN_SENTINEL,
  getAssistantMarkdownSource,
  getStreamingMarkdownSource,
} from './markdownSource.helpers'
import { messageMarkdown } from './messageMarkdown'

const SENTINELS = Object.values(MARKDOWN_SENTINEL).join('')
const hasSentinel = (value: string) => new RegExp(`[${SENTINELS}]`, 'u').test(value)

describe('markdownSource.helpers 的哨兵注入', () => {
  it('围栏代码块内的强调写法不被注入哨兵', () => {
    const source = ['前言', '```markdown', '**\u201c重点\u201d**说明', '```', '结尾'].join('\n')
    const out = getAssistantMarkdownSource(source)
    const fence = out.slice(out.indexOf('```'), out.lastIndexOf('```'))

    expect(hasSentinel(fence)).toBe(false)
    expect(fence).toContain('**\u201c重点\u201d**说明')
  })

  it('行内代码内的强调写法不被注入哨兵', () => {
    const out = getAssistantMarkdownSource('用 `**\u201c测试\u201d**后` 表示')
    const inline = out.slice(out.indexOf('`'), out.lastIndexOf('`') + 1)

    expect(hasSentinel(inline)).toBe(false)
  })

  it('代码块内的引用角标写法不被改写成链接', () => {
    const source = ['```text', '[[1](https://example.com)]', '```'].join('\n')
    const out = getAssistantMarkdownSource(source)

    expect(out).toContain('[[1](https://example.com)]')
    expect(hasSentinel(out)).toBe(false)
  })

  it('代码块之外的强调与引用角标仍会被正常注入', () => {
    const out = getAssistantMarkdownSource(
      '这是**\u201c重点\u201d**说明 [[1](https://example.com)] 结束'
    )

    expect(out).toContain(MARKDOWN_SENTINEL.strongOpen)
    expect(out).toContain(MARKDOWN_SENTINEL.strongClose)
    expect(out).toContain(MARKDOWN_SENTINEL.reference)
  })

  it('模型输出自带私有区字符时先被剥离，无法伪造标记', () => {
    const forged = `A${MARKDOWN_SENTINEL.strongOpen}B${MARKDOWN_SENTINEL.reference}C`
    const out = getAssistantMarkdownSource(forged)

    expect(hasSentinel(out)).toBe(false)
    expect(out).toBe('ABC')
  })

  it('流式未闭合公式仍会被哨兵包裹，且内容按字面量转义', () => {
    const out = getStreamingMarkdownSource('价格是 $100 * 2')

    expect(out).toContain(MARKDOWN_SENTINEL.pendingMathOpen)
    expect(out).toContain(MARKDOWN_SENTINEL.pendingMathClose)
    expect(out).toContain('\\$100')
  })
})

describe('markdownSource.helpers 不改写代码字面量', () => {
  it('围栏代码块里的 \\( \\) \\[ \\] 原样保留', () => {
    const code = ['```python', 'pattern = r"\\(\\d+\\)"', 'items = r"\\[a\\]"', '```'].join('\n')
    const shell = ['```bash', "find . \\( -name '*.log' -o -name '*.tmp' \\) -delete", '```'].join(
      '\n'
    )
    expect(getAssistantMarkdownSource(code)).toBe(code)
    expect(getAssistantMarkdownSource(shell)).toBe(shell)
  })

  it('行内代码里的 \\( 原样保留，正文里的公式定界符照常转换', () => {
    const out = getAssistantMarkdownSource('正则 `\\(\\d+\\)` 匹配括号数字，面积 \\( \\pi r^2 \\)')
    expect(out).toContain('`\\(\\d+\\)`')
    expect(out).toContain('$\\pi r^2$')
  })

  it('围栏代码里的私有下载地址保留，正文里的私有下载链接照常去掉', () => {
    const url = '/api/files/file_abc123/download'
    const code = ['```bash', `curl -O ${url}`, '```'].join('\n')
    expect(getAssistantMarkdownSource(code)).toBe(code)

    // 链接文字里带行内代码时整条链接仍要去掉，不能只剩一个空链接
    const out = getAssistantMarkdownSource(`结果见 [\`report.xlsx\`](${url}) 。`)
    expect(out).not.toContain(url)
    expect(out).not.toContain('](')
  })

  it('多行围栏代码块的后续行和未闭合的代码块同样整段保留', () => {
    const multi = [
      '```text',
      'line one',
      '**\u201c重点\u201d**说明',
      '[[1](https://example.com)]',
      '\\(x\\)',
      '```',
    ].join('\n')
    expect(getAssistantMarkdownSource(multi)).toBe(multi)

    const unclosed = ['```js', 'a', 'const re = /\\(\\d\\)/'].join('\n')
    expect(getAssistantMarkdownSource(unclosed)).toBe(unclosed)
  })

  it('更长的围栏和波浪线围栏同样整段保留，内部较短的 ``` 不会提前闭合', () => {
    const nested = [
      '````markdown',
      '```js',
      'const re = /\\(x\\)/',
      '```',
      '````',
      '后文 \\(y\\)',
    ].join('\n')
    const out = getAssistantMarkdownSource(nested)
    expect(out).toContain(
      ['````markdown', '```js', 'const re = /\\(x\\)/', '```', '````'].join('\n')
    )
    expect(out).toContain('后文 $y$')

    const tilde = ['~~~sh', "find . \\( -name '*.log' \\)", '~~~'].join('\n')
    expect(getAssistantMarkdownSource(tilde)).toBe(tilde)
  })

  it('行内代码里的私有下载地址原样保留', () => {
    const out = getAssistantMarkdownSource('接口是 `/api/files/file_abc123/download`，不要直接打开')
    expect(out).toContain('`/api/files/file_abc123/download`')
  })

  it('流式期间波浪线围栏里的 \\( 不被当成未闭合公式', () => {
    const source = ['~~~js', 'const re = /\\(/', '~~~', '继续'].join('\n')
    const out = getStreamingMarkdownSource(source)
    expect(hasSentinel(out)).toBe(false)
    expect(out).toContain('const re = /\\(/')
  })

  it('混合字符不会提前闭合围栏，引用块里的代码同样保留', () => {
    const mixed = ['```js', 'const a = /\\(x\\)/', '~~~', 'const b = /\\(y\\)/', '```'].join('\n')
    expect(getAssistantMarkdownSource(mixed)).toBe(mixed)

    const quoted = ['> ```js', '> const re = /\\(x\\)/', '> ```', '', '正文 \\(y\\)'].join('\n')
    const out = getAssistantMarkdownSource(quoted)
    expect(out).toContain('> const re = /\\(x\\)/')
    expect(out).toContain('正文 $y$')
  })

  it('列表首行的围栏、代码正文里的「> ```」都按 markdown-it 识别为代码', () => {
    const listed = ['- ```js', '  const re = /\\(x\\)/', '  ```', '', '正文 \\(y\\)'].join('\n')
    const out = getAssistantMarkdownSource(listed)
    expect(out).toContain('  const re = /\\(x\\)/')
    expect(out).toContain('正文 $y$')

    const quotedLine = [
      '```',
      '> ```',
      'curl /api/files/file_demo/download',
      '\\(x\\)',
      '```',
    ].join('\n')
    expect(getAssistantMarkdownSource(quotedLine)).toBe(quotedLine)
  })

  it('流式期间还没写完的行内代码里的 \\( 不会开启待定公式', () => {
    const out = getStreamingMarkdownSource('正在写 `re = /\\(')
    expect(hasSentinel(out)).toBe(false)
  })

  it('流式期间双反引号行内代码里的 $ 不会开启待定公式', () => {
    const out = getStreamingMarkdownSource('价格写成 ``$x`` 即可，后面还有正文')
    expect(hasSentinel(out)).toBe(false)
    expect(out).toContain('``$x``')
  })

  it('公式块之后的缩进代码与渲染器一样算代码', () => {
    const source = ['$$', 'x=1', '$$', '    \\(x\\)'].join('\n')
    expect(getAssistantMarkdownSource(source)).toContain('    \\(x\\)')
  })

  it('孤立的反引号不会跨标题、列表项、引用块段落或单独的 \\r 去配对真正的行内代码', () => {
    const cases = [
      '# 标题 `\n正文 `\\(x\\)`',
      '- 第一项 `\n- 第二项 `\\(x\\)`',
      '> 一段 `\n>\n> 二段 `\\(x\\)`',
      '一段 `\r\r二段 `\\(x\\)`',
    ]
    for (const source of cases) {
      expect(getAssistantMarkdownSource(source), JSON.stringify(source)).toContain('`\\(x\\)`')
    }
  })

  it('表格单元格里的行内代码同样保留，孤立的反引号不跨单元格配对', () => {
    const table = [
      '| 说明 ` | `\\(h\\)` |',
      '| --- | --- |',
      '| `\\(x\\)` | `/api/files/file_demo/download` |',
      '| `a \\| \\(y\\)` | `\\(z\\)` |',
    ].join('\n')
    for (const out of [getAssistantMarkdownSource(table), getStreamingMarkdownSource(table)]) {
      expect(out).toContain('`\\(h\\)`')
      expect(out).toContain('`\\(x\\)`')
      expect(out).toContain('`/api/files/file_demo/download`')
      expect(out).toContain('`a \\| \\(y\\)`')
      expect(out).toContain('`\\(z\\)`')
    }
  })

  it('单元格里竖线前有多个反斜杠时与 markdown-it 一样按转义处理', () => {
    for (const slashes of ['\\\\', '\\\\\\\\']) {
      const table = [
        '| a | b |',
        '| --- | --- |',
        `| \`a ${slashes}| \\(x\\) /api/files/file_demo/download\` | ok |`,
      ].join('\n')
      for (const out of [getAssistantMarkdownSource(table), getStreamingMarkdownSource(table)]) {
        expect(out).toContain('\\(x\\) /api/files/file_demo/download`')
      }
    }
  })

  it('整条写在行内代码里的私有下载链接原样保留', () => {
    const source = '示例：`[report.pdf](/api/files/file_demo/download)`'
    expect(getAssistantMarkdownSource(source)).toBe(source)
  })

  it('流式期间代码字符串里的 ~~~ 不会被当成围栏结束', () => {
    const source = ['```js', "const fence = '~~~'", 'const re = /\\(/', '```', '继续'].join('\n')
    const out = getStreamingMarkdownSource(source)
    expect(hasSentinel(out)).toBe(false)
    expect(out).toContain('const re = /\\(/')
  })

  it('超长单行与大量连续短代码块都能快速处理（耗时随长度线性增长）', () => {
    const started = performance.now()
    getStreamingMarkdownSource('~'.repeat(200_000))
    getAssistantMarkdownSource(`${'~'.repeat(100_000)}\n\\(x\\)`)
    expect(performance.now() - started).toBeLessThan(1000)

    // 32 万字符的连续短代码块：线性实现本机约 0.2 秒，平方级实现要 4 秒以上
    const fences = '```\nx\n```\n'.repeat(32_000)
    const fencesStarted = performance.now()
    getAssistantMarkdownSource(fences)
    getStreamingMarkdownSource(fences)
    expect(performance.now() - fencesStarted).toBeLessThan(3000)
  })

  it('流式期间代码里的 \\( 不被当成未闭合公式', () => {
    const source = ['```js', 'const re = /\\(/', '```', '继续'].join('\n')
    const out = getStreamingMarkdownSource(source)
    expect(hasSentinel(out)).toBe(false)
    expect(out).toContain('const re = /\\(/')
  })
})

describe('显示公式 \\[ … \\] 与流式待定区', () => {
  const { pendingMathOpen: OPEN, pendingMathClose: CLOSE } = MARKDOWN_SENTINEL
  const parse = (source: string) => messageMarkdown.parse(source, {})
  const allTokens = (source: string) =>
    parse(source).flatMap(token => [token, ...(token.children ?? [])])
  const streamTokens = (text: string) => allTokens(getStreamingMarkdownSource(text))
  const mathTypes = new Set(['math_display', 'math_inline', 'math_block'])
  const hasMath = (text: string) => streamTokens(text).some(token => mathTypes.has(token.type))
  const OPENERS = ['$u', '\\(u', '$$u', '\\[u']

  it('静态：\\[ \\] 不再改写成 $，交给 math_display；\\( \\) 照旧；停止后未闭合的 \\[x 显示为 [x', () => {
    expect(getAssistantMarkdownSource('a \\[x\\] b')).toBe('a \\[x\\] b')
    expect(getAssistantMarkdownSource('a \\( x \\) b')).toBe('a $x$ b')
    expect(allTokens(getAssistantMarkdownSource('a \\[x\\] b')).map(token => token.type)).toContain(
      'math_display'
    )
    const stopped = allTokens(getAssistantMarkdownSource('a \\[x'))
    expect(stopped.some(token => mathTypes.has(token.type))).toBe(false)
    expect(
      stopped
        .filter(token => token.type === 'text' || token.type === 'text_special')
        .map(token => token.content)
        .join('')
    ).toBe('a [x')
  })

  it('稳定区开的图片 / 链接标签不被待定区的 ] 闭合（四种开符，有引用定义）', () => {
    const definition = '[r]: https://example.com/a.png\n\n'
    const cases = [
      ...OPENERS.map(opener => `${definition}![caption ${opener}][r]`),
      `${definition}![caption \\[u]][r]`,
      '[caption $u](https://example.com)',
    ]
    for (const text of cases) {
      const tokens = streamTokens(text)
      expect(
        tokens.some(token => token.type === 'image' || token.type === 'link_open'),
        text
      ).toBe(false)
      for (const token of tokens) {
        for (const [, value] of token.attrs ?? []) expect(value).not.toMatch(/[\uE000-\uE004]/u)
      }
    }
  })

  it('待定区里的 [x](y)、[x] 有无引用定义都不成为链接；待定区里没有任何公式', () => {
    for (const prefix of ['', '[x]: https://example.com\n\n']) {
      for (const opener of OPENERS) {
        const text = `${prefix}${opener} [x](y) [x]`
        expect(
          streamTokens(text).some(token => token.type === 'link_open'),
          text
        ).toBe(false)
      }
    }
    for (const opener of OPENERS) {
      expect(hasMath(`${opener}\n\n[x] \\[x\\] 普通文字\n\n第三段 \\[y\\]`), opener).toBe(false)
    }
    expect(hasMath('文字 \\[x] 后文')).toBe(false)
    expect(streamTokens('$$\nx\n$$').map(token => token.type)).toContain('math_block')
  })

  it('待定区进入缩进代码块：代码里的方括号是原样的 [ 与转义的 \\]，没有哨兵；引用里的续行不形成代码块', () => {
    const code = parse(getStreamingMarkdownSource('$u\n\n    [x] abc\\def')).find(
      token => token.type === 'code_block'
    )
    expect(code?.content.replace(/[\uE000-\uE004]/gu, '')).toBe('[x\\] abc\\\\def\n')
    const quoted = parse(getStreamingMarkdownSource('> $u\n>\n>     [x] abc\\def'))
    expect(quoted.some(token => token.type === 'code_block')).toBe(false)
    const stable = parse(getAssistantMarkdownSource('> 段落\n>\n>     [x] abc\\def')).find(
      token => token.type === 'code_block'
    )
    expect(stable?.content).toBe('[x] abc\\def\n')
  })

  it('稳定区改写留下的反斜杠紧贴开哨兵：显示公式不越过开哨兵配到待定区的 \\]', () => {
    for (const opener of ['$c', '\\(c', '$$c', '\\[c']) {
      for (const count of [1, 3, 5]) {
        const slashes = '\\'.repeat(count)
        const text = `[a\\](/api/files/file_x/download)[ b ] [z${slashes}](/api/files/file_y/download)${opener}]`
        const source = getStreamingMarkdownSource(text)
        expect(source, text).toContain(`z${slashes}${OPEN}`)
        expect(
          allTokens(source).some(token => token.type === 'math_display'),
          text
        ).toBe(false)
      }
    }
    expect(hasMath('[a\\](/api/files/file_x/download)[ b $c]')).toBe(false)
  })

  it('模型自带的私有区字符在待定区里也被剥掉：只剩一对待定哨兵', () => {
    const out = getStreamingMarkdownSource(`$a${CLOSE}b${MARKDOWN_SENTINEL.strongOpen}c`)
    expect([...out].filter(char => char === OPEN)).toHaveLength(1)
    expect([...out].filter(char => char === CLOSE)).toHaveLength(1)
    expect(out).not.toContain(MARKDOWN_SENTINEL.strongOpen)
    expect(out.endsWith(CLOSE)).toBe(true)
  })
})
