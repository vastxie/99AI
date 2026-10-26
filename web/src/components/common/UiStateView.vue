<script setup lang="ts">
import { ref } from 'vue'
import UiButton from '@/components/common/UiButton.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'
import { t } from '@/locales'

/**
 * 列表或区块的占位状态：加载中、空、出错（带重试）。
 * 默认自己是读屏播报区（加载与空用 role="status"，出错用 role="alert"）；调用方已经有播报区时传
 * live=false，免得读两遍。点重试后重试键会被「加载中」替换：焦点先落到这块区域上，不掉回页面开头。
 * compact 用于侧栏这类窄区域：不画卡片边框，只留文字与操作。
 */
const props = withDefaults(
  defineProps<{
    state: 'loading' | 'empty' | 'error'
    message?: string
    retryLabel?: string
    compact?: boolean
    live?: boolean
  }>(),
  { message: '', retryLabel: '', compact: false, live: true }
)

const emit = defineEmits<{ retry: [] }>()
const rootRef = ref<HTMLElement | null>(null)

function retry() {
  rootRef.value?.focus()
  emit('retry')
}

function roleOf() {
  if (!props.live) return undefined
  return props.state === 'error' ? 'alert' : 'status'
}
</script>

<template>
  <div
    ref="rootRef"
    tabindex="-1"
    class="ui-state-view"
    :class="compact ? 'ui-state-view-compact' : 'ds-state-card'"
    :role="roleOf()"
  >
    <UiSpinner v-if="state === 'loading'" size="sm" class="shrink-0" />
    <span class="min-w-0 flex-1">
      {{ message || (state === 'loading' ? t('common.loading') : '') }}
    </span>
    <UiButton
      v-if="state === 'error'"
      variant="secondary"
      type="button"
      class="shrink-0"
      @click="retry"
    >
      {{ retryLabel || t('common.retry') }}
    </UiButton>
  </div>
</template>

<style scoped>
.ui-state-view {
  align-items: center;
}

.ui-state-view-compact {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: var(--text-muted);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line-height);
}
</style>
