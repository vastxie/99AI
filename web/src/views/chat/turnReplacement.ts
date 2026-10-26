/**
 * 重新生成 / 编辑重发会删掉该轮之后的全部消息，删之前要过三道检查：
 * 有回复在运行就拒绝（运行中的回合不能被删，服务端也不会收到停止指令）；
 * 后面还有对话时先让用户确认删几轮；确认框开着期间别的端可能已经开始了新一轮，确认后再查一次。
 */
export type TurnReplacementDecision = 'confirmed' | 'cancelled' | 'running'

/**
 * 服务端拒绝替换的原因（chat:start 失败回执的错误码，拒绝时什么都没删）：
 * 这条提问已经不在、后面还有回复在生成、后面的轮数和用户确认的不一样（data.laterTurns 是实际轮数）
 */
export const TURN_REPLACE_CONFLICTS = [
  'REPLACE_TARGET_GONE',
  'TURN_RUNNING',
  'REPLACE_RANGE_CHANGED',
] as const
export type TurnReplaceConflict = (typeof TURN_REPLACE_CONFLICTS)[number]

export function turnReplaceConflictOf(error: unknown): TurnReplaceConflict | null {
  const code = (error as { code?: unknown } | null)?.code
  return TURN_REPLACE_CONFLICTS.find(item => item === code) ?? null
}

/** 某条消息之后还有几轮对话（按用户消息计） */
export function countLaterTurns(messages: Pick<Chat.Chat, 'cid' | 'role'>[], cid: string) {
  const index = messages.findIndex(item => item.cid === cid)
  if (index < 0) return 0
  return messages.slice(index + 1).filter(item => item.role === 'user').length
}

export async function confirmTurnReplacement(options: {
  isRunning: () => boolean
  laterTurns: number
  confirm: (laterTurns: number) => Promise<boolean>
}): Promise<TurnReplacementDecision> {
  if (options.isRunning()) return 'running'
  if (options.laterTurns > 0 && !(await options.confirm(options.laterTurns))) return 'cancelled'
  return options.isRunning() ? 'running' : 'confirmed'
}
