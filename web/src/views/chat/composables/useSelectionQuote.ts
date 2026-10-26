import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import { message } from '@/utils/message'

const MAX_SELECTION_QUOTE_LENGTH = 4000
/** 触屏长按选词没有 mouseup：选区停止变化这么久之后再出气泡 */
const TOUCH_SELECTION_SETTLE_MS = 300
/** 气泡大约的高度（含与选区的间距）：放在选区下方放不下时改放上方 */
const POPOVER_ROOM_PX = 48

export interface UseSelectionQuoteOptions {
  /** 气泡定位宿主（须为 position: relative/absolute 元素），气泡坐标相对它计算 */
  hostRef: Ref<HTMLElement | null>
  /** 选区两端节点是否都落在可引用区域内 */
  isEligibleNode: (node: Node) => boolean
  /** 动态启用门禁；关闭时选区资格与最终提交都 fail closed */
  isEnabled?: () => boolean
  /** 引用来源标题（如文件名）；返回空则不带来源 */
  resolveSourceTitle?: () => string | undefined
  /** 气泡 top 下限，避免顶进宿主顶部的工具栏（默认 52） */
  minTop?: number
  /**
   * 宿主底部被上层盖住的高度（消息区底下压着输入区，气泡盖不过它）：
   * 触屏时选区下方剩下的可见空间放不下气泡就改放上方
   */
  bottomInset?: () => number
}

/**
 * 划词引用：监听选区生成"引用"气泡，点击后把选中文本写入全局 previewQuote，
 * 由输入框的引用 chip 承接并随下一条提问发送。文件预览面板与消息流共用。
 *
 * 鼠标与键盘在松开后计算（宿主上的 mouseup / keyup）；触屏长按选词只有 selectionchange，
 * 等选区稳定后再出，气泡放在选区下方，避开系统自带的复制菜单。
 */
export function useSelectionQuote(options: UseSelectionQuoteOptions) {
  const chatStore = useChatStore()
  const popover = ref({
    visible: false,
    text: '',
    top: 0,
    left: 0,
    placement: 'above' as 'above' | 'below',
    /** 选中的文字超过上限被截断了：引用时提示一次 */
    truncated: false,
  })
  let lastPointerType = ''
  let touchSettleTimer: number | null = null

  function normalizeSelectionText(text: string) {
    return text
      .replace(/\u00a0/gu, ' ')
      .trim()
      .slice(0, MAX_SELECTION_QUOTE_LENGTH)
  }

  function getSelectionRangeRect(range: Range) {
    const rect = range.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) return rect

    const firstRect = range.getClientRects()[0]
    return firstRect || null
  }

  function clampPopoverPosition(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(min, max))
  }

  function isEnabled() {
    return options.isEnabled?.() !== false
  }

  function updatePopover() {
    const selection = window.getSelection()
    if (
      !isEnabled() ||
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0 ||
      !selection.anchorNode ||
      !selection.focusNode ||
      !options.isEligibleNode(selection.anchorNode) ||
      !options.isEligibleNode(selection.focusNode)
    ) {
      hidePopover()
      return
    }

    const rawText = selection.toString()
    const text = normalizeSelectionText(rawText)
    const range = selection.getRangeAt(0)
    const rect = getSelectionRangeRect(range)
    const hostRect = options.hostRef.value?.getBoundingClientRect()

    if (!text || !rect || !hostRect) {
      hidePopover()
      return
    }

    const rawLeft = rect.left - hostRect.left + rect.width / 2
    const belowTop = rect.bottom - hostRect.top + 8
    // 触屏放在选区下方，避开系统自带的复制菜单；选区贴着可见区域底部、下方放不下时改放上方
    const visibleBottom = hostRect.height - Math.max(0, options.bottomInset?.() ?? 0)
    const below = lastPointerType === 'touch' && belowTop + POPOVER_ROOM_PX <= visibleBottom
    popover.value = {
      visible: true,
      text,
      left: clampPopoverPosition(rawLeft, 72, hostRect.width - 72),
      top: below ? belowTop : Math.max(options.minTop ?? 52, rect.top - hostRect.top - 8),
      placement: below ? 'below' : 'above',
      truncated: rawText.trim().length > MAX_SELECTION_QUOTE_LENGTH,
    }
  }

  /** 绑定在可引用区域的 mouseup/keyup 上；等选区落定后再计算 */
  function handleSelectionChange() {
    window.setTimeout(updatePopover, 0)
  }

  function hidePopover() {
    popover.value.visible = false
  }

  function rememberPointerType(event: PointerEvent) {
    lastPointerType = event.pointerType
  }

  /** 选区在区域外被点掉时同步隐藏气泡，避免残留按钮引用旧文本；触屏选词在这里等选区稳定后出气泡 */
  function handleDocumentSelectionChange() {
    if (lastPointerType === 'touch') {
      if (touchSettleTimer) window.clearTimeout(touchSettleTimer)
      // 选区没了（点掉了）：立刻收起，不再等，免得这段时间里点「引用」引到旧文字
      if (window.getSelection()?.isCollapsed !== false) {
        hidePopover()
        return
      }
      touchSettleTimer = window.setTimeout(updatePopover, TOUCH_SELECTION_SETTLE_MS)
      return
    }
    if (!popover.value.visible) return
    const selection = window.getSelection()
    if (
      !isEnabled() ||
      !selection ||
      selection.isCollapsed ||
      !selection.anchorNode ||
      !options.isEligibleNode(selection.anchorNode)
    ) {
      hidePopover()
    }
  }

  function quoteSelection() {
    if (!isEnabled()) {
      hidePopover()
      return
    }
    const text = popover.value.text.trim()
    if (!text) return

    // 引用写进当前会话的输入区（按会话保存，和草稿一样）
    chatStore.setQuote({
      text,
      sourceTitle: options.resolveSourceTitle?.() || undefined,
    })
    if (popover.value.truncated) {
      message().info(t('previewer.quoteTruncated', { max: MAX_SELECTION_QUOTE_LENGTH }))
    }
    hidePopover()
    window.getSelection()?.removeAllRanges()
  }

  onMounted(() => {
    document.addEventListener('selectionchange', handleDocumentSelectionChange)
    document.addEventListener('pointerdown', rememberPointerType, true)
  })

  watch(
    () => isEnabled(),
    enabled => {
      if (!enabled) hidePopover()
    }
  )

  onBeforeUnmount(() => {
    document.removeEventListener('selectionchange', handleDocumentSelectionChange)
    document.removeEventListener('pointerdown', rememberPointerType, true)
    if (touchSettleTimer) window.clearTimeout(touchSettleTimer)
  })

  return {
    popover,
    handleSelectionChange,
    hidePopover,
    quoteSelection,
  }
}
