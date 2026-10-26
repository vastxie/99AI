import { ChatLogStatus } from '@/constants/chatLogStatus'

/**
 * 助手消息是否仍在生成的唯一口径：store 的 isStreamIn、聊天页的恢复与 watchdog、输入框的「加入下一轮」、
 * 消息正文的活动行都用这里，不再各自判断。
 */
export const TERMINAL_CHAT_LOG_STATUSES = new Set<number>([
  ChatLogStatus.COMPLETED,
  ChatLogStatus.FAILED,
  ChatLogStatus.STOPPED,
])

type MessageStateInput =
  Pick<Chat.Chat, 'role' | 'loading' | 'status' | 'error' | 'recovery'> | null | undefined

/** 助手消息已经结束：出错，或状态已是完成 / 失败 / 停止（以终态为准，不看 loading） */
export function isAssistantFinished(message: MessageStateInput): boolean {
  return Boolean(
    message?.role === 'assistant' &&
    (message.error || TERMINAL_CHAT_LOG_STATUSES.has(Number(message.status)))
  )
}

/**
 * 助手消息仍在生成：没有结束，且在加载中或状态为生成中（刷新合并会丢掉 loading，状态照样算数）。
 * 本页已经跟丢、等用户手动重连的（recovery = stalled）不算：否则输入框一直停在「生成中」、
 * 删除会话等操作也一直被挡住；重连后事件恢复即回到生成中
 */
export function isAssistantRunning(message: MessageStateInput): boolean {
  if (message?.role !== 'assistant' || isAssistantFinished(message)) return false
  if (message.recovery === 'stalled') return false
  return Boolean(message.loading) || Number(message.status) === ChatLogStatus.GENERATING
}

/**
 * 助手消息还没有结局：仍在生成，或本页跟丢了（服务端可能仍在跑）。
 * 重新生成 / 编辑重发前的拦截、自动续接、排队显示的保留按这个口径：跟丢的回合不能被删，也要接着找回
 */
export function isAssistantUnsettled(message: MessageStateInput): boolean {
  if (message?.role !== 'assistant' || isAssistantFinished(message)) return false
  return Boolean(message.recovery) || isAssistantRunning(message)
}
