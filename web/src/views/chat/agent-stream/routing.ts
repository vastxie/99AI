import type { AgentEvent } from '@99agent/contracts'
import { getAgentEventMessageId } from './events'

export interface AgentEventRoutingContext {
  targetCid?: string | null
  /**
   * 发送的会话在等 agent.start（刚发出、接续下一轮）：只认这一串回合的提交号。
   * 恢复的会话不知道提交号，不传
   */
  awaitingSubmissionId?: string | null
  /**
   * 恢复的会话在接续下一轮之前（handoff 窗口）：只认父回合是刚结束那一轮的 agent.start 与 agent.error，
   * 别的页签、别的会话同时发出的新一轮（及其接续轮的错误）不认
   */
  awaitingParentTurnId?: string | null
}

function parentTurnIdOf(event: AgentEvent) {
  const data = (event.data || {}) as { parentTurnId?: unknown; turn?: { parentTurnId?: unknown } }
  const envelope = event as { parentTurnId?: unknown }
  return String(envelope.parentTurnId || data.parentTurnId || data.turn?.parentTurnId || '').trim()
}

/**
 * 前台流只消费当前消息的事件。
 *
 * 新请求发送前会先清理上一条订阅，此时 targetCid 尚未建立。因此无活跃流时，
 * agent.start / agent.error 必须先进入前台会话，用服务端返回的 messageId 完成绑定。
 * 用户的每个页签都在每一轮的房间里：等自己的 agent.start 时，别的提交（别的页签、
 * 别的会话接续的下一轮）带来的不认，服务端没带提交号的照旧放行。agent.error 带着提交号的
 * （发起阶段与接续轮的错误）按提交号认；没带的只认发起失败的那种（只发给发起的连接、不指向任何消息），
 * 指向别的消息的是别处那一轮出错。恢复的会话不知道提交号，接续下一轮之前按父回合认。
 */
export function shouldRouteAgentEventToForeground(
  event: AgentEvent,
  context: AgentEventRoutingContext = {}
) {
  const eventMessageId = getAgentEventMessageId(event)
  const targetCid = String(context.targetCid || '').trim()

  if (targetCid && eventMessageId === targetCid) return true

  if (!targetCid && (event.type === 'agent.start' || event.type === 'agent.error')) {
    const awaiting = String(context.awaitingSubmissionId || '').trim()
    if (!awaiting) {
      const parentTurnId = String(context.awaitingParentTurnId || '').trim()
      if (!parentTurnId) return true
      // 接续轮的开始与错误都带着父回合（错误走房间广播，别的一串回合的也会收到）：按它认
      return parentTurnIdOf(event) === parentTurnId
    }
    const submissionId = event.data?.submissionId
    if (event.type === 'agent.error') {
      return submissionId ? submissionId === awaiting : !String(event.messageId || '').trim()
    }
    return !submissionId || submissionId === awaiting
  }

  if (targetCid) return !eventMessageId

  return false
}
