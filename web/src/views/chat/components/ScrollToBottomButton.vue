<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import UiButton from '@/components/common/UiButton.vue'
import { t } from '@/locales'

/**
 * 「回到底部」悬浮按钮：锚点绝对定位在输入框 dock 之上且不拦截指针，只有按钮本体可点，
 * 正文滚动区不为它扣除高度；进出只做 opacity 过渡（进 base 档、出 fast 档），不模糊不缩放。
 * 下方还在生成时按钮上多一个闪动的点，读屏说明下方仍在生成。
 */
defineProps<{ visible: boolean; generating?: boolean }>()
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <div
    class="chat-scroll-bottom-anchor pointer-events-none absolute inset-x-0 z-floating-button flex justify-center"
  >
    <Transition name="scroll-bottom-button">
      <UiButton
        v-show="visible"
        variant="secondary"
        icon
        pill
        :scale="false"
        class="scroll-bottom-button pointer-events-auto"
        :aria-label="generating ? t('chat.scrollToLatestGenerating') : t('chat.scrollToBottom')"
        @click="emit('click')"
      >
        <ChevronDown :size="18" :strokeWidth="2" aria-hidden="true" />
        <span v-if="generating" class="scroll-bottom-generating-dot" aria-hidden="true" />
      </UiButton>
    </Transition>
  </div>
</template>

<style scoped>
.scroll-bottom-button.ui-button {
  position: relative;
  box-shadow: var(--component-shadow-sm);
}

.scroll-bottom-generating-dot {
  position: absolute;
  top: 0.125rem;
  right: 0.125rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--radius-full);
  background: var(--agent-running);
  animation: scroll-bottom-generating 1.2s ease-in-out infinite;
}

@keyframes scroll-bottom-generating {
  50% {
    opacity: 0.35;
  }
}

.chat-scroll-bottom-anchor {
  bottom: calc(var(--chat-footer-dock-height, 0px) + 12px);
}

.scroll-bottom-button-enter-active.ui-button {
  transition: opacity var(--motion-duration-md) var(--motion-easing);
}

.scroll-bottom-button-leave-active.ui-button {
  transition: opacity var(--motion-duration-xs) var(--motion-easing);
}

.scroll-bottom-button-enter-from,
.scroll-bottom-button-leave-to {
  opacity: 0;
}

.scroll-bottom-button-enter-to,
.scroll-bottom-button-leave-from {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .scroll-bottom-button.ui-button,
  .scroll-bottom-button-enter-active.ui-button,
  .scroll-bottom-button-leave-active.ui-button,
  .scroll-bottom-generating-dot {
    transition: none;
    animation: none;
  }
}
</style>
