import { t } from '@/locales'

/** 附件种类，与消息里 urlItems 的 type 一致 */
export type AttachmentKind = Chat.UrlItem['type']

interface AttachmentRule {
  /** 认作这一类：MIME 前缀（文档类没有，兜底） */
  mimePrefix?: string
  /** 能上传：MIME 白名单或扩展名白名单命中其一 */
  mimes: string[]
  extensions: string[]
  unsupportedKey: string
  tooLargeKey: string
}

/** 上传白名单（按种类）；分类按先图片、再视频、再音频、最后文档的顺序认 */
const RULES: Record<AttachmentKind, AttachmentRule> = {
  image: {
    mimePrefix: 'image/',
    mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
    unsupportedKey: 'chat.unsupportedImageType',
    tooLargeKey: 'chat.imageSizeExceeded',
  },
  video: {
    mimePrefix: 'video/',
    mimes: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'],
    extensions: ['.mp4', '.webm', '.mov', '.avi'],
    unsupportedKey: 'chat.unsupportedVideoType',
    tooLargeKey: 'chat.videoSizeExceeded',
  },
  audio: {
    mimePrefix: 'audio/',
    mimes: [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
      'audio/flac',
      'audio/x-flac',
      'audio/x-m4a',
    ],
    extensions: ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm'],
    unsupportedKey: 'chat.unsupportedFileType',
    tooLargeKey: 'chat.fileSizeExceeded',
  },
  file: {
    mimes: [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/markdown',
      'application/zip',
      'application/x-zip-compressed',
    ],
    extensions: [
      '.pdf',
      '.txt',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.csv',
      '.ppt',
      '.pptx',
      '.md',
      '.markdown',
      '.zip',
    ],
    unsupportedKey: 'chat.unsupportedFileType',
    tooLargeKey: 'chat.fileSizeExceeded',
  },
}

/** 文件选择框的 accept：文档按扩展名，媒体按大类 */
export const UPLOAD_ACCEPT = [...RULES.file.extensions, 'image/*', 'video/*', 'audio/*'].join(', ')

function hasExtension(file: File, extensions: string[]) {
  const name = file.name.toLowerCase()
  return extensions.some(extension => name.endsWith(extension))
}

export function classifyAttachment(file: File): AttachmentKind {
  const kinds: AttachmentKind[] = ['image', 'video', 'audio']
  return (
    kinds.find(kind => {
      const rule = RULES[kind]
      return file.type.startsWith(rule.mimePrefix!) || hasExtension(file, rule.extensions)
    }) || 'file'
  )
}

/**
 * 附件能不能加：类型与大小。能加时返回 null，否则返回给用户看的原因。
 * 图片、视频、音频按 MIME 或扩展名认；文档只认白名单里的类型。
 */
export function rejectAttachment(file: File, kind: AttachmentKind, sizeLimitMb: number) {
  const rule = RULES[kind]
  if (!rule.mimes.includes(file.type) && !hasExtension(file, rule.extensions)) {
    return t(rule.unsupportedKey, { name: file.name })
  }
  if (file.size > sizeLimitMb * 1024 * 1024) {
    return t(rule.tooLargeKey, { size: (file.size / 1024 / 1024).toFixed(2), limit: sizeLimitMb })
  }
  return null
}
