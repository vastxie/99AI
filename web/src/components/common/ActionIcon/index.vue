<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'
import { computed, ref, useAttrs } from 'vue'
import { isPointerClick, TOOLTIP_PLACEMENT_CLASS, useTooltipHidden } from '../tooltip'
import type { ActionIconProps } from './types'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<ActionIconProps>(), {
  variant: 'ghost',
  active: false,
  danger: false,
  disabled: false,
  loading: false,
  type: 'button',
  tooltipPlacement: 'bottom',
})

const attrs = useAttrs()
const tooltipHidden = useTooltipHidden()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const isPointerInside = ref(false)
const isTooltipSuppressed = ref(false)

const iconSize = 18
const variantClasses = {
  ghost: 'action-icon-ghost',
  filled: 'action-icon-filled',
  outlined: 'action-icon-outlined',
} as const

const actionClass = computed(() => [
  'action-icon',
  'ds-focus-ring',
  variantClasses[props.variant],
  {
    'action-icon-active': props.active,
    'action-icon-danger': props.danger,
    'action-icon-loading': props.loading,
  },
])

const tooltipClass = computed(() => ['tooltip', TOOLTIP_PLACEMENT_CLASS[props.tooltipPlacement]])
const shouldRenderTooltip = computed(() => Boolean(props.tooltip && !isTooltipSuppressed.value))
const accessibleName = computed(() => {
  const ariaLabel = attrs['aria-label']
  if (typeof ariaLabel === 'string' && ariaLabel.trim()) return ariaLabel
  return props.label || props.tooltip || props.title
})
/** 有自绘提示、而且它会显示时（窄窗口、触屏环境里样式层把它关掉）不再给原生 title：悬停时不会冒出两个提示 */
const buttonTitle = computed(() => {
  if (props.tooltip && !tooltipHidden.value) return undefined
  const title = attrs.title
  if (typeof title === 'string' && title.trim()) return title
  return props.title || props.tooltip || props.label
})
const isDisabled = computed(() => props.disabled || props.loading)

function handleClick(event: MouseEvent) {
  if (isDisabled.value) return
  // 指针点过之后先藏起提示；键盘触发的点击不藏，键盘用户靠它看按钮的名字
  if (isPointerClick(event)) isTooltipSuppressed.value = true
  emit('click', event)
}

function handlePointerEnter() {
  isPointerInside.value = true
}

function handlePointerLeave() {
  isPointerInside.value = false
  isTooltipSuppressed.value = false
}

function handleBlur() {
  if (!isPointerInside.value) {
    isTooltipSuppressed.value = false
  }
}
</script>

<template>
  <span
    class="action-icon-wrap"
    @pointerenter="handlePointerEnter"
    @pointerleave="handlePointerLeave"
  >
    <UiButton
      icon
      v-bind="attrs"
      :type="type"
      :class="actionClass"
      :disabled="isDisabled"
      :aria-label="accessibleName"
      :aria-busy="loading || undefined"
      :aria-disabled="isDisabled || undefined"
      :aria-pressed="active ? 'true' : undefined"
      :title="buttonTitle"
      @click="handleClick"
      @blur="handleBlur"
    >
      <UiSpinner v-if="loading" :size="iconSize" />
      <slot v-else>
        <component v-if="icon" :is="icon" :size="iconSize" aria-hidden="true" />
      </slot>
    </UiButton>
    <span v-if="shouldRenderTooltip" :class="tooltipClass" aria-hidden="true">{{ tooltip }}</span>
  </span>
</template>
