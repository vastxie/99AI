<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    options: { value: string; label: string }[]
    label: string
    active?: boolean
  }>(),
  { active: true }
)
const emit = defineEmits<{
  preview: [index: number]
  change: [index: number]
}>()
const index = ref(props.modelValue)
const pointer = ref<number | null>(null)
const dragging = ref(false)
const progress = ref<number | null>(null)
const hovered = ref<number | null>(null)
let grabOffset = 0
let pressX = 0
const lastIndex = computed(() => Math.max(0, props.options.length - 1))

function sliderPositionForIndex(value: number) {
  const ratio = lastIndex.value ? Math.min(Math.max(value / lastIndex.value, 0), 1) : 0.5
  return `calc(13px + ${ratio * 100}% - ${ratio * 26}px)`
}
const sliderPosition = computed(() => sliderPositionForIndex(progress.value ?? index.value))

function preview(value: number) {
  index.value = Math.min(lastIndex.value, Math.max(0, Number.isFinite(value) ? value : 0))
  emit('preview', index.value)
}
function pointerPosition(event: PointerEvent) {
  const input = event.currentTarget as HTMLInputElement
  const rect = input.getBoundingClientRect()
  const inset = parseFloat(getComputedStyle(input).getPropertyValue('--slider-end-inset')) || 13
  return (
    Math.min(
      1,
      Math.max(
        0,
        (event.clientX - grabOffset - rect.left - inset) / Math.max(1, rect.width - inset * 2)
      )
    ) * lastIndex.value
  )
}
function move(event: PointerEvent) {
  if (pointer.value === null) {
    // Touch has no persistent hover; visual preview never changes the selected value.
    const position = pointerPosition(event)
    const nearest = Math.round(position)
    const width = (event.currentTarget as HTMLInputElement).getBoundingClientRect().width - 26
    const distance = (Math.abs(position - nearest) * width) / Math.max(1, lastIndex.value)
    hovered.value =
      event.pointerType === 'mouse' &&
      lastIndex.value > 0 &&
      distance <= (nearest === index.value ? 17 : 8)
        ? nearest
        : null
    return
  }
  if (pointer.value !== event.pointerId) return
  if (!dragging.value && Math.abs(event.clientX - pressX) < 4) return
  dragging.value = true
  progress.value = pointerPosition(event)
  preview(Math.round(progress.value))
}
function start(event: PointerEvent) {
  if (!props.active || event.button !== 0 || pointer.value !== null || !lastIndex.value) return
  event.preventDefault()
  const input = event.currentTarget as HTMLInputElement
  const thumb = input.parentElement
    ?.querySelector('.discrete-slider-thumb')
    ?.getBoundingClientRect()
  const face = input.parentElement
    ?.querySelector('.discrete-slider-thumb-face')
    ?.getBoundingClientRect()
  const offset = thumb ? event.clientX - thumb.left - thumb.width / 2 : 0
  const hitRadius = (face?.width || thumb?.width || 0) / 2
  grabOffset = thumb && Math.abs(offset) <= hitRadius ? offset : 0
  input.focus({ preventScroll: true })
  input.setPointerCapture(event.pointerId)
  pointer.value = event.pointerId
  pressX = event.clientX
  dragging.value = false
  hovered.value = null
  // A track press previews a snapped target with CSS travel. Only a real move
  // disables interpolation, so dragging stays attached to the pointer.
  preview(Math.round(pointerPosition(event)))
}
function commit() {
  progress.value = null
  if (props.active && index.value !== props.modelValue) emit('change', index.value)
}
function end(event: PointerEvent) {
  if (pointer.value !== event.pointerId) return
  move(event)
  pointer.value = null
  dragging.value = false
  grabOffset = 0
  ;(event.currentTarget as HTMLInputElement).releasePointerCapture(event.pointerId)
  commit()
}
function cancel() {
  grabOffset = 0
  pointer.value = null
  dragging.value = false
  progress.value = null
  hovered.value = null
  preview(props.modelValue)
}
watch([() => props.modelValue, () => props.options, () => props.active], cancel)
</script>

<template>
  <div
    class="discrete-slider-shell"
    :class="{ 'is-single': !lastIndex, 'is-dragging': dragging }"
    :style="{ '--reasoning-position': sliderPosition }"
  >
    <div class="discrete-slider-track" aria-hidden="true">
      <div class="discrete-slider-fill"></div>
      <span
        v-for="(option, tick) in options"
        :key="option.value"
        class="discrete-slider-tick"
        :class="{ 'is-active': tick <= index, 'is-hovered': tick === hovered && tick !== index }"
        :style="{ left: sliderPositionForIndex(tick) }"
      ></span>
    </div>
    <!-- 输入框放在拇指之前：键盘焦点样式用兄弟选择器，不依赖 :has（层级由 z-index 决定，不受顺序影响） -->
    <input
      class="discrete-slider-input"
      type="range"
      :min="0"
      :max="lastIndex"
      :step="1"
      :value="index"
      :disabled="!active || !lastIndex"
      :aria-label="label"
      :aria-valuetext="options[index]?.label"
      @input="preview(Number(($event.target as HTMLInputElement).value))"
      @change="commit"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="end"
      @pointerleave="hovered = null"
      @pointercancel="pointer === $event.pointerId && cancel()"
      @lostpointercapture="pointer === $event.pointerId && cancel()"
    />
    <span
      class="discrete-slider-thumb"
      :class="{ 'is-hovered': hovered === index }"
      aria-hidden="true"
    >
      <span class="discrete-slider-thumb-face"></span>
    </span>
  </div>
</template>
