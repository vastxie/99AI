import { describe, expect, it } from 'vitest'
import { shouldRouteAgentEventToForeground } from './routing'

function event(type: string, messageId?: string, chatId = 'c_pending') {
  return { type, chatId, messageId, timestamp: 1 } as any
}

describe('foreground agent event routing', () => {
  it('binds agent.start and agent.error to a freshly submitted stream without a target', () => {
    expect(shouldRouteAgentEventToForeground(event('agent.start', 'c_new'))).toBe(true)
    expect(shouldRouteAgentEventToForeground(event('agent.error'))).toBe(true)
    expect(shouldRouteAgentEventToForeground(event('message.delta', 'c_new'))).toBe(false)
  })

  it('等自己的 agent.start 时：别的提交的 agent.start、指向别的消息的 agent.error 都不认', () => {
    const awaiting = { awaitingSubmissionId: 'submission-mine' }
    const startOf = (submissionId?: string) =>
      ({ ...event('agent.start', 'c_new'), data: submissionId ? { submissionId } : {} }) as any
    expect(shouldRouteAgentEventToForeground(startOf('submission-mine'), awaiting)).toBe(true)
    expect(shouldRouteAgentEventToForeground(startOf('submission-other'), awaiting)).toBe(false)
    // 服务端没带提交号：照旧放行
    expect(shouldRouteAgentEventToForeground(startOf(), awaiting)).toBe(true)
    // 发起失败：只发给这个连接，不指向任何消息
    expect(
      shouldRouteAgentEventToForeground(event('agent.error', undefined, 'socket:abc'), awaiting)
    ).toBe(true)
    // 别处那一轮出错
    expect(shouldRouteAgentEventToForeground(event('agent.error', 'c_other'), awaiting)).toBe(false)
  })

  it('带提交号的 agent.error 按提交号认：别的一串回合（接续轮没能启动）推来的不认，自己的照收', () => {
    const awaiting = { awaitingSubmissionId: 'submission-mine' }
    const errorOf = (submissionId: string, messageId?: string, chatId = 'pending') =>
      ({ ...event('agent.error', messageId, chatId), data: { submissionId } }) as any
    expect(shouldRouteAgentEventToForeground(errorOf('submission-other'), awaiting)).toBe(false)
    expect(shouldRouteAgentEventToForeground(errorOf('submission-mine'), awaiting)).toBe(true)
    // 自己这一串的接续轮建好后出错（指向新的消息）：也是自己的
    expect(
      shouldRouteAgentEventToForeground(errorOf('submission-mine', 'c_next', 'c_next'), awaiting)
    ).toBe(true)
    // 已经在接收某一轮时，占位 id 的错误不指向它
    expect(
      shouldRouteAgentEventToForeground(errorOf('submission-mine'), { targetCid: 'c_active' })
    ).toBe(false)
  })

  it('routes events that belong to the active message', () => {
    expect(
      shouldRouteAgentEventToForeground(event('message.delta', 'c_active'), {
        targetCid: 'c_active',
      })
    ).toBe(true)
    expect(
      shouldRouteAgentEventToForeground(event('tool.end', 'c_other'), { targetCid: 'c_active' })
    ).toBe(false)
  })

  it('accepts events addressed to the active stream by chatId and drops unrelated ones', () => {
    expect(
      shouldRouteAgentEventToForeground(event('billing.update', undefined, 'c_active'), {
        targetCid: 'c_active',
      })
    ).toBe(true)
    expect(
      shouldRouteAgentEventToForeground(event('billing.update', undefined, 'c_other'), {
        targetCid: 'c_active',
      })
    ).toBe(false)
    expect(shouldRouteAgentEventToForeground(event('billing.update'))).toBe(false)
  })

  it('恢复的会话在接续窗口里：只认父回合是刚结束那一轮的 agent.start 与 agent.error，别处的不认', () => {
    const awaiting = { awaitingParentTurnId: 't-finished' }
    const startWithParent = (parentTurnId?: string) =>
      ({
        ...event('agent.start', 'c_next'),
        data: parentTurnId ? { turn: { id: 't-next', status: 'running', parentTurnId } } : {},
      }) as any
    expect(shouldRouteAgentEventToForeground(startWithParent('t-finished'), awaiting)).toBe(true)
    expect(shouldRouteAgentEventToForeground(startWithParent('t-elsewhere'), awaiting)).toBe(false)
    expect(shouldRouteAgentEventToForeground(startWithParent(), awaiting)).toBe(false)
    // 接续轮没能开始的错误走房间广播、带着父回合：自己的照收，别的一串回合的不认
    const errorWithParent = (parentTurnId?: string) =>
      ({
        ...event('agent.error', undefined, 'pending'),
        data: { code: 'EXECUTION_START_FAILED', submissionId: 'submission-x', parentTurnId },
      }) as any
    expect(shouldRouteAgentEventToForeground(errorWithParent('t-finished'), awaiting)).toBe(true)
    expect(shouldRouteAgentEventToForeground(errorWithParent('t-elsewhere'), awaiting)).toBe(false)
    // 不带父回合的（这个连接上别的操作失败）、指向别的消息的，都不是这一串的
    expect(shouldRouteAgentEventToForeground(errorWithParent(), awaiting)).toBe(false)
    expect(shouldRouteAgentEventToForeground(event('agent.error', 'c_other'), awaiting)).toBe(false)
  })
})
