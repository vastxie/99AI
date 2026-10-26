import { describe, expect, it } from 'vitest'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import { isAssistantFinished, isAssistantRunning } from './messageState'

const reply = (patch: Partial<Chat.Chat>) => ({ role: 'assistant' as const, ...patch })

describe('助手消息是否仍在生成', () => {
  it('加载中或状态为生成中都算在生成（刷新合并会丢掉 loading）', () => {
    expect(isAssistantRunning(reply({ loading: true }))).toBe(true)
    expect(isAssistantRunning(reply({ status: ChatLogStatus.GENERATING }))).toBe(true)
    expect(isAssistantRunning(reply({ status: ChatLogStatus.PENDING }))).toBe(false)
  })

  it('出错或进入终态就不再算在生成，即使 loading 还没清掉', () => {
    for (const patch of [
      { loading: true, error: true },
      { loading: true, status: ChatLogStatus.COMPLETED },
      { status: ChatLogStatus.GENERATING, error: true },
      { loading: true, status: ChatLogStatus.STOPPED },
      { loading: true, status: ChatLogStatus.FAILED },
    ]) {
      expect(isAssistantRunning(reply(patch)), JSON.stringify(patch)).toBe(false)
      expect(isAssistantFinished(reply(patch)), JSON.stringify(patch)).toBe(true)
    }
  })

  it('本页跟丢、等用户手动重连的回复不算在生成，也不算结束；重连中仍算在生成', () => {
    const stalled = reply({ status: ChatLogStatus.GENERATING, recovery: 'stalled' })
    expect(isAssistantRunning(stalled)).toBe(false)
    expect(isAssistantFinished(stalled)).toBe(false)
    expect(
      isAssistantRunning(reply({ status: ChatLogStatus.GENERATING, recovery: 'reconnecting' }))
    ).toBe(true)
  })

  it('用户消息与空值既不在生成也不算结束', () => {
    expect(isAssistantRunning({ role: 'user', loading: true })).toBe(false)
    expect(isAssistantFinished({ role: 'user', status: ChatLogStatus.COMPLETED })).toBe(false)
    expect(isAssistantRunning(undefined)).toBe(false)
  })
})
