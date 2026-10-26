import { t } from '@/locales'
import { parseQuotedPrompt } from './quotePrompt'

function normalizePreviewText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replaceAll(/\s+/gu, ' ').trim()
}

function pickMessageTextFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  const directText = normalizePreviewText(record.content) || normalizePreviewText(record.text)
  if (directText) return directText

  const rounds = Array.isArray(record.rounds) ? record.rounds : []
  for (const round of rounds) {
    const text = pickMessageTextFromUnknown(round)
    if (text) return text
  }

  const parts = Array.isArray(record.parts) ? record.parts : []
  for (const part of parts) {
    const text = pickMessageTextFromUnknown(part)
    if (text) return text
  }

  return ''
}

function resolvePlainMessageText(item: Chat.Chat) {
  const raw = item.message || item.content || ''
  let text = normalizePreviewText(raw)

  if (typeof raw === 'string') {
    try {
      text = normalizePreviewText(pickMessageTextFromUnknown(JSON.parse(raw))) || text
    } catch {
      // 普通纯文本消息不需要 JSON 解析。
    }
  } else {
    text = normalizePreviewText(pickMessageTextFromUnknown(raw))
  }

  return text
}

/** 消息的纯文本摘要（导航预览等），超长截断；没有文本时返回空串 */
export function getPlainMessagePreview(item: Chat.Chat, limit = 72) {
  const text = resolvePlainMessageText(item)
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

export function getPlainMessageText(item: Chat.Chat) {
  // 带引用发出的提问取问题本身，不露出拼接用的标签
  const quoted = item.role === 'user' ? parseQuotedPrompt(item.content || '') : null
  const text = quoted ? normalizePreviewText(quoted.question) : resolvePlainMessageText(item)

  return text ? (text.length > 18 ? `${text.slice(0, 18)}...` : text) : t('chat.messageFallback')
}

/**
 * 对话消息列表的 key。模板里必须以函数调用的形式使用：v-for 同时带 v-memo 时，Vue 编译出的缓存判断是
 * `_cached && _cached.key === <key 表达式> && isMemoSame(_cached, memo)`，key 表达式不加括号；
 * 直接写三元表达式会被运算符优先级拆开，首次渲染就对 undefined 读 memo，整个对话画布渲染成空白。
 */
export function chatMessageKey(
  cid: string | null | undefined,
  workspaceId: string | null | undefined,
  index: number
) {
  return cid ? `msg-${cid}` : `pending-${workspaceId}-${index}`
}

export function waitForMilliseconds(duration: number) {
  return new Promise(resolve => {
    window.setTimeout(resolve, duration)
  })
}
