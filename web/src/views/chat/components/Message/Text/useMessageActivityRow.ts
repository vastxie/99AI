import { computed, watch, type Ref } from 'vue'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import { t } from '@/locales'
import { isAssistantFinished } from '@/store/modules/chat/messageState'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import type { Round, UnifiedMessage } from '@/types/chat'
import type { ActivityEvent, ActivityPanelPayload } from '@/types/preview-panel'
import { getActivityIcon } from '../../activityIcons'
import {
  buildMessageActivity,
  getMessageActivitySummary,
  hasVisibleMessageActivity,
} from './activityTimeline'
import { useActivityStatus } from './useActivityStatus'

interface ActivityRowProps {
  cid?: string
  index: number
  message?: string
  content?: string
  status?: number
  createdAt?: string
  startedAt?: string
  loading?: boolean
  isLast?: boolean
  progress?: number | string
  error?: boolean
  liveToolCalls?: Chat.LiveToolCall[]
}

/**
 * 正文上方唯一的活动行，三种形态共用同一个节点，收尾时不增删节点、不推动正文：
 * - live：有正在进行的活动（含首个 token 前的等待）→ 当前活动 + 计时，shimmer；
 * - quiet：本条消息已有活动但此刻没有在跑的（思考后正在输出正文、媒体占位自带进度）→ 已完成部分的汇总，静态；
 * - final：结束 → 总汇总。
 * 没有任何活动的纯文本回复只在首个 token 前显示等待提示，之后不占位。
 *
 * 右侧活动面板正开着时，面板内容跟着本条消息的活动同步；最后一条消息开始运行时面板跟过来。
 */
export function useMessageActivityRow(options: {
  props: ActivityRowProps
  parsedMessage: Ref<UnifiedMessage | null>
  activityRounds: Ref<Round[]>
  /** content 比 rounds 多出来的正文；正文先于 rounds 快照到达时不再显示过期的思考状态 */
  streamingText: Ref<string>
  /** 本条消息有媒体生成占位（自带进度），此时活动行不再显示运行中状态 */
  hasMediaPlaceholder: () => boolean
}) {
  const { props, parsedMessage, activityRounds, streamingText } = options
  const globalStore = useGlobalStoreWithOut()

  const fallbackSourceKey = () => `message-${props.index}`
  const sourceKey = computed(() => (props.cid ? `chat-${props.cid}` : fallbackSourceKey()))
  const hasActivity = computed(() => hasVisibleMessageActivity(activityRounds.value))

  /**
   * 回合已进入终态：完成、失败或被停止。之后即使还有工具标着执行中（结束事件没有到达），
   * 也按已中断展示，不再显示运行中的活动行、计时与占位。
   */
  const isTerminal = computed(() =>
    isAssistantFinished({
      role: 'assistant',
      loading: props.loading,
      status: props.status,
      error: props.error,
    })
  )
  const activity = computed<ActivityPanelPayload>(() =>
    buildMessageActivity(activityRounds.value, {
      sourceKey: sourceKey.value,
      messageId: props.cid,
      loading: props.loading,
      terminal: isTerminal.value,
      title: t('activity.title'),
    })
  )
  const isRunning = computed(
    () => !isTerminal.value && (Boolean(props.loading) || activity.value.status === 'running')
  )

  // 运行中只显示当前的活动；完成的阶段留在详情面板里
  const latestEvent = computed<ActivityEvent | null>(() => {
    const events = activity.value.events.toReversed()
    const activeTool = events.find(event => event.status === 'loading' && event.type !== 'thinking')
    if (activeTool) return activeTool
    // 纯文本增量可能先于下一份 rounds 快照到达，这时不再显示过期的思考状态
    if (streamingText.value) return null
    return (
      events.find(
        event =>
          event.status === 'loading' &&
          event.type === 'thinking' &&
          event.roundIndex === activityRounds.value.length - 1
      ) || null
    )
  })
  const runningHint = computed(() => {
    const event = latestEvent.value
    if (!isRunning.value || !event) return ''
    const progressText = typeof props.progress === 'string' ? props.progress.trim() : ''
    if (event.type !== 'thinking' && progressText) return progressText
    return event.summary || t('activity.processing')
  })

  // 空助手占位与用户消息同时出现；无需等首个思考事件，也不把等待记成真实活动
  const isWaitingForFirstActivity = computed(
    () =>
      Boolean(props.loading) &&
      !props.error &&
      ![ChatLogStatus.COMPLETED, ChatLogStatus.FAILED, ChatLogStatus.STOPPED].includes(
        props.status!
      ) &&
      !props.content?.trim() &&
      !props.liveToolCalls?.length &&
      activityRounds.value.every(
        round =>
          !round.text?.trim() &&
          !round.thinking?.trim() &&
          !round.toolCalls?.length &&
          !round.interjections?.length &&
          !round.completed
      )
  )

  /* 状态跟随实际活动即时切换，耗时计时独立维护 */
  const { visibleActivityHint, runningActivityElapsedText } = useActivityStatus({
    isUserMessage: () => false,
    loading: () => isRunning.value && !isWaitingForFirstActivity.value,
    runningActivityHint: runningHint,
    startedAtCandidates: () => [
      props.startedAt,
      props.createdAt,
      parsedMessage.value?.turn?.startedAt,
      parsedMessage.value?.timestamp,
    ],
  })

  const showsRunningStatus = computed(() => Boolean(visibleActivityHint.value))
  // label 与秒数分离：shimmer 文本保持稳定（不随秒数每秒重排），秒数走独立后缀
  const liveLabel = computed(() =>
    showsRunningStatus.value ? visibleActivityHint.value : t('activity.thinking')
  )
  const liveSuffix = computed(() => {
    const elapsed = runningActivityElapsedText.value
    return elapsed ? `· ${elapsed}` : ''
  })
  const liveEvent = computed<ActivityEvent>(() => {
    if (showsRunningStatus.value && latestEvent.value) return latestEvent.value
    return {
      id: 'inline-thinking-status',
      title: t('activity.thinking'),
      status: 'loading',
      type: 'thinking',
    }
  })
  const livePanel = computed<ActivityPanelPayload>(() => ({
    ...activity.value,
    status: 'running',
    summary: [liveLabel.value, liveSuffix.value].filter(Boolean).join(' '),
    events: hasActivity.value ? activity.value.events : [liveEvent.value],
  }))
  const finalPanel = computed<ActivityPanelPayload>(() => ({
    ...activity.value,
    status: activity.value.status === 'running' ? 'success' : activity.value.status,
    summary: activity.value.summary || t('activity.processed'),
    events: activity.value.events,
  }))
  const quietSummary = computed(
    () =>
      getMessageActivitySummary(activityRounds.value, { terminal: isTerminal.value }) ||
      t('activity.processed')
  )
  const quietPanel = computed<ActivityPanelPayload>(() => ({
    ...activity.value,
    summary: quietSummary.value,
  }))

  const mode = computed<'live' | 'quiet' | 'final' | null>(() => {
    if (!isRunning.value) return hasActivity.value ? 'final' : null
    if (
      (showsRunningStatus.value || isWaitingForFirstActivity.value) &&
      !options.hasMediaPlaceholder()
    ) {
      return 'live'
    }
    return hasActivity.value ? 'quiet' : null
  })

  function openPanel(payload: ActivityPanelPayload) {
    globalStore.openPanel({ type: 'activity', activity: payload })
  }

  /** 打开当前运行中的活动（活动行、媒体占位框共用） */
  function openLive() {
    openPanel(livePanel.value)
  }

  const row = computed(() => {
    const current = mode.value
    if (!current) return null
    const events = finalPanel.value.events || []
    return {
      mode: current,
      /** 运行中排在正文后面（贴着刚写出来的那段），结束后回到正文上方当汇总头；只换 order，不换节点 */
      belowBody: current !== 'final',
      className:
        current === 'live'
          ? 'message-status-slot'
          : current === 'quiet'
            ? 'assistant-activity-row-quiet'
            : 'assistant-final-activity-row',
      panel:
        current === 'live'
          ? livePanel.value
          : current === 'quiet'
            ? quietPanel.value
            : finalPanel.value,
      label:
        current === 'live'
          ? liveLabel.value
          : current === 'quiet'
            ? quietSummary.value
            : finalPanel.value.summary,
      suffix: current === 'live' ? liveSuffix.value : undefined,
      icon: getActivityIcon(current === 'live' ? liveEvent.value : events.at(-1)),
      clickable: current === 'live' ? showsRunningStatus.value : true,
    }
  })

  function openRow() {
    if (mode.value === 'live') openLive()
    else if (mode.value === 'quiet') openPanel(quietPanel.value)
    else openPanel(finalPanel.value)
  }

  function isThisMessage(panelSourceKey?: string, messageId?: string) {
    if (panelSourceKey) {
      return panelSourceKey === sourceKey.value || panelSourceKey === fallbackSourceKey()
    }
    return Boolean(messageId && props.cid && messageId === props.cid)
  }

  function syncOpenPanel() {
    const current = globalStore.rightPreviewPanel
    if (current?.type !== 'activity' || !hasActivity.value) return
    const next = {
      type: 'activity' as const,
      activity: isRunning.value ? livePanel.value : finalPanel.value,
    }
    if (!isThisMessage(current.activity.sourceKey, current.activity.messageId)) {
      // 最后一条消息开始运行时，面板跟过来
      const follows =
        Boolean(props.isLast) && isRunning.value && activity.value.status === 'running'
      if (follows) globalStore.openPanel(next)
      return
    }
    // 消息拿到 cid 之前面板按位置记的来源，拿到后换成正式来源
    if (
      current.activity.sourceKey === fallbackSourceKey() &&
      sourceKey.value !== fallbackSourceKey()
    ) {
      globalStore.openPanel(next)
      return
    }
    globalStore.updateActivityPanel(next)
  }

  // 跟随活动投影本身（含只在 liveToolCalls 里的实时进度），不只看 message：
  // 实时进度更新时 message 不变，只看它会让已打开的面板停在旧值
  watch([activity, isRunning, () => props.cid, () => props.isLast], syncOpenPanel, {
    immediate: true,
  })

  return { isRunning, row, openRow, openLive }
}
