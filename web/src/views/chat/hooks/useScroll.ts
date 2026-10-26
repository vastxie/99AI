import type { Ref } from 'vue'
import { onMounted, onUnmounted, nextTick, ref, watch } from 'vue'

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
  /** 显式回到底部并接管跟随：发送、按钮；等一次 nextTick 让新内容先落到 DOM */
  scrollToBottom: () => Promise<void>
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
 *
 * 归属只由读者输入改变，判定不看设备：每次程序写 scrollTop 都记进「观察账本」，
 * scroll 事件送达的位置偏离 `min(账本, 底部)` 超过半像素即视为读者输入
 * （滚轮、触摸、滚动条、键盘一视同仁）；落在账本上的是程序写入的延迟送达，落在
 * 收缩后底部上的是浏览器钳位，两者不算读者。读者在底部 24px 内重新钉底，超出即释放
 * 并显示「回到底部」；账本之外的程序滚动（会话切换钉底、钳位）把视口送到底部时，
 * 底部重新归程序所有。
 *
 * 跟随由消息列表的 ResizeObserver 在布局之后、绘制之前同步调用 followIfPinned，
 * 内容长高与贴底落在同一帧；这里不做平滑滚动，也不改任何过渡属性。
 */
export function useScroll(options: UseScrollOptions = {}): ScrollReturn {
  const scrollRef = ref<ScrollHost>(null)
  const isAtBottom = ref(true)
  /** 底部归属：true = 程序跟随，false = 读者在看历史 */
  let pinned = true
  /** 观察账本：最近一次程序写入或送达的 scrollTop */
  let observedTop = 0

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
    if (Math.abs(element.scrollTop - floor) > READER_INPUT_EPSILON) {
      element.scrollTop = floor
    }
    pinned = true
    record(element)
  }

  const followIfPinned = () => {
    const element = scrollRef.value
    if (!element) return
    if (!pinned) {
      refreshBottomVisibility(element)
      return
    }
    writeFloor(element)
  }

  const pinToBottomNow = () => {
    const element = scrollRef.value
    if (element) writeFloor(element)
  }

  async function scrollToBottom() {
    await nextTick()
    pinToBottomNow()
  }

  const adjustScrollTopBy = (delta: number) => {
    const element = scrollRef.value
    if (!element || !Number.isFinite(delta) || Math.abs(delta) < READER_INPUT_EPSILON) return
    element.scrollTop += delta
    record(element)
  }

  const recordProgrammaticScroll = () => {
    const element = scrollRef.value
    if (!element) return
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
      if (pinned && !nearFloor) options.onReaderDetach?.()
      pinned = nearFloor
    } else if (pinned && floor - top > READER_INPUT_EPSILON) {
      // 程序写入的延迟送达、或内容收缩后的浏览器钳位：底部仍归程序所有，补写到当前底部
      element.scrollTop = floor
    } else if (!pinned && nearFloor) {
      // 账本外的程序滚动（会话切换钉底、钳位）把视口送到了底部：重新接管跟随
      pinned = true
    }
    record(element)
  }

  const handleResize = () => {
    followIfPinned()
  }

  // 滚动面可能晚于组件挂载（空会话没有列表），首次出现时记账并钉底
  watch(
    scrollRef,
    element => {
      if (!element) return
      writeFloor(element)
    },
    { immediate: true, flush: 'post' }
  )

  onMounted(() => {
    window.addEventListener('resize', handleResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
  })

  return {
    scrollRef,
    isAtBottom,
    scrollToBottom,
    pinToBottomNow,
    followIfPinned,
    adjustScrollTopBy,
    recordProgrammaticScroll,
    handleScroll,
  }
}
