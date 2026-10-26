import { AGENT_EVENT_FIXTURE } from '../../../../../packages/contracts/fixtures/agent-events.fixture'
import { describe, expect, it } from 'vitest'

import { ChatLogStatus } from '@/constants/chatLogStatus'
import type { AgentEvent } from '@99agent/contracts'
import { getAgentEventSeq, isAgentEvent } from './events'
import { createAgentStreamSession, type FrameScheduler } from './streamSession'

/** 契约用例只看事件归约结果：增量同步落盘，不经过动画帧 */
const syncFrameScheduler: FrameScheduler = {
  request: callback => {
    callback()
    return null
  },
  cancel: () => {},
}

const events: AgentEvent[] = AGENT_EVENT_FIXTURE.events.map(entry => entry.event)

function requireFixture(type: AgentEvent['type']): AgentEvent {
  const event = events.find(candidate => candidate.type === type)
  if (!event) throw new Error(`${type} fixture missing`)
  return event
}

describe('shared Agent Event wire contract', () => {
  it('recognizes every canonical event through the Chat event guard', () => {
    expect(events.every(isAgentEvent)).toBe(true)
  })

  it('delivers the complete agent.start payload through the real stream session', async () => {
    const start = requireFixture('agent.start')
    if (start.type !== 'agent.start') throw new Error('agent.start fixture drifted')
    const expectedStart = structuredClone(start)
    const received: AgentEvent[] = []
    const session = createAgentStreamSession({
      frameScheduler: syncFrameScheduler,
      applyPatch: () => undefined,
      onAgentStart: event => {
        received.push(event)
      },
    })

    await session.applyEvent(start)

    expect(received).toEqual([expectedStart])
    session.dispose()
  })

  it('uses null snapshot status fallback and establishes the real seq baseline', async () => {
    const snapshot = requireFixture('snapshot.sync')
    if (snapshot.type !== 'snapshot.sync') throw new Error('snapshot.sync fixture drifted')
    const patches: Array<Partial<Chat.Chat>> = []
    const completions: string[] = []
    const session = createAgentStreamSession({
      cid: snapshot.chatId,
      frameScheduler: syncFrameScheduler,
      applyPatch: patch => patches.push(patch),
      onDone: input => completions.push(input.finishReason),
    })

    await session.applyEvent(snapshot)

    expect(session.lastSeq).toBe(17)
    expect(patches.at(-1)).toMatchObject({
      content: '已整理完成',
      status: ChatLogStatus.COMPLETED,
      loading: false,
    })
    expect(completions).toEqual(['stop'])
    session.dispose()
  })

  it('rejects a workflowSeq gap without conflating taskEventSeq', async () => {
    const turnStart = requireFixture('turn.start')
    const messageDelta = requireFixture('message.delta')
    const snapshot = requireFixture('snapshot.sync')
    const gaps: number[] = []
    const session = createAgentStreamSession({
      frameScheduler: syncFrameScheduler,
      applyPatch: () => undefined,
      onSeqGap: lastSeq => gaps.push(lastSeq),
    })

    await session.applyEvent(turnStart)
    await session.applyEvent(messageDelta)

    expect(session.lastSeq).toBe(1)
    expect(gaps).toEqual([1])
    expect(getAgentEventSeq(snapshot)).toBe(17)
    session.dispose()
  })
})
