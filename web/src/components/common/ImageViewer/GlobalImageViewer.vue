<template>
  <ImageViewer
    v-model:visible="isVisible"
    :image-url="currentImageUrl"
    :file-name="currentFileName"
    @close="handleClose"
  />
</template>

<script setup lang="ts">
import { useHistoryLayer } from '@/composables/useHistoryLayer'
import ImageViewer from './index.vue'
import { useImageViewer } from './useImageViewer'

const { isVisible, currentImageUrl, currentFileName, closeImageViewer } = useImageViewer()
// 返回键只关掉图片预览，不离开当前页面
useHistoryLayer(() => isVisible.value, closeImageViewer)

function handleClose() {
  closeImageViewer()
}
</script>
