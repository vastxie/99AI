import {
  AUDIO_FILE_EXTENSIONS,
  CODE_FILE_EXTENSIONS,
  IMAGE_FILE_EXTENSIONS,
  MARKDOWN_FILE_EXTENSIONS,
  PDF_FILE_EXTENSIONS,
  SPREADSHEET_FILE_EXTENSIONS,
  VIDEO_FILE_EXTENSIONS,
  WORD_FILE_EXTENSIONS,
} from '@/constants/fileTypes'
import { isCodeContentType } from '@/utils/codeContent'
import type { FilePreviewSource } from '@/types/file-preview'

export type PreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'spreadsheet'
  | 'word'
  | 'markdown'
  | 'html'
  | 'text'
  | 'unsupported'

/**
 * 各预览类型的文件大小上限（字节）。超限抛 'too-large'，
 * 由面板转为"文件过大，请下载查看"错误态。
 * 媒体类（image/video/audio）走浏览器原生流式加载，不设上限。
 */
export const PREVIEW_SIZE_LIMITS: Partial<Record<PreviewKind, number>> = {
  pdf: 50 * 1024 * 1024,
  word: 20 * 1024 * 1024,
  spreadsheet: 12 * 1024 * 1024,
  markdown: 3 * 1024 * 1024,
  html: 3 * 1024 * 1024,
  text: 3 * 1024 * 1024,
}

export function assertPreviewSizeWithinLimit(kind: PreviewKind, size?: number) {
  const limit = PREVIEW_SIZE_LIMITS[kind]
  if (!limit || size === undefined || !Number.isFinite(size)) return
  if (size > limit) throw new Error('too-large')
}

export function getFileExtension(source: FilePreviewSource): string {
  const explicit = String(source.extension || '')
    .replace(/^\./u, '')
    .toLowerCase()
  if (explicit) return explicit

  const name = source.name || ''
  const lastDot = name.lastIndexOf('.')
  if (lastDot !== -1 && lastDot < name.length - 1) return name.slice(lastDot + 1).toLowerCase()

  const mime = String(source.mime || '').toLowerCase()
  if (mime.includes('/')) return mime.split('/').pop() || ''

  return ''
}

export function inferPreviewKind(source: FilePreviewSource): PreviewKind {
  const ext = getFileExtension(source)
  const mime = String(source.mime || '').toLowerCase()
  const contentType = String(source.contentType || '').toLowerCase()

  if (mime.startsWith('image/') || IMAGE_FILE_EXTENSIONS.has(ext)) return 'image'
  if (mime.startsWith('video/') || VIDEO_FILE_EXTENSIONS.has(ext)) return 'video'
  if (mime.startsWith('audio/') || AUDIO_FILE_EXTENSIONS.has(ext)) return 'audio'
  if (mime.includes('pdf') || PDF_FILE_EXTENSIONS.has(ext)) return 'pdf'
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    SPREADSHEET_FILE_EXTENSIONS.has(ext)
  ) {
    return 'spreadsheet'
  }
  if (contentType === 'word' || WORD_FILE_EXTENSIONS.has(ext)) return 'word'
  if (contentType === 'markdown' || MARKDOWN_FILE_EXTENSIONS.has(ext)) return 'markdown'
  // 网页文件在隔离的 iframe 里运行预览（与 HTML 代码块预览同一渲染器，拿不到本站凭据）
  if (mime === 'text/html' || ext === 'html' || ext === 'htm') return 'html'
  // 文件卡的 contentType 由共用别名表推出（svg / cpp / html …），这些代码类型一律按纯文本预览
  if (
    contentType === 'text' ||
    isCodeContentType(contentType) ||
    mime.startsWith('text/') ||
    mime.includes('json') ||
    CODE_FILE_EXTENSIONS.has(ext)
  ) {
    return 'text'
  }

  return 'unsupported'
}

/**
 * 判断两次打开的是否为同一预览源。
 * 仅凭 key 不够：消息附件的 key 可能退化为文件名（无 fileId/url 时），
 * 两个同名不同地址的文件会碰撞，故同时比较来源类型与实际内容地址。
 * key 缺失时视为不同源，总是重载。
 */
export function isSameFilePreviewSource(a: FilePreviewSource, b: FilePreviewSource): boolean {
  return (
    Boolean(a.key) &&
    a.key === b.key &&
    a.sourceKind === b.sourceKind &&
    a.name === b.name &&
    (a.previewUrl || '') === (b.previewUrl || '') &&
    (a.downloadUrl || '') === (b.downloadUrl || '') &&
    (a.content || '') === (b.content || '')
  )
}

/**
 * 表格的总列数：工作表范围与各行长度取最大。逐行比较，不把全部行展开成 Math.max 的实参
 * （几十万行的小 CSV 会超出实参数量上限而预览失败）
 */
export function sheetColumnCount(rangeColumns: number, rows: ReadonlyArray<{ length: number }>) {
  let columns = Math.max(rangeColumns, 0)
  for (const row of rows) if (row.length > columns) columns = row.length
  return columns
}
