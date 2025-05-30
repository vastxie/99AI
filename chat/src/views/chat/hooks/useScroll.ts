import type { Ref } from 'vue'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

type ScrollElement = HTMLDivElement | null

interface ScrollReturn {
  scrollRef: Ref<ScrollElement>
  scrollToBottom: () => Promise<void>
  scrollToTop: () => Promise<void>
  scrollToBottomIfAtBottom: (threshold?: number) => Promise<void>
  isAtBottom: Ref<boolean>
  handleScroll: () => void
}

export function useScroll(): ScrollReturn {
  const scrollRef = ref<ScrollElement>(null)
  const isAtBottom = ref(true)

  // 添加节流时间戳
  let lastScrollTime = 0
  const SCROLL_THROTTLE = 300 // 300ms 的节流时间

  // 平滑滚动到底部
  const scrollToBottom = async () => {
    await nextTick()
    if (scrollRef.value) {
      setTimeout(() => {
        scrollRef.value?.scrollTo({
          top: scrollRef.value.scrollHeight,
          behavior: 'smooth',
        })
      }, 300)
    }
  }

  const scrollToTop = async () => {
    await nextTick()
    if (scrollRef.value) scrollRef.value.scrollTop = 0
  }

  const scrollToBottomIfAtBottom = async (threshold = 300) => {
    const now = Date.now()
    if (now - lastScrollTime < SCROLL_THROTTLE) {
      return
    }
    lastScrollTime = now

    await nextTick()
    if (scrollRef.value) {
      const distanceToBottom =
        scrollRef.value.scrollHeight - scrollRef.value.scrollTop - scrollRef.value.clientHeight

      if (distanceToBottom <= threshold) {
        scrollRef.value.scrollTo({
          top: scrollRef.value.scrollHeight,
          behavior: 'smooth',
        })
      }
    }
  }

  // 检查是否在底部
  const checkIfBottomVisible = () => {
    if (scrollRef.value) {
      const element = scrollRef.value
      const scrollPosition = element.scrollTop + element.clientHeight
      const threshold = 50
      const distance = element.scrollHeight - scrollPosition

      isAtBottom.value = distance <= threshold
    }
  }

  // 处理滚动事件
  const handleScroll = () => {
    checkIfBottomVisible()
  }

  onMounted(() => {
    const element = scrollRef.value
    if (element) {
      element.addEventListener('scroll', handleScroll)
      window.addEventListener('resize', handleScroll)
      checkIfBottomVisible()
      scrollToBottom()
    }
  })

  onUnmounted(() => {
    const element = scrollRef.value
    if (element) {
      element.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  })

  return {
    scrollRef,
    scrollToBottom,
    scrollToTop,
    scrollToBottomIfAtBottom,
    isAtBottom,
    handleScroll,
  }
}
