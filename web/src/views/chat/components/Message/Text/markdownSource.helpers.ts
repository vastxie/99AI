import { t } from '@/locales'
import { isInsideCodeRegion, scanCodeRegions } from './markdownCodeRegions'
import { MARKDOWN_SENTINEL } from './markdownSentinels'

const isEscapedMarkdownChar = (value: string, index: number) => {
  let slashCount = 0
  for (let i = index - 1; i >= 0 && value[i] === '\\'; i--) {
    slashCount++
  }
  return slashCount % 2 === 1
}

const findUnclosedMathStart = (value: string) => {
  const stack: Array<{
    type: 'displayBracket' | 'inlineParen' | 'doubleDollar' | 'singleDollar'
    index: number
  }> = []

  // 代码区（代码块与行内代码）与静态改写共用同一套边界：整段跳过；未闭合的代码块到结尾为止，之后不再扫公式
  const regions = scanCodeRegions(value)
  let nextRegion = 0

  for (let i = 0; i < value.length; i++) {
    if (nextRegion < regions.length && i >= regions[nextRegion].start) {
      const region = regions[nextRegion++]
      if (region.end >= value.length) break
      i = region.end - 1
      continue
    }

    // 代码区之外还有反引号：行内代码还没写完（流式中），之后不扫公式
    if (value[i] === '`' && !isEscapedMarkdownChar(value, i)) break

    if (value.startsWith('\\[', i) && !isEscapedMarkdownChar(value, i)) {
      stack.push({ type: 'displayBracket', index: i })
      i++
      continue
    }

    if (value.startsWith('\\]', i) && !isEscapedMarkdownChar(value, i)) {
      if (stack.at(-1)?.type === 'displayBracket') stack.pop()
      i++
      continue
    }

    if (value.startsWith('\\(', i) && !isEscapedMarkdownChar(value, i)) {
      stack.push({ type: 'inlineParen', index: i })
      i++
      continue
    }

    if (value.startsWith('\\)', i) && !isEscapedMarkdownChar(value, i)) {
      if (stack.at(-1)?.type === 'inlineParen') stack.pop()
      i++
      continue
    }

    if (value.startsWith('$$', i) && !isEscapedMarkdownChar(value, i)) {
      if (stack.at(-1)?.type === 'doubleDollar') {
        stack.pop()
      } else {
        stack.push({ type: 'doubleDollar', index: i })
      }
      i++
      continue
    }

    if (value[i] === '$' && !isEscapedMarkdownChar(value, i)) {
      const prevChar = value[i - 1] || ''
      const nextChar = value[i + 1] || ''

      if (prevChar === '$' || nextChar === '$') continue

      if (stack.at(-1)?.type === 'singleDollar' && prevChar && !/\s/u.test(prevChar)) {
        stack.pop()
        continue
      }

      if (nextChar && !/\s/u.test(nextChar)) {
        stack.push({ type: 'singleDollar', index: i })
      }
    }
  }

  return stack.length > 0 ? stack[0].index : -1
}

export { MARKDOWN_SENTINEL }

// 待定公式片段以字面量文本通过 markdown 解析：反斜杠转义除 `[` 以外的全部 ASCII 标点。
// `[` 不转义：待定文本里的反斜杠都成对出现，不会构成有效的 `\[`（显示公式的开符）；
// `]` 仍转义：稳定区或待定区里开的链接 / 图片标签在待定区里都闭合不了
const PENDING_ESCAPE_PATTERN = /[!-\/:-@\\-`{-~]/gu

const escapePendingMarkdownText = (value: string) =>
  value.replaceAll(PENDING_ESCAPE_PATTERN, match => `\\${match}`)

// 行内公式 \( … \) 改写成 $…$；显示公式 \[ … \] 不改写，由 markdownItMath 的 math_display 行内规则识别
const normalizeMathDelimiters = (value: string) =>
  value.replaceAll(/\\\(\s*/gu, '$').replaceAll(/\s*\\\)/gu, '$')

/**
 * 按代码边界切分源文本，只对非代码片段做改写。
 *
 * 强调修正与引用角标都是在 markdown 解析之前对整段源做正则替换的，
 * 若不感知代码上下文，哨兵字符会被写进围栏代码块和行内代码：
 * 它们不走 text token，渲染层还原不到，最终以不可见的私有区字符留在代码里，
 * 并被「复制代码」原样写进剪贴板、被「在工作区打开」送进预览。
 *
 * 返回分片列表，isCode 为真的分片（围栏代码块与行内代码）原样保留。
 */
const splitByCodeRegions = (value: string) => {
  const segments: Array<{ text: string; isCode: boolean }> = []
  let lastIndex = 0
  for (const region of scanCodeRegions(value)) {
    if (region.start > lastIndex) {
      segments.push({ text: value.slice(lastIndex, region.start), isCode: false })
    }
    segments.push({ text: value.slice(region.start, region.end), isCode: true })
    lastIndex = region.end
  }
  if (lastIndex < value.length) {
    segments.push({ text: value.slice(lastIndex), isCode: false })
  }
  return segments
}

const replaceOutsideCode = (value: string, replacer: (text: string) => string) =>
  splitByCodeRegions(value)
    .map(segment => (segment.isCode ? segment.text : replacer(segment.text)))
    .join('')

const normalizeQuotedStrongDelimiters = (value: string) =>
  replaceOutsideCode(value, text =>
    text.replaceAll(
      /\*\*([^*\n]+?[”"’'」』）】》])\*\*(?=[\p{L}\p{N}])/gu,
      (_, content: string) =>
        `${MARKDOWN_SENTINEL.strongOpen}${content}${MARKDOWN_SENTINEL.strongClose}`
    )
  )

export const toSafeHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

const PRIVATE_FILE_DOWNLOAD_URL_SOURCE = String.raw`(?:https?:\/\/[^/\s)\]'"<>]+)?\/api\/files\/file_[a-zA-Z0-9_-]+\/download(?:[?#][^\s)\]'"<>]*)?`
const PREVIEWABLE_FILE_NAME_PATTERN = /\.(?:xlsx|xls|csv|pdf)(?:$|[\s?#)])/i
const PDF_FILE_NAME_PATTERN = /\.pdf(?:$|[\s?#)])/i

export const isPrivateFileDownloadUrl = (value: string) =>
  new RegExp(`^${PRIVATE_FILE_DOWNLOAD_URL_SOURCE}$`, 'i').test(value.trim())

const normalizePrivateFileLinkLabel = (value: string) => {
  const label = value.replace(/^[\s　]*(下载|download|预览|preview|查看|open)\s*/i, '').trim()
  return label || t('common.file')
}

const getPreviewFileType = (label: string, url: string) =>
  PDF_FILE_NAME_PATTERN.test(label) || PDF_FILE_NAME_PATTERN.test(url) ? 'pdf' : 'spreadsheet'

export const extractPreviewableFileLinksFromMarkdown = (value?: string) => {
  if (!value) return []

  const items: Array<{
    name: string
    url: string
    downloadUrl: string
    visibility: string
    type: string
  }> = []
  const seen = new Set<string>()
  const linkPattern = new RegExp(`\\[([^\\]]+)\\]\\((${PRIVATE_FILE_DOWNLOAD_URL_SOURCE})\\)`, 'gi')

  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(value))) {
    const label = normalizePrivateFileLinkLabel(match[1] || '')
    const url = (match[2] || '').trim()
    if (!url || seen.has(url)) continue
    if (!isPrivateFileDownloadUrl(url)) continue
    if (!PREVIEWABLE_FILE_NAME_PATTERN.test(label) && !PREVIEWABLE_FILE_NAME_PATTERN.test(url)) {
      continue
    }

    seen.add(url)
    items.push({
      name: label,
      url,
      downloadUrl: url,
      visibility: 'private',
      type: getPreviewFileType(label, url),
    })
  }

  return items
}

// 只替换起点在代码之外的匹配：整条链接写在代码里的原样保留，链接文字里带行内代码的整条链接照常处理
const replaceMatchesOutsideCode = (
  value: string,
  pattern: RegExp,
  replace: (label: string) => string
) => {
  const regions = scanCodeRegions(value)
  return value.replace(pattern, (match: string, label: string, offset: number) =>
    isInsideCodeRegion(regions, offset) ? match : replace(label)
  )
}

// 整条私有下载链接：可预览的表格 / PDF 与图片整条去掉，其余只留链接文字
const stripPrivateFileDownloadLinks = (value: string) =>
  replaceMatchesOutsideCode(
    replaceMatchesOutsideCode(
      replaceMatchesOutsideCode(
        value,
        new RegExp(
          `\\[([^\\]]*\\.(?:xlsx|xls|csv|pdf)[^\\]]*)\\]\\(${PRIVATE_FILE_DOWNLOAD_URL_SOURCE}\\)`,
          'gi'
        ),
        () => ''
      ),
      new RegExp(`!\\[([^\\]]*)\\]\\(${PRIVATE_FILE_DOWNLOAD_URL_SOURCE}\\)`, 'gi'),
      () => ''
    ),
    new RegExp(`\\[([^\\]]+)\\]\\(${PRIVATE_FILE_DOWNLOAD_URL_SOURCE}\\)`, 'gi'),
    label => label
  )

// 正文里裸露的私有下载地址：围栏代码与行内代码里的原样保留
const stripPrivateFileDownloadUrls = (value: string) =>
  value.replace(new RegExp(PRIVATE_FILE_DOWNLOAD_URL_SOURCE, 'gi'), '')

// 模型输出若自带私有区字符，会被渲染层当成我们注入的标记（伪造角标 / 错配强调），
// 因此在任何改写之前先剥掉这一段码位
const SENTINEL_CODEPOINT_PATTERN = /[\uE000-\uE004]/gu
const stripIncomingSentinels = (value: string) => value.replace(SENTINEL_CODEPOINT_PATTERN, '')

// 公式定界符与私有下载地址的改写都不能进代码：代码里的 `\(`（正则、find 参数、LaTeX 源码）和地址
// 必须原样显示和复制
const normalizeOutsideCode = (value: string) =>
  replaceOutsideCode(stripPrivateFileDownloadLinks(value), text =>
    normalizeMathDelimiters(stripPrivateFileDownloadUrls(text))
  )

export const normalizeAssistantMarkdown = (value: string) =>
  replaceOutsideCode(
    normalizeQuotedStrongDelimiters(normalizeOutsideCode(stripIncomingSentinels(value))),
    text =>
      text.replace(/\[\[(\d+)\]\(([^)]+)\)\]/g, (_, index: string, rawUrl: string) => {
        const safeUrl = toSafeHttpUrl(rawUrl.trim())
        if (!safeUrl) return ''
        // 保持标准 markdown 链接语法，链接文本前缀哨兵，渲染层据此还原成角标按钮。
        // 目标地址用尖括号包裹，避免 URL 中的右括号截断链接。
        return `[${MARKDOWN_SENTINEL.reference}${index}](<${safeUrl}>)`
      })
  )

export const getAssistantMarkdownSource = (value: string) => normalizeAssistantMarkdown(value)

export const getStreamingMarkdownSource = (raw: string) => {
  // 先剥掉外来私有区字符：扫描、稳定区改写与待定文本看到同样的内容，待定文本里也不会混入伪造的哨兵
  const value = stripIncomingSentinels(raw)
  const unclosedMathStart = findUnclosedMathStart(value)
  if (unclosedMathStart < 0) return getAssistantMarkdownSource(value)

  const stableText = normalizeAssistantMarkdown(value.slice(0, unclosedMathStart))
  const pendingText = value.slice(unclosedMathStart)
  return `${stableText}${MARKDOWN_SENTINEL.pendingMathOpen}${escapePendingMarkdownText(
    pendingText
  )}${MARKDOWN_SENTINEL.pendingMathClose}`
}
