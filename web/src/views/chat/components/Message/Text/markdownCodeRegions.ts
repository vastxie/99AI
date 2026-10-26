import type { Token } from 'markdown-it'
import { messageMarkdown } from './messageMarkdown'

/**
 * 找出 markdown 源文本里的代码区（代码块与行内代码），供渲染前的文本改写避开代码。
 *
 * 用渲染正文的同一个 markdown-it 实例只跑块级解析：
 * - 代码块（围栏与缩进代码块）直接取解析出的行范围，列表、引用块等容器以及公式块等插件规则都与渲染一致；
 * - 行内代码只在解析出的行内内容（段落、标题、列表项里的段落等）各自的行范围里找，表格按单元格找：一串 n 个反引号与之后第一串
 *   恰好 n 个的反引号配对，找不到配对时这串反引号是普通文字；被反斜杠转义的反引号不开启行内代码（同 CommonMark）。
 *
 * 全程线性：块级解析本身是线性的，行内扫描只往前走。
 */
export interface CodeRegion {
  start: number
  /** 不含 */
  end: number
}

/** 每一行的起点（按 markdown-it 的换行规则：\r\n、\r、\n 都算一行结束） */
function lineStarts(value: string) {
  const starts = [0]
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '\n' || (char === '\r' && value[index + 1] !== '\n')) starts.push(index + 1)
  }
  return starts
}

function parseBlocks(value: string): Token[] {
  const tokens: Token[] = []
  // 与 markdown-it 的 normalize 一致：\r\n、\r 统一成 \n（行号不变），NUL 换成 U+FFFD
  const normalized = value.replace(/\r\n?/g, '\n').replace(/\0/g, '�')
  messageMarkdown.block.parse(normalized, messageMarkdown, {}, tokens)
  return tokens
}

function runLength(value: string, index: number, end: number) {
  let cursor = index
  while (cursor < end && value[cursor] === '`') cursor++
  return cursor - index
}

/** 一段行内内容里的行内代码：反引号串按长度配对 */
function scanInlineCode(value: string, from: number, to: number, regions: CodeRegion[]) {
  const runs: Array<{ start: number; length: number; escaped: boolean }> = []
  for (let index = from; index < to;) {
    if (value[index] !== '`') {
      index++
      continue
    }
    let slashes = 0
    for (let back = index - 1; back >= from && value[back] === '\\'; back--) slashes++
    const length = runLength(value, index, to)
    runs.push({ start: index, length, escaped: slashes % 2 === 1 })
    index += length
  }
  // 每种长度的反引号串按出现顺序编号，配对时只往后找，整体线性
  const byLength = new Map<number, number[]>()
  runs.forEach((run, position) => {
    const list = byLength.get(run.length) ?? []
    list.push(position)
    byLength.set(run.length, list)
  })
  const cursors = new Map<number, number>()
  const nextRun = (length: number, after: number) => {
    const list = byLength.get(length)
    if (!list) return -1
    let cursor = cursors.get(length) ?? 0
    while (cursor < list.length && list[cursor] <= after) cursor++
    cursors.set(length, cursor)
    return cursor < list.length ? list[cursor] : -1
  }
  for (let position = 0; position < runs.length;) {
    const run = runs[position]
    // 被转义的第一个反引号是普通文字，剩下的仍可开启行内代码
    const start = run.escaped ? run.start + 1 : run.start
    const length = run.escaped ? run.length - 1 : run.length
    const closing = length > 0 ? nextRun(length, position) : -1
    if (closing === -1) {
      position++
      continue
    }
    regions.push({ start, end: runs[closing].start + runs[closing].length })
    position = closing + 1
  }
}

/**
 * 表格的一行：按竖线切出各单元格，行内代码不跨单元格。
 * 与 markdown-it 的表格切分一致：竖线前一个字符是反斜杠就算转义，不看反斜杠个数的奇偶
 */
function scanTableRow(value: string, from: number, to: number, regions: CodeRegion[]) {
  let cellStart = from
  for (let index = from; index < to; index++) {
    if (value[index] !== '|' || (index > from && value[index - 1] === '\\')) continue
    scanInlineCode(value, cellStart, index, regions)
    cellStart = index + 1
  }
  scanInlineCode(value, cellStart, to, regions)
}

/** 代码块与行内代码，按起点排序、互不重叠 */
export function scanCodeRegions(value: string): CodeRegion[] {
  if (!value) return []
  const starts = lineStarts(value)
  // 第 line 行行首；行号越界时是全文结尾
  const startOf = (line: number) => (line < starts.length ? starts[line] : value.length)
  // [startLine, endLine) 这几行的范围：到最后一行行尾为止，不含换行
  const rangeOf = (map: [number, number]) => ({
    start: startOf(map[0]),
    end: map[1] < starts.length ? starts[map[1]] - 1 : value.length,
  })
  const regions: CodeRegion[] = []
  for (const token of parseBlocks(value)) {
    if (!token.map) continue
    const range = rangeOf(token.map)
    if (range.end <= range.start) continue
    if (token.type === 'fence' || token.type === 'code_block') {
      regions.push(range)
    } else if (token.type === 'inline') {
      scanInlineCode(value, range.start, range.end, regions)
    } else if (token.type === 'tr_open') {
      // 表格单元格的行内内容没有行号：按表格行的行号取源码，逐个单元格扫描
      scanTableRow(value, range.start, range.end, regions)
    }
  }
  return regions.sort((a, b) => a.start - b.start)
}

/** 位置是否落在代码区里（regions 已按起点排序） */
export function isInsideCodeRegion(regions: CodeRegion[], index: number) {
  let low = 0
  let high = regions.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (index < regions[middle].start) high = middle - 1
    else if (index >= regions[middle].end) low = middle + 1
    else return true
  }
  return false
}
