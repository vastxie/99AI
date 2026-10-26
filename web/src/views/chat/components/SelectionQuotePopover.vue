<script setup lang="ts">
import { Quote } from '@lucide/vue'
import { t } from '@/locales'

withDefaults(
  defineProps<{
    visible: boolean
    top: number
    left: number
    /** 气泡在选区上方（鼠标）还是下方（触屏，避开系统复制菜单） */
    placement?: 'above' | 'below'
  }>(),
  { placement: 'above' }
)

const emit = defineEmits<{
  (e: 'quote'): void
}>()
</script>

<template>
  <Transition name="selection-quote-popover">
    <div
      v-if="visible"
      class="selection-quote-popover"
      :class="{ 'is-below': placement === 'below' }"
      :style="{ top: `${top}px`, left: `${left}px` }"
      @mousedown.prevent.stop
    >
      <button type="button" class="selection-quote-button" @click="emit('quote')">
        <Quote :size="14" />
        <span>{{ t('previewer.quote') }}</span>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.selection-quote-popover {
  position: absolute;
  /* 弹出层：选区引用气泡需盖过消息区浮动按钮与输入 dock */
  z-index: var(--z-popover);
  transform: translate(-50%, -100%);
  pointer-events: auto;
}

.selection-quote-popover.is-below {
  transform: translate(-50%, 0);
}

.selection-quote-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-full);
  padding: 0.38rem 0.75rem;
  color: var(--text-primary);
  background: var(--app-surface-elevated);
  font-size: var(--type-meta-size);
  font-weight: 600;
  box-shadow: var(--component-shadow-md);
}

.selection-quote-button:hover {
  background: var(--interaction-bg-hover);
}

.selection-quote-popover-enter-active,
.selection-quote-popover-leave-active {
  transition:
    opacity var(--motion-duration-xs) ease,
    transform var(--motion-duration-xs) ease;
}

.selection-quote-popover-enter-from,
.selection-quote-popover-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-100% + 0.25rem));
}

.selection-quote-popover.is-below.selection-quote-popover-enter-from,
.selection-quote-popover.is-below.selection-quote-popover-leave-to {
  transform: translate(-50%, -0.25rem);
}

/* 减弱动效：只淡入淡出，不位移 */
@media (prefers-reduced-motion: reduce) {
  .selection-quote-popover-enter-active,
  .selection-quote-popover-leave-active {
    transition: opacity var(--motion-duration-xs) ease;
  }
}
</style>
