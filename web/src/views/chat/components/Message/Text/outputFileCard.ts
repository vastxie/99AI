import type { Component } from 'vue'
import {
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from '@lucide/vue'
import {
  ARCHIVE_FILE_EXTENSIONS,
  AUDIO_FILE_EXTENSIONS,
  CODE_FILE_EXTENSIONS,
  IMAGE_FILE_EXTENSIONS,
  MARKDOWN_FILE_EXTENSIONS,
  PDF_FILE_EXTENSIONS,
  PRESENTATION_FILE_EXTENSIONS,
  SPREADSHEET_FILE_EXTENSIONS,
  VIDEO_FILE_EXTENSIONS,
  WORD_FILE_EXTENSIONS,
} from '@/constants/fileTypes'
import { t } from '@/locales'
import type { FilePreviewSource } from '@/types/file-preview'
import { getFileContentType } from '@/utils/codeContent'
import { downloadBlob, downloadUrl, filenameFromContentDisposition } from '@/utils/download'
import { formatFileSize } from '@/utils/format'
import {
  fetchPrivateFileBlob,
  getControlledFilePreviewUrl,
  getFileIdFromItem,
  getPrivateFileDownloadUrl,
  getPrivateFilePreviewUrl,
  isPrivateOutputFile,
  loadFileBlob,
  resolveAuthenticatedFileUrl,
} from '@/utils/privateFileAccess'
import {
  explicitOutputFileName,
  extensionFromType,
  extractExtension,
  extractUrlExtension,
  fileItemUrl,
  fileNameFromUrl,
  hasPreviewContent,
  outputFileKey,
  type OutputFile,
} from '@/views/chat/outputFile'

/**
 * 消息里文件卡片的视图模型：卡片形态、显示名、元信息、图标，以及能否预览、下载。
 * 判断都在这里（纯函数），MediaOutput 与 OutputFileCard 只按结果渲染。
 *
 * 形态：
 * - audio：可播放的音频，播放键代替图标，底边是进度条；
 * - source：源码 / 文本文件，左边打开预览，右边单独下载；
 * - action：整张卡片一个动作，能预览就预览，否则下载；
 * - readonly：既不能预览也不能下载，只展示。
 */
export type FileCardKind = 'audio' | 'source' | 'action' | 'readonly'

export interface FileCard {
  key: string
  file: OutputFile
  kind: FileCardKind
  /** action 形态整张卡片的动作 */
  action: 'preview' | 'download' | null
  /** 显示名，也是下载时的文件名（缺扩展名时补上） */
  name: string
  /** 大写扩展名，未知时为 FILE */
  extension: string
  /** 扩展名、大小与动作说明；音频卡的时长由播放器补在后面 */
  meta: string[]
  icon: Component
  /** 图标色调类名 */
  tone: string
  canPreview: boolean
  canDownload: boolean
}

export interface FileCardContext {
  /** 用户消息里的附件：不出播放卡和源码卡，也不写动作说明 */
  userMessage: boolean
  /** 只有一个文件时，工具输出上的名称可以当作它的名称 */
  fallbackName: string
}

/** 按扩展名区分的图标与色调；按顺序匹配 */
const FILE_KINDS: Array<{
  matches: (extension: string) => boolean
  icon: Component
  tone: string
}> = [
  { matches: ext => PDF_FILE_EXTENSIONS.has(ext), icon: FileText, tone: 'is-pdf' },
  { matches: ext => SPREADSHEET_FILE_EXTENSIONS.has(ext), icon: FileSpreadsheet, tone: 'is-excel' },
  { matches: ext => WORD_FILE_EXTENSIONS.has(ext), icon: FileText, tone: 'is-word' },
  {
    matches: ext => PRESENTATION_FILE_EXTENSIONS.has(ext),
    icon: Presentation,
    tone: 'is-presentation',
  },
  { matches: ext => MARKDOWN_FILE_EXTENSIONS.has(ext), icon: FileCode, tone: 'is-markdown' },
  { matches: ext => CODE_FILE_EXTENSIONS.has(ext), icon: FileCode, tone: 'is-code' },
  {
    matches: ext => VIDEO_FILE_EXTENSIONS.has(ext) || ext === 'video',
    icon: FileVideo,
    tone: 'is-video',
  },
  {
    matches: ext => AUDIO_FILE_EXTENSIONS.has(ext) || ext === 'audio',
    icon: FileAudio,
    tone: 'is-audio',
  },
  {
    matches: ext => IMAGE_FILE_EXTENSIONS.has(ext) || ext === 'image',
    icon: FileImage,
    tone: 'is-image',
  },
  { matches: ext => ARCHIVE_FILE_EXTENSIONS.has(ext), icon: FileArchive, tone: 'is-archive' },
]

/** 不在面板里渲染的类型：SVG / XHTML 可能带脚本，PSD 浏览器打不开；HTML 页面在隔离 iframe 里预览 */
const UNPREVIEWABLE_EXTENSIONS = new Set(['psd', 'xhtml', 'svg'])
const UNPREVIEWABLE_MIMES = new Set(['application/xhtml+xml', 'image/svg+xml'])
const PREVIEWABLE_TEXT_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
])

function mimeOf(file: OutputFile) {
  return String(file.mime || file.mimeType || '').toLowerCase()
}

function typeOf(file: OutputFile) {
  return String(file.type || file.fileType || '').toLowerCase()
}

/** 文件的基础名称：写明的名称 → 工具输出上的名称 → 地址末段 */
function baseNameOf(file: OutputFile, fallbackName: string) {
  return explicitOutputFileName(file) || fallbackName || fileNameFromUrl(file.url || '')
}

function extensionOf(file: OutputFile, baseName: string) {
  const type = file.fileType || file.type || file.mime || file.mimeType || ''
  return (
    extractExtension(baseName) ||
    extractUrlExtension(fileItemUrl(file)) ||
    extensionFromType(type) ||
    'FILE'
  )
    .toUpperCase()
    .slice(0, 8)
}

export function hasDownloadTarget(file: OutputFile): boolean {
  if (file.privateDownloadHidden && !getFileIdFromItem(file)) return false
  return Boolean(file.downloadUrl || file.url || getFileIdFromItem(file))
}

function isAudioFile(file: OutputFile, extension: string) {
  const type = typeOf(file)
  return (
    AUDIO_FILE_EXTENSIONS.has(extension) ||
    mimeOf(file).startsWith('audio/') ||
    type === 'audio' ||
    type.startsWith('audio/')
  )
}

function isSourceFile(file: OutputFile, extension: string) {
  const mime = mimeOf(file)
  const type = typeOf(file)
  if (/^(?:image|video|audio)\//u.test(mime)) return false
  return (
    CODE_FILE_EXTENSIONS.has(extension) ||
    MARKDOWN_FILE_EXTENSIONS.has(extension) ||
    mime.startsWith('text/') ||
    /json|javascript|typescript/u.test(mime) ||
    type.includes('code') ||
    type.includes('source')
  )
}

/** 预览面板能打开的类型：图片、PDF、Office 文档、表格、纯文本与源码 */
function isPreviewableType(file: OutputFile, extension: string) {
  const mime = mimeOf(file)
  if (UNPREVIEWABLE_EXTENSIONS.has(extension) || UNPREVIEWABLE_MIMES.has(mime)) return false
  return (
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    /word|spreadsheet|excel/u.test(mime) ||
    PREVIEWABLE_TEXT_MIMES.has(mime) ||
    mime === 'text/html' ||
    ['pdf', 'txt', 'md', 'json', 'csv', 'log', 'html', 'htm'].includes(extension) ||
    SPREADSHEET_FILE_EXTENSIONS.has(extension) ||
    WORD_FILE_EXTENSIONS.has(extension) ||
    isSourceFile(file, extension)
  )
}

function canPreviewFile(file: OutputFile, extension: string) {
  if (hasPreviewContent(file)) return true
  const hasTarget = Boolean(
    getFileIdFromItem(file) || getControlledFilePreviewUrl(file) || hasDownloadTarget(file)
  )
  return hasTarget && isPreviewableType(file, extension)
}

export function describeFileCard(
  file: OutputFile,
  index: number,
  context: FileCardContext
): FileCard {
  const baseName = baseNameOf(file, context.fallbackName)
  const extension = extensionOf(file, baseName)
  const lowerExtension = extension.toLowerCase()
  const fileName = baseName || t('common.file')
  const name =
    extractExtension(fileName) || lowerExtension === 'file'
      ? fileName
      : `${fileName}.${lowerExtension}`
  const canPreview = canPreviewFile(file, lowerExtension)
  const canDownload = hasDownloadTarget(file)

  let kind: FileCardKind = 'readonly'
  if (!context.userMessage && canDownload && isAudioFile(file, lowerExtension)) kind = 'audio'
  else if (!context.userMessage && canPreview && isSourceFile(file, lowerExtension)) kind = 'source'
  else if (canPreview || canDownload) kind = 'action'

  const action = kind === 'action' ? (canPreview ? 'preview' : 'download') : null
  let actionLabel = ''
  if (kind === 'source') actionLabel = t('common.preview')
  else if (action && !context.userMessage) {
    actionLabel = action === 'preview' ? t('common.preview') : t('common.download')
  }
  const fileKind = FILE_KINDS.find(entry => entry.matches(lowerExtension))

  return {
    key: outputFileKey(file, index),
    file,
    kind,
    action,
    name,
    extension,
    meta: [extension, formatFileSize(file.size), actionLabel].filter(Boolean),
    icon: fileKind?.icon ?? FileText,
    tone: fileKind?.tone ?? 'is-generic',
    canPreview,
    canDownload,
  }
}

function resolveFileUrl(file: OutputFile, privateUrlOf: (file: OutputFile) => string) {
  try {
    const privateUrl = privateUrlOf(file)
    return privateUrl ? resolveAuthenticatedFileUrl(privateUrl) : ''
  } catch {
    return ''
  }
}

/** 打开预览面板用的文件来源 */
export function filePreviewSource(
  card: FileCard,
  download: () => Promise<void> | void
): FilePreviewSource {
  const { file } = card
  const isPrivate = isPrivateOutputFile(file)
  const extension = card.extension.toLowerCase()
  return {
    key: outputFileKey(file, 0),
    name: card.name,
    mime: file.mime || file.mimeType,
    size: file.size,
    extension,
    sourceKind: hasPreviewContent(file)
      ? 'inline-content'
      : isPrivate
        ? 'private-file'
        : 'public-url',
    previewUrl: isPrivate
      ? resolveFileUrl(file, getPrivateFilePreviewUrl)
      : file.previewUrl || file.publicUrl || file.url || file.downloadUrl || '',
    downloadUrl: isPrivate
      ? resolveFileUrl(file, getPrivateFileDownloadUrl)
      : file.downloadUrl || file.url || file.publicUrl || file.previewUrl || '',
    content: file.previewContent,
    contentType: getFileContentType(String(file.previewContentType || file.fileType || extension)),
    loadBlob: card.canDownload ? () => loadFileBlob(file) : undefined,
    downloadFile: card.canDownload ? download : undefined,
  }
}

/**
 * 下载文件：私有文件带鉴权取回后按服务端给的文件名保存（返回 true，调用方可提示下载完成），
 * 公开文件交给浏览器（返回 false）。失败时抛错。
 */
export async function downloadOutputFile(card: FileCard): Promise<boolean> {
  const { file } = card
  if (isPrivateOutputFile(file)) {
    const privateUrl = getPrivateFileDownloadUrl(file)
    if (!privateUrl) throw new Error('Invalid private file download URL')
    const { response, blob } = await fetchPrivateFileBlob(privateUrl)
    downloadBlob(
      blob,
      filenameFromContentDisposition(response.headers.get('Content-Disposition')) || card.name
    )
    return true
  }
  const url = file.downloadUrl || file.url
  if (url) downloadUrl(url, card.name)
  return false
}
