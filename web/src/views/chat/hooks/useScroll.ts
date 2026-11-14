import type { Ref } from 'vue'
import { onMounted, onUnmounted, nextTick, ref, watch } from 'vue'
import { readDuration } from '@/utils/motion'

/** 承载消息列表的滚动容器，挂载前为 null */
type ScrollHost = HTMLDivElement | null

export interface UseScrollOptions {
  /** 读者主动把视口从底部移开、释放跟随时回调（导航交互复位、取消兜底贴底等） */
  onReaderDetach?: () => void
}

export interface ScrollReturn {
  scrollRef: Ref<ScrollHost>
  /** 距底部 220px 内（「回到底部」按钮的显示依据），不代表跟随归属 */
  isAtBottom: Ref<boolean>
  /** 显式回到底部并接管跟随：发送等场景；等一次 nextTick 让新内容先落到 DOM */
  scrollToBottom: () => Promise<void>
  /** 阻尼平滑滚回底部并接管跟随：「回到底部」按钮点击，读者上滚立即让位 */
  scrollToBottomSmooth: () => void
  /** 同步钉底并接管跟随：会话切换过渡逐帧钉底用 */
  pinToBottomNow: () => void
  /** 内容长高后的跟随：只在底部仍归程序所有时同步写到底部；未钉底时只刷新 isAtBottom */
  followIfPinned: () => void
  /** 历史前插等程序补偿：按相对量调整并记账，不改变归属 */
  adjustScrollTopBy: (delta: number) => void
  /** 账本之外的程序滚动（导航跳转的 scrollIntoView）完成后调用：按落点几何设定归属并记账，不算读者输入 */
  recordProgrammaticScroll: () => void
  handleScroll: () => void
}

/** 距底部多近算「钉底」：只有真正贴底才跟随，读者刚向上滚一点就不会被增量拽回 */
const FOLLOW_PIN_THRESHOLD = 24
/** 「回到底部」按钮的显示阈值 */
const BOTTOM_VISIBLE_THRESHOLD = 220
/** 滚动位置可能带小数，偏差超过半像素才算读者输入 */
const READER_INPUT_EPSILON = 0.5

/**
 * 消息列表的贴底跟随与读者归属。
 * 每次程序写 scrollTop 都记进观察账本，偏离 `min(账本, 底部)` 超过半像素即视为读者输入；
 * 读者在底部 24px 内重新钉底，超出即释放并显示「回到底部」。
 * ResizeObserver 在布局后同步调用 followIfPinned 使内容长高与贴底同帧；点击按钮走 scrollToBottomSmooth 阻尼滑行。
 */
export function useScroll(options: UseScrollOptions = {}): ScrollReturn {
  const scrollRef = ref<ScrollHost>(null)
  const isAtBottom = ref(true)
  let pinned = true
  let observedTop = 0
  let smoothRaf = 0

  const cancelSmooth = () => {
    if (smoothRaf) cancelAnimationFrame(smoothRaf)
    smoothRaf = 0
  }

  const floorOf = (element: HTMLElement) => Math.max(0, element.scrollHeight - element.clientHeight)
  const refreshBottomVisibility = (element: HTMLElement) => {
    isAtBottom.value = floorOf(element) - element.scrollTop <= BOTTOM_VISIBLE_THRESHOLD
  }
  const record = (element: HTMLElement) => {
    observedTop = element.scrollTop
    refreshBottomVisibility(element)
  }

  const writeFloor = (element: HTMLElement) => {
    const floor = floorOf(element)
    if (Math.abs(element.scrollTop - floor) > READER_INPUT_EPSILON) element.scrollTop = floor
    pinned = true
    record(element)
  }

  const followIfPinned = () => {
    const element = scrollRef.value
    if (!element) return
    if (!pinned) return refreshBottomVisibility(element)
    if (!smoothRaf) writeFloor(element)
  }

  const pinToBottomNow = () => {
    cancelSmooth()
    const element = scrollRef.value
    if (element) writeFloor(element)
  }

  async function scrollToBottom() {
    await nextTick()
    pinToBottomNow()
  }

  const scrollToBottomSmooth = () => {
    const element = scrollRef.value
    if (!element) return
    cancelSmooth()
    const initialFloor = floorOf(element)
    if (
      initialFloor - element.scrollTop <= FOLLOW_PIN_THRESHOLD ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      writeFloor(element)
      return
    }
    pinned = true
    if (element.clientHeight > 0 && initialFloor - element.scrollTop > element.clientHeight * 2.2) {
      element.scrollTop = initialFloor - element.clientHeight * 2.2
      record(element)
    }
    const startTop = element.scrollTop
    const duration = Math.max(1, readDuration(element, '--motion-duration-xl', 300))
    const startAt = performance.now()
    const step = (now: number) => {
      if (!pinned || scrollRef.value !== element) {
        smoothRaf = 0
        return
      }
      const t = Math.min(1, Math.max(0, (now - startAt) / duration))
      if (t >= 1) {
        smoothRaf = 0
        writeFloor(element)
        return
      }
      const eased = 1 - (1 - t) ** 3
      element.scrollTop = startTop + (floorOf(element) - startTop) * eased
      record(element)
      smoothRaf = requestAnimationFrame(step)
    }
    smoothRaf = requestAnimationFrame(step)
  }

  const adjustScrollTopBy = (delta: number) => {
    const element = scrollRef.value
    if (!element || !Number.isFinite(delta) || Math.abs(delta) < READER_INPUT_EPSILON) return
    cancelSmooth()
    element.scrollTop += delta
    record(element)
  }

  const recordProgrammaticScroll = () => {
    const element = scrollRef.value
    if (!element) return
    cancelSmooth()
    pinned = floorOf(element) - element.scrollTop <= FOLLOW_PIN_THRESHOLD
    record(element)
  }

  const handleScroll = () => {
    const element = scrollRef.value
    if (!element) return
    const floor = floorOf(element)
    const top = element.scrollTop
    const movedByReader = Math.abs(top - Math.min(observedTop, floor)) > READER_INPUT_EPSILON
    const nearFloor = floor - top <= FOLLOW_PIN_THRESHOLD

    if (movedByReader) {
      cancelSmooth()
      if (pinned && !nearFloor) options.onReaderDetach?.()
      pinned = nearFloor
    } else if (pinned && !smoothRaf && floor - top > READER_INPUT_EPSILON) {
      element.scrollTop = floor
    } else if (!pinned && nearFloor) {
      pinned = true
    }
    record(element)
  }

  watch(
    scrollRef,
    element => {
      cancelSmooth()
      if (element) writeFloor(element)
    },
    { immediate: true, flush: 'post' }
  )

  onMounted(() => window.addEventListener('resize', followIfPinned))
  onUnmounted(() => {
    cancelSmooth()
    window.removeEventListener('resize', followIfPinned)
  })

  return {
    scrollRef,
    isAtBottom,
    scrollToBottom,
    scrollToBottomSmooth,
    pinToBottomNow,
    followIfPinned,
    adjustScrollTopBy,
    recordProgrammaticScroll,
    handleScroll,
  }
}
