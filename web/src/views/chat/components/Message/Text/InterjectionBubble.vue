<script setup lang="ts">
import { t } from '@/locales'

defineProps<{
  content: string
}>()
</script>

<template>
  <div
    class="flex items-start gap-2 ml-auto max-w-[80%] rounded-xl bg-semantic-info-bg border border-app-border px-3 py-2 text-sm text-semantic-info"
  >
    <span class="shrink-0 text-xs font-medium">{{ t('chat.interjection') }}</span>
    <span class="break-words">{{ content }}</span>
  </div>
</template>
