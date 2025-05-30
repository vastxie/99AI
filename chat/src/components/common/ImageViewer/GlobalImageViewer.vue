<template>
  <ImageViewer
    v-model:visible="isVisible"
    :image-url="currentImageUrl"
    :file-name="currentFileName"
    @close="handleClose"
  />
</template>

<script setup lang="ts">
import ImageViewer from './index.vue'
import { useImageViewer } from './useImageViewer'

const { isVisible, currentImageUrl, currentFileName, closeImageViewer } = useImageViewer()

function handleClose() {
  closeImageViewer()
}
</script>
