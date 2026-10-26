<script setup lang="ts">
import { computed, nextTick, onUpdated, ref } from 'vue'
import { useScrollOverflow } from './useScrollOverflow'

/**
 * 滚动容器：跟踪滚动溢出状态（canScrollStart / canScrollEnd），供边界分割线等按需消费。
 * 历史上曾内置边缘渐隐遮罩，已按全站「线分割」规范移除，仅保留状态跟踪能力。
 */
const props = withDefaults(
  defineProps<{
    orientation?: 'vertical' | 'horizontal'
    hideScrollbar?: boolean
    tag?: string
  }>(),
  {
    orientation: 'vertical',
    hideScrollbar: false,
    tag: 'div',
  }
)

const emit = defineEmits<{
  scroll: [event: Event]
}>()

const scrollRef = ref<HTMLElement | null>(null)
const { canScrollStart, canScrollEnd, refreshOverflow, updateOverflow } = useScrollOverflow(
  scrollRef,
  props.orientation
)

const scrollClass = computed(() => [
  'scroll-shadow',
  props.orientation === 'horizontal' ? 'scroll-shadow-horizontal' : 'scroll-shadow-vertical',
  {
    'scrollbar-hide': props.hideScrollbar,
  },
])

function handleScroll(event: Event) {
  updateOverflow()
  emit('scroll', event)
}

onUpdated(async () => {
  await nextTick()
  refreshOverflow()
})

defineExpose({
  scrollRef,
  canScrollStart,
  canScrollEnd,
  updateOverflow,
  refreshOverflow,
})
</script>

<template>
  <component :is="tag" ref="scrollRef" :class="scrollClass" @scroll="handleScroll">
    <slot />
  </component>
</template>
