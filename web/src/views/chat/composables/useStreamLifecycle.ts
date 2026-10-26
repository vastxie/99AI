import { onBeforeUnmount, onMounted, ref } from 'vue'
import { resyncChat } from '@/api'
import { socketService } from '@/services/socket-io'
import type { AgentStreamSession } from '../agent-stream/streamSession'

/**
 * 流式订阅生命周期 composable：当前订阅的注册/清理、活跃会话句柄、
 * seq 跳号去抖补发、长任务 watchdog、页面级恢复入口
 * （visibilitychange / online / pageshow，挂载期自注册）。从 chatBase 整体迁出。
 *
 * 调用方职责：发送/重连建立订阅后调用 registerStreamSession + startWatchdog，
 * 事件到达时调用 noteStreamActivity，会话切换/结束时按场景调用
 * cleanupSubscription 与 resetWatchdog；socket 重连等额外恢复入口
 * 自行接到 tryResumeActiveTask。
 */

// 事件侧只记录最近活跃时间戳，定时器周期性检查空窗，不再每个事件重建 timer
const WATCHDOG_INTERVAL = 50000
const WATCHDOG_MAX_RETRIES = 3

interface StreamLifecycleOptions {
  /** 最后一条消息：watchdog 与恢复入口据此判断是否有进行中的助手回复 */
  getLastMessage: () => Chat.Chat | undefined
  /** 按 cid 查当前流消息；存在活跃 cid 时优先用于 watchdog 与恢复判断 */
  getMessageByCid?: (cid: string) => Chat.Chat | undefined
  /**
   * 判断消息是否仍在生成、需要恢复。由页面提供唯一判定口径，
   * 避免 watchdog / 恢复入口只认 loading，而刷新合并后 loading 丢失导致恢复链断裂。
   */
  isResumableMessage: (message: Chat.Chat | undefined) => boolean
  /** 恢复入口统一回调：对指定消息重连工作流（已有活跃会话时由调用方走增量补发） */
  resumeWorkflow: (cid: string) => void
  /** resync ack 被服务端拒绝或没送到（code 是回执的错误码）时，由页面决定怎么处理 */
  onResyncRejected?: (cid: string, message?: string, code?: string) => void
  /** watchdog 重试耗尽时，由页面决定如何给消息落一个可见状态 */
  onWatchdogExhausted?: (cid: string) => void
}

export function useStreamLifecycle(options: StreamLifecycleOptions) {
  const {
    getLastMessage,
    getMessageByCid,
    isResumableMessage,
    resumeWorkflow,
    onResyncRejected,
    onWatchdogExhausted,
  } = options

  // ====== 当前流式订阅管理（隔离不同对话组的事件） ======
  const currentUnsubscribe = ref<(() => void) | null>(null)
  const currentStreamCid = ref<string | null>(null)
  const isReconnecting = ref(false)

  /** 当前活跃的流式事件会话（发送 / 重连共用），用于 seq 跟踪与增量补发 */
  let activeStreamSession: AgentStreamSession | null = null

  const getActiveStreamSession = () => activeStreamSession

  const registerStreamSession = (unsubscribe: () => void, session: AgentStreamSession) => {
    currentUnsubscribe.value = unsubscribe
    activeStreamSession = session
  }

  /**
   * seq 跳号时请求增量补发（去抖，避免连续跳号触发风暴）。
   * 补发绑定发起时的流会话与 cid：清掉订阅、换了会话、同一会话 handoff 换了 cid，旧的都作废——
   * 到点不发、回执不回调；新目标可以重新计时
   */
  let streamResync: { timer: number; session: AgentStreamSession | null; cid: string } | null = null
  const cancelStreamResync = () => {
    if (streamResync) window.clearTimeout(streamResync.timer)
    streamResync = null
  }
  const isResyncTargetCurrent = (session: AgentStreamSession | null, cid: string) =>
    activeStreamSession === session && currentStreamCid.value === cid
  const requestStreamResync = (afterSeq: number) => {
    const session = activeStreamSession
    const cid = currentStreamCid.value
    if (!cid) return
    if (streamResync && streamResync.session === session && streamResync.cid === cid) return
    cancelStreamResync()
    const timer = window.setTimeout(() => {
      streamResync = null
      if (!isResyncTargetCurrent(session, cid)) return
      void resyncChat(cid, afterSeq > 0 ? afterSeq : undefined)
        .then(ack => {
          if (!ack.ok && isResyncTargetCurrent(session, cid)) {
            onResyncRejected?.(cid, ack.message, ack.code)
          }
        })
        .catch(error => {
          if (isResyncTargetCurrent(session, cid)) {
            onResyncRejected?.(cid, error?.message, 'CONNECTION_FAILED')
          }
        })
    }, 200)
    streamResync = { timer, session, cid }
  }

  /** 这条回复要被标成不再生成、订阅还留着时：让它的流会话先把手里的正文落盘 */
  const settleStreamText = (cid: string) => {
    if (currentStreamCid.value === cid) activeStreamSession?.settleText()
  }

  /** 清理当前流式订阅（不重置 watchdog，由调用方按场景决定）；没发出的补发计时一并清掉 */
  const cleanupSubscription = () => {
    cancelStreamResync()
    if (currentUnsubscribe.value) {
      currentUnsubscribe.value()
      currentUnsubscribe.value = null
    }
    activeStreamSession?.dispose()
    activeStreamSession = null
    currentStreamCid.value = null
  }

  // ====== 长任务 watchdog ======
  let watchdogTimer: ReturnType<typeof setInterval> | null = null
  let watchdogRetryCount = 0
  let lastStreamActivityAt = 0

  /** 每收到一个流式事件调用：刷新活跃时间并清零重试计数 */
  const noteStreamActivity = () => {
    lastStreamActivityAt = Date.now()
    watchdogRetryCount = 0
  }

  const resetWatchdog = () => {
    if (watchdogTimer) {
      clearInterval(watchdogTimer)
      watchdogTimer = null
    }
    watchdogRetryCount = 0
  }

  const startWatchdog = () => {
    resetWatchdog()
    lastStreamActivityAt = Date.now()
    watchdogTimer = setInterval(() => {
      const cid = currentStreamCid.value
      const targetMsg = cid ? getMessageByCid?.(cid) : getLastMessage()
      if (!targetMsg || targetMsg.role !== 'assistant' || !isResumableMessage(targetMsg)) {
        resetWatchdog()
        return
      }
      if (Date.now() - lastStreamActivityAt < WATCHDOG_INTERVAL) return
      if (watchdogRetryCount >= WATCHDOG_MAX_RETRIES) {
        const exhaustedCid = cid || targetMsg.cid
        resetWatchdog()
        if (exhaustedCid) onWatchdogExhausted?.(exhaustedCid)
        return
      }
      watchdogRetryCount++
      tryResumeActiveTask()
    }, WATCHDOG_INTERVAL)
  }

  // ====== 恢复入口 ======
  const tryResumeActiveTask = () => {
    if (isReconnecting.value) return
    if (currentStreamCid.value) {
      const targetMsg = getMessageByCid?.(currentStreamCid.value)
      if (targetMsg?.role === 'assistant' && isResumableMessage(targetMsg)) {
        resumeWorkflow(currentStreamCid.value)
      }
      return
    }
    const lastMsg = getLastMessage()
    if (!lastMsg || lastMsg.role !== 'assistant' || !isResumableMessage(lastMsg)) return

    if (lastMsg.cid) {
      resumeWorkflow(lastMsg.cid)
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return
    // socket 尚未恢复时不抢跑，等 socket:connected 入口统一触发
    if (!socketService.connected) return
    tryResumeActiveTask()
  }

  const onOnline = () => {
    tryResumeActiveTask()
  }

  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) {
      tryResumeActiveTask()
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    window.addEventListener('pageshow', onPageShow)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('pageshow', onPageShow)
    cleanupSubscription()
    resetWatchdog()
  })

  return {
    currentStreamCid,
    isReconnecting,
    getActiveStreamSession,
    registerStreamSession,
    cleanupSubscription,
    settleStreamText,
    requestStreamResync,
    noteStreamActivity,
    resetWatchdog,
    startWatchdog,
    tryResumeActiveTask,
  }
}
