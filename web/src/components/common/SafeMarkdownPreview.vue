<script setup lang="ts">
import { createMarkdownIt } from '@/utils/markdown/createMarkdownIt'
import { computed } from 'vue'
import { sanitizeConfigMarkdownHtml } from '@/utils/safeConfigMarkdown'

/**
 * 后台配置类 Markdown（公告 / 用户协议）的只读预览。
 * 渲染链：markdown-it → DOMPurify（sanitizeConfigMarkdownHtml），不加载任何远程脚本或样式；
 * 替代此前的 md-editor-v3 MdPreview（其默认会从 unpkg 拉取高亮 / 公式 / 图表脚本）。
 */
const props = defineProps<{
  content: string
}>()

const renderer = createMarkdownIt({
  html: true,
  breaks: true,
  linkAttributes: { target: '_blank', rel: 'noopener noreferrer' },
})

const html = computed(() => sanitizeConfigMarkdownHtml(renderer.render(props.content || '')))
</script>

<template>
  <div class="safe-markdown-preview" v-html="html"></div>
</template>

<style scoped>
.safe-markdown-preview {
  color: var(--text-secondary);
  line-height: 1.7;
  word-break: break-word;
  --md-code-bg: var(--md-inline-code-bg);
}

.safe-markdown-preview :deep(h1),
.safe-markdown-preview :deep(h2),
.safe-markdown-preview :deep(h3),
.safe-markdown-preview :deep(h4),
.safe-markdown-preview :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

.safe-markdown-preview :deep(h1) {
  font-size: var(--type-display-sm-size);
  margin: 0 0 0.75em;
}

.safe-markdown-preview :deep(h2) {
  font-size: var(--type-section-title-size);
  margin: 1.25em 0 0.5em;
}

.safe-markdown-preview :deep(h3),
.safe-markdown-preview :deep(h4) {
  font-size: var(--type-body-size);
  margin: 1em 0 0.4em;
}

.safe-markdown-preview :deep(p),
.safe-markdown-preview :deep(ul),
.safe-markdown-preview :deep(ol),
.safe-markdown-preview :deep(pre),
.safe-markdown-preview :deep(table),
.safe-markdown-preview :deep(blockquote) {
  margin: 0 0 0.85em;
}

.safe-markdown-preview :deep(ul),
.safe-markdown-preview :deep(ol) {
  padding-left: 1.5em;
}

.safe-markdown-preview :deep(ul) {
  list-style: disc;
}

.safe-markdown-preview :deep(ol) {
  list-style: decimal;
}

.safe-markdown-preview :deep(a) {
  color: var(--text-link);
  text-decoration: underline;
}

.safe-markdown-preview :deep(code) {
  background-color: var(--md-code-bg);
  border-radius: var(--radius);
  padding: 0.1em 0.35em;
  font-size: 0.9em;
}

.safe-markdown-preview :deep(pre) {
  background-color: var(--md-code-bg);
  border-radius: var(--radius-lg);
  padding: 0.75em 1em;
  overflow-x: auto;
}

.safe-markdown-preview :deep(pre code) {
  background: transparent;
  padding: 0;
}

.safe-markdown-preview :deep(blockquote) {
  color: var(--text-muted);
  border-left: 3px solid var(--app-border);
  padding-left: 0.85em;
}

.safe-markdown-preview :deep(table) {
  border-collapse: collapse;
  width: 100%;
}

.safe-markdown-preview :deep(th),
.safe-markdown-preview :deep(td) {
  border: 1px solid var(--app-border);
  padding: 0.35em 0.6em;
  text-align: left;
}

.safe-markdown-preview :deep(img) {
  max-width: 100%;
}
</style>
