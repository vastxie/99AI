<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed } from 'vue'
import type { Component, CSSProperties } from 'vue'
import { t } from '@/locales'
import type { ActivityPanelPayload } from '@/types/preview-panel'

const props = defineProps<{
  activity: ActivityPanelPayload
  label?: string
  /** 随时间变化的后缀（如运行秒数）：独立渲染，避免扰动 shimmer 文本 */
  suffix?: string
  clickable?: boolean
  icon?: Component
  shimmer?: boolean
}>()

const emit = defineEmits<{
  (e: 'open', activity: ActivityPanelPayload): void
}>()

const statusLabel = computed(() => {
  if (props.activity.status === 'running') return t('activity.inProgress')
  return t('activity.processed')
})

const displaySummary = computed(() => {
  const label = props.label?.trim()
  if (label) return label

  const summary = props.activity.summary?.trim()
  if (!summary) return statusLabel.value
  // 出错的工具只轻描淡写地记一笔（原因在详情里）：按状态判断，不按摘要文案（英文等其它语言也一样）
  if (props.activity.status === 'error') return t('activity.processed')
  return summary
})

const isClickable = computed(() => props.clickable !== false)
const shouldShimmer = computed(() => props.shimmer === true)

function isAsciiCharacter(char: string) {
  return (char.codePointAt(0) ?? 0) <= 0x7f
}

const shimmerStyle = computed<CSSProperties>(() => {
  const visualLength = Array.from(displaySummary.value.trim()).reduce((sum, char) => {
    if (/\s/u.test(char)) return sum + 0.35
    if (isAsciiCharacter(char)) return sum + 0.55
    return sum + 1
  }, 0)
  const bandWidthRem = Math.max(3, Math.min(8, 2.2 + visualLength * 0.32))

  return {
    '--activity-summary-band-width': `${bandWidthRem.toFixed(2)}rem`,
  } as CSSProperties
})

function handleOpen() {
  if (!isClickable.value) return
  emit('open', props.activity)
}
</script>

<template>
  <button
    type="button"
    class="group inline-flex h-7 max-w-full items-center gap-0.5 text-left text-sm leading-6"
    :class="isClickable ? 'fg-quiet cursor-pointer' : 'text-text-muted cursor-default'"
    :aria-disabled="!isClickable"
    @click="handleOpen"
  >
    <!-- 文案切换用全局的文字升起动效（text-rise-enter）：新文案升起淡入，
         旧文案立即让位不参与布局；按钮本身是稳定节点，不随文案重挂载 -->
    <Transition enter-active-class="text-rise-enter" leave-active-class="activity-summary-leave">
      <span :key="displaySummary" class="activity-summary-copy">
        <component v-if="icon" :is="icon" class="shrink-0 text-current" :size="16" />
        <span
          class="min-w-0 truncate"
          :class="{ 'activity-summary-shimmer-text': shouldShimmer }"
          :data-text="shouldShimmer ? displaySummary : undefined"
          :style="shouldShimmer ? shimmerStyle : undefined"
        >
          {{ displaySummary }}
        </span>
      </span>
    </Transition>
    <!-- 计时后缀只在出现时入场；之后每秒更新文本，不重播动效 -->
    <Transition enter-active-class="text-rise-enter" leave-active-class="activity-summary-leave">
      <span v-if="suffix" class="shrink-0 whitespace-nowrap tabular-nums text-text-muted">
        {{ suffix }}
      </span>
    </Transition>
    <!-- 可展开就常驻显示箭头，不再只在悬停时出现 -->
    <Transition enter-active-class="text-rise-enter" leave-active-class="activity-summary-leave">
      <ChevronRight v-if="isClickable" class="shrink-0 text-text-subtle" :size="16" />
    </Transition>
  </button>
</template>

<style scoped>
.activity-summary-copy {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 0.125rem;
}

/* 离场的旧文案立即让位：不显示也不占布局，避免新旧同时占位把一行撑宽 */
.activity-summary-leave {
  display: none !important;
}

.activity-summary-shimmer-text {
  position: relative;
  display: inline-block;
  max-width: 100%;
  color: currentColor;
}

.activity-summary-shimmer-text::after {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  color: transparent;
  pointer-events: none;
  background: linear-gradient(
    100deg,
    transparent 0%,
    transparent 18%,
    color-mix(in srgb, white 70%, currentColor 30%) 36%,
    color-mix(in srgb, white 86%, currentColor 14%) 50%,
    color-mix(in srgb, white 70%, currentColor 30%) 64%,
    transparent 82%,
    transparent 100%
  );
  background-repeat: no-repeat;
  background-size: var(--activity-summary-band-width, 5.5rem) 100%;
  background-position-x: calc(-1 * var(--activity-summary-band-width, 5.5rem));
  background-position-y: 0;
  -webkit-background-clip: text;
  background-clip: text;
  animation: activitySummaryTextShimmer 2s linear infinite;
}

@keyframes activitySummaryTextShimmer {
  0% {
    background-position-x: calc(-1 * var(--activity-summary-band-width, 5.5rem));
  }

  50%,
  100% {
    background-position-x: calc(100% + var(--activity-summary-band-width, 5.5rem));
  }
}

@media (prefers-reduced-motion: reduce) {
  .activity-summary-shimmer-text::after {
    content: none;
    animation: none;
  }
}
</style>
