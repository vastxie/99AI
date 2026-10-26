<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDialogA11y } from '@/composables/useDialogA11y'

defineProps<{
  ariaLabel?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function close() {
  emit('close')
}

// Sheet 由父级 v-if 控制挂载，挂载即视为打开；
// Esc / 焦点陷阱 / 关闭后焦点返回统一由 composable 承载（含多层弹窗栈协调）
const { setDialogRef, dialogAttrs } = useDialogA11y(() => true, { onClose: close })

/**
 * 按住顶部抓手往下拖：超过这个距离、或松手时速度够快（px/ms）就关掉，否则弹回。
 * 按速度关掉也要拖出一小段：碰一下抓手的轻微抖动不算
 */
const DISMISS_DISTANCE_PX = 96
const DISMISS_VELOCITY = 0.6
const FLICK_MIN_DISTANCE_PX = 24

const dragOffset = ref(0)
const isDragging = ref(false)
const isSettling = ref(false)
let dragStartY = 0
let dragStartTime = 0

function startDrag(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  isDragging.value = true
  isSettling.value = false
  dragStartY = event.clientY
  dragStartTime = event.timeStamp
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (isDragging.value) dragOffset.value = Math.max(0, event.clientY - dragStartY)
}

function endDrag(event: PointerEvent) {
  if (!isDragging.value) return
  isDragging.value = false
  const velocity = dragOffset.value / Math.max(1, event.timeStamp - dragStartTime)
  const flicked = dragOffset.value > FLICK_MIN_DISTANCE_PX && velocity > DISMISS_VELOCITY
  if (dragOffset.value > DISMISS_DISTANCE_PX || flicked) {
    // 保留当前位移：离场动画从手指松开的位置继续往下滑
    close()
    return
  }
  isSettling.value = dragOffset.value > 0
  dragOffset.value = 0
}

const panelStyle = computed(() =>
  dragOffset.value ? { '--sheet-drag-offset': `${dragOffset.value}px` } : undefined
)
</script>

<template>
  <div class="mobile-context-sheet fixed inset-0 z-sheet flex items-end">
    <div class="mobile-context-sheet-backdrop absolute inset-0" aria-hidden="true" @click="close" />
    <section
      :ref="setDialogRef"
      class="mobile-context-sheet-panel relative z-1 flex w-full min-w-0 flex-col overflow-hidden bg-panel text-text-primary"
      :class="{ 'is-dragging': isDragging, 'is-settling': isSettling }"
      :style="panelStyle"
      :aria-label="ariaLabel || undefined"
      v-bind="dialogAttrs"
      @transitionend.self="isSettling = false"
    >
      <div
        class="mobile-context-sheet-grabber"
        aria-hidden="true"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
      >
        <span />
      </div>
      <slot />
    </section>
  </div>
</template>

<style scoped>
.mobile-context-sheet {
  padding-top: max(2.75rem, var(--safe-top));
}

.mobile-context-sheet-backdrop {
  background: var(--scrim-bg);
  backdrop-filter: blur(var(--scrim-blur));
  -webkit-backdrop-filter: blur(var(--scrim-blur));
}

.mobile-context-sheet-panel {
  height: min(86dvh, calc(100dvh - 2.75rem));
  max-height: calc(100dvh - max(2.75rem, var(--safe-top)));
  padding-bottom: var(--safe-bottom);
  border-radius: var(--radius-dialog) var(--radius-dialog) 0 0;
  box-shadow: var(--sheet-shadow);
  overscroll-behavior: contain;
  /* 拖动用独立的 translate，不和进出场动画的 transform 抢同一个属性 */
  translate: 0 var(--sheet-drag-offset, 0px);
}

.mobile-context-sheet-panel.is-settling {
  transition: translate var(--motion-duration-xs) var(--motion-easing);
}

.mobile-context-sheet-grabber {
  display: flex;
  height: 1.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
}

.mobile-context-sheet-panel.is-dragging .mobile-context-sheet-grabber {
  cursor: grabbing;
}

.mobile-context-sheet-grabber span {
  width: 2.25rem;
  height: 0.25rem;
  border-radius: var(--radius-full);
  background: var(--app-border-strong);
}

@media (prefers-reduced-motion: reduce) {
  .mobile-context-sheet-panel.is-settling {
    transition: none;
  }
}
</style>
