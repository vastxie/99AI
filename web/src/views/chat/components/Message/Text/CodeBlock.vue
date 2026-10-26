<script lang="ts">
const INLINE_PREVIEW_STATE_LIMIT = 300
const inlinePreviewStateMap = new Map<string, boolean>()

function rememberInlinePreviewState(key: string, active: boolean) {
  if (active) {
    inlinePreviewStateMap.set(key, true)
  } else {
    inlinePreviewStateMap.delete(key)
  }

  if (inlinePreviewStateMap.size <= INLINE_PREVIEW_STATE_LIMIT) return

  const oldestKey = inlinePreviewStateMap.keys().next().value
  if (oldestKey) inlinePreviewStateMap.delete(oldestKey)
}
</script>

<script lang="ts" setup>
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import CopyFeedbackIcon from '@/components/common/CopyFeedbackIcon.vue'

import { CirclePlay, CodeXml, Maximize2 } from '@lucide/vue'
import {
  currentHighlighter,
  escapeCodeHtml as escapeHtmlText,
  highlighterReady,
} from '@/utils/highlight'
import { computed, defineAsyncComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { t } from '@/locales'
import { useGlobalStore } from '@/store/modules/global'
import type { CodeContentType } from '@/types/preview-panel'
import {
  getCodeBlockContentType,
  getCodeBlockLanguageLabel,
  isPreviewableCodeContentType,
  type PreviewableCodeContentType,
} from '@/utils/codeContent'
import { useCopyFeedback } from '@/composables/useCopyFeedback'

// 行内预览只在点开时才需要：它带着 Markdown 渲染等依赖，不和代码块一起进首屏
// 行内预览按需加载；还在下载时先放一个同高的占位（外层 class 给出高度），代码块不先塌下去再撑开
const CodePreviewSurface = defineAsyncComponent({
  loader: () => import('../../UnifiedSidePanel/CodePreviewSurface.vue'),
  loadingComponent: { render: () => h('div', { 'aria-busy': 'true' }) },
  delay: 0,
})

const props = defineProps<{
  code: string
  language?: string
  stateKey?: string
  allowWorkspace?: boolean
  /** 流式输出中：高亮节流 + 内部滚动自动跟随底部 */
  streaming?: boolean
}>()

const emit = defineEmits<{
  (
    ev: 'openWorkspace',
    payload: { content: string; contentType: CodeContentType; title?: string; sourceKey?: string }
  ): void
}>()

const globalStore = useGlobalStore()
const { copied: isCopied, copy } = useCopyFeedback()
const isInlinePreviewActive = ref(
  props.stateKey ? inlinePreviewStateMap.get(props.stateKey) === true : false
)

const languageLabel = computed(() => getCodeBlockLanguageLabel(props.language))
const contentType = computed(() => getCodeBlockContentType(languageLabel.value))
const isPreviewable = computed(() => isPreviewableCodeContentType(contentType.value))
const previewContentType = computed(() => contentType.value as PreviewableCodeContentType)
const previewToggleLabel = computed(() =>
  isInlinePreviewActive.value ? t('chat.viewCode') : t('common.preview')
)
// 工作台提供可预览代码的编辑与预览；和「编辑提问」区分开，按钮说的是打开工作台
const canOpenWorkspace = computed(() => props.allowWorkspace !== false && isPreviewable.value)
const workspaceActionLabel = computed(() => t('chat.openInWorkspace'))

// ── 流式高亮节流：避免每个 chunk 都全量重新高亮导致闪烁与高 CPU ──
// 间隔随上一次高亮的耗时加长（至少 120ms、至少耗时的 4 倍）：长代码越写越长时，高亮不会越来越占主线程
const STREAM_HIGHLIGHT_INTERVAL = 120
const STREAM_HIGHLIGHT_COST_FACTOR = 4
const STREAM_PLAIN_THRESHOLD = 60000
// 没标语言的代码自动识别要把每种语言都试一遍：太长的直接按纯文本
const AUTO_DETECT_MAX_LENGTH = 20000

const highlightedCode = ref('')
let highlightTimer: ReturnType<typeof setTimeout> | null = null
let lastHighlightAt = 0
let lastHighlightCost = 0

// 历史消息里的代码块滚到附近才高亮：打开一个代码很多的会话时不在同一刻全部高亮
const rootRef = ref<HTMLElement | null>(null)
const isNearViewport = ref(Boolean(props.streaming) || typeof IntersectionObserver === 'undefined')
let visibilityObserver: IntersectionObserver | null = null

onMounted(() => {
  if (isNearViewport.value || !rootRef.value) return
  visibilityObserver = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      isNearViewport.value = true
      visibilityObserver?.disconnect()
      visibilityObserver = null
    },
    { rootMargin: '600px 0px' }
  )
  visibilityObserver.observe(rootRef.value)
})

function computeHighlightedCode(): string {
  const language = languageLabel.value

  try {
    // 超长代码在流式期间只做转义，完成后再做完整高亮
    if (props.streaming && props.code.length > STREAM_PLAIN_THRESHOLD) {
      return escapeHtmlText(props.code)
    }
    if (!props.streaming && !isNearViewport.value) return escapeHtmlText(props.code)

    // 高亮库按需加载：加载完成前先显示纯文本，加载完成时重新高亮（见下方 watch）
    const hljs = currentHighlighter()
    if (!hljs) return escapeHtmlText(props.code)
    if (language && hljs.getLanguage(language)) {
      if (!props.streaming) {
        return hljs.highlight(props.code, { language }).value
      }
      // 流式期间只高亮已完成的整行，正在输出的半行保持纯文本：
      // 未闭合的字符串 / 注释不会让后半段颜色来回变（参考 dsh 按行冻结的做法）
      const cut = props.code.lastIndexOf('\n') + 1
      const settled = props.code.slice(0, cut)
      const tail = props.code.slice(cut)
      return (settled ? hljs.highlight(settled, { language }).value : '') + escapeHtmlText(tail)
    }

    // 语言未知时 highlightAuto 开销极大，流式期间先转义，完成后再自动识别
    if (props.streaming) {
      return escapeHtmlText(props.code)
    }

    if (props.code.length > AUTO_DETECT_MAX_LENGTH) return escapeHtmlText(props.code)
    return hljs.highlightAuto(props.code).value
  } catch {
    return escapeHtmlText(props.code)
  }
}

function applyHighlight() {
  const startedAt = performance.now()
  highlightedCode.value = computeHighlightedCode()
  lastHighlightAt = Date.now()
  lastHighlightCost = performance.now() - startedAt
}

function refreshHighlight(immediate = false) {
  if (immediate || !props.streaming) {
    if (highlightTimer) {
      clearTimeout(highlightTimer)
      highlightTimer = null
    }
    applyHighlight()
    return
  }

  const interval = Math.max(
    STREAM_HIGHLIGHT_INTERVAL,
    lastHighlightCost * STREAM_HIGHLIGHT_COST_FACTOR
  )
  const elapsed = Date.now() - lastHighlightAt
  if (elapsed >= interval) {
    applyHighlight()
    return
  }

  if (highlightTimer) return
  highlightTimer = setTimeout(() => {
    highlightTimer = null
    applyHighlight()
  }, interval - elapsed)
}

watch(
  () => props.code,
  () => refreshHighlight(),
  { immediate: true }
)

watch(languageLabel, () => refreshHighlight(true))
watch(highlighterReady, ready => {
  if (ready) refreshHighlight(true)
})
watch(isNearViewport, near => {
  if (near) refreshHighlight(true)
})

// ── 流式底部跟随：输出时钉在底部，用户向上滚动即脱离，滚回底部恢复 ──
const codeScrollRef = ref<HTMLElement | null>(null)
const followStreamOutput = ref(true)
const FOLLOW_BOTTOM_THRESHOLD = 32

function handleCodeScroll() {
  const el = codeScrollRef.value
  if (!el) return
  followStreamOutput.value =
    el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_BOTTOM_THRESHOLD
}

watch(highlightedCode, async () => {
  if (!props.streaming || !followStreamOutput.value) return
  // 下一帧里再读高度、钉底：DOM 刚换完就读 scrollHeight 会强制同步排版
  await new Promise(resolve => requestAnimationFrame(resolve))
  // 等待期间用户可能已向上滚动脱离跟随，二次确认后再钉底
  if (!props.streaming || !followStreamOutput.value) return
  const el = codeScrollRef.value
  if (el) el.scrollTop = el.scrollHeight
})

watch(
  () => props.streaming,
  streaming => {
    if (streaming) {
      followStreamOutput.value = true
      return
    }
    // 流式结束：立即做一次完整高亮（覆盖节流期间跳过的最终内容/自动识别）
    refreshHighlight(true)
  }
)

function handleCopy() {
  void copy(props.code)
}

function handleToggleInlinePreview() {
  if (!isPreviewable.value) return
  isInlinePreviewActive.value = !isInlinePreviewActive.value
}

function handleOpenWorkspace() {
  if (!canOpenWorkspace.value) return
  emit('openWorkspace', {
    content: props.code,
    contentType: contentType.value,
    title: languageLabel.value,
    sourceKey: props.stateKey,
  })
}

function syncOpenWorkspaceContent() {
  const sourceKey = props.stateKey
  if (!sourceKey) return

  const currentPanel = globalStore.rightPreviewPanel
  if (currentPanel?.type !== 'code' || currentPanel.sourceKey !== sourceKey) return

  globalStore.updateCodePanel({
    type: 'code',
    sourceKey,
    content: props.code,
    contentType: contentType.value,
    title: languageLabel.value,
  })
}

watch(
  () => [props.code, contentType.value],
  () => {
    if (!isPreviewable.value) {
      isInlinePreviewActive.value = false
    }
  }
)

watch(
  () => props.stateKey,
  key => {
    if (!key) {
      isInlinePreviewActive.value = false
      return
    }
    isInlinePreviewActive.value = inlinePreviewStateMap.get(key) === true
  }
)

watch(isInlinePreviewActive, active => {
  if (!props.stateKey) return
  rememberInlinePreviewState(props.stateKey, active)
})

watch(
  () => [props.code, contentType.value, languageLabel.value, props.stateKey] as const,
  () => {
    syncOpenWorkspaceContent()
  },
  { immediate: true }
)

onUnmounted(() => {
  visibilityObserver?.disconnect()
  visibilityObserver = null
  if (highlightTimer) {
    clearTimeout(highlightTimer)
    highlightTimer = null
  }
})
</script>

<template>
  <div
    ref="rootRef"
    class="chat-code-block"
    :class="{ 'is-previewing': isInlinePreviewActive }"
    role="group"
  >
    <div class="chat-code-block-header code-block-header">
      <span class="chat-code-block-language">
        <CodeXml :size="15" :stroke-width="2.15" class="chat-code-block-language-icon" />
        <span>{{ languageLabel }}</span>
      </span>
      <div class="chat-code-block-actions">
        <UiTooltip v-if="isPreviewable" :text="previewToggleLabel" placement="bottom">
          <UiButton
            icon
            type="button"
            class="chat-code-block-action action-icon btn-icon-action"
            :aria-label="previewToggleLabel"
            @click.stop.prevent="handleToggleInlinePreview"
          >
            <CodeXml v-if="isInlinePreviewActive" :size="16" />
            <CirclePlay v-else :size="16" />
          </UiButton>
        </UiTooltip>
        <UiTooltip v-if="canOpenWorkspace" :text="workspaceActionLabel" placement="bottom">
          <UiButton
            icon
            type="button"
            class="chat-code-block-action action-icon btn-icon-action"
            :aria-label="workspaceActionLabel"
            @click.stop.prevent="handleOpenWorkspace"
          >
            <Maximize2 :size="16" aria-hidden="true" />
          </UiButton>
        </UiTooltip>
        <UiTooltip :text="t('chat.copy')" placement="bottom">
          <UiButton
            icon
            type="button"
            class="chat-code-block-action action-icon btn-icon-action"
            :aria-label="t('chat.copy')"
            :scale="false"
            @click.stop.prevent="handleCopy"
          >
            <CopyFeedbackIcon :copied="isCopied" />
          </UiButton>
        </UiTooltip>
      </div>
    </div>
    <CodePreviewSurface
      v-if="isInlinePreviewActive && isPreviewable"
      class="chat-code-block-preview"
      :content="code"
      :content-type="previewContentType"
      compact
      :render-interval-ms="120"
    />
    <code
      v-else
      ref="codeScrollRef"
      class="hljs chat-code-block-content code-content-scrollable code-container custom-scrollbar"
      v-html="highlightedCode"
      @scroll.passive="handleCodeScroll"
    ></code>
  </div>
</template>

<style scoped>
/* 代码容器：流式与完成态统一限高（全局类 .chat-code-block-content 负责高度与滚动），流式期间由本组件做内部底部跟随 */
.code-container {
  overflow: auto;
  max-width: 100% !important;
  overflow-x: auto !important;
  width: 100% !important;
}

.chat-code-block-preview {
  --preview-device-stage-bg: var(--code-block-header-bg);

  height: min(26rem, 52vh);
  border-bottom-right-radius: var(--code-block-radius);
  border-bottom-left-radius: var(--code-block-radius);
  background: var(--code-block-header-bg);
}

.chat-code-block-preview :deep(.content-renderer),
.chat-code-block-preview :deep(.code-preview-surface),
.chat-code-block-preview :deep(.preview-device-stage) {
  background: var(--code-block-header-bg);
}
</style>
