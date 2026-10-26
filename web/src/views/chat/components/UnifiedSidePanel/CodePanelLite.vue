<script setup lang="ts">
import { Copy, X } from '@lucide/vue'
import ActionIcon from '@/components/common/ActionIcon'
import { computed } from 'vue'
import { t } from '@/locales'
import { copyText } from '@/utils/clipboard'
import { currentHighlighter, escapeCodeHtml } from '@/utils/highlight'
import { message } from '@/utils/message'

/** 富媒体包关闭时的代码面板：只读高亮 + 复制，不加载 CodeMirror */
const props = defineProps<{
  content: string
  contentType?: string
  title?: string
  close: () => void
  variant?: string
  lockBodyScroll?: boolean
  manageSidebar?: boolean
}>()

const ms = message()

// 高亮库按需加载：加载完成前先显示纯文本，加载完成时这个计算自动重跑
const highlighted = computed(() => {
  const hljs = currentHighlighter()
  if (!hljs) return escapeCodeHtml(props.content || '')
  const language = props.contentType === 'svg' ? 'xml' : props.contentType || ''
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(props.content || '', { language }).value
  }
  return hljs.highlightAuto(props.content || '').value
})

async function handleCopy() {
  if (await copyText(props.content || '')) ms.success(t('chat.copySuccess'))
  else ms.error(t('chat.copyFailed'))
}
</script>

<template>
  <div class="flex h-full w-full min-w-0 flex-col bg-panel text-text-primary">
    <div class="flex items-center justify-between gap-2 border-b border-app-border px-4 py-2">
      <div class="type-field-title truncate">{{ title || contentType || 'code' }}</div>
      <div class="flex items-center gap-1">
        <ActionIcon :label="t('chat.copy')" @click="handleCopy">
          <Copy :size="16" aria-hidden="true" />
        </ActionIcon>
        <ActionIcon :label="t('common.close')" @click="close()">
          <X :size="16" aria-hidden="true" />
        </ActionIcon>
      </div>
    </div>
    <pre
      class="min-h-0 flex-1 overflow-auto p-4 text-xs leading-relaxed"
    ><code class="hljs" v-html="highlighted"></code></pre>
  </div>
</template>
