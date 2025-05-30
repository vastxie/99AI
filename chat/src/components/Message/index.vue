<template>
  <Teleport to="body">
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="scale-100 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="fixed top-8 left-1/2 -translate-x-1/2 z-[999999] flex items-center px-4 py-2 rounded-lg shadow-sm overflow-hidden whitespace-nowrap"
        :class="{
          'bg-emerald-50 dark:bg-emerald-500/10': msg.type === 'success',
          'bg-red-50 dark:bg-red-500/10': msg.type === 'error',
          'bg-yellow-50 dark:bg-yellow-500/10': msg.type === 'warning',
          'bg-blue-50 dark:bg-blue-500/10': msg.type === 'info',
          'max-w-[70vw]': isMobile,
          'max-w-[40vw]': !isMobile,
        }"
      >
        <div class="flex items-center gap-2 overflow-hidden">
          <CheckOne
            v-if="msg.type === 'success'"
            theme="filled"
            size="20"
            class="text-emerald-500 dark:text-emerald-400 flex-shrink-0"
          />
          <CloseOne
            v-if="msg.type === 'error'"
            theme="filled"
            size="20"
            class="text-red-500 dark:text-red-400 flex-shrink-0"
          />
          <Attention
            v-if="msg.type === 'warning'"
            theme="filled"
            size="20"
            class="text-yellow-500 dark:text-yellow-400 flex-shrink-0"
          />
          <Info
            v-if="msg.type === 'info'"
            theme="filled"
            size="20"
            class="text-blue-500 dark:text-blue-400 flex-shrink-0"
          />
          <span class="text-gray-900 dark:text-gray-100 truncate">{{ msg.content }}</span>
        </div>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import type { MessageOptions } from '@/utils/message'
import { Attention, CheckOne, CloseOne, Info } from '@icon-park/vue-next'
import { ref } from 'vue'

interface Message extends MessageOptions {
  id: number
}

const messages = ref<Message[]>([])
let messageId = 0

const { isMobile } = useBasicLayout()

const show = (options: MessageOptions) => {
  const id = messageId++
  const msg = {
    id,
    type: options.type || 'info',
    content: options.content,
  }

  messages.value.push(msg)

  setTimeout(() => {
    messages.value = messages.value.filter(m => m.id !== id)
  }, options.duration || 3000)
}

defineExpose({
  show,
})
</script>
