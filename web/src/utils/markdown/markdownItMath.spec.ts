import mdKatex from '@traptitech/markdown-it-katex'
import katex from 'katex'
import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import { markdownItMath, type MathRenderer } from './markdownItMath'

const BLOCK_CLASS = 'katexmath-block p-0 flex h-full items-center justify-start'

const CASES = [
  'Inline $E=mc^2$ and $a_1$.',
  'Money $5 and $10 stays text.',
  'Escaped \\$not math\\$ here.',
  '$$\n\\int_0^1 x^2 dx\n$$',
  '$$ \\frac{a}{b} $$',
  '- item with $x^2$\n- next',
  'Broken $\\frac{a}{$ formula.',
  '$$\n\\badcommand{x}\n$$',
]

function render(md: InstanceType<typeof MarkdownIt>, source: string) {
  return md.render(source)
}

describe('消息正文的公式切分（取自 @traptitech/markdown-it-katex）', () => {
  it('KaTeX 已加载时，与原插件的输出逐字节一致（含报错时的降级）', () => {
    const vendored = new MarkdownIt().use(markdownItMath, {
      katex: () => katex,
      blockClass: BLOCK_CLASS,
      katexOptions: { errorColor: 'var(--semantic-danger)' },
    })
    const original = new MarkdownIt().use(mdKatex, {
      blockClass: BLOCK_CLASS,
      errorColor: 'var(--semantic-danger)',
    })
    for (const source of CASES) {
      expect(render(vendored, source), source).toBe(render(original, source))
    }
  })

  it('KaTeX 还没加载：公式先按转义后的 TeX 源码显示，不丢内容、不注入 HTML', () => {
    const md = new MarkdownIt().use(markdownItMath, { katex: () => null, blockClass: 'block' })
    const inline = md.render('a $x<y$ b')
    expect(inline).toContain('<span class="katex-pending">x&lt;y</span>')
    const block = md.render('$$\n<b>\n$$')
    expect(block).toContain('<p class="katex-block katex-pending block">&lt;b&gt;')
  })

  it('加载完成后同一个实例改出排版结果（每次渲染时才取 KaTeX）', () => {
    let current: MathRenderer | null = null
    const md = new MarkdownIt().use(markdownItMath, { katex: () => current })
    expect(md.render('$x$')).toContain('katex-pending')
    current = katex
    expect(md.render('$x$')).toContain('class="katex"')
  })
})

describe('显示公式 \\[ … \\]（行内规则 math_display）', () => {
  const BARRIER = String.fromCharCode(0xe003)
  const END = String.fromCharCode(0xe004)
  const md = new MarkdownIt().use(markdownItMath, {
    katex: () => null,
    displayScanBarrier: BARRIER,
  })
  const inlineTokens = (source: string) =>
    md.parse(source, {}).flatMap(token => token.children ?? [])
  const displays = (source: string) =>
    inlineTokens(source)
      .filter(token => token.type === 'math_display')
      .map(token => token.content)
  const typesOf = (source: string) => md.parse(source, {}).map(token => token.type)

  it('单行、段中、同一段跨行都成为显示公式；渲染为 displayMode 的 KaTeX，未加载时显示 TeX 源码', () => {
    expect(displays('\\[x^2\\]')).toEqual(['x^2'])
    expect(displays('文字 \\[a+b\\] 文字')).toEqual(['a+b'])
    expect(displays('\\[a\nb\\]')).toEqual(['a\nb'])
    expect(md.render('文字 \\[x<y\\] 文字')).toBe(
      '<p>文字 <span class="katex-pending">x&lt;y</span> 文字</p>\n'
    )
    const typeset = new MarkdownIt().use(markdownItMath, { katex: () => katex })
    const html = typeset.render('文字 \\[\\frac{a}{b}\\] 文字')
    expect(html.startsWith('<p>文字 <span class="katex-display">')).toBe(true)
    expect(typeset.render('\\[\\frac{a}{\\]')).toContain("class='katex-error'")
  })

  it('列表项、引用、表格单元格里的公式留在原容器；跨段、跨单元格的一对不成公式', () => {
    expect(typesOf('- \\[x\\]\n- y')).toContain('bullet_list_open')
    expect(displays('- \\[x\\]\n- y')).toEqual(['x'])
    expect(displays('> \\[x\\]')).toEqual(['x'])
    expect(displays('> \\[x\n>\n> y\\]')).toEqual([])
    expect(displays('\\[x\n\ny\\]')).toEqual([])
    expect(displays('| a | b |\n| --- | --- |\n| \\[x\\] | y |')).toEqual(['x'])
    expect(displays('| a | b |\n| --- | --- |\n| \\[x | y\\] |')).toEqual([])
  })

  it('反斜杠奇偶：转义的 \\\\[ 不是开符，转义的 \\\\] 不是闭符；矩阵换行 \\\\\\\\ 不截断公式', () => {
    for (let count = 1; count <= 6; count += 1) {
      const open = '\\'.repeat(count) + '['
      const opens = count % 2 === 1
      expect(displays(`${open}x\\]`).length, `开符前 ${count} 个反斜杠`).toBe(opens ? 1 : 0)
      const close = '\\'.repeat(count) + ']'
      expect(displays(`\\[x${close}`).length, `闭符前 ${count} 个反斜杠`).toBe(
        count % 2 === 1 ? 1 : 0
      )
    }
    expect(displays('\\[a\\\\b\\]')).toEqual(['a\\\\b'])
    expect(displays('\\[a \\\\] b\\]')).toEqual(['a \\\\] b'])
  })

  it('不跨行内代码：闭符在代码里、代码夹在两个定界符之间都不成公式，代码完整', () => {
    const crossing = inlineTokens('\\[a `b\\]` c')
    expect(crossing.some(token => token.type === 'math_display')).toBe(false)
    expect(crossing.find(token => token.type === 'code_inline')?.content).toBe('b\\]')
    expect(displays('\\[a `code` b\\]')).toEqual([])
  })

  it('链接文字里的公式照常，链接目标不被改写；与 $…$ 相邻、交错', () => {
    const link = inlineTokens('[\\[x\\]](https://example.com/a)')
    expect(link.map(token => token.type)).toEqual(['link_open', 'math_display', 'link_close'])
    const target = inlineTokens('[a](https://example.com/\\[y\\])')
    expect(target.some(token => token.type === 'math_display')).toBe(false)
    expect(target[0].attrGet('href')).not.toContain('$')
    expect(inlineTokens('$a$ \\[b\\] $c$').map(token => token.type)).toEqual([
      'math_inline',
      'text',
      'math_display',
      'text',
      'math_inline',
    ])
    expect(displays('\\[x\\]2')).toEqual(['x'])
  })

  it('闭符扫描不越过开哨兵：哨兵前奇数个反斜杠也不能跳过它；闭符完整在哨兵之前时照常', () => {
    for (let count = 0; count <= 6; count += 1) {
      const slashes = '\\'.repeat(count)
      // 开哨兵之后是待定区转义出来的 \]：不能配到它
      expect(displays(`\\[ a ${slashes}${BARRIER}\\$b\\]${END}`), `哨兵前 ${count} 个`).toEqual([])
      // 合法闭符完整在哨兵之前：成功
      expect(displays(`\\[ a ${slashes}${slashes}\\] c ${BARRIER}\\$b\\]${END}`)).toEqual([
        ` a ${slashes}${slashes}`,
      ])
      // 合法闭符之后、紧贴开哨兵还有偶数个反斜杠：不影响已经找到的闭符
      expect(
        displays(`\\[ a \\]${'\\'.repeat(count * 2)}${BARRIER}\\$b\\]${END}`),
        `闭符后紧贴哨兵 ${count * 2} 个`
      ).toEqual([' a '])
    }
  })

  it('大量未闭合的开符：整段解析保持线性（不随开符数平方增长）', () => {
    const plain = new MarkdownIt().use(markdownItMath, { katex: () => null })
    const timed = (instance: InstanceType<typeof MarkdownIt>, source: string) => {
      const started = performance.now()
      instance.parse(source, {})
      return performance.now() - started
    }
    // 每个 \[ 都没有闭符；以前每个开符都重扫到结尾，16 万字符要 3 秒以上
    expect(timed(plain, '\\[a] '.repeat(32_000))).toBeLessThan(1000)
    expect(timed(md, '\\[a] '.repeat(32_000) + `${BARRIER}\\$b\\]${END}`)).toBeLessThan(1000)
    // 夹着链接（链接文字以更小的 posMax 嵌套解析）与行内代码
    expect(timed(plain, '\\[a [l](u) '.repeat(16_000))).toBeLessThan(1000)
    expect(timed(plain, '\\[a `b` '.repeat(16_000))).toBeLessThan(1000)
    // 有闭符时第一个开符照常配到它（开符之间的文字都在公式里）；被反引号截断的开符失败后，后面的公式照常识别
    expect(displays(`${'\\[a] '.repeat(3)}\\[x\\]`)).toEqual(['a] \\[a] \\[a] \\[x'])
    expect(displays(`\\[a \`b\` \\[c\\]`)).toEqual(['c'])
    expect(displays(`\\[a \`b\` \\[c \`d\` \\[e\\]`)).toEqual(['e'])
  })

  it('开哨兵查找的记录只在仍覆盖查询位置时复用：越过哨兵之后、往回查询时都重新查找', () => {
    // 哨兵之后的开符：前一个开符记下的哨兵位置已在它之前，要重新找（之后没有哨兵，上界回到 posMax）
    expect(displays(`\\[ a ${BARRIER} b \\[c\\]`)).toEqual(['c'])
    const rule = (md.inline.ruler as any).__rules__.find(
      (item: { name: string }) => item.name === 'math_display'
    ).fn
    // 同一段内容先在后面查询、再往回查询：往回时第一个哨兵在更前面，不能沿用后面那次的结果
    const src = `\\[x ${BARRIER}\\] y \\[z ${BARRIER}`
    const state = new md.inline.State(src, md, {}, [])
    state.pos = src.indexOf('\\[z')
    expect(rule(state, true)).toBe(false)
    state.pos = 0
    expect(rule(state, true)).toBe(false)
    expect(state.pos).toBe(0)
  })

  it('失败记录按 posMax 隔离：同一段内容在截断与完整的 posMax 之间来回，结果各自正确', () => {
    const rule = (md.inline.ruler as any).__rules__.find(
      (item: { name: string }) => item.name === 'math_display'
    ).fn
    const state = new md.inline.State('\\[x\\]', md, {}, [])
    for (const [posMax, expected] of [
      [4, false],
      [5, true],
      [4, false],
      [5, true],
    ] as const) {
      state.pos = 0
      state.posMax = posMax
      expect(rule(state, true), `posMax=${posMax}`).toBe(expected)
      expect(state.pos).toBe(expected ? 5 : 0)
    }
    expect(state.tokens).toEqual([])
  })

  it('规则本身：posMax 截断闭符时失败且不改状态；silent 成功也推进位置但不建 token', () => {
    const rule = (md.inline.ruler as any).__rules__.find(
      (item: { name: string }) => item.name === 'math_display'
    ).fn
    const make = (src: string) => new md.inline.State(src, md, {}, [])
    const truncated = make('\\[x\\]')
    truncated.posMax = 4
    expect(rule(truncated, false)).toBe(false)
    expect(truncated.pos).toBe(0)
    expect(truncated.tokens).toEqual([])
    const silent = make('\\[x\\] y')
    expect(rule(silent, true)).toBe(true)
    expect(silent.pos).toBe(5)
    expect(silent.tokens).toEqual([])
    const plain = make('[x]')
    expect(rule(plain, false)).toBe(false)
  })
})
