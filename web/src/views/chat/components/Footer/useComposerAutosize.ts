import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { animateHeight } from '@/utils/motion'
import { getTextareaMaxHeight } from './footer.helpers'

/**
 * 输入框高度：按内容自适应，最多 8 行（同时尊重 CSS 的 30vh 矮屏上限）；超过 4 行时出现「展开」，
 * 展开后固定 60vh。内容在外部被改（切换会话、清空）或窗口缩放时重新计算。
 */
export function useComposerAutosize(options: {
  input: Ref<HTMLTextAreaElement | null>
  text: () => string
}) {
  const isExpanded = ref(false)
  const showsExpandButton = ref(false)

  function resize() {
    const textarea = options.input.value
    if (!textarea) return
    if (isExpanded.value) {
      textarea.style.height = '60vh'
      return
    }
    // 断点切换的中间布局可能把 placeholder 临时折成多行；空草稿不据此撑高
    if (!textarea.value) {
      textarea.style.height = 'auto'
      showsExpandButton.value = false
      return
    }

    // 先压到 0 再读取 scrollHeight，避免 textarea 默认两行高度污染单行态；
    // 最小高度由行高与上下内边距算出，滚动交给 CSS 的 overflow-y:auto
    const style = window.getComputedStyle(textarea)
    const lineHeight = parseFloat(style.lineHeight) || 20
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    textarea.style.height = '0px'
    const contentHeight = textarea.scrollHeight
    const maxHeight = getTextareaMaxHeight(lineHeight, padding, parseFloat(style.maxHeight))
    textarea.style.height = `${Math.min(Math.max(contentHeight, lineHeight + padding), maxHeight)}px`
    showsExpandButton.value = contentHeight > lineHeight * 4
  }

  function toggleExpanded() {
    const fromHeight = options.input.value?.getBoundingClientRect().height ?? 0
    isExpanded.value = !isExpanded.value
    void nextTick(() => {
      resize()
      animateHeight(options.input.value, fromHeight, '--motion-duration-lg', 250)
    })
  }

  /** 清空或发出后收起展开态，按剩下的内容（通常为空）重新计算高度 */
  function reset() {
    isExpanded.value = false
    nextTick(resize)
  }

  watch(options.text, () => nextTick(() => requestAnimationFrame(resize)), { immediate: true })
  onMounted(() => window.addEventListener('resize', resize))
  onUnmounted(() => window.removeEventListener('resize', resize))

  return { isExpanded, showsExpandButton, resize, toggleExpanded, reset }
}
