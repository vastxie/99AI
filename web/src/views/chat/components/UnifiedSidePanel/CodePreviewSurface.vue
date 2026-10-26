<script lang="ts">
import { createMarkdownIt } from '@/utils/markdown/createMarkdownIt'

/** 所有预览共用一个 Markdown 实例（每个实例都要编译一遍链接识别的正则） */
const markdown = createMarkdownIt({ html: true })
</script>

<script setup lang="ts">
import DOMPurify from 'dompurify'
import { computed, onUnmounted, ref, watch } from 'vue'
import ScrollShadow from '@/components/common/ScrollShadow/index.vue'
import { isPreviewableCodeContentType, type PreviewableCodeContentType } from '@/utils/codeContent'
import ContentRenderer from '../Previewer/ContentRenderer.vue'

type PreviewSize = 'desktop' | 'tablet' | 'mobile'

const props = withDefaults(
  defineProps<{
    content: string
    contentType: PreviewableCodeContentType
    previewSize?: PreviewSize
    compact?: boolean
    renderIntervalMs?: number
    editable?: boolean
  }>(),
  {
    previewSize: 'desktop',
    compact: false,
    renderIntervalMs: 0,
    editable: false,
  }
)

const emit = defineEmits<{
  'update:preview-size': [value: PreviewSize]
  'update:content': [value: string]
}>()

const stableContent = ref(props.content || '')
const isRefreshing = ref(false)
let pendingContent = stableContent.value
let lastCommittedAt = Date.now()
let renderTimer: ReturnType<typeof setTimeout> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const rendererContentType = computed(() => props.contentType)

const renderedMarkdown = computed(() => {
  return DOMPurify.sanitize(markdown.render(stableContent.value || ''))
})

function clearRenderTimer() {
  if (!renderTimer) return
  clearTimeout(renderTimer)
  renderTimer = null
}

function clearRefreshTimer() {
  if (!refreshTimer) return
  clearTimeout(refreshTimer)
  refreshTimer = null
}

function commitStableContent(nextContent = pendingContent) {
  clearRenderTimer()

  if (stableContent.value === nextContent) return

  isRefreshing.value = true
  stableContent.value = nextContent
  lastCommittedAt = Date.now()

  clearRefreshTimer()
  refreshTimer = setTimeout(() => {
    isRefreshing.value = false
    refreshTimer = null
  }, 180)
}

function scheduleStableContent(nextContent: string) {
  pendingContent = nextContent || ''

  const intervalMs = Math.max(0, props.renderIntervalMs || 0)
  if (intervalMs <= 0) {
    commitStableContent(pendingContent)
    return
  }

  const elapsed = Date.now() - lastCommittedAt
  if (elapsed >= intervalMs) {
    commitStableContent(pendingContent)
    return
  }

  if (renderTimer) return

  renderTimer = setTimeout(() => {
    renderTimer = null
    commitStableContent(pendingContent)
  }, intervalMs - elapsed)
}

watch(
  () => [props.content, props.renderIntervalMs] as const,
  ([content]) => {
    scheduleStableContent(content)
  }
)

onUnmounted(() => {
  clearRenderTimer()
  clearRefreshTimer()
})
</script>

<template>
  <div
    class="code-preview-surface"
    :class="{ 'is-compact': compact, 'is-refreshing': isRefreshing }"
  >
    <ContentRenderer
      v-if="isPreviewableCodeContentType(contentType)"
      class="code-preview-surface-renderer"
      :content-type="rendererContentType"
      :content="stableContent"
      :preview-size="previewSize"
      :compact="compact"
      :editable="editable"
      @update:preview-size="emit('update:preview-size', $event)"
      @update:content="emit('update:content', $event)"
    />

    <ScrollShadow
      v-else
      class="code-preview-markdown-scroll custom-scrollbar overflow-auto bg-transparent"
    >
      <div class="code-preview-markdown md-prose" v-html="renderedMarkdown"></div>
    </ScrollShadow>
  </div>
</template>

<style scoped>
.code-preview-surface {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: transparent;
}

.code-preview-surface-renderer,
.code-preview-markdown-scroll {
  width: 100%;
  height: 100%;
  transition: opacity var(--motion-duration-md) ease;
}

.code-preview-surface.is-refreshing .code-preview-surface-renderer,
.code-preview-surface.is-refreshing .code-preview-markdown-scroll {
  opacity: 0.985;
}

.code-preview-surface :deep(.content-renderer),
.code-preview-surface :deep(.preview-device-stage) {
  background: transparent;
}

.code-preview-surface.is-compact {
  min-height: min(26rem, 52vh);
}

.code-preview-surface.is-compact :deep(.preview-device-frame-full) {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.code-preview-surface.is-compact :deep(.preview-device-frame-device) {
  max-height: calc(100% - 1.5rem);
}

.code-preview-markdown {
  max-width: 56rem;
  margin: 0 auto;
  padding: 1.125rem 1.25rem 1.5rem;
  color: var(--code-block-text);
  font-size: var(--type-body-size);
  line-height: 1.65;
}

.code-preview-markdown :deep(pre) {
  overflow: auto;
  border-radius: var(--radius-xl);
  background: var(--code-block-content-bg);
  padding: 0.85rem 1rem;
}

.code-preview-markdown :deep(code) {
  font-family: var(--font-mono);
}
</style>
