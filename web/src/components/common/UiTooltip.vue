<script setup lang="ts">
import { ref } from 'vue'
import {
  isPointerClick,
  TOOLTIP_PLACEMENT_CLASS,
  useTooltipHidden,
  type TooltipPlacement,
} from './tooltip'

/**
 * 悬停或键盘聚焦时的文字提示：包住一个控件（通常是图标按钮），提示放在上下左右。
 * 定位由 .group-btn 给出（relative）；需要绝对定位时把 absolute 等类写在本组件上。
 * 指针点过控件后，指针离开或焦点移走之前不再出现，不挡视线；键盘触发的点击不影响；
 * 触屏设备与窄窗口里不显示（样式层统一关闭）：这时改给包裹层原生 title，窄窗口里用鼠标悬停照样有提示。
 * 提示只是看得见的标签：控件自己要有 aria-label，提示对读屏隐藏，避免读两遍。
 */
withDefaults(
  defineProps<{
    text: string
    placement?: TooltipPlacement
  }>(),
  { placement: 'top' }
)

const tooltipHidden = useTooltipHidden()
const suppressed = ref(false)
let pointerInside = false

function onClick(event: MouseEvent) {
  if (isPointerClick(event)) suppressed.value = true
}

function onPointerEnter() {
  pointerInside = true
}

function onPointerLeave() {
  pointerInside = false
  suppressed.value = false
}

// 点过之后焦点被挪走（如停止生成后焦点回到输入框）而指针还在控件上：提示不重新冒出来
function onFocusOut() {
  if (!pointerInside) suppressed.value = false
}
</script>

<template>
  <span
    class="group-btn inline-flex"
    :title="tooltipHidden && text ? text : undefined"
    @click.capture="onClick"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @focusout="onFocusOut"
  >
    <slot />
    <span
      v-if="text && !suppressed"
      :class="['tooltip', TOOLTIP_PLACEMENT_CLASS[placement]]"
      aria-hidden="true"
    >
      {{ text }}
    </span>
  </span>
</template>
