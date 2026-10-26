import type { UnifiedMessage } from '@/types/chat'

/**
 * 解析 chat 消息的统一结构（chat_log.message）。
 * 入参可为 JSON 字符串或已解析对象，解析失败返回 null。
 * 与后端 server/src/modules/chatLog/unified-message.util.ts 行为一致，
 * 前端唯一的消息解析入口，禁止再手写 JSON.parse(message)。
 */
export function parseChatMessage(
  message: unknown
): (UnifiedMessage & Record<string, unknown>) | null {
  if (!message) return null
  try {
    let parsed: unknown = message
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as UnifiedMessage & Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** 从存量消息中提取 turn id（无效返回空串） */
export function parseStoredTurnId(storedMessage?: string | null): string {
  return String(parseChatMessage(storedMessage)?.turn?.id || '').trim()
}
