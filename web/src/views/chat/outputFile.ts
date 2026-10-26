import { IMAGE_FILE_EXTENSIONS } from '@/constants/fileTypes'
import { t } from '@/locales'
import type { CodeContentType } from '@/types/preview-panel'
import { extractInternalFileAssetIdFromUrl, normalizeFileAssetId } from '@/utils/privateFileAccess'

/**
 * 工具产出文件与消息附件的描述。
 *
 * 服务端落库、流式事件和工具输出给的都是松散写法：对象、地址字符串、JSON 字符串或逗号分隔的地址。
 * 解析、判定、命名只在这里做一次，消息文件卡片、活动时间线、工具详情和流式事件都用它，
 * 不再各自实现。
 */
export type OutputFile = {
  id?: string
  fileId?: string
  fileRef?: string
  url?: string
  name?: string
  title?: string
  type?: string
  fileType?: string
  mime?: string
  mimeType?: string
  size?: number
  visibility?: string
  role?: string
  origin?: string
  filename?: string
  fileName?: string
  path?: string
  downloadUrl?: string
  previewUrl?: string
  publicUrl?: string
  previewContent?: string
  previewContentType?: CodeContentType | string
  privateDownloadHidden?: boolean
  privatePreviewHidden?: boolean
}

/** 文件字段的几种写法：数组、单个对象、JSON 字符串；splitUrls 时把不是 JSON 的字符串按逗号拆成地址 */
export function readFileField(field: unknown, { splitUrls = true } = {}): any[] {
  if (!field) return []
  if (Array.isArray(field)) return field
  if (typeof field === 'object') return [field]
  if (typeof field !== 'string') return []
  try {
    return readFileField(JSON.parse(field), { splitUrls })
  } catch {}
  if (!splitUrls) return []
  return field
    .split(',')
    .map(url => url.trim())
    .filter(Boolean)
}

/** 文件项的地址：字符串就是地址本身，对象按 url → previewUrl → downloadUrl → publicUrl 取 */
export function fileItemUrl(item: any): string {
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.url || item.previewUrl || item.downloadUrl || item.publicUrl || ''
}

export function hasPreviewContent(item: any): boolean {
  return Boolean(
    item &&
    typeof item === 'object' &&
    typeof item.previewContent === 'string' &&
    item.previewContent.trim()
  )
}

/** 能定位到文件：有地址、平台文件 ID 或内联预览内容 */
export function hasFileTarget(item: any): boolean {
  if (!item) return false
  if (typeof item === 'string') return Boolean(item.trim())
  if (typeof item !== 'object') return false
  return Boolean(
    fileItemUrl(item) || normalizeFileAssetId(item.fileId || item.id) || hasPreviewContent(item)
  )
}

function normalizeFileRef(value: unknown): string {
  const fileRef = String(value || '').trim()
  return /^(attachment|output_image|output_file|previous_file)_([1-9]\d*)$/.test(fileRef)
    ? fileRef
    : ''
}

/** 把一项松散写法规整为 OutputFile；定位不到文件的返回 null */
export function toOutputFile(item: any): OutputFile | null {
  if (!hasFileTarget(item)) return null
  if (typeof item === 'string') return { url: item }
  return {
    id: item.id,
    fileId: item.fileId,
    fileRef: normalizeFileRef(item.fileRef),
    url: fileItemUrl(item) || undefined,
    downloadUrl: item.downloadUrl,
    previewUrl: item.previewUrl,
    publicUrl: item.publicUrl,
    name: item.name,
    title: item.title,
    type: item.type,
    fileType: item.fileType,
    mime: item.mime,
    mimeType: item.mimeType,
    size: item.size,
    visibility: item.visibility,
    role: item.role,
    origin: item.origin,
    filename: item.filename,
    fileName: item.fileName,
    path: item.path,
    previewContent: item.previewContent,
    previewContentType: item.previewContentType,
    privateDownloadHidden: item.privateDownloadHidden,
  }
}

export function parseOutputFiles(field: unknown): OutputFile[] {
  return readFileField(field)
    .map(item => toOutputFile(item))
    .filter((item): item is OutputFile => Boolean(item))
}

export function dedupeOutputFiles(items: OutputFile[]): OutputFile[] {
  const seen = new Set<string>()
  return items.filter((item, index) => {
    const key =
      item.fileId ||
      item.id ||
      item.fileRef ||
      item.url ||
      item.path ||
      item.title ||
      item.name ||
      `preview-${index}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 列表渲染用的稳定键 */
export function outputFileKey(item: OutputFile, index: number): string {
  return (
    item.fileId ||
    item.id ||
    item.url ||
    item.path ||
    item.title ||
    item.name ||
    item.fileRef ||
    item.previewContent?.slice(0, 80) ||
    String(index)
  )
}

export function fileNameFromPath(path?: string): string {
  if (!path) return ''
  return path.split(/[\\/]/u).findLast(Boolean) || ''
}

/** 地址里的文件名；平台文件接口（/api/files/{id}/download）的末段不是文件名，不取 */
export function fileNameFromUrl(url: string): string {
  if (!url || extractInternalFileAssetIdFromUrl(url)) return ''
  try {
    return decodeURIComponent(fileNameFromPath(new URL(url, window.location.origin).pathname))
  } catch {
    return fileNameFromPath(url.split(/[?#]/u)[0])
  }
}

/** 文件项自己写明的名称：名称字段 → 路径末段 */
export function explicitOutputFileName(item: any): string {
  if (!item || typeof item !== 'object') return ''
  return item.name || item.title || item.fileName || item.filename || fileNameFromPath(item.path)
}

/** 文件的显示名：写明的名称 → 地址末段；都没有时返回空字符串 */
export function outputFileName(item: any): string {
  if (typeof item === 'string') return fileNameFromUrl(item)
  return explicitOutputFileName(item) || fileNameFromUrl(fileItemUrl(item))
}

export function extractExtension(value: string): string {
  const lastDot = value.lastIndexOf('.')
  if (lastDot === -1 || lastDot === value.length - 1) return ''
  return value.slice(lastDot + 1)
}

export function extractUrlExtension(url: string): string {
  try {
    return extractExtension(new URL(url).pathname)
  } catch {
    return extractExtension(url)
  }
}

/** MIME 或类型名对应的扩展名（application/pdf → pdf，spreadsheet → xlsx） */
export function extensionFromType(type: string): string {
  const normalized = type.toLowerCase()
  if (!normalized) return ''
  if (normalized.includes('photoshop')) return 'psd'
  if (normalized.includes('spreadsheet') || normalized.includes('excel')) return 'xlsx'
  if (normalized.includes('word')) return 'docx'
  if (normalized.includes('presentation') || normalized.includes('powerpoint')) return 'pptx'
  if (normalized.includes('pdf')) return 'pdf'
  if (normalized.includes('markdown')) return 'md'
  if (normalized.includes('json')) return 'json'
  if (normalized.includes('text')) return 'txt'
  if (normalized.includes('/')) return normalized.split('/').pop() || ''
  return normalized.replace(/^\./u, '')
}

/** 文件扩展名（小写）：按名称 → 地址 → 类型推断 */
export function outputFileExtension(item: OutputFile): string {
  const name =
    item.name || item.title || item.fileName || item.filename || fileNameFromPath(item.path)
  return (
    extractExtension(name) ||
    extractUrlExtension(fileItemUrl(item)) ||
    extensionFromType(item.fileType || item.type || item.mime || item.mimeType || '')
  ).toLowerCase()
}

export function isImageOutputFile(item: OutputFile): boolean {
  const mime = String(item.mime || item.mimeType || '').toLowerCase()
  const type = String(item.type || item.fileType || '').toLowerCase()
  const extension = outputFileExtension(item)
  if (extension === 'svg' || mime === 'image/svg+xml') return false
  if (extension === 'psd' || mime.includes('photoshop')) return false
  return (
    mime.startsWith('image/') ||
    type === 'image' ||
    type.startsWith('image/') ||
    IMAGE_FILE_EXTENSIONS.has(extension)
  )
}

export function isVideoOutputFile(item: OutputFile): boolean {
  const mime = String(item.mime || item.mimeType || '').toLowerCase()
  const type = String(item.type || item.fileType || '').toLowerCase()
  return (
    mime.startsWith('video/') ||
    type === 'video' ||
    type.startsWith('video/') ||
    ['mp4', 'webm', 'mov'].includes(outputFileExtension(item))
  )
}

function assetFileKind(asset: any) {
  const mime = String(asset?.mimeType || asset?.mime || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || mime.startsWith('text/') || mime.includes('officedocument')) {
    return 'document'
  }
  return 'file'
}

/** 工具结束事件里的私有产物（只有平台文件 ID）转成文件项；没有合法 ID 的返回 null */
export function assetToOutputFile(asset: any): OutputFile | null {
  const fileId = normalizeFileAssetId(asset?.fileId || asset?.id)
  if (!fileId) return null
  return {
    type: assetFileKind(asset),
    id: fileId,
    fileId,
    title: asset?.displayName || asset?.title || asset?.name || t('common.file'),
    role: asset?.role,
    mime: asset?.mimeType || asset?.mime,
    mimeType: asset?.mimeType || asset?.mime,
    size: asset?.size,
    visibility: 'private',
    privateDownloadHidden: true,
    privatePreviewHidden: true,
  }
}
