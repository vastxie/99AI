<script setup lang="ts">
import { Download, X } from '@lucide/vue'
import ActionIcon from '@/components/common/ActionIcon'
import UiButton from '@/components/common/UiButton.vue'
import { computed, ref } from 'vue'
import { t } from '@/locales'
import type { FilePreviewSource } from '@/types/file-preview'

/** 没有富媒体渲染包时的文件面板：只提供文件信息与下载，不加载任何重型预览依赖 */
const props = defineProps<{
  file: FilePreviewSource
  close: () => void
  quoteDisabled?: boolean
}>()

const downloading = ref(false)
const fileName = computed(() => props.file.name || t('common.file'))
const downloadUrl = computed(() => props.file.downloadUrl || props.file.previewUrl || '')
const canDownload = computed(() => Boolean(props.file.downloadFile || downloadUrl.value))

async function handleDownload() {
  if (downloading.value || !canDownload.value) return
  downloading.value = true
  try {
    if (props.file.downloadFile) {
      await props.file.downloadFile()
      return
    }
    window.open(downloadUrl.value, '_blank', 'noopener')
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="flex h-full w-full min-w-0 flex-col bg-panel text-text-primary">
    <div class="flex items-center justify-between gap-2 border-b border-app-border px-4 py-2">
      <div class="type-field-title truncate">{{ fileName }}</div>
      <ActionIcon :label="t('common.close')" @click="close()">
        <X :size="16" aria-hidden="true" />
      </ActionIcon>
    </div>
    <div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <UiButton
        type="button"
        variant="secondary"
        :disabled="!canDownload || downloading"
        @click="handleDownload"
      >
        <Download :size="16" aria-hidden="true" />
        <span>{{ t('common.download') }}</span>
      </UiButton>
    </div>
  </div>
</template>
