import { nextTick, ref, type ComputedRef, type Ref } from 'vue'

/** 离历史顶部多近开始预取更早的消息：按前几条消息的高度估，最多这么远 */
const HISTORY_PREFETCH_MAX_DISTANCE = 560

/**
 * 历史分页 composable：滚动接近顶部时预取更早消息，加载后优先按消息
 * 锚点（cid + 顶部偏移）恢复视口，锚点失效时退回 scrollHeight 差值补偿。
 * 从 chatBase 整体迁出。
 *
 * 调用方职责：滚动事件中调用 maybeLoadOlderMessagesOnScroll；
 * 会话切换露出后调用 suppressHistoryPrefetch 短暂冷却，避免布局抖动误触发预取。
 */

interface HistoryPaginationOptions {
  scrollRef: Ref<HTMLElement | null | undefined>
  /** 按相对量调整 scrollTop（与滚动跟随状态联动），由 useScroll 提供 */
  adjustScrollTopBy: (delta: number) => void
  activeWorkspaceId: ComputedRef<string>
  hasMessages: ComputedRef<boolean>
  /** 会话切换过渡期间 scrollTop 会被浏览器钳到顶部附近，不可据此触发预取 */
  isCanvasSwitching: Ref<boolean>
  getPagination: (
    workspaceId: string
  ) => { hasMore?: boolean; loading?: boolean; olderLoadFailed?: boolean } | undefined
  loadOlderMessages: (workspaceId: string) => Promise<{ added: boolean }>
}

type HistoryViewportAnchor = {
  cid: string
  topOffset: number
}

const nextAnimationFrame = () =>
  new Promise<void>(resolve => {
    window.requestAnimationFrame(() => resolve())
  })

export function useHistoryPagination(options: HistoryPaginationOptions) {
  const {
    scrollRef,
    adjustScrollTopBy,
    activeWorkspaceId,
    hasMessages,
    isCanvasSwitching,
    getPagination,
    loadOlderMessages,
  } = options

  const isLoadingOlderMessages = ref(false)
  let olderMessagesLoadSettledUntil = 0

  const suppressHistoryPrefetch = (durationMs: number) => {
    olderMessagesLoadSettledUntil = Date.now() + durationMs
  }

  const getHistoryTopDistance = (element: HTMLElement) => element.scrollTop

  const waitForScrollLayout = async () => {
    await nextTick()
    await nextAnimationFrame()
  }

  const preserveViewportAfterScrollHeightChange = (
    previousScrollHeight: number,
    previousScrollTop: number
  ) => {
    const element = scrollRef.value
    if (!element || previousScrollHeight <= 0) return

    const targetScrollTop = previousScrollTop + (element.scrollHeight - previousScrollHeight)
    adjustScrollTopBy(targetScrollTop - element.scrollTop)
  }

  const captureHistoryViewportAnchor = (): HistoryViewportAnchor | null => {
    const element = scrollRef.value
    if (!element) return null

    const containerTop = element.getBoundingClientRect().top
    const messages = Array.from(element.querySelectorAll<HTMLElement>('[data-chat-message-cid]'))
    const anchorElement = messages.find(messageElement => {
      const rect = messageElement.getBoundingClientRect()
      return rect.bottom >= containerTop + 8
    })
    const cid = anchorElement?.dataset.chatMessageCid
    if (!anchorElement || !cid) return null

    return {
      cid,
      topOffset: anchorElement.getBoundingClientRect().top - containerTop,
    }
  }

  const preserveViewportByAnchor = (anchor: HistoryViewportAnchor | null) => {
    const element = scrollRef.value
    if (!element || !anchor) return false

    const escapedCid =
      typeof window !== 'undefined' && window.CSS?.escape
        ? window.CSS.escape(anchor.cid)
        : anchor.cid.replaceAll('"', '\\"')
    const anchorElement = element.querySelector<HTMLElement>(
      `[data-chat-message-cid="${escapedCid}"]`
    )
    if (!anchorElement) return false

    const containerTop = element.getBoundingClientRect().top
    const nextTopOffset = anchorElement.getBoundingClientRect().top - containerTop
    adjustScrollTopBy(nextTopOffset - anchor.topOffset)
    return true
  }

  const getHistoryPrefetchDistance = (element: HTMLElement) => {
    const messageHeights = Array.from(
      element.querySelectorAll<HTMLElement>('[data-chat-message-cid]')
    )
      .slice(0, 4)
      .map(messageElement => messageElement.getBoundingClientRect().height)
      .filter(height => Number.isFinite(height) && height > 24)

    if (messageHeights.length === 0) {
      return Math.min(HISTORY_PREFETCH_MAX_DISTANCE, Math.max(260, element.clientHeight * 0.32))
    }

    const averageHeight =
      messageHeights.reduce((total, height) => total + height, 0) / messageHeights.length
    const threeMessagesDistance = averageHeight * 3
    return Math.min(HISTORY_PREFETCH_MAX_DISTANCE, Math.max(260, threeMessagesDistance))
  }

  const maybeLoadOlderMessagesOnScroll = async () => {
    const element = scrollRef.value
    if (!element || isLoadingOlderMessages.value || !hasMessages.value) return
    if (isCanvasSwitching.value) return
    if (Date.now() < olderMessagesLoadSettledUntil) return

    const pagination = getPagination(activeWorkspaceId.value)
    // 上一次失败后不随滚动自动重试（服务不可用时会反复请求），等用户点重试
    if (!pagination?.hasMore || pagination.loading || pagination.olderLoadFailed) return

    const distanceToHistoryTop = getHistoryTopDistance(element)
    // 离顶部还远（超过预取距离的上限）：不必测量消息高度，滚动时不做无用的布局读取
    if (distanceToHistoryTop > HISTORY_PREFETCH_MAX_DISTANCE) return
    if (distanceToHistoryTop > getHistoryPrefetchDistance(element)) return

    await loadOlderMessagesKeepingViewport()
  }

  /** 用户点了「重试」：不看距离与上次失败，直接再取一次 */
  const retryOlderMessages = async () => {
    if (isLoadingOlderMessages.value || !hasMessages.value || isCanvasSwitching.value) return
    const pagination = getPagination(activeWorkspaceId.value)
    if (!pagination?.hasMore || pagination.loading) return
    await loadOlderMessagesKeepingViewport()
  }

  const loadOlderMessagesKeepingViewport = async () => {
    isLoadingOlderMessages.value = true

    const workspaceIdAtLoad = activeWorkspaceId.value
    const beforeLoadElement = scrollRef.value
    const viewportAnchor = captureHistoryViewportAnchor()
    const previousScrollHeight = beforeLoadElement?.scrollHeight ?? 0
    const previousScrollTop = beforeLoadElement?.scrollTop ?? 0

    try {
      const result = await loadOlderMessages(workspaceIdAtLoad)
      await waitForScrollLayout()
      // 加载途中切换了会话时，禁止用旧锚点回滚视口（会把新会话拽回顶部）
      const viewportStillValid =
        activeWorkspaceId.value === workspaceIdAtLoad && !isCanvasSwitching.value
      if (viewportStillValid && result.added && !preserveViewportByAnchor(viewportAnchor)) {
        preserveViewportAfterScrollHeightChange(previousScrollHeight, previousScrollTop)
      }
    } finally {
      isLoadingOlderMessages.value = false
      suppressHistoryPrefetch(180)
    }
  }

  return {
    isLoadingOlderMessages,
    suppressHistoryPrefetch,
    maybeLoadOlderMessagesOnScroll,
    retryOlderMessages,
  }
}
