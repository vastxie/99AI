/*
 * Markdown 里的数学公式：$…$（行内）与 $$…$$（独立成块）取自 @traptitech/markdown-it-katex；
 * \[ … \]（显示公式）是本仓库加的行内规则 math_display（见 mathDisplay）。
 *
 * $ 与 $$ 的切分规则与输出结构取自 @traptitech/markdown-it-katex 3.6.0，逐条保持一致；
 * 原插件在模块加载时就 require('katex')，会把整份 KaTeX 打进首屏，这里只保留切分与包裹，
 * KaTeX 由调用方按需提供（还没加载时公式先显示为 TeX 源码）。
 *
 * 原插件的许可（MIT）：
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2016 Waylon Flinn
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type { MarkdownIt } from 'markdown-it'

/** 渲染公式需要的那一点 KaTeX 接口 */
export interface MathRenderer {
  renderToString(tex: string, options: Record<string, unknown>): string
}

export interface MarkdownItMathOptions {
  /** 当前可用的 KaTeX；还没加载时返回 null，公式先按 TeX 源码显示（调用方负责加载完成后重新渲染） */
  katex: () => MathRenderer | null
  /** 块级公式外层 <p> 的附加 class */
  blockClass?: string
  /** 传给 KaTeX 的其余设置（如 errorColor） */
  katexOptions?: Record<string, unknown>
  /**
   * 显示公式的闭符扫描遇到这个字符即止（消息正文传流式待定区的开哨兵）：
   * 待定区里有转义出来的 \]，稳定区的开符不能越过开哨兵配到它
   */
  displayScanBarrier?: string
}

type StateInline = Parameters<MarkdownIt['inline']['ruler']['push']>[1] extends (
  state: infer S,
  ...args: any[]
) => any
  ? S
  : never
type StateBlock = Parameters<MarkdownIt['block']['ruler']['push']>[1] extends (
  state: infer S,
  ...args: any[]
) => any
  ? S
  : never

/** 是否可以作为开始 / 结束的 $（假定 state.src[pos] 是 $） */
function isValidDelim(state: StateInline, pos: number) {
  const max = state.posMax
  let canOpen = true
  let canClose = true
  const prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1
  const nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1

  // 前面是空白、或后面紧跟数字：不能作为结束；后面是空白：不能作为开始
  if (prevChar === 0x20 || prevChar === 0x09 || (nextChar >= 0x30 && nextChar <= 0x39)) {
    canClose = false
  }
  if (nextChar === 0x20 || nextChar === 0x09) canOpen = false
  return { canOpen, canClose }
}

function mathInline(state: StateInline, silent: boolean) {
  if (state.src[state.pos] !== '$') return false

  let delim = isValidDelim(state, state.pos)
  if (!delim.canOpen) {
    if (!silent) state.pending += '$'
    state.pos += 1
    return true
  }

  // 跳过转义的 $，找到第一个没被转义的结束符
  const start = state.pos + 1
  let match = start
  while ((match = state.src.indexOf('$', match)) !== -1) {
    let pos = match - 1
    while (state.src[pos] === '\\') pos -= 1
    if ((match - pos) % 2 === 1) break
    match += 1
  }

  // 没有结束符：把 $ 当普通字符
  if (match === -1) {
    if (!silent) state.pending += '$'
    state.pos = start
    return true
  }

  // 空公式 $$：不解析
  if (match - start === 0) {
    if (!silent) state.pending += '$$'
    state.pos = start + 1
    return true
  }

  delim = isValidDelim(state, match)
  if (!delim.canClose) {
    if (!silent) state.pending += '$'
    state.pos = start
    return true
  }

  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.markup = '$'
    token.content = state.src.slice(start, match)
  }
  state.pos = match + 1
  return true
}

/** 同一段行内内容的显示公式扫描记录（按 StateInline）：未闭合的开符很多时，每个开符都重新扫到结尾会变成平方级 */
interface DisplayScanMemo {
  /** 按 posMax 分开记（链接文字会以更小的 posMax 嵌套解析）：上一次失败的开符位置与扫描停下的位置 */
  failures: Map<number, { from: number; stop: number }>
  /** 开哨兵查找：barrierFrom 之后第一个开哨兵在 barrierAt（-1 表示没有） */
  barrierFrom: number
  barrierAt: number
}
const displayScanMemos = new WeakMap<StateInline, DisplayScanMemo>()

function nextBarrierAt(memo: DisplayScanMemo, src: string, barrier: string, from: number) {
  // 查询位置只往后走：上次的结果仍覆盖 from 时直接用（之间没有开哨兵）
  if (
    memo.barrierFrom === -1 ||
    from < memo.barrierFrom ||
    (memo.barrierAt !== -1 && from > memo.barrierAt)
  ) {
    memo.barrierFrom = from
    memo.barrierAt = src.indexOf(barrier, from)
  }
  return memo.barrierAt
}

/**
 * 显示公式 \[ … \]：只在当前位置是 \[ 时尝试（注册在 escape 之前；\\[ 的第一个反斜杠已被 escape 成对消费，
 * 轮不到这里）。在本块的行内内容里（posMax 之内，不跨段落、列表项、表格单元格）向后找第一个有效的 \]：
 * 遇到反斜杠时若下一个字符是 ] 就是闭符，否则连同下一个字符一起跳过（转义对）；遇到反引号放弃（不跨行内代码）；
 * 扫描上界还截到 barrier（流式待定区的开哨兵）之前，任何跳步都不能越过。
 * 找到闭符时不论是否 silent 都把位置推进到闭符之后（链接标签探测要求），只有非 silent 才建 token；找不到不改状态。
 *
 * 失败会记下来：后面的开符若完整落在已经扫过、没有闭符的区间里，从它开始扫也找不到（开符本身是 \[ 两个字符，
 * 前一次扫描经过它之后与从它开始的扫描在开符后对齐），直接失败，整段保持线性
 */
function mathDisplay(barrier: string | undefined) {
  return (state: StateInline, silent: boolean) => {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x5c || state.src.charCodeAt(start + 1) !== 0x5b) {
      return false
    }
    let memo = displayScanMemos.get(state)
    if (!memo) {
      memo = { failures: new Map(), barrierFrom: -1, barrierAt: -1 }
      displayScanMemos.set(state, memo)
    }
    const failure = memo.failures.get(state.posMax)
    if (failure && start >= failure.from && start + 2 <= failure.stop) return false
    const barrierAt = barrier ? nextBarrierAt(memo, state.src, barrier, start + 2) : -1
    const limit = barrierAt === -1 ? state.posMax : Math.min(state.posMax, barrierAt)
    let pos = start + 2
    while (pos < limit) {
      const code = state.src.charCodeAt(pos)
      if (code === 0x60) break
      if (code !== 0x5c) {
        pos += 1
        continue
      }
      if (pos + 1 < limit && state.src.charCodeAt(pos + 1) === 0x5d) {
        if (!silent) {
          const token = state.push('math_display', 'math', 0)
          token.markup = '\\['
          token.content = state.src.slice(start + 2, pos)
        }
        state.pos = pos + 2
        return true
      }
      pos += 2
    }
    memo.failures.set(state.posMax, { from: start, stop: Math.min(pos, limit) })
    return false
  }
}

function mathBlock(state: StateBlock, start: number, end: number, silent: boolean) {
  let pos = state.bMarks[start] + state.tShift[start]
  let max = state.eMarks[start]
  if (pos + 2 > max) return false
  if (state.src.slice(pos, pos + 2) !== '$$') return false

  pos += 2
  let firstLine = state.src.slice(pos, max)
  if (silent) return true

  let found = false
  let lastLine = ''
  if (firstLine.trim().slice(-2) === '$$') {
    // 单行公式
    firstLine = firstLine.trim().slice(0, -2)
    found = true
  }

  let next = start
  while (!found) {
    next += 1
    if (next >= end) break
    pos = state.bMarks[next] + state.tShift[next]
    max = state.eMarks[next]
    // 缩进比块小的非空行：列表之类的结构结束了
    if (pos < max && state.tShift[next] < state.blkIndent) break
    if (state.src.slice(pos, max).trim().slice(-2) === '$$') {
      const lastPos = state.src.slice(0, max).lastIndexOf('$$')
      lastLine = state.src.slice(pos, lastPos)
      found = true
    }
  }

  state.line = next + 1
  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content =
    (firstLine && firstLine.trim() ? `${firstLine}\n` : '') +
    state.getLines(start + 1, next, state.tShift[start], true) +
    (lastLine && lastLine.trim() ? lastLine : '')
  token.map = [start, state.line]
  token.markup = '$$'
  return true
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function markdownItMath(md: MarkdownIt, options: MarkdownItMathOptions) {
  const blockClass = options.blockClass ?? ''
  const katexOptions = options.katexOptions ?? {}

  const renderInline = (tex: string) => {
    const katex = options.katex()
    if (!katex) return `<span class="katex-pending">${escapeHtml(tex)}</span>`
    try {
      return katex.renderToString(tex, { ...katexOptions, displayMode: false })
    } catch (error) {
      return `<span class='katex-error' title='${escapeHtml(String(error))}'>${escapeHtml(tex)}</span>`
    }
  }

  /** 显示公式（行内规则产生）：KaTeX 的 displayMode 输出 span.katex-display，可以放在段落里 */
  const renderDisplay = (tex: string) => {
    const katex = options.katex()
    if (!katex) return `<span class="katex-pending">${escapeHtml(tex)}</span>`
    try {
      return katex.renderToString(tex, { ...katexOptions, displayMode: true })
    } catch (error) {
      return `<span class='katex-error' title='${escapeHtml(String(error))}'>${escapeHtml(tex)}</span>`
    }
  }

  const renderBlock = (tex: string) => {
    const katex = options.katex()
    if (!katex) {
      return `<p class="katex-block katex-pending ${blockClass}">${escapeHtml(tex)}</p>`
    }
    try {
      return (
        `<p class="katex-block ${blockClass}">` +
        katex.renderToString(tex, { ...katexOptions, displayMode: true }) +
        '</p>'
      )
    } catch (error) {
      return `<p class='katex-block katex-error ${blockClass}' title='${escapeHtml(
        String(error)
      )}'>${escapeHtml(tex)}</p>`
    }
  }

  md.inline.ruler.before('escape', 'math_display', mathDisplay(options.displayScanBarrier))
  md.inline.ruler.after('escape', 'math_inline', mathInline)
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
  md.renderer.rules.math_inline = (tokens, idx) => renderInline(tokens[idx].content)
  md.renderer.rules.math_display = (tokens, idx) => renderDisplay(tokens[idx].content)
  md.renderer.rules.math_block = (tokens, idx) => `${renderBlock(tokens[idx].content)}\n`
}
