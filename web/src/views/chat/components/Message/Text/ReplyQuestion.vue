<script setup lang="ts">
import type { AgentQuestion } from '@99agent/contracts'
import UiButton from '@/components/common/UiButton.vue'
import { t } from '@/locales'

/**
 * agent 用 ask_user 结束本轮时的提问：问题 + 可点的选项。
 * 点选即把选项作为下一条消息发出；能不能点由调用方判断（最后一条、回合已完成、没有别的发送在进行）。
 */
defineProps<{
  question: AgentQuestion
  interactive: boolean
}>()

const emit = defineEmits<{
  answer: [option: string]
}>()
</script>

<template>
  <div
    class="reply-question assistant-content-width"
    role="group"
    :aria-label="t('chat.agentQuestion')"
  >
    <p class="type-body m-0 break-words text-chat-assistant-text [overflow-wrap:anywhere]">
      {{ question.text }}
    </p>
    <div v-if="question.options.length > 0" class="mt-2 flex max-w-full flex-wrap gap-2">
      <UiButton
        v-for="option in question.options"
        :key="option"
        variant="secondary"
        class="reply-question-option"
        :disabled="!interactive"
        @click="emit('answer', option)"
      >
        {{ option }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.reply-question-option {
  max-width: 100%;
  white-space: normal;
  text-align: left;
  overflow-wrap: anywhere;
}
</style>
