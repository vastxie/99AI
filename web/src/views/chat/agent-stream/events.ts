import type { AgentEvent } from '@99agent/contracts'
import { ChatLogStatus } from '@/constants/chatLogStatus'

export type ChatTerminalEventType =
  'agent.end' | 'agent.error' | 'snapshot.sync' | 'turn_done' | 'turn_error'

function normalizeTerminalStatus(status: unknown): ChatLogStatus | null {
  if (
    status === ChatLogStatus.COMPLETED ||
    status === ChatLogStatus.FAILED ||
    status === ChatLogStatus.STOPPED
  ) {
    return status
  }

  const normalized = String(status || '')
    .trim()
    .toLowerCase()
  if (['3', 'completed', 'success', 'stop'].includes(normalized)) {
    return ChatLogStatus.COMPLETED
  }
  if (['4', 'failed', 'error'].includes(normalized)) {
    return ChatLogStatus.FAILED
  }
  if (
    ['5', 'stopped', 'cancelled', 'canceled', 'abort', 'aborted', 'interrupted'].includes(
      normalized
    )
  ) {
    return ChatLogStatus.STOPPED
  }
  return null
}

/**
 * Agent 源事件、重连快照与 chat:sync 共用的终态投影口径。
 *
 * `agent.error` 必须携带明确 FAILED turn 状态才算权威终态；仅凭事件名或
 * `loading=false` 不得清理 pending queue intent。
 */
export function resolveChatTerminalStatus(input: {
  eventType: ChatTerminalEventType
  finishReason?: unknown
  status?: unknown
  turnStatus?: unknown
  turn?: { status?: unknown } | null
}): ChatLogStatus | null {
  const explicitStatus = input.status ?? input.turnStatus ?? input.turn?.status
  const normalizedStatus = normalizeTerminalStatus(explicitStatus)

  if (input.eventType === 'agent.error') {
    return normalizedStatus === ChatLogStatus.FAILED ? ChatLogStatus.FAILED : null
  }
  if (input.eventType === 'snapshot.sync') {
    return normalizedStatus
  }
  if (normalizedStatus !== null) {
    return normalizedStatus
  }
  if (input.eventType === 'turn_error') {
    return ChatLogStatus.FAILED
  }

  const finishReason = String(input.finishReason || '')
    .trim()
    .toLowerCase()
  if (finishReason === 'error') {
    return ChatLogStatus.FAILED
  }
  if (
    ['abort', 'aborted', 'cancelled', 'canceled', 'interrupted', 'stopped'].includes(finishReason)
  ) {
    return ChatLogStatus.STOPPED
  }
  return ChatLogStatus.COMPLETED
}

/** 判断是否为新协议 AgentEvent（type 带命名空间点号） */
export function isAgentEvent(event: any): event is AgentEvent {
  return (
    Boolean(event) &&
    typeof event.type === 'string' &&
    event.type.includes('.') &&
    typeof event.chatId === 'string' &&
    typeof event.timestamp === 'number'
  )
}

export function getAgentEventMessageId(event: AgentEvent | any): string {
  return String(event?.messageId || event?.cid || event?.data?.cid || event?.chatId || '').trim()
}

/**
 * 服务端在消息建立之前推的事件（预检拒绝、发起失败、接续轮没能启动）用占位 id：
 * 'pending' 或 'socket:<连接 id>'，不指向任何消息
 */
export function isPlaceholderMessageId(id: string): boolean {
  return id === 'pending' || id.startsWith('socket:')
}

export function getAgentEventTurnId(event: AgentEvent | any): string {
  return String(event?.turnId || event?.data?.turn?.id || '').trim()
}

export function getAgentEventRoundIndex(event: AgentEvent | any): number {
  const value = event?.roundId ?? event?.roundIndex ?? 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 事件流水号；无 seq 的控制事件返回 0 */
export function getAgentEventSeq(event: AgentEvent | any): number {
  const parsed = Number(event?.workflowSeq ?? event?.seq)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}
