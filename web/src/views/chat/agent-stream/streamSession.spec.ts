import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import type { AgentEvent } from '@99agent/contracts'
import { resolveChatTerminalStatus } from './events'
import { createAgentStreamSession, type FrameScheduler } from './streamSession'

/** 恢复投影相关的用例不关心节拍：每次增量立即落盘 */
const syncFrameScheduler: FrameScheduler = {
  request: callback => {
    callback()
    return null
  },
  cancel: () => {},
}

/** 手动推进的帧调度：断言「一帧只发布一次」与冲刷顺序 */
function createManualFrameScheduler() {
  const queue: Array<() => void> = []
  const scheduler: FrameScheduler = {
    request: callback => {
      queue.push(callback)
      return callback
    },
    cancel: handle => {
      const index = queue.indexOf(handle as () => void)
      if (index >= 0) queue.splice(index, 1)
    },
  }
  return {
    scheduler,
    flush() {
      queue.splice(0).forEach(callback => callback())
    },
    get pending() {
      return queue.length
    },
  }
}

function makeEvent(
  partial: Partial<AgentEvent> & { type: AgentEvent['type']; data: any }
): AgentEvent {
  return {
    chatId: 'assistant_1',
    messageId: 'assistant_1',
    timestamp: Date.now(),
    ...partial,
  } as AgentEvent
}

describe('createAgentStreamSession recovery projection', () => {
  it.each([
    ['chat sync error', { eventType: 'turn_error' as const }, ChatLogStatus.FAILED],
    [
      'normal source end',
      { eventType: 'agent.end' as const, finishReason: 'stop' },
      ChatLogStatus.COMPLETED,
    ],
    [
      'aborted source end',
      { eventType: 'agent.end' as const, finishReason: 'abort' },
      ChatLogStatus.STOPPED,
    ],
    [
      'explicit source failure',
      { eventType: 'agent.error' as const, turnStatus: 'failed' },
      ChatLogStatus.FAILED,
    ],
    [
      'non-terminal source error',
      { eventType: 'agent.error' as const, turnStatus: 'running' },
      null,
    ],
    [
      'interrupted resync snapshot',
      { eventType: 'snapshot.sync' as const, status: 'interrupted' },
      ChatLogStatus.STOPPED,
    ],
  ])('shares the terminal status projection for %s', (_label, input, expected) => {
    expect(resolveChatTerminalStatus(input)).toBe(expected)
  })

  it('uses terminal resync snapshots to clear loading and ignores following agent.end', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const onDone = vi.fn()
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      onDone,
    })

    await session.applyEvent(
      makeEvent({
        type: 'message.delta',
        seq: 1,
        data: { delta: 'stale' },
      })
    )
    await session.applyEvent(
      makeEvent({
        type: 'snapshot.sync',
        seq: 2,
        data: {
          reason: 'resync',
          content: '',
          status: ChatLogStatus.COMPLETED,
        },
      })
    )
    const patchCountAfterSnapshot = patches.length
    await session.applyEvent(
      makeEvent({
        type: 'agent.end',
        data: { finishReason: 'stop' },
      })
    )

    expect(patches.at(-1)).toMatchObject({
      cid: 'assistant_1',
      content: '',
      loading: false,
      status: ChatLogStatus.COMPLETED,
      liveToolCalls: [],
    })
    expect(patches).toHaveLength(patchCountAfterSnapshot)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0].finishReason).toBe('stop')
  })

  it('does not finish on workflow_complete snapshots even when they include terminal-looking fields', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const onDone = vi.fn()
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      onDone,
    })

    await session.applyEvent(
      makeEvent({
        type: 'snapshot.sync',
        seq: 1,
        data: {
          reason: 'workflow_complete',
          content: 'done',
          status: ChatLogStatus.COMPLETED,
          turnStatus: 'completed',
        },
      })
    )

    expect(patches.at(-1)).toMatchObject({
      content: 'done',
      loading: true,
    })
    expect(onDone).not.toHaveBeenCalled()
  })

  it('does not let terminal turnStatus override an explicit non-terminal resync status', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const onDone = vi.fn()
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      onDone,
    })

    await session.applyEvent(
      makeEvent({
        type: 'snapshot.sync',
        seq: 1,
        data: {
          reason: 'resync',
          content: 'still running',
          status: 'streaming',
          turnStatus: 'completed',
        },
      })
    )
    await session.applyEvent(
      makeEvent({
        type: 'agent.end',
        data: { finishReason: 'error' },
      })
    )

    expect(patches[0]).toMatchObject({
      content: 'still running',
      loading: true,
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0].finishReason).toBe('error')
    expect(patches.at(-1)).toMatchObject({
      status: ChatLogStatus.FAILED,
      loading: true,
    })
  })

  it('keeps workflow_complete snapshots open until a handoff agent.end arrives once', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const onDone = vi.fn()
    const onHandoff = vi.fn()
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      onDone,
      onHandoff,
    })

    await session.applyEvent(
      makeEvent({
        type: 'snapshot.sync',
        seq: 1,
        data: {
          reason: 'workflow_complete',
          content: 'done',
          turnStatus: 'completed',
        },
      })
    )
    const handoffEnd = makeEvent({
      type: 'agent.end',
      data: { finishReason: 'handoff' },
    })
    await session.applyEvent(handoffEnd)
    await session.applyEvent(handoffEnd)

    expect(onDone).not.toHaveBeenCalled()
    expect(onHandoff).toHaveBeenCalledTimes(1)
    expect(patches.at(-1)).toMatchObject({
      loading: false,
      status: ChatLogStatus.COMPLETED,
      liveToolCalls: [],
    })
  })

  it('resets ended state when a new agent.start arrives after handoff', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const onDone = vi.fn()
    const onHandoff = vi.fn()
    const onCidResolved = vi.fn()
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      onDone,
      onHandoff,
      onCidResolved,
    })

    await session.applyEvent(
      makeEvent({
        type: 'snapshot.sync',
        seq: 1,
        data: {
          reason: 'workflow_complete',
          content: 'first turn',
          turnStatus: 'completed',
        },
      })
    )
    const handoffEnd = makeEvent({
      type: 'agent.end',
      data: { finishReason: 'handoff' },
    })
    await session.applyEvent(handoffEnd)
    await session.applyEvent(handoffEnd)
    await session.applyEvent(
      makeEvent({
        type: 'agent.start',
        chatId: 'assistant_2',
        messageId: 'assistant_2',
        data: { initialMessages: {} },
      })
    )
    await session.applyEvent(
      makeEvent({
        type: 'message.delta',
        chatId: 'assistant_2',
        messageId: 'assistant_2',
        seq: 1,
        data: { delta: 'next turn' },
      })
    )
    await session.applyEvent(
      makeEvent({
        type: 'agent.end',
        chatId: 'assistant_2',
        messageId: 'assistant_2',
        data: { finishReason: 'stop' },
      })
    )

    expect(onHandoff).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0].finishReason).toBe('stop')
    expect(onCidResolved).not.toHaveBeenCalledWith('assistant_1')
    expect(onCidResolved).toHaveBeenCalledWith('assistant_2')
    expect(patches.at(-1)).toMatchObject({
      cid: 'assistant_2',
      content: 'next turn',
      status: ChatLogStatus.COMPLETED,
      liveToolCalls: [],
    })
  })

  it('deduplicates repeated terminal agent.end events', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const onDone = vi.fn()
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      onDone,
    })
    const doneEvent = makeEvent({
      type: 'agent.end',
      data: { finishReason: 'stop' },
    })

    await session.applyEvent(doneEvent)
    await session.applyEvent(doneEvent)

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(patches.filter(patch => patch.status === ChatLogStatus.COMPLETED)).toHaveLength(1)
  })

  it('uses workflowSeq instead of task timeline seq for stream gap tracking', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const onSeqGap = vi.fn()
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      onSeqGap,
    })

    await session.applyEvent(
      makeEvent({
        type: 'message.delta',
        seq: 99,
        workflowSeq: 1,
        data: { delta: 'ok' },
      })
    )

    expect(onSeqGap).not.toHaveBeenCalled()
    expect(patches.at(-1)).toMatchObject({ content: 'ok' })
  })

  it('占位 id（pending、socket:*）的错误不当成这一轮的 cid：之后自己的 agent.start 照常绑定', async () => {
    const onCidResolved = vi.fn()
    const onError = vi.fn()
    const session = createAgentStreamSession({
      applyPatch: () => true,
      frameScheduler: syncFrameScheduler,
      onCidResolved,
      onError,
    })
    for (const chatId of ['pending', 'socket:abc']) {
      await session.applyEvent({
        type: 'agent.error',
        chatId,
        timestamp: 1,
        data: { code: 'QUEUE_TURN_ERROR', message: '接续消息暂未启动' },
      } as AgentEvent)
    }
    expect(onError).toHaveBeenCalledTimes(2)
    expect(session.cid).toBe('')
    expect(onCidResolved).not.toHaveBeenCalled()

    await session.applyEvent(makeEvent({ type: 'agent.start', data: {} }))
    expect(session.cid).toBe('assistant_1')
    expect(onCidResolved).toHaveBeenCalledWith('assistant_1')
  })
})

describe('createAgentStreamSession reply phases', () => {
  const lastMessage = (patches: Partial<Chat.Chat>[]) =>
    JSON.parse(String(patches.filter(patch => 'message' in patch).at(-1)?.message))

  it('marks a round as process with its full text and clears the mark on correction', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      smoothReveal: false,
    })
    await session.applyEvent(
      makeEvent({ type: 'message.delta', seq: 1, roundId: '0', data: { delta: '先看' } })
    )
    await session.applyEvent(
      makeEvent({ type: 'message.delta', seq: 2, roundId: '0', data: { delta: '一下数据。' } })
    )
    await session.applyEvent(
      makeEvent({ type: 'message.phase', seq: 3, roundId: '0', data: { phase: 'process' } })
    )
    expect(lastMessage(patches).rounds[0]).toMatchObject({
      text: '先看一下数据。',
      phase: 'process',
    })

    await session.applyEvent(
      makeEvent({ type: 'message.phase', seq: 4, roundId: '0', data: { phase: 'answer' } })
    )
    expect(lastMessage(patches).rounds[0].phase).toBeUndefined()
  })

  it('rebuilds the stream buffer from snapshot rounds so later text lands in the right round', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      smoothReveal: false,
    })
    // 重连快照：content 只是回答（过程话术不在里面）
    await session.applyEvent(
      makeEvent({
        type: 'snapshot.sync',
        seq: 5,
        data: {
          reason: 'resync',
          content: 'FINAL',
          status: 'streaming',
          message: {
            role: 'assistant',
            content: 'FINAL',
            rounds: [
              { text: '先看看', thinking: null, toolCalls: [], completed: true, phase: 'process' },
              { text: 'FINAL', thinking: null, toolCalls: [], completed: false },
            ],
          },
        },
      })
    )
    await session.applyEvent(
      makeEvent({ type: 'message.delta', seq: 6, roundId: '1', data: { delta: '-MORE' } })
    )
    const last = patches.at(-1)!
    const rounds = lastMessage(patches).rounds
    const roundsTextLength = rounds.reduce(
      (sum: number, round: any) => sum + (round.text?.length || 0),
      0
    )
    // 渲染层：最后一轮 = rounds 文本 + content 多出来的部分
    expect(`${rounds[1].text}${String(last.content).slice(roundsTextLength)}`).toBe('FINAL-MORE')
    expect(rounds[0].text).toBe('先看看')
  })

  it('keeps each round intact when a phase, text, reasoning and tool event follow a reconnect snapshot', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      smoothReveal: false,
    })
    await session.applyEvent(
      makeEvent({
        type: 'snapshot.sync',
        seq: 3,
        data: {
          reason: 'resync',
          content: 'FINAL',
          status: 'streaming',
          message: {
            role: 'assistant',
            content: 'FINAL',
            rounds: [
              { text: 'PROCESS', thinking: '想一想', toolCalls: [], completed: true },
              { text: 'FINAL', thinking: '再想', toolCalls: [], completed: false },
            ],
          },
        },
      })
    )
    await session.applyEvent(
      makeEvent({ type: 'message.phase', seq: 4, roundId: '0', data: { phase: 'process' } })
    )
    await session.applyEvent(
      makeEvent({ type: 'message.phase', seq: 5, roundId: '1', data: { phase: 'process' } })
    )
    expect(lastMessage(patches).rounds.map((round: any) => round.text)).toEqual([
      'PROCESS',
      'FINAL',
    ])
    await session.applyEvent(
      makeEvent({ type: 'reasoning.delta', seq: 6, roundId: '1', data: { delta: '一下' } })
    )
    await session.applyEvent(
      makeEvent({ type: 'message.delta', seq: 7, roundId: '1', data: { delta: '-MORE' } })
    )
    await session.applyEvent(
      makeEvent({
        type: 'tool.start',
        seq: 8,
        roundId: '1',
        toolCallId: 'call_1',
        data: { name: 'bash', status: 'running' },
      })
    )
    const rounds = lastMessage(patches).rounds
    expect(rounds.map((round: any) => round.text)).toEqual(['PROCESS', 'FINAL-MORE'])
    expect(rounds.map((round: any) => round.thinking)).toEqual(['想一想', '再想一下'])
    expect(rounds.map((round: any) => round.phase)).toEqual(['process', 'process'])
  })

  it('finishes with the server reply text without writing it into any round', async () => {
    const patches: Partial<Chat.Chat>[] = []
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      smoothReveal: false,
    })
    await session.applyEvent(
      makeEvent({ type: 'message.delta', seq: 1, roundId: '0', data: { delta: '初稿完成。' } })
    )
    const reply = '初稿完成。\n\n要哪种风格？\n1. 科技感\n2. 手绘'
    await session.applyEvent(
      makeEvent({
        type: 'snapshot.sync',
        seq: 2,
        data: {
          reason: 'workflow_complete',
          content: reply,
          finishReason: 'stop',
          message: {
            role: 'assistant',
            content: reply,
            rounds: [{ text: '初稿完成。', thinking: null, toolCalls: [], completed: true }],
          },
        },
      })
    )
    await session.applyEvent(
      makeEvent({ type: 'agent.end', seq: 3, data: { finishReason: 'stop' } })
    )
    const last = patches.at(-1)!
    expect(last.content).toBe(reply)
    expect(lastMessage(patches).rounds).toHaveLength(1)
    expect(lastMessage(patches).rounds[0].text).toBe('初稿完成。')
  })
})

describe('createAgentStreamSession 按帧发布与平滑揭示', () => {
  type SessionOptions = Parameters<typeof createAgentStreamSession>[0]
  function createHarness(overrides: Partial<SessionOptions> = {}) {
    const frames = createManualFrameScheduler()
    const patches: Partial<Chat.Chat>[] = []
    let now = 0
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: frames.scheduler,
      now: () => now,
      smoothReveal: true,
      ...overrides,
    })
    return {
      session,
      patches,
      frames,
      /** 推进 ms 毫秒并执行一帧 */
      tick(ms = 16) {
        now += ms
        frames.flush()
      },
      advance(ms: number) {
        now += ms
      },
      lastContent: () => String(patches.at(-1)?.content ?? ''),
    }
  }
  const textDelta = (seq: number, text: string) =>
    makeEvent({ type: 'message.delta', seq, data: { delta: text } })

  it('一轮首段正文立刻可见并同步 rounds；同一帧内后续到达的大段按到达速度分摊到多帧', async () => {
    const harness = createHarness()
    const burst = '一'.repeat(40)
    await harness.session.applyEvent(textDelta(1, '你好'))
    await harness.session.applyEvent(textDelta(2, burst))
    expect(harness.patches).toHaveLength(0)
    expect(harness.frames.pending).toBe(1)

    harness.tick()
    expect(harness.patches).toHaveLength(1)
    const first = harness.patches[0]
    expect(String(first.content).startsWith('你好')).toBe(true)
    expect(String(first.content).length).toBeLessThan(2 + burst.length)
    expect(JSON.parse(first.message as string).rounds[0].text).toBe('你好')

    // 加速 → 匀速：每帧最多多出几个字，内容单调递增，几十帧内显示完
    const full = `你好${burst}`
    let ticks = 0
    let largestStep = 0
    while (harness.lastContent() !== full && ticks < 90) {
      const previous = harness.lastContent()
      harness.tick()
      ticks += 1
      const next = harness.lastContent()
      expect(full.startsWith(next)).toBe(true)
      expect(next.length).toBeGreaterThanOrEqual(previous.length)
      largestStep = Math.max(largestStep, next.length - previous.length)
    }
    expect(harness.lastContent()).toBe(full)
    expect(ticks).toBeLessThanOrEqual(60)
    expect(largestStep).toBeLessThanOrEqual(8)
    expect(harness.patches.slice(1).every(patch => !('message' in patch))).toBe(true)
    expect(harness.frames.pending).toBe(0)
  })

  it('稳定到达时显示紧跟到达，积压保持在容忍范围内并在到达停止后收敛', async () => {
    const harness = createHarness()
    let full = ''
    for (let index = 1; index <= 40; index += 1) {
      const piece = '文字流'
      full += piece
      await harness.session.applyEvent(textDelta(index, piece))
      harness.tick(25)
      if (index >= 6) {
        expect(full.length - harness.lastContent().length).toBeLessThanOrEqual(36)
      }
    }
    let ticks = 0
    while (harness.lastContent() !== full && ticks < 90) {
      harness.tick()
      ticks += 1
    }
    expect(harness.lastContent()).toBe(full)
    expect(ticks).toBeLessThanOrEqual(60)
  })

  it('结构事件到达前先追平并落盘，补丁顺序与事件顺序一致', async () => {
    const harness = createHarness()
    await harness.session.applyEvent(textDelta(1, 'abc'))
    await harness.session.applyEvent(textDelta(2, 'x'.repeat(30)))
    await harness.session.applyEvent(
      makeEvent({
        type: 'tool.start',
        seq: 3,
        toolCallId: 'tool-1',
        data: { name: 'bash', arguments: {}, status: 'running' },
      } as any)
    )

    expect(harness.frames.pending).toBe(0)
    expect(harness.patches).toHaveLength(2)
    expect(harness.patches[0]).toMatchObject({ content: `abc${'x'.repeat(30)}` })
    expect(harness.patches[1].liveToolCalls).toBeDefined()
  })

  it('思考增量按帧合并后随 message 下发，正文不变', async () => {
    const harness = createHarness()
    await harness.session.applyEvent(
      makeEvent({ type: 'reasoning.delta', seq: 1, data: { delta: '先' } })
    )
    await harness.session.applyEvent(
      makeEvent({ type: 'reasoning.delta', seq: 2, data: { delta: '想想' } })
    )
    harness.tick()

    expect(harness.patches).toHaveLength(1)
    expect(harness.patches[0]).toMatchObject({ content: '' })
    expect(JSON.parse(harness.patches[0].message as string).rounds[0].thinking).toBe('先想想')
  })

  it('思考文本第一段立刻下发，之后最多每 250ms 下发一次（整条消息要序列化）；结构事件前照常追平', async () => {
    vi.useFakeTimers()
    try {
      const harness = createHarness()
      await harness.session.applyEvent(
        makeEvent({ type: 'reasoning.delta', seq: 1, data: { delta: '一' } })
      )
      harness.tick()
      expect(harness.patches).toHaveLength(1)

      // 间隔内的思考增量先攒着
      await harness.session.applyEvent(
        makeEvent({ type: 'reasoning.delta', seq: 2, data: { delta: '二' } })
      )
      harness.tick(100)
      expect(harness.patches).toHaveLength(1)

      // 到点由定时器并进下一帧
      harness.advance(150)
      await vi.advanceTimersByTimeAsync(250)
      harness.tick()
      expect(harness.patches).toHaveLength(2)
      expect(JSON.parse(harness.patches[1].message as string).rounds[0].thinking).toBe('一二')

      // 结构事件（工具开始）到来前先把攒着的思考一起下发
      await harness.session.applyEvent(
        makeEvent({ type: 'reasoning.delta', seq: 3, data: { delta: '三' } })
      )
      await harness.session.applyEvent(
        makeEvent({
          type: 'turn.end',
          seq: 4,
          data: {},
        })
      )
      const thinking = harness.patches
        .map(patch => (patch.message ? JSON.parse(patch.message as string) : null))
        .filter(Boolean)
        .at(-1).rounds[0].thinking
      expect(thinking).toBe('一二三')
    } finally {
      vi.useRealTimers()
    }
  })

  it('思考之后的首段正文同步 rounds 并保留思考', async () => {
    const harness = createHarness()
    await harness.session.applyEvent(
      makeEvent({ type: 'reasoning.delta', seq: 1, data: { delta: '推理' } })
    )
    harness.tick()
    await harness.session.applyEvent(textDelta(2, '结论'))
    harness.tick()

    const message = JSON.parse(harness.patches.at(-1)!.message as string)
    expect(message.rounds[0]).toMatchObject({ thinking: '推理', text: '结论' })
    expect(harness.patches.at(-1)).toMatchObject({ content: '结论' })
  })

  it('agent.end 后剩余积压在时间预算内加速补完，终态与 onDone 延后到补完之后', async () => {
    const onDone = vi.fn()
    const harness = createHarness({ onDone })
    const burst = '一'.repeat(60)
    await harness.session.applyEvent(textDelta(1, '你好'))
    harness.tick()
    await harness.session.applyEvent(textDelta(2, burst))
    await harness.session.applyEvent(
      makeEvent({ type: 'agent.end', data: { finishReason: 'stop' } })
    )

    expect(onDone).not.toHaveBeenCalled()
    expect(harness.patches.at(-1)?.status).toBeUndefined()

    let ticks = 0
    let largestStep = 0
    while (!onDone.mock.calls.length && ticks < 60) {
      const previous = harness.lastContent()
      harness.tick()
      ticks += 1
      largestStep = Math.max(largestStep, harness.lastContent().length - previous.length)
    }
    // 500ms 预算内补完（16ms 一帧约 32 帧），且靠加速摊平而不是最后一帧倒出
    expect(ticks).toBeLessThanOrEqual(33)
    expect(largestStep).toBeLessThanOrEqual(20)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(harness.patches.at(-1)).toMatchObject({
      content: `你好${burst}`,
      status: ChatLogStatus.COMPLETED,
    })
    expect(harness.frames.pending).toBe(0)
    const count = harness.patches.length
    harness.tick()
    expect(harness.patches).toHaveLength(count)
  })

  it('没有积压时 agent.end 立即落终态，之后不再有帧发布', async () => {
    const onDone = vi.fn()
    const harness = createHarness({ onDone })
    await harness.session.applyEvent(textDelta(1, '最后一段'))
    await harness.session.applyEvent(
      makeEvent({ type: 'agent.end', data: { finishReason: 'stop' } })
    )

    expect(harness.frames.pending).toBe(0)
    expect(harness.patches[0]).toMatchObject({ content: '最后一段', loading: true })
    expect(harness.patches.at(-1)).toMatchObject({
      content: '最后一段',
      status: ChatLogStatus.COMPLETED,
    })
    expect(JSON.parse(harness.patches.at(-1)!.message as string).rounds[0].text).toBe('最后一段')
    const count = harness.patches.length
    harness.tick()
    expect(harness.patches).toHaveLength(count)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('补完期间 dispose 会立即落终态一次', async () => {
    const onDone = vi.fn()
    const harness = createHarness({ onDone })
    await harness.session.applyEvent(textDelta(1, '你好'))
    harness.tick()
    await harness.session.applyEvent(textDelta(2, '一'.repeat(60)))
    await harness.session.applyEvent(
      makeEvent({ type: 'agent.end', data: { finishReason: 'stop' } })
    )
    harness.session.dispose()

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(harness.patches.at(-1)).toMatchObject({
      content: `你好${'一'.repeat(60)}`,
      status: ChatLogStatus.COMPLETED,
    })
    const count = harness.patches.length
    harness.tick()
    expect(harness.patches).toHaveLength(count)
  })

  it('没有终态时 dispose 补发正文并把它写进 rounds，不带 loading 标记', async () => {
    const harness = createHarness()
    await harness.session.applyEvent(textDelta(1, 'a'))
    await harness.session.applyEvent(textDelta(2, 'b'.repeat(40)))
    harness.session.dispose()

    const last = harness.patches.at(-1)!
    expect(last.content).toBe(`a${'b'.repeat(40)}`)
    // 渲染层在不再生成时只认 rounds：停止后要看到全部正文，rounds 里必须是全文
    expect(JSON.parse(last.message as string).rounds[0].text).toBe(`a${'b'.repeat(40)}`)
    expect('loading' in last).toBe(false)
    expect('status' in last).toBe(false)
    const count = harness.patches.length
    harness.tick()
    expect(harness.patches).toHaveLength(count)
  })

  it('正文已全部显示、没有积压时 dispose 仍把它写进 rounds', async () => {
    const harness = createHarness()
    for (const [seq, text] of [
      [1, '片段 1。'],
      [2, '片段 2。'],
      [3, '片段 3。'],
    ] as const) {
      await harness.session.applyEvent(textDelta(seq, text))
      // 让平滑揭示追平，正文全部发布出去
      for (let i = 0; i < 20; i += 1) harness.tick()
    }
    expect(harness.patches.at(-1)!.content).toBe('片段 1。片段 2。片段 3。')
    const count = harness.patches.length
    harness.session.dispose()

    expect(harness.patches).toHaveLength(count + 1)
    const last = harness.patches.at(-1)!
    expect(last.content).toBe('片段 1。片段 2。片段 3。')
    expect(JSON.parse(last.message as string).rounds[0].text).toBe('片段 1。片段 2。片段 3。')
    expect('loading' in last).toBe(false)
  })

  it('settleText 把手里的正文落盘（content 与 rounds 都是全文），会话照常接着收事件', async () => {
    const harness = createHarness()
    await harness.session.applyEvent(textDelta(1, 'a'))
    await harness.session.applyEvent(textDelta(2, 'b'.repeat(40)))
    harness.session.settleText()

    const settled = harness.patches.at(-1)!
    expect(settled.content).toBe(`a${'b'.repeat(40)}`)
    expect(JSON.parse(settled.message as string).rounds[0].text).toBe(`a${'b'.repeat(40)}`)
    expect('loading' in settled).toBe(false)
    // 没有新事件时不再多发；之前排着的那一帧也已取消
    const count = harness.patches.length
    harness.tick()
    expect(harness.patches).toHaveLength(count)

    // 订阅还在：事件再到，照常写入并回到生成中
    await harness.session.applyEvent(textDelta(3, 'c'))
    for (let i = 0; i < 20; i += 1) harness.tick()
    expect(harness.patches.at(-1)).toMatchObject({ content: `a${'b'.repeat(40)}c`, loading: true })
  })

  it('这条回复已由别处落成终态时 dispose 不再补发：手里的正文是旧的', async () => {
    let settled = false
    const harness = createHarness({ isSettled: () => settled })
    await harness.session.applyEvent(textDelta(1, 'a'))
    await harness.session.applyEvent(textDelta(2, 'b'.repeat(40)))
    // 还有没揭示完的积压、rounds 也落后于全文：平时都会补发
    settled = true
    const count = harness.patches.length
    harness.session.dispose()
    expect(harness.patches).toHaveLength(count)
    harness.tick()
    expect(harness.patches).toHaveLength(count)
  })

  it('rounds 已经是全文时 dispose 不多发补丁', async () => {
    const harness = createHarness()
    await harness.session.applyEvent(textDelta(1, '只有这一段'))
    for (let i = 0; i < 20; i += 1) harness.tick()
    const count = harness.patches.length
    harness.session.dispose()
    expect(harness.patches).toHaveLength(count)
  })

  it('取消订阅时节流里还没下发的思考一起落盘，不丢最后一段', async () => {
    vi.useFakeTimers()
    try {
      const harness = createHarness()
      await harness.session.applyEvent(
        makeEvent({ type: 'reasoning.delta', seq: 1, data: { delta: '一' } })
      )
      harness.tick()
      await harness.session.applyEvent(
        makeEvent({ type: 'reasoning.delta', seq: 2, data: { delta: '二' } })
      )
      harness.tick(100)
      const count = harness.patches.length
      harness.session.dispose()

      expect(harness.patches).toHaveLength(count + 1)
      const last = harness.patches.at(-1)!
      expect(JSON.parse(last.message as string).rounds[0].thinking).toBe('一二')
      expect('loading' in last).toBe(false)
      await vi.advanceTimersByTimeAsync(500)
      harness.tick()
      expect(harness.patches).toHaveLength(count + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('关闭平滑时到达即全量显示', async () => {
    const harness = createHarness({ smoothReveal: false })
    await harness.session.applyEvent(textDelta(1, '你好'))
    await harness.session.applyEvent(textDelta(2, '一'.repeat(40)))
    harness.tick()
    expect(harness.patches).toHaveLength(1)
    expect(harness.lastContent()).toBe(`你好${'一'.repeat(40)}`)
  })

  it('快照、错误与 handoff 到达前同样先追平落盘，顺序不乱', async () => {
    const snapshot = createHarness()
    await snapshot.session.applyEvent(textDelta(1, '半句'))
    await snapshot.session.applyEvent(
      makeEvent({
        type: 'snapshot.sync',
        seq: 2,
        data: { reason: 'resync', content: '半句话全文', status: 'streaming' },
      })
    )
    expect(snapshot.frames.pending).toBe(0)
    expect(snapshot.patches.map(patch => patch.content)).toEqual(['半句', '半句话全文'])

    const failing = createHarness()
    await failing.session.applyEvent(textDelta(1, '出错前'))
    await failing.session.applyEvent(makeEvent({ type: 'agent.error', data: { message: 'boom' } }))
    expect(failing.frames.pending).toBe(0)
    expect(failing.patches[0]).toMatchObject({ content: '出错前', loading: true })
    expect(failing.patches.at(-1)).toMatchObject({
      error: true,
      loading: false,
      errorMessage: 'boom',
      errorRetryable: true,
    })

    const notRetryable = createHarness()
    await notRetryable.session.applyEvent(textDelta(1, '开头'))
    await notRetryable.session.applyEvent(
      makeEvent({ type: 'agent.error', data: { message: '内容不合规', retryable: false } })
    )
    expect(notRetryable.patches.at(-1)).toMatchObject({
      errorMessage: '内容不合规',
      errorRetryable: false,
    })

    const onHandoff = vi.fn()
    const handoff = createHarness({ onHandoff })
    await handoff.session.applyEvent(textDelta(1, '交接前'))
    await handoff.session.applyEvent(
      makeEvent({ type: 'agent.end', data: { finishReason: 'handoff' } })
    )
    expect(handoff.frames.pending).toBe(0)
    expect(handoff.patches[0]).toMatchObject({ content: '交接前' })
    expect(handoff.patches.at(-1)).toMatchObject({
      loading: false,
      status: ChatLogStatus.COMPLETED,
    })
    expect(onHandoff).toHaveBeenCalledTimes(1)
  })
})

describe('createAgentStreamSession 补发快照的收尾原因与挂起的实时收尾（R40）', () => {
  type SessionOptions = Parameters<typeof createAgentStreamSession>[0]
  const resyncSnapshot = (data: Record<string, unknown>, partial: Record<string, unknown> = {}) =>
    makeEvent({ type: 'snapshot.sync', ...partial, data: { reason: 'resync', ...data } })
  const snapshotMessage = (text: string, turnId = 't-parent') => ({
    role: 'assistant',
    content: text,
    rounds: [{ text, thinking: null, toolCalls: [] }],
    turn: { id: turnId, status: 'completed' },
  })

  function createSyncSession(overrides: Partial<SessionOptions> = {}) {
    const patches: Partial<Chat.Chat>[] = []
    const onDone = vi.fn()
    const onSeqGap = vi.fn()
    const session = createAgentStreamSession({
      cid: 'assistant_1',
      applyPatch: patch => patches.push(patch),
      frameScheduler: syncFrameScheduler,
      smoothReveal: false,
      onDone,
      onSeqGap,
      ...overrides,
    })
    return { session, patches, onDone, onSeqGap }
  }

  it('「完成 + handoff」：父轮按快照落成完成并交接一次；之后父轮的事件被忽略（不报跳号），接续轮只有自己的内容', async () => {
    const onHandoff = vi.fn()
    const { session, patches, onDone, onSeqGap } = createSyncSession({ onHandoff })
    await session.applyEvent(makeEvent({ type: 'message.delta', seq: 1, data: { delta: '本地' } }))
    await session.applyEvent(
      resyncSnapshot(
        {
          content: '父轮定稿',
          status: 'completed',
          finishReason: 'handoff',
          message: snapshotMessage('父轮定稿'),
        },
        { seq: 7 }
      )
    )

    expect(onHandoff).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    expect(
      patches.find(patch => patch.cid === 'assistant_1' && patch.status === ChatLogStatus.COMPLETED)
    ).toMatchObject({ content: '父轮定稿', loading: false })
    expect(patches.at(-1)).toMatchObject({ loading: false, status: ChatLogStatus.COMPLETED })
    expect(session.cid).toBe('')
    expect(session.lastSeq).toBe(0)
    expect(session.turnId).toBe('t-parent')

    const before = patches.length
    await session.applyEvent(makeEvent({ type: 'agent.end', data: { finishReason: 'stop' } }))
    await session.applyEvent(makeEvent({ type: 'message.delta', seq: 9, data: { delta: '迟到' } }))
    expect(patches).toHaveLength(before)
    expect(onSeqGap).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()

    const next = { chatId: 'assistant_2', messageId: 'assistant_2' }
    await session.applyEvent(makeEvent({ type: 'agent.start', ...next, data: {} }))
    await session.applyEvent(
      makeEvent({ type: 'message.delta', ...next, seq: 1, data: { delta: '接续' } })
    )
    expect(patches.filter(patch => patch.cid === 'assistant_2').at(-1)?.content).toBe('接续')
  })

  it('接续轮开始之后迟到的父轮事件也忽略：会话不被拉回父轮', async () => {
    const onHandoff = vi.fn()
    const onCidResolved = vi.fn()
    const { session, patches } = createSyncSession({ onHandoff, onCidResolved })
    await session.applyEvent(
      resyncSnapshot(
        { content: '父轮定稿', status: 'completed', finishReason: 'handoff' },
        { seq: 3 }
      )
    )
    const next = { chatId: 'assistant_2', messageId: 'assistant_2' }
    await session.applyEvent(makeEvent({ type: 'agent.start', ...next, data: {} }))
    await session.applyEvent(
      makeEvent({ type: 'message.delta', ...next, seq: 1, data: { delta: '接续' } })
    )
    const count = patches.length
    await session.applyEvent(resyncSnapshot({ content: '父轮旧快照', status: 'streaming' }))
    await session.applyEvent(makeEvent({ type: 'message.delta', data: { delta: '父轮迟到' } }))
    expect(patches).toHaveLength(count)
    expect(session.cid).toBe('assistant_2')
    expect(onCidResolved).not.toHaveBeenCalledWith('assistant_1')
  })

  it('「完成 + handoff」但调用方不接续（没有 onHandoff）：按 handoff 结束，不清 cid', async () => {
    const { session, onDone } = createSyncSession()
    await session.applyEvent(
      resyncSnapshot({ content: '父轮定稿', status: 'completed', finishReason: 'handoff' })
    )
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0].finishReason).toBe('handoff')
    expect(session.cid).toBe('assistant_1')
  })

  it.each([
    ['length', 'length'],
    [undefined, 'stop'],
    ['bogus', 'stop'],
  ])('「完成 + %s」：收尾原因为 %s', async (finishReason, expected) => {
    const { session, onDone } = createSyncSession({ onHandoff: vi.fn() })
    await session.applyEvent(resyncSnapshot({ content: 'x', status: 'completed', finishReason }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0].finishReason).toBe(expected)
  })

  it.each([
    ['failed', 'error'],
    ['interrupted', 'abort'],
  ])('状态优先：「%s + handoff」按 %s 结束，不交接', async (status, expected) => {
    const onHandoff = vi.fn()
    const { session, onDone } = createSyncSession({ onHandoff })
    await session.applyEvent(resyncSnapshot({ content: 'x', status, finishReason: 'handoff' }))
    expect(onHandoff).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0].finishReason).toBe(expected)
  })

  it('没有挂起收尾的非终态补发快照照常应用：正文与投影换成快照的，不触发回调', async () => {
    const onHandoff = vi.fn()
    const { session, patches, onDone } = createSyncSession({ onHandoff })
    await session.applyEvent(makeEvent({ type: 'message.delta', seq: 1, data: { delta: '本地' } }))
    await session.applyEvent(
      resyncSnapshot(
        { content: '快照正文', status: 'streaming', message: snapshotMessage('快照正文') },
        { seq: 4 }
      )
    )
    expect(patches.at(-1)).toMatchObject({ cid: 'assistant_1', content: '快照正文', loading: true })
    expect(JSON.parse(patches.at(-1)?.message as string).rounds[0].text).toBe('快照正文')
    expect(onDone).not.toHaveBeenCalled()
    expect(onHandoff).not.toHaveBeenCalled()
  })

  describe('挂起的实时收尾（平滑揭示补完期间）遇到同一条消息的补发快照', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    function createPendingHarness(overrides: Partial<SessionOptions> = {}) {
      const queue: Array<() => void> = []
      const frames: FrameScheduler = {
        request: callback => {
          queue.push(callback)
          return callback
        },
        cancel: handle => {
          const index = queue.indexOf(handle as () => void)
          if (index >= 0) queue.splice(index, 1)
        },
      }
      const patches: Partial<Chat.Chat>[] = []
      const onDone = vi.fn()
      const onHandoff = vi.fn()
      const onSeqGap = vi.fn()
      let now = 0
      const session = createAgentStreamSession({
        cid: 'assistant_1',
        applyPatch: patch => patches.push(patch),
        frameScheduler: frames,
        now: () => now,
        smoothReveal: true,
        onDone,
        onHandoff,
        onSeqGap,
        ...overrides,
      })
      return {
        session,
        patches,
        onDone,
        onHandoff,
        onSeqGap,
        pendingFrames: () => queue.length,
        tick(ms = 16) {
          now += ms
          queue.splice(0).forEach(callback => callback())
        },
        drain() {
          for (let index = 0; index < 200 && queue.length > 0; index += 1) this.tick()
        },
      }
    }

    /**
     * 父轮先有：序号、turnId、思考、两轮正文、一个运行中的实时工具卡、与 rounds 正文不同的回复正文
     * （workflow_complete 快照）；随后又来一段思考（落在节流间隔内，留下定时器）与大段正文（积压），
     * 实时 agent.end 因积压挂起。返回前确认定时器与待执行帧都在
     */
    async function buildParentAndPend(
      harness: ReturnType<typeof createPendingHarness>,
      finishReason: string
    ) {
      const parent = { turnId: 't-parent' }
      await harness.session.applyEvent(
        makeEvent({ type: 'reasoning.delta', ...parent, seq: 1, data: { delta: '思考一' } })
      )
      harness.tick()
      await harness.session.applyEvent(
        makeEvent({ type: 'message.delta', ...parent, seq: 2, data: { delta: '过程' } })
      )
      await harness.session.applyEvent(
        makeEvent({
          type: 'tool.update',
          ...parent,
          seq: 3,
          toolCallId: 'tool-live',
          data: { name: 'image_gen', status: 'running', output: { estimatedProgress: 40 } },
        } as any)
      )
      harness.tick()
      await harness.session.applyEvent(
        makeEvent({
          type: 'message.delta',
          ...parent,
          seq: 4,
          roundId: 1,
          data: { delta: '回答' },
        } as any)
      )
      await harness.session.applyEvent(
        makeEvent({ type: 'reasoning.delta', ...parent, seq: 5, data: { delta: '思考二' } })
      )
      await harness.session.applyEvent(
        makeEvent({
          type: 'snapshot.sync',
          ...parent,
          seq: 6,
          data: { reason: 'workflow_complete', content: '回复正文（定稿）' },
        })
      )
      // 上面的快照刚把思考随 message 下发：这一段落在节流间隔内，留下定时器
      await harness.session.applyEvent(
        makeEvent({ type: 'reasoning.delta', ...parent, seq: 7, data: { delta: '思考三' } })
      )
      await harness.session.applyEvent(
        makeEvent({
          type: 'message.delta',
          ...parent,
          seq: 8,
          roundId: 1,
          data: { delta: '积压'.repeat(40) },
        } as any)
      )
      await harness.session.applyEvent(
        makeEvent({ type: 'agent.end', ...parent, seq: 9, data: { finishReason } })
      )
      expect(harness.pendingFrames()).toBeGreaterThan(0)
      expect(vi.getTimerCount()).toBeGreaterThan(0)
      expect(harness.onDone).not.toHaveBeenCalled()
      expect(harness.onHandoff).not.toHaveBeenCalled()
    }

    /** 目标快照之后：没有残留帧与定时器，推进时间也不再发布 */
    async function expectQuietAfter(harness: ReturnType<typeof createPendingHarness>) {
      expect(harness.pendingFrames()).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
      const count = harness.patches.length
      vi.advanceTimersByTime(1000)
      harness.drain()
      expect(harness.patches).toHaveLength(count)
    }

    const parentSnapshot = (status: string, finishReason?: string) =>
      resyncSnapshot(
        {
          content: '父轮快照正文',
          status,
          ...(finishReason ? { finishReason } : {}),
          message: snapshotMessage('父轮快照正文'),
        },
        { seq: 10, turnId: 't-parent' }
      )

    it('挂起 handoff + 快照「完成 + stop」：父轮按快照落成完成，交接一次（原因按实时）；接续轮不带父轮的任何状态', async () => {
      const harness = createPendingHarness()
      await buildParentAndPend(harness, 'handoff')
      const before = harness.patches.length
      await harness.session.applyEvent(parentSnapshot('completed', 'stop'))

      expect(harness.onHandoff).toHaveBeenCalledTimes(1)
      expect(harness.onDone).not.toHaveBeenCalled()
      const after = harness.patches.slice(before)
      expect(after.some(patch => patch.cid === '')).toBe(false)
      const finalPatch = after.find(
        patch => patch.status === ChatLogStatus.COMPLETED && 'content' in patch
      )
      expect(finalPatch).toMatchObject({
        cid: 'assistant_1',
        content: '父轮快照正文',
        liveToolCalls: [],
      })
      expect(JSON.parse(finalPatch?.message as string).rounds[0].text).toBe('父轮快照正文')
      expect(harness.patches.at(-1)).toMatchObject({
        loading: false,
        status: ChatLogStatus.COMPLETED,
      })
      await expectQuietAfter(harness)

      const next = { chatId: 'assistant_2', messageId: 'assistant_2', turnId: 't-next' }
      await harness.session.applyEvent(makeEvent({ type: 'agent.start', ...next, data: {} }))
      await harness.session.applyEvent(
        makeEvent({ type: 'message.delta', ...next, seq: 1, data: { delta: '接续' } })
      )
      await harness.session.applyEvent(
        makeEvent({ type: 'agent.end', ...next, seq: 2, data: { finishReason: 'stop' } })
      )
      harness.drain()
      const continuation = harness.patches.filter(patch => patch.cid === 'assistant_2')
      const last = continuation.at(-1)
      expect(last).toMatchObject({
        content: '接续',
        status: ChatLogStatus.COMPLETED,
        liveToolCalls: [],
      })
      const message = JSON.parse(last?.message as string)
      expect(message.rounds).toHaveLength(1)
      expect(message.rounds[0]).toMatchObject({ text: '接续', thinking: null, toolCalls: [] })
      expect(continuation.every(patch => !String(patch.content ?? '').includes('父轮'))).toBe(true)
      expect(harness.onDone).toHaveBeenCalledTimes(1)
      expect(harness.onSeqGap).not.toHaveBeenCalled()
    })

    it.each([
      ['stop', ChatLogStatus.COMPLETED, 'completed'],
      ['error', ChatLogStatus.FAILED, 'failed'],
      ['abort', ChatLogStatus.STOPPED, 'interrupted'],
    ])(
      '挂起 %s + 终态快照：收尾补丁的正文是快照的、状态按实时原因、loading 仍为 true；回调一次，重复的 agent.end 与残留帧、定时器不再发布',
      async (finishReason, status, snapshotStatus) => {
        const harness = createPendingHarness()
        await buildParentAndPend(harness, finishReason)
        await harness.session.applyEvent(parentSnapshot(snapshotStatus))

        expect(harness.onDone).toHaveBeenCalledTimes(1)
        expect(harness.onDone.mock.calls[0][0].finishReason).toBe(finishReason)
        expect(harness.onDone.mock.calls[0][0].event.type).toBe('agent.end')
        expect(harness.patches.at(-1)).toMatchObject({
          cid: 'assistant_1',
          content: '父轮快照正文',
          status,
          loading: true,
          liveToolCalls: [],
        })
        await expectQuietAfter(harness)

        const count = harness.patches.length
        await harness.session.applyEvent(
          makeEvent({ type: 'agent.end', turnId: 't-parent', data: { finishReason } })
        )
        harness.drain()
        expect(harness.patches).toHaveLength(count)
        expect(harness.onDone).toHaveBeenCalledTimes(1)
      }
    )

    it('挂起 stop + 非终态快照（带新的正文与投影）：仍按实时原因收尾一次，正文与投影是快照的', async () => {
      const harness = createPendingHarness()
      await buildParentAndPend(harness, 'stop')
      await harness.session.applyEvent(parentSnapshot('streaming'))
      expect(harness.onDone).toHaveBeenCalledTimes(1)
      expect(harness.onDone.mock.calls[0][0].finishReason).toBe('stop')
      expect(harness.patches.at(-1)).toMatchObject({
        content: '父轮快照正文',
        status: ChatLogStatus.COMPLETED,
        loading: true,
      })
      expect(JSON.parse(harness.patches.at(-1)?.message as string).rounds[0].text).toBe(
        '父轮快照正文'
      )
      await expectQuietAfter(harness)
    })

    it('挂起 stop + 只有实时工具进度变化的非终态快照：不走进度的提前退出，仍收尾一次并清空实时工具卡', async () => {
      const harness = createPendingHarness()
      const liveTool = {
        type: 'tool.update',
        seq: 2,
        toolCallId: 'tool-live',
        data: { name: 'image_gen', status: 'running', output: { estimatedProgress: 40 } },
      }
      await harness.session.applyEvent(
        makeEvent({ type: 'message.delta', seq: 1, data: { delta: '过程' } })
      )
      await harness.session.applyEvent(makeEvent(liveTool as any))
      // 工具事件刚把投影随 message 下发：这段思考落在节流间隔内，留下定时器
      await harness.session.applyEvent(
        makeEvent({ type: 'reasoning.delta', seq: 3, data: { delta: '思考' } })
      )
      await harness.session.applyEvent(
        makeEvent({ type: 'message.delta', seq: 4, data: { delta: '积压'.repeat(40) } })
      )
      await harness.session.applyEvent(
        makeEvent({ type: 'agent.end', seq: 5, data: { finishReason: 'stop' } })
      )
      expect(harness.pendingFrames()).toBeGreaterThan(0)
      expect(vi.getTimerCount()).toBeGreaterThan(0)
      // 与本地稳定投影相同、只多了运行中工具进度的快照（会被当成「只是工具进度变化」）
      const progressMessage = {
        role: 'assistant',
        content: '',
        rounds: [
          {
            text: `过程${'积压'.repeat(40)}`,
            thinking: '思考',
            toolCalls: [
              {
                id: 'tool-live',
                name: 'image_gen',
                status: 'loading',
                output: { estimatedProgress: 60 },
              },
            ],
          },
        ],
      }
      await harness.session.applyEvent(
        resyncSnapshot({ status: 'streaming', message: progressMessage }, { seq: 6 })
      )
      expect(harness.onDone).toHaveBeenCalledTimes(1)
      expect(harness.onDone.mock.calls[0][0].finishReason).toBe('stop')
      expect(harness.patches.at(-1)).toMatchObject({
        status: ChatLogStatus.COMPLETED,
        liveToolCalls: [],
      })
      await expectQuietAfter(harness)
    })

    it('挂起 stop + 快照，onDone 里同步 dispose：dispose 之后这次快照处理不再写补丁，之后任何事件也不写，没有残留帧与定时器', async () => {
      let patchesAtDispose = -1
      const onDone = vi.fn(() => {
        harness.session.dispose()
        patchesAtDispose = harness.patches.length
      })
      const harness = createPendingHarness({ onDone })
      await buildParentAndPend(harness, 'stop')
      expect(onDone).not.toHaveBeenCalled()
      await harness.session.applyEvent(parentSnapshot('completed'))
      expect(onDone).toHaveBeenCalledTimes(1)
      expect(harness.patches).toHaveLength(patchesAtDispose)

      await harness.session.applyEvent(parentSnapshot('streaming'))
      await harness.session.applyEvent(
        makeEvent({ type: 'message.delta', turnId: 't-parent', seq: 11, data: { delta: '迟到' } })
      )
      await expectQuietAfter(harness)
      expect(harness.patches).toHaveLength(patchesAtDispose)
      expect(onDone).toHaveBeenCalledTimes(1)
    })
  })
})
