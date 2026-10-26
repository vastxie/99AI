import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'

/**
 * 轮次导航器 composable：右侧轮次轨道的展开/收起、活跃轮次随视口计算、
 * 点击跳转与滚动锁定。从 chatBase 整体迁出。
 *
 * 调用方职责：滚动事件中调用 updateActiveFromViewport / scheduleJumpIdleRelease，
 * 会话切换时重置 selectedCid，卸载时调用 dispose。
 */

interface TurnNavigatorOptions {
  scrollRef: Ref<HTMLElement | null | undefined>
  chatMessages: ComputedRef<Chat.Chat[]>
  isMobile: Ref<boolean>
  /** 轮次条目的预览文本（用户提问） */
  getItemText: (item: Chat.Chat) => string
  /** 轮次的回答摘要（可选）；实现方应只读已完成的消息，避免流式中每帧重算轨道 */
  getItemResponse?: (item: Chat.Chat, messageIndex: number, all: Chat.Chat[]) => string
  /** 跳转写入 scrollTop 后通知滚动账本（useScroll.recordProgrammaticScroll），不被判成读者输入 */
  recordProgrammaticScroll?: () => void
}

const escapeSelectorValue = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replaceAll('"', '\\"')
}

const nextAnimationFrame = () =>
  new Promise<void>(resolve => {
    window.requestAnimationFrame(() => resolve())
  })

export function useTurnNavigator(options: TurnNavigatorOptions) {
  const {
    scrollRef,
    chatMessages,
    isMobile,
    getItemText,
    getItemResponse,
    recordProgrammaticScroll,
  } = options

  const getTurnAnchorElement = (cid: string) => {
    return scrollRef.value?.querySelector(
      `[data-turn-anchor="${escapeSelectorValue(cid)}"]`
    ) as HTMLElement | null
  }

  const selectedTurnNavigatorCid = ref<string | null>(null)

  const turnNavigatorItems = computed(() => {
    const all = chatMessages.value
    return all
      .map((item, messageIndex) => ({ item, messageIndex }))
      .filter(({ item }) => item.role === 'user' && item.cid)
      .map(({ item, messageIndex }, turnIndex) => ({
        cid: item.cid as string,
        text: getItemText(item),
        response: getItemResponse ? getItemResponse(item, messageIndex, all) : '',
        messageIndex,
        turnIndex,
      }))
  })

  const turnNavigatorCardRef = ref<HTMLElement | null>(null)
  const turnNavigatorJumpTargetCid = ref<string | null>(null)
  const turnNavigatorSuppressExpand = ref(false)
  const turnNavigatorExpanded = ref(false)
  let turnNavigatorExpandTimer: number | undefined

  const activeTurnNavigatorCid = computed(() => {
    return (
      turnNavigatorJumpTargetCid.value ||
      selectedTurnNavigatorCid.value ||
      turnNavigatorItems.value[turnNavigatorItems.value.length - 1]?.cid
    )
  })

  const turnNavigatorRailItems = computed(() => {
    return turnNavigatorItems.value.map((item, index) => ({
      ...item,
      railSlot: index,
    }))
  })

  watch(
    [activeTurnNavigatorCid, turnNavigatorRailItems],
    async ([cid]) => {
      if (!cid) return
      // 展开时用户在主动浏览卡片，不抢占其滚动位置；收起后下次活跃变化会重新对齐
      if (turnNavigatorExpanded.value) return

      await nextTick()
      const card = turnNavigatorCardRef.value
      if (!card) return

      const activeItem = card.querySelector<HTMLElement>(
        `[data-turn-navigator-cid="${escapeSelectorValue(cid)}"]`
      )
      if (!activeItem) return

      const itemTop = activeItem.offsetTop
      const itemBottom = itemTop + activeItem.offsetHeight
      const visibleTop = card.scrollTop
      const visibleBottom = visibleTop + card.clientHeight
      // 留出边距，让活跃标记避开容器边缘的渐隐/截断区域
      const edgePeek = 8

      if (itemTop < visibleTop + edgePeek) {
        card.scrollTo({ top: Math.max(0, itemTop - edgePeek), behavior: 'smooth' })
        return
      }

      if (itemBottom > visibleBottom - edgePeek) {
        card.scrollTo({ top: itemBottom - card.clientHeight + edgePeek, behavior: 'smooth' })
      }
    },
    { immediate: true, flush: 'post' }
  )

  let turnNavigatorCollapseTimer: number | undefined

  const cancelTurnNavigatorHoverTimers = () => {
    if (turnNavigatorExpandTimer) {
      window.clearTimeout(turnNavigatorExpandTimer)
      turnNavigatorExpandTimer = undefined
    }
    if (turnNavigatorCollapseTimer) {
      window.clearTimeout(turnNavigatorCollapseTimer)
      turnNavigatorCollapseTimer = undefined
    }
  }

  const handleTurnNavigatorMouseEnter = () => {
    // 取消待执行的收起，光标沿边缘短暂进出时不抖动
    if (turnNavigatorCollapseTimer) {
      window.clearTimeout(turnNavigatorCollapseTimer)
      turnNavigatorCollapseTimer = undefined
    }
    if (turnNavigatorJumpTargetCid.value || turnNavigatorSuppressExpand.value) return
    if (turnNavigatorExpanded.value) return
    if (turnNavigatorExpandTimer) {
      window.clearTimeout(turnNavigatorExpandTimer)
    }
    // 指针一到就展开；短延迟只为过滤划过边缘时的误触
    turnNavigatorExpandTimer = window.setTimeout(() => {
      turnNavigatorExpanded.value = true
      turnNavigatorExpandTimer = undefined
    }, 60)
  }

  const handleTurnNavigatorMouseLeave = () => {
    cancelTurnNavigatorHoverTimers()
    turnNavigatorCollapseTimer = window.setTimeout(() => {
      turnNavigatorCollapseTimer = undefined
      turnNavigatorExpanded.value = false
      if (!turnNavigatorJumpTargetCid.value) {
        turnNavigatorSuppressExpand.value = false
      }
    }, 120)
  }

  let turnNavigatorActiveRaf = 0
  let turnNavigatorAlignTimer: number | undefined
  let turnNavigatorJumpIdleTimer: number | undefined
  let turnNavigatorJumpFallbackTimer: number | undefined
  let turnNavigatorMarginTarget: HTMLElement | null = null

  const clearTurnNavigatorScrollMargin = () => {
    if (!turnNavigatorMarginTarget) return
    turnNavigatorMarginTarget.style.scrollMarginTop = ''
    turnNavigatorMarginTarget = null
  }

  const clearTurnNavigatorJumpTimers = () => {
    if (turnNavigatorJumpIdleTimer) {
      window.clearTimeout(turnNavigatorJumpIdleTimer)
      turnNavigatorJumpIdleTimer = undefined
    }
    if (turnNavigatorJumpFallbackTimer) {
      window.clearTimeout(turnNavigatorJumpFallbackTimer)
      turnNavigatorJumpFallbackTimer = undefined
    }
  }

  const clearTurnNavigatorJumpLock = () => {
    clearTurnNavigatorJumpTimers()
    turnNavigatorJumpTargetCid.value = null
  }

  const releaseTurnNavigatorJumpLock = (cid: string) => {
    if (turnNavigatorJumpTargetCid.value !== cid) return
    selectedTurnNavigatorCid.value = cid
    clearTurnNavigatorJumpLock()
    turnNavigatorSuppressExpand.value = false
    turnNavigatorExpanded.value = false
  }

  const scheduleTurnNavigatorJumpIdleRelease = (delay = 220) => {
    const cid = turnNavigatorJumpTargetCid.value
    if (!cid) return
    if (turnNavigatorJumpIdleTimer) {
      window.clearTimeout(turnNavigatorJumpIdleTimer)
    }
    turnNavigatorJumpIdleTimer = window.setTimeout(() => {
      releaseTurnNavigatorJumpLock(cid)
    }, delay)
  }

  const scheduleTurnNavigatorActiveCompute = () => {
    if (turnNavigatorActiveRaf) return

    turnNavigatorActiveRaf = window.requestAnimationFrame(() => {
      turnNavigatorActiveRaf = 0

      const scroller = scrollRef.value
      if (!scroller || turnNavigatorJumpTargetCid.value) return

      const scrollerTop = scroller.getBoundingClientRect().top
      const probeLine = scrollerTop + scroller.clientHeight * 0.25
      const visualAnchors = turnNavigatorItems.value
        .map(item => {
          const anchor = getTurnAnchorElement(item.cid)
          if (!anchor) return null
          return {
            cid: item.cid,
            top: anchor.getBoundingClientRect().top,
          }
        })
        .filter((item): item is { cid: string; top: number } => item !== null)
        .toSorted((a, b) => a.top - b.top)

      if (visualAnchors.length === 0) return

      let matchedCid: string | null = null
      for (const anchor of visualAnchors) {
        if (anchor.top <= probeLine) matchedCid = anchor.cid
        else break
      }

      const nextCid = matchedCid || visualAnchors[0]?.cid
      if (nextCid) selectedTurnNavigatorCid.value = nextCid
    })
  }

  // 活跃项追踪节流（带尾随落点）：快速滚动时右侧标记不再逐帧跳动，
  // 同时避免每帧对全部轮次锚点做布局测量；停下后仍会落到准确位置
  const TURN_NAVIGATOR_ACTIVE_THROTTLE = 160
  let turnNavigatorActiveLastRun = 0
  let turnNavigatorActiveTrailingTimer: number | undefined

  const updateActiveTurnNavigatorFromViewport = () => {
    if (turnNavigatorJumpTargetCid.value) return

    const now = Date.now()
    if (now - turnNavigatorActiveLastRun >= TURN_NAVIGATOR_ACTIVE_THROTTLE) {
      turnNavigatorActiveLastRun = now
      scheduleTurnNavigatorActiveCompute()
      return
    }

    if (turnNavigatorActiveTrailingTimer) return
    turnNavigatorActiveTrailingTimer = window.setTimeout(() => {
      turnNavigatorActiveTrailingTimer = undefined
      turnNavigatorActiveLastRun = Date.now()
      scheduleTurnNavigatorActiveCompute()
    }, TURN_NAVIGATOR_ACTIVE_THROTTLE)
  }

  const scrollTurnNavigatorItem = async (cid: string) => {
    const scroller = scrollRef.value
    if (!scroller) return

    cancelTurnNavigatorHoverTimers()
    turnNavigatorSuppressExpand.value = true
    turnNavigatorExpanded.value = false
    turnNavigatorJumpTargetCid.value = cid
    selectedTurnNavigatorCid.value = cid
    if (turnNavigatorAlignTimer) {
      window.clearTimeout(turnNavigatorAlignTimer)
      turnNavigatorAlignTimer = undefined
    }
    clearTurnNavigatorJumpTimers()
    clearTurnNavigatorScrollMargin()
    await nextTick()

    await nextAnimationFrame()
    const target = getTurnAnchorElement(cid)
    if (!target) {
      releaseTurnNavigatorJumpLock(cid)
      return
    }

    const topGap = isMobile.value ? 12 : 16
    turnNavigatorMarginTarget = target
    target.style.scrollMarginTop = `${topGap}px`
    const previousScrollBehavior = scroller.style.scrollBehavior
    scroller.style.scrollBehavior = 'auto'
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
    recordProgrammaticScroll?.()

    await nextAnimationFrame()
    const currentTarget = getTurnAnchorElement(cid)
    if (currentTarget) {
      clearTurnNavigatorScrollMargin()
      turnNavigatorMarginTarget = currentTarget
      currentTarget.style.scrollMarginTop = `${topGap}px`
      currentTarget.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
      recordProgrammaticScroll?.()
    }
    scroller.style.scrollBehavior = previousScrollBehavior
    clearTurnNavigatorScrollMargin()

    scheduleTurnNavigatorJumpIdleRelease(180)
    turnNavigatorJumpFallbackTimer = window.setTimeout(() => {
      releaseTurnNavigatorJumpLock(cid)
    }, 700)
  }

  /** 会话切换等场景的交互复位（不清空 selectedCid） */
  const resetTurnNavigatorInteraction = () => {
    clearTurnNavigatorJumpLock()
    turnNavigatorSuppressExpand.value = false
    turnNavigatorExpanded.value = false
  }

  /** 卸载清理：定时器 / RAF / 滚动边距 */
  const disposeTurnNavigator = () => {
    if (turnNavigatorActiveRaf) {
      window.cancelAnimationFrame(turnNavigatorActiveRaf)
      turnNavigatorActiveRaf = 0
    }
    if (turnNavigatorAlignTimer) {
      window.clearTimeout(turnNavigatorAlignTimer)
      turnNavigatorAlignTimer = undefined
    }
    if (turnNavigatorActiveTrailingTimer) {
      window.clearTimeout(turnNavigatorActiveTrailingTimer)
      turnNavigatorActiveTrailingTimer = undefined
    }
    cancelTurnNavigatorHoverTimers()
    clearTurnNavigatorJumpLock()
    clearTurnNavigatorScrollMargin()
  }

  return {
    turnNavigatorItems,
    turnNavigatorRailItems,
    activeTurnNavigatorCid,
    selectedTurnNavigatorCid,
    turnNavigatorCardRef,
    turnNavigatorJumpTargetCid,
    turnNavigatorSuppressExpand,
    turnNavigatorExpanded,
    handleTurnNavigatorMouseEnter,
    handleTurnNavigatorMouseLeave,
    scrollTurnNavigatorItem,
    updateActiveTurnNavigatorFromViewport,
    scheduleTurnNavigatorJumpIdleRelease,
    resetTurnNavigatorInteraction,
    disposeTurnNavigator,
  }
}
