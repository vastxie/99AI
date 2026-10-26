<script setup lang="ts">
import { computed } from 'vue'
import { currentHighlighter, escapeCodeHtml } from '@/utils/highlight'

/** 富媒体包关闭时的预览回退：只读展示源码，不加载任何渲染器 */
const props = defineProps<{
  content: string
  contentType?: string
  previewSize?: 'desktop' | 'tablet' | 'mobile'
  compact?: boolean
  editable?: boolean
}>()

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
</script>

<template>
  <pre
    class="plain-source-block h-full w-full overflow-auto rounded-lg bg-panel-subtle p-4 text-xs leading-relaxed text-text-primary"
  ><code class="hljs" v-html="highlighted"></code></pre>
</template>
