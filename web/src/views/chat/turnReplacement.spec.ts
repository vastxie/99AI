import { describe, expect, it, vi } from 'vitest'
import { confirmTurnReplacement, countLaterTurns, turnReplaceConflictOf } from './turnReplacement'

const messages = [
  { cid: 'u1', role: 'user' },
  { cid: 'a1', role: 'assistant' },
  { cid: 'u2', role: 'user' },
  { cid: 'a2', role: 'assistant' },
  { cid: 'u3', role: 'user' },
  { cid: 'a3', role: 'assistant' },
] as Chat.Chat[]

describe('重新生成 / 编辑重发前的检查', () => {
  it('按用户消息数出后面还有几轮；找不到或已是最后一轮时为 0', () => {
    expect(countLaterTurns(messages, 'a1')).toBe(2)
    expect(countLaterTurns(messages, 'u3')).toBe(0)
    expect(countLaterTurns(messages, 'missing')).toBe(0)
  })

  it('最后一轮不弹确认；后面还有对话时先确认，取消就不删', async () => {
    const confirm = vi.fn().mockResolvedValue(false)
    await expect(
      confirmTurnReplacement({ isRunning: () => false, laterTurns: 0, confirm })
    ).resolves.toBe('confirmed')
    expect(confirm).not.toHaveBeenCalled()

    await expect(
      confirmTurnReplacement({ isRunning: () => false, laterTurns: 2, confirm })
    ).resolves.toBe('cancelled')
    expect(confirm).toHaveBeenCalledWith(2)
  })

  it('有回复在运行时直接拒绝；确认框开着期间开始运行的，确认后也拒绝', async () => {
    const confirm = vi.fn().mockResolvedValue(true)
    await expect(
      confirmTurnReplacement({ isRunning: () => true, laterTurns: 1, confirm })
    ).resolves.toBe('running')
    expect(confirm).not.toHaveBeenCalled()

    let running = false
    confirm.mockImplementationOnce(async () => {
      running = true
      return true
    })
    await expect(
      confirmTurnReplacement({ isRunning: () => running, laterTurns: 1, confirm })
    ).resolves.toBe('running')
  })
})

describe('服务端拒绝替换的原因', () => {
  it('只认三种替换冲突，别的错误码不算', () => {
    expect(turnReplaceConflictOf({ code: 'REPLACE_TARGET_GONE' })).toBe('REPLACE_TARGET_GONE')
    expect(turnReplaceConflictOf({ code: 'TURN_RUNNING' })).toBe('TURN_RUNNING')
    expect(turnReplaceConflictOf({ code: 'REPLACE_RANGE_CHANGED' })).toBe('REPLACE_RANGE_CHANGED')
    expect(turnReplaceConflictOf({ code: 'BAD_REQUEST' })).toBeNull()
    expect(turnReplaceConflictOf(new Error('x'))).toBeNull()
    expect(turnReplaceConflictOf(null)).toBeNull()
  })
})
