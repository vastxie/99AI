import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'

const COLLAPSE_CHAR_LIMIT = 520
const COLLAPSE_LINE_LIMIT = 10
const COLLAPSED_MAX_HEIGHT_PX = 252
const COLLAPSED_MAX_HEIGHT = `${COLLAPSED_MAX_HEIGHT_PX}px`
const COLLAPSE_TRANSITION_MS = 220

/**
 * 长提问折叠：超过字数或行数时默认收起到固定高度，可展开 / 收起。
 * 高度过渡要有具体像素值，所以展开时先从收起高度过渡到内容实际高度，结束后再放开为 none（内容变化时不被截断）。
 */
export function useUserMessageCollapse(options: {
  content: () => string
  /** 编辑中不折叠 */
  editing: () => boolean
}) {
  const contentRef = ref<HTMLElement | null>(null)
  const isExpanded = ref(false)
  const maxHeight = ref(COLLAPSED_MAX_HEIGHT)
  let timer: ReturnType<typeof setTimeout> | null = null
  let frame: number | null = null

  const isLong = computed(() => {
    if (options.editing()) return false
    const text = options.content()
    const lineCount = (text.match(/\n/g)?.length || 0) + 1
    return text.length > COLLAPSE_CHAR_LIMIT || lineCount > COLLAPSE_LINE_LIMIT
  })
  const isCollapsed = computed(() => isLong.value && !isExpanded.value)
  const contentStyle = computed<CSSProperties>(() =>
    isLong.value ? { maxHeight: maxHeight.value } : {}
  )

  function clearAnimation() {
    if (frame !== null) {
      window.cancelAnimationFrame(frame)
      frame = null
    }
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function syncHeight() {
    clearAnimation()
    maxHeight.value = isCollapsed.value ? COLLAPSED_MAX_HEIGHT : 'none'
  }

  async function animateHeight(collapsed: boolean) {
    await nextTick()
    const element = contentRef.value
    if (!element || !isLong.value) {
      syncHeight()
      return
    }
    clearAnimation()
    const fullHeight = Math.max(element.scrollHeight, COLLAPSED_MAX_HEIGHT_PX)

    if (collapsed) {
      maxHeight.value = `${fullHeight}px`
      frame = window.requestAnimationFrame(() => {
        maxHeight.value = COLLAPSED_MAX_HEIGHT
        frame = null
      })
      return
    }

    maxHeight.value = COLLAPSED_MAX_HEIGHT
    frame = window.requestAnimationFrame(() => {
      maxHeight.value = `${fullHeight}px`
      frame = null
      timer = setTimeout(() => {
        if (!isCollapsed.value) maxHeight.value = 'none'
        timer = null
      }, COLLAPSE_TRANSITION_MS + 40)
    })
  }

  function toggle() {
    isExpanded.value = !isExpanded.value
  }

  watch(options.content, () => {
    isExpanded.value = false
    nextTick(syncHeight)
  })
  watch(isCollapsed, collapsed => animateHeight(collapsed))
  watch(isLong, () => nextTick(syncHeight))
  onMounted(() => nextTick(syncHeight))
  onUnmounted(clearAnimation)

  return { contentRef, isLong, isExpanded, contentStyle, toggle }
}
