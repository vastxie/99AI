import { t } from '@/locales'
import { isHttpProtocol, isHttpUrl } from '@/utils/is'

/** 工具活动详情的纯文本处理：来源卡片、链接、文件名与时长，不读组件状态 */

const MAX_DETAIL_DURATION_MS = 24 * 60 * 60 * 1000

export type SourceCard = {
  key: string
  title: string
  url: string
  displayUrl: string
  chipLabel: string
  faviconUrl: string
  sourceLabel: string
  snippet: string
}

export type PreviewDocumentItem = {
  title?: string
  fileType?: string
  previewContent: string
  previewContentType?: string
  downloadUrl?: string
}

export function cleanText(value: unknown, limit = 180): string {
  if (value === null || value === undefined) return ''
  const normalized = String(value)
    .replaceAll(/<[^>]*>/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit)}...`
}

function stripSourceInputLabel(value: string): string {
  return value
    .replace(/^(?:搜索|检索)\s*[：:=]\s*/iu, '')
    .replace(/^(?:搜索\s*)?(?:query|q|keyword|关键词|搜索词|url|链接)\s*[：:=]\s*/iu, '')
}

export function isInternalSearchSummary(value: unknown): boolean {
  return /OpenAI Responses|内置\s*web_search|native\s*web_search|hosted\s*tool/iu.test(
    String(value || '')
  )
}

export function cleanSourceTitle(value: unknown, limit = 120): string {
  return cleanText(
    stripSourceInputLabel(
      String(value || '')
        .replaceAll(/^#+\s*/gu, '')
        .replaceAll(/\s+(?:URL|url|链接|最终地址|来源|缓存)[：:].*$/gu, '')
        .trim()
    ),
    limit
  )
}

function normalizeTitlePart(value: unknown): string {
  return String(value || '')
    .replace(/\s+/gu, '')
    .replace(/^www\./iu, '')
    .toLowerCase()
}

export function isDuplicateTitlePart(left: unknown, right: unknown): boolean {
  const a = normalizeTitlePart(left)
  const b = normalizeTitlePart(right)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

export function cleanMarkdownText(value: unknown, limit = 180): string {
  return cleanText(
    String(value || '')
      .replaceAll(/```[\s\S]*?```/gu, ' ')
      .replaceAll(/!\[[^\]]*\]\([^)]+\)/gu, ' ')
      .replaceAll(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
      .replaceAll(/[#>*_`~-]/gu, ' '),
    limit
  )
}

function normalizeComparableText(value: string): string {
  return value
    .replaceAll(/\.\.\.$/gu, '')
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

export function isDuplicateText(a: string, b: string): boolean {
  const left = normalizeComparableText(a)
  const right = normalizeComparableText(b)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

function normalizeFileSummary(value: string): string {
  return normalizeComparableText(value).toLowerCase()
}

function stripFileExtension(value: string): string {
  return value.replace(/\.[a-z0-9]{1,10}$/iu, '')
}

export function isDuplicateMediaSummary(summary: string, fileName: string): boolean {
  const normalizedSummary = normalizeFileSummary(summary)
  const normalizedFileName = normalizeFileSummary(fileName)
  if (!normalizedSummary || !normalizedFileName) return false

  return (
    normalizedSummary === normalizedFileName ||
    normalizedSummary === stripFileExtension(normalizedFileName)
  )
}

export function formatDuration(duration?: number): string {
  if (!duration || duration <= 0) return ''
  if (!Number.isFinite(duration) || duration > MAX_DETAIL_DURATION_MS) return ''
  if (duration < 1000) return `${Math.round(duration)}ms`
  const totalSeconds = Math.round(duration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function trimUrlPunctuation(value: string): string {
  return value
    .trim()
    .replace(/^[（([<]+/u, '')
    .replace(/[),，。；;、）\]>]+$/u, '')
}

function isLikelyDomain(value: string): boolean {
  const cleaned = value.split(/[/?#]/u)[0]
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/iu.test(cleaned)
}

export function safeHttpUrl(value: unknown): string {
  const raw = trimUrlPunctuation(String(value || ''))
  if (!raw) return ''
  const candidate = isHttpUrl(raw) ? raw : isLikelyDomain(raw) ? `https://${raw}` : ''
  if (!candidate) return ''

  try {
    const url = new URL(candidate)
    if (!isHttpProtocol(url.protocol)) return ''
    return /…|\.\.\./u.test(raw) ? `${url.origin}/` : url.toString()
  } catch {
    return ''
  }
}

export function isUrlLikeText(value: unknown): boolean {
  const text = String(value || '').trim()
  return Boolean(safeHttpUrl(text))
}

export function getSourceHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./iu, '')
  } catch {
    return ''
  }
}

export function getSourceDisplayUrl(value: string): string {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./iu, '')
    const pathParts = url.pathname.split('/').filter(Boolean)
    if (pathParts.length === 0) return host
    if (pathParts.length === 1) return `${host}/${pathParts[0]}`
    return `${host}/${pathParts[0]}/.../${pathParts.at(-1)}`
  } catch {
    return cleanText(value, 90)
  }
}

export function getFaviconUrl(value: string): string {
  try {
    const url = new URL(value)
    return isHttpProtocol(url.protocol) ? `${url.origin}/favicon.ico` : ''
  } catch {
    return ''
  }
}

export function extractSearchQueryFromText(value: string): string {
  if (!value) return ''
  const match = value.match(/(?:搜索结果|搜索查询|搜索词|关键词|query)[：:]\s*([^\n]+)/iu)
  if (!match?.[1]) return ''
  return cleanSourceTitle(match[1].replace(/\s+(?:摘要|结果)[：:].*$/u, ''), 96)
}

export function extractTitleFromSourceText(value: string): string {
  if (!value) return ''
  const titleMatch = value.match(/(?:标题|title)[：:]\s*([^\n]+)/iu)
  if (titleMatch?.[1]) return cleanSourceTitle(titleMatch[1], 140)

  const headingMatch = value.match(/^#+\s*(.+)$/mu)
  if (headingMatch?.[1]) return cleanSourceTitle(headingMatch[1], 140)
  return ''
}

export function extractHostFromTitle(title: unknown): string {
  const hostMatch = String(title || '').match(/[·•]\s*((?:[a-z0-9-]+\.)+[a-z]{2,})/iu)
  return hostMatch?.[1] || ''
}

export function extractSourceUrlsFromText(value: string, hostFromTitle = ''): string[] {
  if (!value) return []
  const urls = new Set<string>()
  const collect = (candidate?: string) => {
    const url = safeHttpUrl(candidate)
    if (url) urls.add(url)
  }

  for (const match of value.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/giu)) {
    collect(match[1])
  }
  for (const match of value.matchAll(/https?:\/\/[^\s"'<>，。)）]+/giu)) {
    collect(match[0])
  }
  for (const match of value.matchAll(
    /(?:URL|url|链接|最终地址|地址)[：:]\s*((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>，。)）]*)?)/giu
  )) {
    collect(match[1])
  }
  for (const match of value.matchAll(
    /(?:^|[\s（(])((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>，。)）]*)?)/giu
  )) {
    collect(match[1])
  }

  if (hostFromTitle) collect(hostFromTitle)

  return [...urls]
}

export function normalizeSourceCard(detail: any, index: number): SourceCard | null {
  if (!detail || typeof detail !== 'object') return null

  const url = safeHttpUrl(
    detail.url || detail.link || detail.href || detail.sourceUrl || detail.domain
  )
  const host = url ? getSourceHost(url) : cleanText(detail.domain, 80)
  const title = cleanText(
    detail.title ||
      detail.name ||
      host ||
      detail.sourceName ||
      detail.source ||
      t('activity.webSource'),
    120
  )
  const snippet = cleanMarkdownText(
    detail.snippet || detail.description || detail.content || detail.summary,
    190
  )
  const sourceLabel = cleanText(
    detail.sourceName || detail.sourceEngine || detail.source || detail.engine || host,
    80
  )
  const key = url || `${title}-${sourceLabel}-${index}`

  return {
    key,
    title,
    url,
    displayUrl: url ? getSourceDisplayUrl(url) : host,
    chipLabel: host || sourceLabel || title,
    faviconUrl: url ? getFaviconUrl(url) : '',
    sourceLabel,
    snippet,
  }
}

export function dedupeSourceCards(cards: SourceCard[]): SourceCard[] {
  const seen = new Set<string>()
  const result: SourceCard[] = []

  for (const card of cards) {
    const key = card.url || `${card.title}:${card.sourceLabel}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(card)
  }

  return result
}

export function getSourceCardLinkAttrs(card: SourceCard) {
  if (!card.url) return {}

  return {
    href: card.url,
    target: '_blank',
    rel: 'noopener noreferrer',
  }
}

export function normalizePreviewDocumentItem(item: any): PreviewDocumentItem | null {
  if (!item || typeof item !== 'object') return null
  const previewContent = typeof item.previewContent === 'string' ? item.previewContent : ''
  if (!previewContent.trim()) return null
  return {
    title: item.title || item.name || item.fileName || item.filename,
    fileType: item.fileType,
    previewContent,
    previewContentType: item.previewContentType,
    downloadUrl: item.downloadUrl,
  }
}
