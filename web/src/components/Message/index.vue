<template>
  <Teleport to="body">
    <!-- 常驻的礼貌播报区：提示插进来时读屏会播报；错误用 alert 立即打断播报 -->
    <div class="toast-region" role="region" :aria-label="t('common.notifications')">
      <TransitionGroup name="toast" tag="div" class="toast-stack" aria-live="polite">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="toast-item"
          :role="msg.type === 'error' ? 'alert' : undefined"
          @mouseenter="pause(msg.id)"
          @mouseleave="resume(msg.id)"
          @focusin="pause(msg.id)"
          @focusout="resume(msg.id)"
        >
          <component
            :is="ICONS[msg.type]"
            :size="18"
            class="toast-icon"
            :class="`toast-icon-${msg.type}`"
            aria-hidden="true"
          />
          <span class="toast-text">{{ msg.content }}</span>
          <button
            type="button"
            class="toast-close ds-focus-ring"
            :aria-label="t('common.close')"
            @click="dismiss(msg.id)"
          >
            <X :size="14" aria-hidden="true" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { AlertTriangle, CheckCircle, Info, X, XCircle } from '@lucide/vue'
import { ref } from 'vue'
import { t } from '@/locales'
import type { MessageOptions } from '@/utils/message'

/**
 * 全局提示区：多条提示纵向排列、可换行；同类型同内容的提示合并成一条并重新计时；
 * 错误用 role=alert、其余用 role=status，读屏会播报；鼠标悬停或键盘聚焦时暂停计时，每条都能手动关闭。
 */
type ToastType = NonNullable<MessageOptions['type']>

interface Toast {
  id: number
  type: ToastType
  content: string
  duration: number
}

const ICONS = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info } as const
/** 错误要读完原因，停留更久 */
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  warning: 4000,
  error: 5000,
}
/** 同时最多显示几条：更早的先收起 */
const MAX_VISIBLE = 3

const messages = ref<Toast[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 0

function clearTimer(id: number) {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
}

function schedule(toast: Toast) {
  clearTimer(toast.id)
  timers.set(
    toast.id,
    setTimeout(() => dismiss(toast.id), toast.duration)
  )
}

function dismiss(id: number) {
  clearTimer(id)
  messages.value = messages.value.filter(item => item.id !== id)
}

function pause(id: number) {
  clearTimer(id)
}

function resume(id: number) {
  const toast = messages.value.find(item => item.id === id)
  if (toast) schedule(toast)
}

const show = (options: MessageOptions) => {
  const type: ToastType = options.type || 'info'
  const content = String(options.content ?? '')
  const duration = options.duration || DEFAULT_DURATION[type]
  const existing = messages.value.find(item => item.type === type && item.content === content)
  if (existing) {
    existing.duration = duration
    schedule(existing)
    return
  }
  const toast: Toast = { id: nextId++, type, content, duration }
  messages.value = [...messages.value, toast]
  while (messages.value.length > MAX_VISIBLE) dismiss(messages.value[0].id)
  schedule(toast)
}

defineExpose({
  show,
})
</script>

<style scoped>
.toast-region {
  position: fixed;
  top: max(1.5rem, var(--safe-top));
  left: 50%;
  z-index: var(--z-global-message);
  width: min(28rem, calc(100vw - 2rem));
  transform: translateX(-50%);
  pointer-events: none;
}

.toast-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.toast-item {
  display: flex;
  max-width: 100%;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem 0.5rem 0.875rem;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-control);
  background: var(--app-surface-elevated);
  box-shadow: var(--component-shadow-md);
  color: var(--text-primary);
  pointer-events: auto;
}

.toast-icon {
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.toast-icon-success {
  color: var(--semantic-success);
}

.toast-icon-error {
  color: var(--semantic-danger);
}

.toast-icon-warning {
  color: var(--semantic-warning);
}

.toast-icon-info {
  color: var(--semantic-info);
}

.toast-text {
  min-width: 0;
  flex: 1;
  padding: 0.0625rem 0;
  font-size: var(--type-body-sm-size);
  line-height: 1.375rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.toast-close {
  display: inline-flex;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.toast-close:hover {
  background: var(--interaction-bg-hover);
  color: var(--text-primary);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--motion-duration-sm) var(--motion-easing),
    transform var(--motion-duration-sm) var(--motion-easing);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: opacity var(--motion-duration-sm) linear;
  }

  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
