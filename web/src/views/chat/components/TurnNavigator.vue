<script setup lang="ts">
import { computed, onBeforeUnmount, toRef, watch } from 'vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import { getPlainMessagePreview, getPlainMessageText } from '../chatBase.helpers'
import { useTurnNavigator } from '../composables/useTurnNavigator'

/**
 * 右侧的轮次导航（桌面、两轮以上时出现）：悬停或键盘聚焦时展开成提问列表，点一项跳到那一轮。
 * 画布滚动时由 chatBase 调用 onScroll 更新当前所在轮次；读者主动滚动时调用 reset 复位交互。
 */
const props = defineProps<{
  scrollElement: HTMLElement | null
  /** 跳转写入 scrollTop 后通知滚动账本，不被判成读者输入 */
  recordProgrammaticScroll: () => void
}>()

const chatStore = useChatStore()
const { isMobile } = useViewport()

const navigator = useTurnNavigator({
  scrollRef: toRef(props, 'scrollElement'),
  chatMessages: computed(() => chatStore.chatList),
  isMobile,
  getItemText: getPlainMessageText,
  recordProgrammaticScroll: () => props.recordProgrammaticScroll(),
  // 回答摘要只取紧随其后、已完成的助手消息：流式中的消息每帧都在变，不让它触发轨道重算
  getItemResponse: (_item, messageIndex, all) => {
    const next = all[messageIndex + 1]
    if (!next || next.role !== 'assistant' || next.loading) return ''
    return getPlainMessagePreview(next)
  },
})
const {
  turnNavigatorItems: items,
  turnNavigatorRailItems: railItems,
  activeTurnNavigatorCid: activeCid,
  turnNavigatorExpanded: expanded,
  turnNavigatorSuppressExpand: suppressExpand,
  handleTurnNavigatorMouseEnter: expand,
  handleTurnNavigatorMouseLeave: collapse,
  scrollTurnNavigatorItem: jumpTo,
} = navigator

function setCardRef(element: unknown) {
  navigator.turnNavigatorCardRef.value = (element as HTMLElement) ?? null
}

/** 焦点移出整个导航时才收起（在列表项之间移动不收） */
function handleFocusOut(event: FocusEvent) {
  const root = event.currentTarget as HTMLElement
  if (!root.contains(event.relatedTarget as Node | null)) collapse()
}

watch(
  () => chatStore.active,
  (next, previous) => {
    if (next !== previous) navigator.selectedTurnNavigatorCid.value = null
  }
)
onBeforeUnmount(navigator.disposeTurnNavigator)

defineExpose({
  onScroll() {
    // 导航没显示（手机、只有一轮）：不测量各轮的位置
    if (isMobile.value || items.value.length <= 1) return
    if (navigator.turnNavigatorJumpTargetCid.value) {
      navigator.scheduleTurnNavigatorJumpIdleRelease()
    }
    navigator.updateActiveTurnNavigatorFromViewport()
  },
  reset: navigator.resetTurnNavigatorInteraction,
})
</script>

<template>
  <nav
    v-if="!isMobile && items.length > 1"
    class="chat-turn-navigator"
    :class="{
      'is-expanded': expanded,
      'is-expand-suppressed': suppressExpand,
      'is-interaction-locked': suppressExpand,
    }"
    :aria-label="t('chat.turnNavigation')"
    @mouseenter="expand"
    @mouseleave="collapse"
    @focusin="expand"
    @focusout="handleFocusOut"
  >
    <div :ref="setCardRef" class="chat-turn-navigator-card">
      <button
        v-for="item in railItems"
        :key="`rail-${item.railSlot ?? item.cid}-${item.cid}`"
        type="button"
        class="chat-turn-navigator-item"
        :class="{ 'is-active': item.cid === activeCid }"
        :aria-label="item.text"
        :aria-current="item.cid === activeCid ? 'true' : undefined"
        :data-turn-navigator-cid="item.cid"
        @click="jumpTo(item.cid)"
      >
        <span class="chat-turn-navigator-copy">
          <span class="chat-turn-navigator-label truncate">{{ item.text }}</span>
          <span v-if="item.response" class="chat-turn-navigator-response truncate">
            {{ item.response }}
          </span>
        </span>
        <span class="chat-turn-navigator-item-mark" aria-hidden="true"></span>
      </button>
    </div>
  </nav>
</template>
