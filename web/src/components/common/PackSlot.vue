<script setup lang="ts">
import { computed } from 'vue'
import type { PackSlotName } from '@/packs'
import { usePackSlot } from './usePackSlot'

/**
 * 渲染某个挂载点上所有扩展包贡献的组件（懒加载）。
 * extra 会作为 props 透传给每个贡献组件（如 visible、close 回调）。
 */
const props = defineProps<{
  name: PackSlotName
  extra?: Record<string, unknown>
}>()

const contributions = usePackSlot(props.name)
const items = computed(() =>
  contributions.value
    .filter(item => item.when?.() ?? true)
    .map(item => ({
      id: item.id,
      component: item.view,
      props: { ...(item.props ?? {}), ...(props.extra ?? {}) },
    }))
)
</script>

<template>
  <component v-for="item in items" :key="item.id" :is="item.component" v-bind="item.props" />
</template>
