import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useChatStore } from '@/store/modules/chat'

const HIGHLIGHT_MS = 1800

/**
 * 定位到某条消息（搜索结果跳转）：滚到视口中间并短暂高亮。
 * 要定位的消息不在当前列表里（比如一次失败的跳转）时视为陈旧残留，不阻塞自动贴底。
 */
export function useMessageFocus(options: { scrollRef: Ref<HTMLElement | null | undefined> }) {
  const chatStore = useChatStore()
  const highlightedCid = ref<string | null>(null)
  let timer: number | null = null

  function hasPendingFocus() {
    const cid = chatStore.pendingFocusCid
    return Boolean(cid) && chatStore.chatList.some(item => item.cid === cid)
  }

  async function focusMessage(cid?: string | null) {
    if (!cid) return
    await nextTick()
    const target = options.scrollRef.value?.querySelector<HTMLElement>(
      `[data-chat-message-cid="${cid}"]`
    )
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    highlightedCid.value = cid
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      highlightedCid.value = null
      if (chatStore.pendingFocusCid === cid) chatStore.pendingFocusCid = null
    }, HIGHLIGHT_MS)
  }

  watch(
    () => chatStore.pendingFocusCid,
    cid => {
      if (cid) void focusMessage(cid)
    }
  )
  onBeforeUnmount(() => {
    if (timer) window.clearTimeout(timer)
  })

  return { highlightedCid, hasPendingFocus, focusMessage }
}
