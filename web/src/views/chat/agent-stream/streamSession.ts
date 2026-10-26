import type { AgentEvent, AgentEventOf } from '@99agent/contracts'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import {
  getAgentEventMessageId,
  getAgentEventRoundIndex,
  getAgentEventSeq,
  getAgentEventTurnId,
  isPlaceholderMessageId,
  resolveChatTerminalStatus,
} from './events'
import {
  buildStreamingToolCall,
  getLiveToolCallKey,
  getMessageStableTextSignature,
  hasLiveToolProgressInMessage,
  isLiveToolProgressCandidate,
  mergeToolCallIntoRound,
  restoreMessageFileHandles,
} from './toolCalls'
import { cloneJson, visualLength, visualWeight } from './text'

/**
 * 高频文本增量的发布节拍：一帧只向 store 写一次。
 * 默认走 requestAnimationFrame；没有它的环境（单测 / SSR）同步发布。
 */
export interface FrameScheduler {
  request: (callback: () => void) => unknown
  cancel: (handle: unknown) => void
}

/** 平滑揭示：首个到达速度样本之前的默认速度（视觉单位 / 毫秒，约 120 个汉字每秒） */
const DEFAULT_ARRIVAL_RATE = 0.12
/** 允许显示落后于到达的时长（毫秒）：在此之内按到达速度匀速显示，超出的积压才慢慢追 */
const REVEAL_LAG_TOLERANCE_MS = 450
/** 超额积压摊平的时间跨度（毫秒）：追赶速度 = 超额 / 该值，越大追得越缓 */
const REVEAL_CATCH_UP_HORIZON_MS = 900
/** 追赶时显示速度最多是到达速度的多少倍，避免追赶像倒出 */
const REVEAL_MAX_SPEEDUP = 2.5
/** 有积压时的最低显示速度（视觉单位 / 毫秒，约 20 个汉字每秒），慢速模型也不停滞 */
const REVEAL_MIN_VELOCITY = 0.02
/** 显示速度向目标速度逼近的时间常数（毫秒）：形成加减速，而不是速度突变 */
const REVEAL_VELOCITY_TAU_MS = 200
/** 不足一个字符的揭示预算最多攒到多少个单位，避免停顿后一次吐出一串 */
const REVEAL_CARRY_MAX = 2
/** 到达速度的指数平滑系数 */
const ARRIVAL_RATE_SMOOTHING = 0.3
/** 帧间隔估计：首帧按 60Hz；标签页休眠回来不把整段一次倒出 */
const FRAME_MS_FALLBACK = 16.7
const FRAME_MS_MIN = 4
const FRAME_MS_MAX = 100
/** 收尾补完的时间预算（毫秒）：agent.end 之后剩余积压最迟在此时间内显示完，再落终态 */
const DRAIN_MAX_MS = 500
/**
 * 思考文本随整条 message 下发（要序列化整条消息，代价随长度增长），而它只在活动面板里可见：
 * 第一段立刻下发，之后最多每这么久下发一次；结构事件到来前照常先追平
 */
const REASONING_PUBLISH_INTERVAL_MS = 250
/** 收尾快照的完成态可带的原因 */
const COMPLETED_FINISH_REASONS = new Set(['stop', 'length', 'handoff'])

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const defaultFrameScheduler: FrameScheduler = {
  request: callback => {
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(() => callback())
    }
    callback()
    return null
  },
  cancel: handle => {
    if (handle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(handle as number)
    }
  },
}

export interface AgentStreamSessionOptions {
  /** 已知的助手消息 cid（重连场景）；发送场景留空，从事件中习得 */
  cid?: string
  turnId?: string
  /** 展示用模型名，发送场景传入；会出现在工具/计划/完成补丁里 */
  modelName?: string
  /** 文本 / 思考增量的发布节拍（默认按动画帧），测试注入 */
  frameScheduler?: FrameScheduler
  /** 时钟（毫秒），测试注入；默认 performance.now */
  now?: () => number
  /** 是否按到达速度平滑揭示正文；默认开启，系统减少动态效果时关闭 */
  smoothReveal?: boolean
  /** 把补丁写入当前流式助手消息（chatBase 中为最后一条消息） */
  applyPatch: (
    patch: Partial<Chat.Chat>,
    pendingQueueIntentExpectation?: Chat.PendingQueueIntentIdentity | null
  ) => void
  /** 这条回复是否已经由别处落成终态（如按服务端刷新）：是的话，清理会话时手里的正文是旧的，不再补发 */
  isSettled?: (cid: string) => boolean
  /** cid 首次确定或变化（用于 currentStreamCid 注册） */
  onCidResolved?: (cid: string) => void
  /** agent.start：发送场景在此插入 initialMessages */
  onAgentStart?: (event: AgentEventOf<'agent.start'>) => void | Promise<void>
  /** 计费摘要刷新（billing.update 的 summary 或 agent.end 的 billing），内核原样写入 store */
  onBilling?: (summary: unknown) => void
  /** 同一工作流接续下一轮（finishReason=handoff），会话内部状态已重置 */
  onHandoff?: () => void
  /** 非 handoff 终结（stop/abort/error/length） */
  onDone?: (input: { finishReason: string; event: AgentEvent }) => void
  /** agent.error */
  onError?: (input: {
    message: string
    event: AgentEvent
    pendingQueueIntentExpectation?: Chat.PendingQueueIntentIdentity | null
  }) => void
  /** 检测到 seq 跳号，事件已丢弃，调用方应触发增量 resync */
  onSeqGap?: (lastSeq: number) => void
}

export interface AgentStreamEventContext {
  pendingQueueIntentExpectation?: Chat.PendingQueueIntentIdentity | null
}

export interface AgentStreamSession {
  applyEvent: (event: AgentEvent, context?: AgentStreamEventContext) => Promise<void>
  readonly cid: string
  readonly lastSeq: number
  /** 当前的回合号；接续下一轮时（新的 agent.start 到之前）是刚结束的那一轮 */
  readonly turnId: string
  /** 这条回复要被标成不再生成、但订阅还留着（跟丢）：先把手里的正文落盘 */
  settleText: () => void
  /** 丢弃尚未发布的增量帧（取消订阅时调用） */
  dispose: () => void
}

/**
 * Agent 事件 → 消息投影的统一会话。
 *
 * 发送（chat:start）与断线重连（chat:resync）共用同一份事件归约逻辑，
 * 仅通过 options 差异化生命周期回调如何接入页面。
 * 会话内部维护累积状态（全文 / 思考 / rounds / live 工具），并按事件类型
 * 产出最小补丁交给 applyPatch。
 *
 * 正文增量到达即累加，一帧最多发布一次，显示按「最近的到达速度」平滑揭示：
 * 显示速度向目标速度按时间常数逼近（加速 → 匀速 → 减速），一帧里突然到达的几十个
 * token 会分摊到后面几帧，不会整段闪出；显示落后到达超过 REVEAL_LAG_TOLERANCE_MS 的
 * 部分按 REVEAL_CATCH_UP_HORIZON_MS 摊平慢慢追，追赶速度不超过到达速度的
 * REVEAL_MAX_SPEEDUP 倍，所以既没有固定速率上限、不会越写越落后，也不会追得像倒出；
 * 结构事件（工具、轮次、快照、错误）前先追平并落盘，保证顺序；agent.end 后剩余积压
 * 在 DRAIN_MAX_MS 内补完再落终态，而不是一次倒出。
 * 纯文本帧只写 `content`；rounds 结构（`message`）只在结构事件与一轮首段文本时同步，
 * 让已结算的轮次对象在整个流式过程中保持引用不变。
 */
export function createAgentStreamSession(options: AgentStreamSessionOptions): AgentStreamSession {
  const frameScheduler = options.frameScheduler || defaultFrameScheduler
  const clock =
    options.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
  const smoothReveal = options.smoothReveal ?? !prefersReducedMotion()

  let cid = String(options.cid || '')
  let turnId = String(options.turnId || '')
  let lastSeq = 0
  let ended = false
  /** 交接出去的父轮：之后到的它的事件都已过期，直接忽略（下一次交接时换成新的父轮） */
  let handedOffCid = ''

  /** 流式缓冲：全部轮次正文按到达顺序拼接（各轮 text 是其中一段），过程话术也在里面 */
  let fullText = ''
  /** 服务端给出的回复文字（收尾快照的 content：回答 + 以提问收尾时的问题），收尾时写进消息 */
  let replyContent: string | undefined
  let fullReasoningText = ''
  let currentTextRoundIndex = 0
  let unifiedMessage: any = { role: 'assistant', content: '', rounds: [] }
  const liveToolCalls = new Map<string, Chat.LiveToolCall>()

  // ---- 按帧发布 ----
  let publishPending = false
  let publishIncludesMessage = false
  /** 有还没下发的思考文本；间隔没到时由这个定时器兜底下发（思考停下、又没有别的事件时） */
  let reasoningDirty = false
  let lastMessagePublishAt = -Infinity
  let reasoningTimer: ReturnType<typeof setTimeout> | null = null
  let pendingFrameToken: number | null = null
  let pendingFrameHandle: unknown = null
  let frameSeq = 0
  let disposed = false

  // ---- 平滑揭示 ----
  /** fullText 已显示的前缀长度（UTF-16 单位，与渲染层 content.slice 的口径一致） */
  let visibleLen = 0
  /** 最近的到达速度（视觉单位 / 毫秒），null 表示还没有样本 */
  let arrivalRate: number | null = null
  let lastArrivalAt: number | null = null
  let lastFrameAt: number | null = null
  /** 当前显示速度（视觉单位 / 毫秒），向目标速度平滑逼近 */
  let revealVelocity = 0
  /** 帧内没用完的揭示预算（不足一个字符的部分攒到下一帧） */
  let revealCarry = 0
  /** agent.end 已到但正文还没显示完：补完后再执行 */
  let terminalPending: (() => void) | null = null
  /** 收尾补完的截止时刻 */
  let drainDeadline: number | null = null

  const modelNamePatch = () => (options.modelName ? { modelName: options.modelName } : {})
  const turnIdPatch = () => (turnId ? { turnId } : {})

  const applyPatch = (patch: Partial<Chat.Chat>) => options.applyPatch(patch)

  const terminalFromFinishReason = (finishReason: string) => {
    return {
      status:
        resolveChatTerminalStatus({
          eventType: 'agent.end',
          finishReason,
        }) ?? ChatLogStatus.COMPLETED,
      finishReason,
    }
  }

  const terminalFromStatus = (status: unknown) => {
    const terminalStatus = resolveChatTerminalStatus({
      eventType: 'snapshot.sync',
      status,
    })
    if (terminalStatus === null) return null
    return {
      status: terminalStatus,
      finishReason:
        terminalStatus === ChatLogStatus.FAILED
          ? 'error'
          : terminalStatus === ChatLogStatus.STOPPED
            ? 'abort'
            : 'stop',
    }
  }

  const terminalFromSnapshot = (event: AgentEventOf<'snapshot.sync'>) => {
    if (event.data.reason !== 'resync') return null
    const status = event.data.status
    const hasExplicitStatus =
      status !== undefined && status !== null && String(status).trim() !== ''
    const terminal = terminalFromStatus(hasExplicitStatus ? status : event.data.turnStatus)
    // 状态决定是不是终态；完成时按快照带的原因细分（交接、输出达到上限，与实时 agent.end 一致），
    // 没带、别的值或与状态矛盾的原因不用
    if (terminal?.status !== ChatLogStatus.COMPLETED) return terminal
    const reason = String(event.data.finishReason || '')
    return COMPLETED_FINISH_REASONS.has(reason) ? { ...terminal, finishReason: reason } : terminal
  }

  // ---- live 工具调用 ----

  const getLiveToolCallList = () =>
    Array.from(liveToolCalls.values()).map(entry => cloneJson(entry))

  const setLiveToolCall = (roundIndex: number, toolCall: Chat.ToolCall) => {
    liveToolCalls.set(getLiveToolCallKey(roundIndex, toolCall.id), {
      roundIndex,
      toolCall: cloneJson(toolCall),
    })
  }

  const removeLiveToolCall = (roundIndex: number, toolId?: string) => {
    if (!toolId) return
    liveToolCalls.delete(getLiveToolCallKey(roundIndex, toolId))
  }

  const patchLiveToolCalls = (patch: Partial<Chat.Chat> = {}) => {
    applyPatch({
      cid,
      ...modelNamePatch(),
      error: false,
      loading: true,
      progress: '',
      ...patch,
      liveToolCalls: getLiveToolCallList(),
    })
  }

  // ---- rounds 文本同步 ----

  /**
   * 快照替换消息后，从它的轮次恢复累积状态：各轮正文 / 思考依次拼起来就是流式缓冲，
   * 当前轮是最后一轮；后续增量按轮次文字长度接在后面，不借旧的游标改写别的轮次
   */
  const restoreAccumulatorFrom = (message: any) => {
    const rounds: any[] = Array.isArray(message?.rounds) ? message.rounds : []
    const joined = (field: 'text' | 'thinking') =>
      rounds.map(round => (typeof round?.[field] === 'string' ? round[field] : '')).join('')
    fullText = joined('text')
    fullReasoningText = joined('thinking')
    currentTextRoundIndex = Math.max(0, rounds.length - 1)
  }

  // fullText / fullReasoningText 是所有轮次累积的完整文本，按轮次拆分后写入 rounds
  const syncTextToRounds = () => {
    const ri = currentTextRoundIndex
    if (!unifiedMessage.rounds[ri]) {
      unifiedMessage.rounds[ri] = { text: null, thinking: null, toolCalls: [] }
    }
    let prevLen = 0
    for (let i = 0; i < ri; i++) {
      prevLen += unifiedMessage.rounds[i]?.text?.length || 0
    }
    const currentRoundText = fullText.slice(prevLen)
    if (currentRoundText) unifiedMessage.rounds[ri].text = currentRoundText

    let prevThinkingLen = 0
    for (let i = 0; i < ri; i++) {
      prevThinkingLen += unifiedMessage.rounds[i]?.thinking?.length || 0
    }
    const currentRoundThinking = fullReasoningText.slice(prevThinkingLen)
    if (currentRoundThinking) unifiedMessage.rounds[ri].thinking = currentRoundThinking
  }

  const applyTurnFromEvent = (event: AgentEvent) => {
    const turn = 'turn' in event.data ? event.data.turn : undefined
    const eventTurnId = String(event.turnId || turn?.id || turnId || '').trim()
    if (!eventTurnId) return
    turnId = eventTurnId
    unifiedMessage.turn = {
      ...unifiedMessage.turn,
      ...turn,
      id: eventTurnId,
      status: turn?.status || unifiedMessage.turn?.status || 'running',
      startedAt: turn?.startedAt || unifiedMessage.turn?.startedAt || new Date().toISOString(),
    }
  }

  // ---- 平滑揭示 ----

  const visibleText = () =>
    visibleLen >= fullText.length ? fullText : fullText.slice(0, visibleLen)
  const hasBacklog = () => visibleLen < fullText.length
  const catchUpVisible = () => {
    visibleLen = fullText.length
  }

  /** 记录一段正文的到达，更新到达速度的指数平滑估计 */
  const noteArrival = (delta: string) => {
    if (!smoothReveal) return
    const now = clock()
    if (lastArrivalAt !== null) {
      const gap = now - lastArrivalAt
      if (gap >= 1) {
        const instant = visualLength(delta) / gap
        arrivalRate =
          arrivalRate === null
            ? instant
            : arrivalRate + (instant - arrivalRate) * ARRIVAL_RATE_SMOOTHING
      }
    }
    lastArrivalAt = now
  }

  /**
   * 推进可见前缀一帧；返回是否有推进。
   *
   * 目标速度 = 到达速度，超过容忍时长的积压按 REVEAL_CATCH_UP_HORIZON_MS 摊平，
   * 且不超过到达速度的 REVEAL_MAX_SPEEDUP 倍；实际速度按时间常数向目标逼近，
   * 所以突发到达是「加速 → 匀速 → 减速」，而不是一下子追平。
   */
  const advanceVisible = (): boolean => {
    if (!hasBacklog()) return false
    const now = clock()
    const gap = lastFrameAt === null ? FRAME_MS_FALLBACK : now - lastFrameAt
    lastFrameAt = now
    // 停顿之后速度自然回落，再次到达时重新加速
    if (gap > FRAME_MS_MAX) {
      revealVelocity *= Math.exp(-(gap - FRAME_MS_MAX) / REVEAL_VELOCITY_TAU_MS)
    }
    const dt = Math.min(FRAME_MS_MAX, Math.max(FRAME_MS_MIN, gap))
    const rate = arrivalRate ?? DEFAULT_ARRIVAL_RATE
    const backlogUnits = visualLength(fullText.slice(visibleLen))
    const excess = Math.max(0, backlogUnits - rate * REVEAL_LAG_TOLERANCE_MS)
    let target = Math.min(
      rate * REVEAL_MAX_SPEEDUP,
      rate * 1.05 + excess / REVEAL_CATCH_UP_HORIZON_MS
    )
    target = Math.max(target, REVEAL_MIN_VELOCITY)
    let flushAll = false
    if (drainDeadline !== null) {
      const remaining = drainDeadline - now
      if (remaining <= FRAME_MS_MIN) flushAll = true
      else target = Math.max(target, backlogUnits / remaining)
    }
    revealVelocity += (target - revealVelocity) * (1 - Math.exp(-dt / REVEAL_VELOCITY_TAU_MS))

    let budget = flushAll ? Number.POSITIVE_INFINITY : revealCarry + revealVelocity * dt
    let index = visibleLen
    while (index < fullText.length) {
      const codePoint = fullText.codePointAt(index) as number
      const weight = visualWeight(codePoint)
      if (weight > budget) break
      budget -= weight
      index += codePoint > 0xffff ? 2 : 1
    }
    revealCarry = flushAll ? 0 : Math.min(budget, REVEAL_CARRY_MAX)
    const advanced = index > visibleLen
    visibleLen = index
    return advanced
  }

  /**
   * 纯文本增量不会触发 rounds 同步，而渲染层在不再生成时只认 rounds：收口与取消订阅前补一次。
   * 仅在 rounds 文本确实少于全文时执行：快照替换 unifiedMessage 后 currentTextRoundIndex 可能是陈旧值，
   * 无条件同步会把全文重复写进旧轮次。返回是否补过
   */
  const syncRoundsIfBehind = (): boolean => {
    const roundsTextLen = (unifiedMessage.rounds || []).reduce(
      (sum: number, round: any) => sum + (round?.text?.length || 0),
      0
    )
    if (fullText.length <= roundsTextLen) return false
    syncTextToRounds()
    return true
  }

  // ---- 发布 ----

  const buildContentPatch = (
    withLoading: boolean,
    includeMessage: boolean
  ): Partial<Chat.Chat> => ({
    cid,
    ...turnIdPatch(),
    content: visibleText(),
    ...(withLoading ? { error: false, loading: true, progress: '' } : {}),
    ...(includeMessage ? { message: JSON.stringify(unifiedMessage) } : {}),
  })

  const clearReasoningTimer = () => {
    if (reasoningTimer) clearTimeout(reasoningTimer)
    reasoningTimer = null
  }

  const publishNow = () => {
    const includeMessage = publishIncludesMessage
    publishPending = false
    publishIncludesMessage = false
    if (includeMessage) {
      // message 里带着最新的思考全文
      reasoningDirty = false
      clearReasoningTimer()
    }
    if (ended) return
    if (includeMessage) lastMessagePublishAt = clock()
    applyPatch(buildContentPatch(true, includeMessage))
  }

  /** 思考文本：离上次下发不到间隔就先攒着，到点由定时器并进下一帧的发布 */
  const scheduleReasoningPublish = () => {
    reasoningDirty = true
    const wait = lastMessagePublishAt + REASONING_PUBLISH_INTERVAL_MS - clock()
    if (wait <= 0) {
      schedulePublish(true)
      return
    }
    if (reasoningTimer) return
    reasoningTimer = setTimeout(() => {
      reasoningTimer = null
      if (reasoningDirty && !disposed) schedulePublish(true)
    }, wait)
  }

  const cancelPendingFrame = () => {
    if (pendingFrameToken === null) return
    frameScheduler.cancel(pendingFrameHandle)
    pendingFrameToken = null
    pendingFrameHandle = null
  }

  /** 取走挂起的收尾（补完期间的 agent.end）：由调用方决定何时执行 */
  const takePendingTerminal = () => {
    const finalize = terminalPending
    terminalPending = null
    drainDeadline = null
    return finalize
  }

  const finalizeIfDrained = () => {
    if (!terminalPending || hasBacklog()) return
    takePendingTerminal()?.()
  }

  const onFrame = () => {
    if (smoothReveal) {
      if (advanceVisible()) publishPending = true
    } else {
      catchUpVisible()
    }
    if (publishPending) publishNow()
    if (hasBacklog()) {
      scheduleFrame()
      return
    }
    finalizeIfDrained()
  }

  const scheduleFrame = () => {
    if (pendingFrameToken !== null) return
    const token = ++frameSeq
    pendingFrameToken = token
    pendingFrameHandle = frameScheduler.request(() => {
      if (pendingFrameToken !== token) return
      pendingFrameToken = null
      pendingFrameHandle = null
      onFrame()
    })
  }

  /** 把当前累积状态排进下一帧；已有待发布帧时只合并标记 */
  const schedulePublish = (includeMessage: boolean) => {
    publishPending = true
    if (includeMessage) publishIncludesMessage = true
    scheduleFrame()
  }

  const cancelPendingPublish = () => {
    cancelPendingFrame()
    publishPending = false
    publishIncludesMessage = false
  }

  /** 结构事件出站前先追平并落盘待发布的增量，保证补丁顺序与事件顺序一致 */
  const flushPendingPublish = () => {
    cancelPendingFrame()
    if (reasoningDirty) {
      publishPending = true
      publishIncludesMessage = true
    }
    if (hasBacklog() || publishPending) {
      catchUpVisible()
      publishNow()
    }
    finalizeIfDrained()
  }

  const resetAccumulator = () => {
    cancelPendingPublish()
    liveToolCalls.clear()
    fullText = ''
    replyContent = undefined
    fullReasoningText = ''
    reasoningDirty = false
    lastMessagePublishAt = -Infinity
    clearReasoningTimer()
    currentTextRoundIndex = 0
    unifiedMessage = { role: 'assistant', content: '', rounds: [] }
    visibleLen = 0
    arrivalRate = null
    lastArrivalAt = null
    lastFrameAt = null
    revealVelocity = 0
    revealCarry = 0
    terminalPending = null
    drainDeadline = null
  }

  /**
   * 同一工作流接续下一轮：父轮落成完成，清掉这一轮的累积状态，等接续轮的 agent.start
   * （turnId 保留：调用方按它认接续轮）
   */
  const endWithHandoff = () => {
    applyPatch({
      loading: false,
      status: ChatLogStatus.COMPLETED,
      message: JSON.stringify(unifiedMessage),
      liveToolCalls: [],
    })
    handedOffCid = cid
    cid = ''
    lastSeq = 0
    ended = true
    resetAccumulator()
    options.onHandoff?.()
  }

  // ---- seq 去重与跳号检测 ----

  /** @returns false 表示事件应被丢弃（重复或跳号） */
  const trackSeq = (event: AgentEvent): boolean => {
    const seq = getAgentEventSeq(event)
    if (seq <= 0) return true

    // 快照是全量替换，直接作为新的 seq 基准（过期快照丢弃）
    if (event.type === 'snapshot.sync') {
      if (lastSeq > 0 && seq < lastSeq) return false
      lastSeq = seq
      return true
    }

    if (lastSeq > 0) {
      if (seq <= lastSeq) return false
      if (seq > lastSeq + 1) {
        options.onSeqGap?.(lastSeq)
        return false
      }
    } else if (seq > 1) {
      // 会话尚无基准且首个事件已跳号：等待快照 / 补发建立基准
      options.onSeqGap?.(0)
      return false
    }

    lastSeq = seq
    return true
  }

  // ---- 事件归约 ----

  const applyEvent = async (
    event: AgentEvent,
    context: AgentStreamEventContext = {}
  ): Promise<void> => {
    // 已经取消订阅：取消前已经派发出来的事件不再写进消息
    if (disposed) return
    // 交接之后父轮的事件都已过期：在序号核对之前忽略（不误报跳号）
    if (handedOffCid && getAgentEventMessageId(event) === handedOffCid) return
    if (!trackSeq(event)) return
    if (ended && event.type === 'agent.end') return

    // 占位 id 不指向任何消息，不能当成这一轮的 cid（否则之后自己的 agent.start 对不上被丢掉）
    const rawMessageId = getAgentEventMessageId(event)
    const eventMessageId = isPlaceholderMessageId(rawMessageId) ? '' : rawMessageId
    const explicitEventMessageId = String(event.messageId || '').trim()
    const explicitEventTurnId = getAgentEventTurnId(event)
    if (
      event.type === 'agent.error' &&
      ((cid && explicitEventMessageId && explicitEventMessageId !== cid) ||
        (turnId && explicitEventTurnId && explicitEventTurnId !== turnId))
    ) {
      return
    }
    // 实时收尾正在补完时来了这条消息的补发快照：先取走挂起的收尾（不让下面的冲刷执行它），
    // 快照作为这条消息的权威内容归约之后再执行（原因按先到的实时 agent.end，只收尾一次）
    const pendingTerminal =
      event.type === 'snapshot.sync' && (!eventMessageId || eventMessageId === cid)
        ? takePendingTerminal()
        : null
    if (eventMessageId && eventMessageId !== cid) {
      cid = eventMessageId
      options.onCidResolved?.(cid)
    }
    applyTurnFromEvent(event)
    // agent.end 自己处理收尾补完（不追平），其余结构事件前先追平并落盘
    if (
      event.type !== 'message.delta' &&
      event.type !== 'reasoning.delta' &&
      event.type !== 'agent.end'
    ) {
      flushPendingPublish()
    }

    switch (event.type) {
      case 'agent.start':
        ended = false
        await options.onAgentStart?.(event)
        break

      case 'turn.start':
      case 'turn.end':
        applyPatch({
          cid,
          ...turnIdPatch(),
          message: JSON.stringify(unifiedMessage),
        })
        break

      case 'message.delta': {
        const delta = event.data.delta || ''
        noteArrival(delta)
        fullText += delta
        currentTextRoundIndex = getAgentEventRoundIndex(event)
        const currentRound = unifiedMessage.rounds[currentTextRoundIndex]
        // 一轮的第一段正文：立刻可见并同步一次 rounds，让正文从第一个字起就渲染在最终的轮次容器里，
        // 收尾时不再从回退容器搬进去（搬动意味着整段 DOM 重挂载）。之后的纯文本帧只写 content，
        // 由 onFrame 按到达速度逐帧揭示。
        const isFirstTextOfRound = !currentRound?.text
        if (isFirstTextOfRound) {
          syncTextToRounds()
          catchUpVisible()
        }
        schedulePublish(isFirstTextOfRound)
        break
      }

      case 'message.phase': {
        // 这一轮调用了工具：文字是过程话术，渲染位置随之变化；正在输出的就是这一轮时先把正文补齐
        const roundIdx = getAgentEventRoundIndex(event)
        if (!unifiedMessage.rounds[roundIdx]) {
          unifiedMessage.rounds[roundIdx] = { text: null, thinking: null, toolCalls: [] }
        }
        if (roundIdx === currentTextRoundIndex) syncTextToRounds()
        const round = unifiedMessage.rounds[roundIdx]
        if (event.data.phase === 'process') round.phase = 'process'
        else delete round.phase
        applyPatch({
          cid,
          ...turnIdPatch(),
          content: fullText,
          error: false,
          loading: true,
          message: JSON.stringify(unifiedMessage),
        })
        break
      }

      case 'reasoning.delta': {
        const delta = event.data.delta || ''
        fullReasoningText += delta
        currentTextRoundIndex = getAgentEventRoundIndex(event)
        // 思考随 message 下发，其中的 rounds 文本是全文：先把正文追平，避免正文跳变
        if (hasBacklog()) catchUpVisible()
        syncTextToRounds()
        // 思考文本只在活动面板里可见：第一段立刻下发，之后按间隔随 message 下发（见 REASONING_PUBLISH_INTERVAL_MS）
        scheduleReasoningPublish()
        break
      }

      case 'tool.start':
      case 'tool.update':
      case 'tool.end': {
        const roundIdx = getAgentEventRoundIndex(event)
        if (!unifiedMessage.rounds[roundIdx]) {
          unifiedMessage.rounds[roundIdx] = { text: null, thinking: null, toolCalls: [] }
        }
        const round = unifiedMessage.rounds[roundIdx]
        const toolData = {
          ...event.data,
          id: event.toolCallId,
          status:
            event.type === 'tool.end'
              ? event.data.status || 'success'
              : event.data.status || 'running',
        }
        const nextToolCall = buildStreamingToolCall(toolData)
        if (toolData.error?.message) {
          nextToolCall.status = 'error'
          nextToolCall.output = {
            ...nextToolCall.output,
            error: toolData.error.message,
          }
        }
        const { toolCall, shouldSerialize } = mergeToolCallIntoRound(round, nextToolCall)
        syncTextToRounds()

        if (event.type === 'tool.end') {
          removeLiveToolCall(roundIdx, toolCall.id)
        } else if (isLiveToolProgressCandidate(toolCall)) {
          setLiveToolCall(roundIdx, toolCall)
        }

        if (!shouldSerialize) {
          // 仅 live 进度变化：跳过整条消息序列化
          patchLiveToolCalls({ content: fullText })
          break
        }
        patchLiveToolCalls({
          cid,
          content: fullText,
          error: false,
          loading: true,
          message: JSON.stringify(unifiedMessage),
        })
        break
      }

      case 'snapshot.sync': {
        const snapData = event.data
        const terminal = pendingTerminal ? null : terminalFromSnapshot(event)
        const previousStableSignature = getMessageStableTextSignature(unifiedMessage)
        let nextMessage: any | null = null
        if (snapData.message) {
          try {
            nextMessage =
              typeof snapData.message === 'string' ? JSON.parse(snapData.message) : snapData.message
            // 快照是公开投影，把本地已拿到的私有文件句柄补回去，避免文件卡片在收尾时消失
            nextMessage = restoreMessageFileHandles(unifiedMessage, nextMessage)
            unifiedMessage = nextMessage
            turnId = String(nextMessage?.turn?.id || turnId || '')
          } catch (e) {
            // 快照消息解析失败时保留现有结构
          }
        }
        // 快照的 content 是回复（不含过程话术）：流式缓冲按快照里的轮次正文重建，后续增量才接得上；
        // 收尾快照（工作流完成或终态）的 content 是服务端定稿的回复，收尾时写进消息
        if (nextMessage) restoreAccumulatorFrom(nextMessage)
        else if (snapData.content !== undefined) fullText = snapData.content
        if (
          (terminal || pendingTerminal || snapData.reason === 'workflow_complete') &&
          snapData.content !== undefined
        ) {
          replyContent = snapData.content
        }
        // 快照是权威内容，直接全量显示
        catchUpVisible()
        // 这条消息已经实时收尾：按快照更新过内容之后执行那次收尾（不看快照是不是终态）
        if (pendingTerminal) {
          pendingTerminal()
          break
        }

        // 快照只是工具实时进度变化时，避免整条消息重渲染
        const shouldTreatSnapshotAsLiveProgress =
          nextMessage &&
          hasLiveToolProgressInMessage(nextMessage) &&
          previousStableSignature === getMessageStableTextSignature(nextMessage)

        if (!terminal && shouldTreatSnapshotAsLiveProgress) {
          ;(nextMessage.rounds || []).forEach((round: any, roundIndex: number) => {
            ;(round?.toolCalls || []).forEach((toolCall: Chat.ToolCall) => {
              if (isLiveToolProgressCandidate(toolCall)) setLiveToolCall(roundIndex, toolCall)
            })
          })
          patchLiveToolCalls({ content: fullText })
          break
        }

        if (terminal) liveToolCalls.clear()
        applyPatch({
          cid,
          ...turnIdPatch(),
          content: replyContent ?? fullText,
          ...(terminal ? { status: terminal.status } : {}),
          error: false,
          loading: terminal ? false : true,
          progress: '',
          message: JSON.stringify(nextMessage || unifiedMessage),
          liveToolCalls: terminal ? [] : getLiveToolCallList(),
        })
        if (terminal && !ended) {
          if (terminal.finishReason === 'handoff' && options.onHandoff) {
            endWithHandoff()
            break
          }
          ended = true
          liveToolCalls.clear()
          options.onDone?.({ finishReason: terminal.finishReason, event })
        }
        break
      }

      case 'billing.update':
        options.onBilling?.(event.data.summary)
        break

      case 'agent.end': {
        if (ended || terminalPending) break
        const doneData = event.data
        const terminal = terminalFromFinishReason(String(doneData.finishReason || 'stop'))
        syncRoundsIfBehind()
        if (doneData.billing !== undefined) options.onBilling?.(doneData.billing)

        const finalize = () => {
          if (ended) return
          publishPending = false
          publishIncludesMessage = false
          liveToolCalls.clear()
          applyPatch({
            cid,
            ...turnIdPatch(),
            content: replyContent ?? fullText,
            status: terminal.status,
            ...modelNamePatch(),
            error: false,
            loading: true,
            message: JSON.stringify(unifiedMessage),
            liveToolCalls: [],
          })

          if (doneData.finishReason === 'handoff' && options.onHandoff) {
            endWithHandoff()
            return
          }

          ended = true
          options.onDone?.({ finishReason: String(doneData.finishReason || 'stop'), event })
        }

        cancelPendingFrame()
        if (smoothReveal && hasBacklog()) {
          // 剩余正文在时间预算内补完，再落终态：不一次倒出，也不无限期拖延
          terminalPending = finalize
          drainDeadline = clock() + DRAIN_MAX_MS
          scheduleFrame()
          break
        }
        catchUpVisible()
        finalize()
        break
      }

      case 'agent.error': {
        const errMsg = event.data.message || ''
        const terminalStatus = resolveChatTerminalStatus({
          eventType: event.type,
          turnStatus: event.data.turnStatus,
          turn: event.data.turn,
        })
        const isAuthoritativeFailed =
          terminalStatus === ChatLogStatus.FAILED &&
          Boolean(explicitEventMessageId) &&
          Boolean(explicitEventTurnId) &&
          explicitEventMessageId === cid &&
          explicitEventTurnId === turnId
        const pendingQueueIntentExpectation = isAuthoritativeFailed
          ? context.pendingQueueIntentExpectation
          : undefined
        liveToolCalls.clear()
        if (cid) {
          // 出错后这条消息不再生成、按 rounds 渲染：先把已经流出的正文补进去
          syncRoundsIfBehind()
          // 还没收到过这条回复的任何内容（恢复的会话刚建好就被拒）：不拿空的累积器覆盖它已有的轮次
          const accumulated = unifiedMessage.rounds.length > 0 || fullText.length > 0
          options.applyPatch(
            {
              cid,
              ...turnIdPatch(),
              ...(isAuthoritativeFailed ? { status: ChatLogStatus.FAILED } : {}),
              error: true,
              loading: false,
              // 失败原因与能否重试留在消息上，界面就地展示（toast 会消失）
              errorMessage: errMsg || undefined,
              errorRetryable: event.data.retryable !== false,
              ...(accumulated ? { message: JSON.stringify(unifiedMessage) } : {}),
              liveToolCalls: [],
            },
            pendingQueueIntentExpectation
          )
        } else {
          applyPatch({ liveToolCalls: [] })
        }
        options.onError?.({
          message: errMsg,
          event,
          pendingQueueIntentExpectation,
        })
        break
      }
    }
  }

  /**
   * 没有终态、调用方随后要把这条消息标成不再生成（停止、跟丢、取消订阅）：把手里的正文追平并补进 rounds，
   * 否则界面只剩这一轮开头的一小段。不带 loading 标记；这条回复已由别处落成终态时手里的正文是旧的，不补发
   */
  const settleUnfinishedText = () => {
    if (ended || options.isSettled?.(cid)) return
    const roundsSynced = syncRoundsIfBehind()
    if (roundsSynced || hasBacklog() || publishPending || reasoningDirty) {
      catchUpVisible()
      // 节流里还没下发的思考随 message 一起落盘
      applyPatch(buildContentPatch(false, roundsSynced || publishIncludesMessage || reasoningDirty))
    }
  }

  return {
    applyEvent,
    get cid() {
      return cid
    },
    get lastSeq() {
      return lastSeq
    },
    get turnId() {
      return turnId
    },
    settleText: () => {
      if (disposed || terminalPending) return
      cancelPendingFrame()
      settleUnfinishedText()
      publishPending = false
      publishIncludesMessage = false
      reasoningDirty = false
    },
    dispose: () => {
      // 取消订阅时不丢内容：正文追平落盘；收尾补完中的终态立即执行（onDone 内的再次清理由 disposed 挡住）
      if (disposed) return
      disposed = true
      cancelPendingFrame()
      clearReasoningTimer()
      if (terminalPending) {
        catchUpVisible()
        takePendingTerminal()?.()
        return
      }
      settleUnfinishedText()
      publishPending = false
      publishIncludesMessage = false
      reasoningDirty = false
    },
  }
}
