<script setup lang="ts">
import { PanelLeft, Search, SquarePen } from '@lucide/vue'

withDefaults(defineProps<{ name: 'new-chat' | 'search' | 'sidebar'; size?: number }>(), {
  size: 20,
})
const icons = { 'new-chat': SquarePen, search: Search, sidebar: PanelLeft }
</script>

<template>
  <component
    :is="icons[name]"
    :size="size"
    :stroke-width="1.8"
    class="sidebar-motion-icon shrink-0"
    :class="`sidebar-motion-${name}`"
    aria-hidden="true"
  />
</template>
