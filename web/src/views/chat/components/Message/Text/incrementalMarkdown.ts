/**
 * 流式 Markdown 的增量解析（只追加的文本流）。
 *
 * 每来一段增量就整篇重新解析，代价随回复长度线性增长，长回复到后半段每帧都在做
 * 无谓的重复工作。CommonMark 的块级解析按行进行，追加文本只可能改变解析前沿
 * （最后一个顶层块：段落可能变成 setext 标题或表格、列表在空行后继续），更早的块
 * 已经定型。因此这里冻结除末尾 UNSTABLE_TAIL_BLOCKS 个顶层块以外的全部 token，
 * 只把冻结边界之后的源码交给 markdown-it 重新解析，再把两段 token 拼起来。
 *
 * 已知偏差（任何前缀冻结方案都有）：引用式链接 / 脚注的定义如果落在冻结边界另一侧，
 * 会先按字面渲染，流结束后的完整解析会自愈。调用方在 streaming 结束时必须做一次完整解析。
 */
import type { MarkdownIt } from 'markdown-it'

export interface IncrementalToken {
  type: string
  nesting: number
  level: number
  map: [number, number] | null
  [key: string]: any
}

export interface IncrementalParseCache<T extends IncrementalToken = IncrementalToken> {
  source: string
  tokens: T[]
}

export interface IncrementalParseResult<T extends IncrementalToken = IncrementalToken> {
  tokens: T[]
  cache: IncrementalParseCache<T>
  /** 本次是否复用了冻结前缀（测试与诊断用） */
  reusedPrefix: boolean
  /**
   * tokens 开头有多少个是原样复用的上一轮 token 对象（引用不变）。
   * 渲染层据此跳过对前缀的重复处理；完整解析时为 0。
   */
  frozenTokenCount: number
}

/** 末尾保持「可变」的顶层块数量：最后一块是解析前沿，再多留一块给列表 / 表格等跨空行延续 */
export const UNSTABLE_TAIL_BLOCKS = 2

export interface TopLevelBlock {
  startIndex: number
  endIndex: number
  lineEnd: number
}

/**
 * 把扁平 token 流切成顶层块 [startIndex, endIndex]。
 * 结构不符合预期（缺 map、开闭不配对）时返回 null，调用方回退到整体处理。
 */
export function collectTopLevelBlocks<T extends IncrementalToken>(
  tokens: T[]
): TopLevelBlock[] | null {
  const blocks: TopLevelBlock[] = []
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]
    if (token.level !== 0 || token.nesting === -1) return null
    if (!token.map) return null
    if (token.nesting === 0) {
      blocks.push({ startIndex: index, endIndex: index, lineEnd: token.map[1] })
      index += 1
      continue
    }
    // nesting === 1：找到同层的闭合 token
    let closeIndex = -1
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const candidate = tokens[cursor]
      if (candidate.level === 0 && candidate.nesting === -1) {
        closeIndex = cursor
        break
      }
    }
    if (closeIndex < 0) return null
    blocks.push({ startIndex: index, endIndex: closeIndex, lineEnd: token.map[1] })
    index = closeIndex + 1
  }
  return blocks
}

function lineStartOffsets(source: string): number[] {
  const offsets = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) offsets.push(index + 1)
  }
  return offsets
}

function shiftTokenLines<T extends IncrementalToken>(tokens: T[], lineOffset: number) {
  if (!lineOffset) return
  tokens.forEach(token => {
    if (token.map) token.map = [token.map[0] + lineOffset, token.map[1] + lineOffset]
    if (Array.isArray(token.children)) shiftTokenLines(token.children as T[], lineOffset)
  })
}

export function parseMarkdownFully<T extends IncrementalToken = IncrementalToken>(
  markdown: MarkdownIt,
  source: string
): IncrementalParseResult<T> {
  const tokens = markdown.parse(source, {}) as unknown as T[]
  return { tokens, cache: { source, tokens }, reusedPrefix: false, frozenTokenCount: 0 }
}

export function parseMarkdownIncrementally<T extends IncrementalToken = IncrementalToken>(
  markdown: MarkdownIt,
  nextSource: string,
  cache: IncrementalParseCache<T> | null | undefined
): IncrementalParseResult<T> {
  if (!cache || !cache.source || !nextSource.startsWith(cache.source)) {
    return parseMarkdownFully<T>(markdown, nextSource)
  }
  if (nextSource === cache.source) {
    return {
      tokens: cache.tokens,
      cache,
      reusedPrefix: true,
      frozenTokenCount: cache.tokens.length,
    }
  }
  const blocks = collectTopLevelBlocks(cache.tokens)
  if (!blocks || blocks.length <= UNSTABLE_TAIL_BLOCKS) {
    return parseMarkdownFully<T>(markdown, nextSource)
  }
  const lastFrozen = blocks[blocks.length - UNSTABLE_TAIL_BLOCKS - 1]
  const offsets = lineStartOffsets(cache.source)
  const frozenLineCount = lastFrozen.lineEnd
  const frozenEndOffset = offsets[frozenLineCount]
  // 冻结边界必须落在一个完整行的开头；边界之后的旧源码必须还是新源码的前缀
  if (frozenEndOffset === undefined || frozenEndOffset > nextSource.length) {
    return parseMarkdownFully<T>(markdown, nextSource)
  }
  const frozenTokens = cache.tokens.slice(0, lastFrozen.endIndex + 1)
  const tailTokens = markdown.parse(nextSource.slice(frozenEndOffset), {}) as unknown as T[]
  shiftTokenLines(tailTokens, frozenLineCount)
  const tokens = frozenTokens.concat(tailTokens)
  return {
    tokens,
    cache: { source: nextSource, tokens },
    reusedPrefix: true,
    frozenTokenCount: frozenTokens.length,
  }
}
