<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useChatStore } from '@/store'
import { dialog } from '@/utils/dialog'
import { Delete } from '@icon-park/vue-next'
import { ref } from 'vue'

interface Props {
  visible: boolean
}

defineProps<Props>()

const chatStore = useChatStore()
const loading = ref(false)
const { isMobile } = useBasicLayout()

/* 删除全部非置顶聊天 */
async function handleClearConversations() {
  const dialogInstance = dialog()
  dialogInstance.warning({
    title: t('chat.clearConversation'),
    content: t('chat.clearAllNonFavoriteConversations'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      loading.value = true
      try {
        await chatStore.delAllGroup()
        loading.value = false
      } catch (error) {
        loading.value = false
      }
    },
  })
}
</script>

<template>
  <div class="overflow-y-auto custom-scrollbar p-1" :class="{ 'max-h-[70vh]': !isMobile }">
    <!-- 清空对话卡片 -->
    <div
      class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col space-y-4"
    >
      <!-- 卡片标题 -->
      <div
        class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
      >
        清空对话记录
      </div>

      <div class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        清空所有非收藏的对话记录。此操作不可撤销，请谨慎操作。
      </div>

      <button
        @click="handleClearConversations"
        class="flex items-center px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium text-sm"
        :disabled="loading"
      >
        <Delete theme="outline" size="16" class="mr-2" />
        <span>清空记录</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(155, 155, 155, 0.5);
  border-radius: 20px;
  border: transparent;
}

/* 暗黑模式下滚动条样式 */
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(100, 100, 100, 0.5);
}

.dark .custom-scrollbar {
  scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
}
</style>
