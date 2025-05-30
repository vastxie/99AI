<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useAuthStore } from '@/store'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { computed, onMounted, watch } from 'vue'

const authStore = useAuthStore()
const appStore = useAppStore()
const darkMode = computed(() => appStore.theme === 'dark')
const { isMobile } = useBasicLayout()

const { noticeInfo } = authStore.globalConfig

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const globalConfig = computed(() => authStore.globalConfig)

function openDrawerAfter() {
  // 刷新全局配置数据，确保获取最新的公告信息
  authStore.getGlobalConfig().catch(error => {
    console.error('获取最新公告信息失败:', error)
  })
}

watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      // 当组件变为可见时刷新数据
      openDrawerAfter()
    }
  }
)

onMounted(() => {
  if (props.visible) {
    openDrawerAfter()
  }
})
</script>

<template>
  <div class="overflow-y-auto custom-scrollbar p-1" :class="{ 'max-h-[70vh]': !isMobile }">
    <!-- 公告信息卡片 -->
    <div
      class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col space-y-4"
    >
      <!-- 卡片标题 -->
      <div
        class="text-base font-semibold text-gray-900 dark:text-gray-100 pb-2 border-b border-gray-200 dark:border-gray-700"
      >
        {{ globalConfig.noticeTitle || '平台公告' }}
      </div>

      <!-- 公告内容 -->
      <div class="overflow-y-auto" :class="{ 'max-h-[calc(70vh-120px)]': !isMobile }">
        <MdPreview
          editorId="preview-only"
          :modelValue="noticeInfo"
          :theme="darkMode ? 'dark' : 'light'"
          class="dark:bg-gray-700 w-full"
        />
      </div>
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
