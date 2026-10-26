import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * 对话画布的布局跟随。
 *
 * - 输入区的高度决定消息列表底部留白（--chat-footer-dock-height）；只读渠道没有输入框，只为提示条留高度。
 * - 消息列表长高（流式输出、图片加载、代码高亮）时在同一帧贴底：ResizeObserver 回调在布局之后、
 *   绘制之前触发，这是流式期间唯一的跟随入口；读者离开底部后不再拽回（followIfPinned 负责）。
 * - 进入会话、切换、发出后再兜底跟随一次，接住异步渲染把内容撑高的情况。
 */
export function useConversationLayoutFollow(options: {
  scrollRef: Ref<HTMLElement | null | undefined>
  footerDockRef: Ref<HTMLElement | null>
  isReadonly: () => boolean
  isMobile: () => boolean
  /** 这时不跟随：正在定位到某条消息、正在加载更早的消息、还没有消息 */
  shouldHold: () => boolean
  followIfPinned: () => void
}) {
  const footerDockHeight = ref(160)
  let dockObserver: ResizeObserver | null = null
  let observedDock: HTMLElement | null = null
  let layoutObserver: ResizeObserver | null = null
  let observedLayout: HTMLElement | null = null
  let settleTimers: number[] = []

  function followLayoutChange() {
    if (!options.shouldHold()) options.followIfPinned()
  }

  function updateDockHeight() {
    if (options.isReadonly()) {
      footerDockHeight.value = options.isMobile() ? 88 : 72
      return
    }
    const dock = options.footerDockRef.value
    if (!dock) {
      footerDockHeight.value = 0
      return
    }
    const { height } = dock.getBoundingClientRect()
    if (height && Number.isFinite(height)) footerDockHeight.value = height
  }

  function stopDockObserver() {
    dockObserver?.disconnect()
    dockObserver = null
    observedDock = null
  }

  /** 输入区挂载、换了节点或高度可能变化时调用：重新绑定观察并量一次 */
  async function refreshDockObserver() {
    if (options.isReadonly()) {
      stopDockObserver()
      updateDockHeight()
      return
    }
    await nextTick()
    const dock = options.footerDockRef.value
    if (!dock) {
      stopDockObserver()
      return
    }
    if (typeof ResizeObserver === 'undefined') {
      updateDockHeight()
      return
    }
    // 输入区高度变化会改变底部留白，跟随一帧即可；后续变化会再次触发
    dockObserver ??= new ResizeObserver(() => {
      updateDockHeight()
      followLayoutChange()
    })
    if (observedDock !== dock) {
      if (observedDock) dockObserver.unobserve(observedDock)
      dockObserver.observe(dock)
      observedDock = dock
    }
    updateDockHeight()
  }

  function cancelSettle() {
    settleTimers.forEach(timer => window.clearTimeout(timer))
    settleTimers = []
  }

  /** 兜底跟随：列表长高已由观察器持续跟随，这里只补两次，避免 1.2s 内连续吸附 */
  function settle() {
    cancelSettle()
    settleTimers = [0, 300].map(delay => window.setTimeout(followLayoutChange, delay))
  }

  /** 消息列表节点可能随会话切换重建：每次消息变化后确认观察的是当前节点 */
  async function refreshLayoutObserver() {
    await nextTick()
    if (typeof ResizeObserver === 'undefined') return
    const target =
      options.scrollRef.value?.querySelector<HTMLElement>('[data-chat-message-list]') ||
      options.scrollRef.value?.querySelector<HTMLElement>('[data-chat-transcript]') ||
      null
    if (target === observedLayout) return
    layoutObserver?.disconnect()
    layoutObserver = null
    observedLayout = target
    if (!target) return
    layoutObserver = new ResizeObserver(followLayoutChange)
    layoutObserver.observe(target)
  }

  function stop() {
    cancelSettle()
    layoutObserver?.disconnect()
    layoutObserver = null
    observedLayout = null
    stopDockObserver()
  }

  watch([options.isMobile, options.isReadonly], () => void refreshDockObserver(), {
    immediate: true,
    flush: 'post',
  })
  onBeforeUnmount(stop)

  return {
    footerDockHeight,
    refreshDockObserver,
    refreshLayoutObserver,
    settle,
    cancelSettle,
    stop,
  }
}
