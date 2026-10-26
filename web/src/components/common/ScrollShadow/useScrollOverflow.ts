import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useScrollOverflow(
  target: Ref<HTMLElement | null>,
  orientation: 'vertical' | 'horizontal'
) {
  const canScrollStart = ref(false)
  const canScrollEnd = ref(false)
  let resizeObserver: ResizeObserver | null = null
  let observedElement: HTMLElement | null = null

  function updateOverflow() {
    const el = target.value
    if (!el) {
      canScrollStart.value = false
      canScrollEnd.value = false
      return
    }

    if (orientation === 'horizontal') {
      canScrollStart.value = el.scrollLeft > 1
      canScrollEnd.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      return
    }

    canScrollStart.value = el.scrollTop > 1
    canScrollEnd.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1
  }

  const overflowState = computed(() => ({
    start: canScrollStart.value,
    end: canScrollEnd.value,
  }))

  function observeTarget() {
    if (typeof ResizeObserver === 'undefined') return
    const el = target.value
    if (!el || observedElement === el) return

    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(updateOverflow)
    resizeObserver.observe(el)
    observedElement = el
  }

  function refreshOverflow() {
    observeTarget()
    updateOverflow()
  }

  onMounted(() => {
    refreshOverflow()
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    observedElement = null
  })

  return {
    canScrollStart,
    canScrollEnd,
    overflowState,
    updateOverflow,
    refreshOverflow,
  }
}
