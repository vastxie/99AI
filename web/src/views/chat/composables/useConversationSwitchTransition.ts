import type { ComputedRef, Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useChatStore } from '@/store/modules/chat'

interface UseConversationSwitchTransitionOptions {
  /** 消息滚动容器 */
  scrollRef: Ref<HTMLDivElement | null>
  /** 路由层会话加载状态 */
  isConversationLoading: ComputedRef<boolean>
  /** 当前工作区 id */
  activeWorkspaceId: ComputedRef<string>
  /** 是否存在仍然有效的消息定位请求（搜索跳转等），有效时不抢占滚动位置 */
  hasActivePendingFocus: () => boolean
  /** 经滚动账本钉底（useScroll.pinToBottomNow）；缺省时直接写 scrollTop */
  pinToBottom?: () => void
  /** 画布即将淡入时触发（贴底已完成） */
  onReveal?: () => void
}

/**
 * 会话切换过渡：切换期间画布瞬时隐藏并逐帧把滚动钉在底部（无动画），
 * 待路由状态与目标会话消息首次拉取都就绪后，再以贴底姿态淡入。
 *
 * 这是会话进入/切换时唯一的滚动定位机制；可见后的内容增长跟随
 * 由消息列表的 ResizeObserver 负责，冷启动（恢复持久化状态）由 firstScroll 兜底。
 */
export function useConversationSwitchTransition(options: UseConversationSwitchTransitionOptions) {
  const chatStore = useChatStore()
  const isCanvasSwitching = ref(false)
  let pinRaf = 0

  const pinScrollToBottomInstantly = () => {
    const element = options.scrollRef.value
    if (!element || options.hasActivePendingFocus()) return
    if (options.pinToBottom) {
      options.pinToBottom()
      return
    }
    const previousScrollBehavior = element.style.scrollBehavior
    element.style.scrollBehavior = 'auto'
    element.scrollTop = element.scrollHeight
    element.style.scrollBehavior = previousScrollBehavior
  }

  const stopPinLoop = () => {
    if (pinRaf) {
      window.cancelAnimationFrame(pinRaf)
      pinRaf = 0
    }
  }

  const startPinLoop = () => {
    stopPinLoop()
    const tick = () => {
      if (!isCanvasSwitching.value) {
        pinRaf = 0
        return
      }
      pinScrollToBottomInstantly()
      pinRaf = window.requestAnimationFrame(tick)
    }
    pinRaf = window.requestAnimationFrame(tick)
  }

  // 目标会话首次拉取消息还在途时（无缓存），路由状态可能已提前 ready，此时继续保持隐藏。
  // 本地已经有消息（首屏的一页没取到时插进来的一轮）就不是首屏加载，后台刷新时不隐藏
  const isActiveMessageLoadPending = computed(() => {
    const workspaceId = options.activeWorkspaceId.value
    const pagination = chatStore.messagePaginationByWorkspace[workspaceId]
    return Boolean(
      pagination?.loading &&
      !pagination.initialized &&
      !chatStore.messageCacheByWorkspace[workspaceId]?.length
    )
  })

  const shouldHoldCanvas = computed(
    () =>
      !chatStore.isStreamIn &&
      (options.isConversationLoading.value || isActiveMessageLoadPending.value)
  )

  const nextAnimationFrame = () =>
    new Promise<void>(resolve => {
      window.requestAnimationFrame(() => resolve())
    })

  const revealAtBottom = async () => {
    await nextTick()
    if (shouldHoldCanvas.value) return
    pinScrollToBottomInstantly()
    await nextAnimationFrame()
    if (shouldHoldCanvas.value) return
    pinScrollToBottomInstantly()
    options.onReveal?.()
    isCanvasSwitching.value = false
  }

  watch(
    shouldHoldCanvas,
    hold => {
      if (hold) {
        if (!isCanvasSwitching.value) {
          isCanvasSwitching.value = true
          startPinLoop()
        }
        return
      }
      if (!isCanvasSwitching.value) return
      void revealAtBottom()
    },
    { immediate: true }
  )

  onBeforeUnmount(stopPinLoop)

  return { isCanvasSwitching }
}
