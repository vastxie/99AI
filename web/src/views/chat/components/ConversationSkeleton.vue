<script setup lang="ts">
import { t } from '@/locales'

/** 打开一个还没缓存的会话、消息还在路上时的占位：一问一答的轮廓，不显示成一片空白 */
const turns = [
  { question: 'w-2/5', lines: ['w-11/12', 'w-4/5', 'w-3/5'] },
  { question: 'w-1/3', lines: ['w-10/12', 'w-2/3'] },
]
</script>

<template>
  <div
    class="chat-transcript-width mx-auto flex flex-col gap-8 pt-6"
    role="status"
    :aria-label="t('chat.loadingConversation')"
  >
    <div v-for="(turn, index) in turns" :key="index" class="flex flex-col gap-4" aria-hidden="true">
      <div :class="['ml-auto h-10 animate-pulse rounded-2xl bg-app-sunken', turn.question]" />
      <div class="flex flex-col gap-2.5">
        <div
          v-for="line in turn.lines"
          :key="line"
          :class="['h-3.5 animate-pulse rounded bg-app-sunken', line]"
        />
      </div>
    </div>
  </div>
</template>
