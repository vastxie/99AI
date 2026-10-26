<script setup lang="ts">
import { X } from '@lucide/vue'
import ActionIcon from '@/components/common/ActionIcon/index.vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'

defineProps<{
  title: string
  showClose?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { isMobile } = useViewport()
</script>

<template>
  <div class="panel-header justify-between px-4">
    <!-- Left: tabs slot + back button on mobile -->
    <div class="flex items-center gap-2 min-w-0">
      <slot name="tabs" />
    </div>

    <!-- Center: title (hidden on mobile) -->
    <h2
      v-if="!isMobile && title"
      class="type-control absolute left-1/2 max-w-[40%] -translate-x-1/2 select-none truncate text-text-primary"
    >
      {{ title }}
    </h2>

    <!-- Right: actions slot + close button -->
    <div class="flex items-center gap-2">
      <slot name="actions" />
      <ActionIcon v-if="showClose !== false" :label="t('common.close')" @click="emit('close')">
        <X :size="18" />
      </ActionIcon>
    </div>
  </div>
</template>
