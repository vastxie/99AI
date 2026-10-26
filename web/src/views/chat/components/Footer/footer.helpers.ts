import { t } from '@/locales'
import { parseStoredTurnId } from '@/utils/messageParser'

export function getMessageTurnId(item: Chat.Chat | undefined) {
  if (!item) return ''
  if (item.turnId) return String(item.turnId)
  return parseStoredTurnId(item.message)
}

export function getFileLimitMessage(current: number, limit: number, withAction = false) {
  const params = { current, limit }
  return withAction
    ? t('chat.fileCountLimitWithAction', params)
    : t('chat.fileCountLimitWithCurrent', params)
}

export function getSelectedFilesLimitMessage(selected: number, remaining: number) {
  return t('chat.selectedFilesLimit', { selected, remaining })
}

export function getTextareaMaxHeight(
  lineHeight: number,
  verticalPadding: number,
  cssMaxHeight: number,
  maxLines = 8
) {
  const lineBasedMaxHeight = lineHeight * maxLines + verticalPadding
  return Number.isFinite(cssMaxHeight) && cssMaxHeight > 0
    ? Math.min(lineBasedMaxHeight, cssMaxHeight)
    : lineBasedMaxHeight
}

/** 待发送附件在右侧预览面板中的标识：不含列表索引，删除其他附件导致的位移不影响匹配 */
export function getLocalFilePreviewKey(file: File) {
  return `pending-upload:${file.name}:${file.size}:${file.lastModified}`
}
