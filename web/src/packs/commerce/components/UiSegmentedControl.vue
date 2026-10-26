<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { canAnimate, cancelAnimations, readDuration, readEasing } from '@/utils/motion'

const props = withDefaults(
  defineProps<{
    modelValue: T
    options: readonly {
      value: T
      label: string
      id?: string
      controls?: string
      disabled?: boolean
    }[]
    label: string
    kind?: 'tabs' | 'group'
    compact?: boolean
    iconOnly?: boolean
  }>(),
  { kind: 'group' }
)
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
const root = ref<HTMLElement>()
const thumb = ref<HTMLElement>()
/** 滑块已经放到某一项下面（量不到尺寸时先隐藏） */
const placed = ref(false)
let placement: { x: number; width: number } | undefined
const activeIndex = computed(() =>
  props.options.findIndex(option => option.value === props.modelValue)
)
const tabStopIndex = computed(() =>
  activeIndex.value >= 0 && !props.options[activeIndex.value].disabled
    ? activeIndex.value
    : props.options.findIndex(option => !option.disabled)
)
let observer: ResizeObserver | undefined
let disposed = false

function buttons() {
  return Array.from(root.value?.querySelectorAll<HTMLButtonElement>('.segmented-option') || [])
}

/** 滑块此刻所在的位置：上一段滑动还没播完时按实际画面算，接着从这里滑，连点不会跳 */
function thumbNow(element: HTMLElement) {
  if (!root.value || !element.getAnimations?.().length) return placement
  const box = element.getBoundingClientRect()
  // 滑块按轨道的内边距框定位：减掉轨道自己的边框宽度
  return {
    x: box.left - root.value.getBoundingClientRect().left - root.value.clientLeft,
    width: box.width,
  }
}

/**
 * 把滑块放到选中项下面：位置与宽度直接写进样式；glide 为 true 且之前已经放好过时，
 * 再用 Web Animations 从原位置滑过去（首次出现、尺寸变化、减弱动态效果时直接到位）。
 */
function placeThumb(glide: boolean) {
  const element = thumb.value
  const target = buttons()[activeIndex.value]
  if (!element || !target || !target.offsetWidth) {
    placed.value = false
    placement = undefined
    return
  }
  const next = { x: target.offsetLeft, width: target.offsetWidth }
  const from = glide && placed.value ? thumbNow(element) : undefined
  cancelAnimations(element)
  element.style.transform = `translateX(${next.x}px)`
  element.style.width = `${next.width}px`
  placement = next
  placed.value = true
  if (!from || (from.x === next.x && from.width === next.width) || !canAnimate(element)) return
  element.animate(
    [
      { transform: `translateX(${from.x}px)`, width: `${from.width}px` },
      { transform: `translateX(${next.x}px)`, width: `${next.width}px` },
    ],
    {
      duration: readDuration(root.value, '--segmented-slide-duration', 250),
      easing: readEasing(root.value, '--segmented-slide-easing', 'ease-out'),
    }
  )
}

function select(index: number) {
  const option = props.options[index]
  if (option && !option.disabled && option.value !== props.modelValue) {
    emit('update:modelValue', option.value)
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const enabled = props.options.flatMap((option, index) => (option.disabled ? [] : [index]))
  if (!enabled.length) return
  event.preventDefault()
  const focused = buttons().indexOf(document.activeElement as HTMLButtonElement)
  const current = enabled.indexOf(focused < 0 ? tabStopIndex.value : focused)
  const index =
    event.key === 'Home'
      ? enabled[0]
      : event.key === 'End'
        ? enabled[enabled.length - 1]
        : enabled[
            (current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length
          ]
  select(index)
  buttons()[index]?.focus()
}

const snap = () => placeThumb(false)
watch(
  () => props.modelValue,
  () => placeThumb(true),
  { flush: 'post' }
)
watch(() => props.options.map(option => [option.value, option.label, option.disabled]), snap, {
  flush: 'post',
})
onMounted(() => {
  snap()
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    observer = new ResizeObserver(snap)
    observer.observe(root.value)
  }
  window.addEventListener('resize', snap)
})
onActivated(() => {
  void nextTick(() => {
    if (!disposed) snap()
  })
})
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  window.removeEventListener('resize', snap)
})
</script>

<template>
  <div
    ref="root"
    class="ui-segmented-control"
    :class="{ 'ui-segmented-compact': compact, 'ui-segmented-icons': iconOnly }"
    :role="kind === 'tabs' ? 'tablist' : 'group'"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <span
      ref="thumb"
      class="segmented-thumb"
      :class="{ 'is-unplaced': !placed }"
      aria-hidden="true"
    ></span>
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      class="segmented-option type-control ds-focus-ring"
      :id="option.id"
      :role="kind === 'tabs' ? 'tab' : undefined"
      :aria-selected="kind === 'tabs' ? modelValue === option.value : undefined"
      :aria-pressed="kind === 'group' ? modelValue === option.value : undefined"
      :data-selected="modelValue === option.value"
      :aria-controls="option.controls"
      :aria-label="option.label"
      :title="option.label"
      :disabled="option.disabled"
      :tabindex="index === tabStopIndex ? 0 : -1"
      @click="select(index)"
    >
      <slot name="option" :option="option" :selected="modelValue === option.value">
        <span class="truncate">{{ option.label }}</span>
      </slot>
    </button>
  </div>
</template>
