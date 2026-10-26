<script setup lang="ts">
import CopyFeedbackIcon from '@/components/common/CopyFeedbackIcon.vue'
import { Download, PanelLeftClose, PanelLeftOpen, Play, SquarePen, X } from '@lucide/vue'

import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { lintKeymap } from '@codemirror/lint'
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  Transaction,
  type Extension,
} from '@codemirror/state'
import { searchKeymap } from '@codemirror/search'
import {
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import ActionIcon from '@/components/common/ActionIcon'
import UiButton from '@/components/common/UiButton.vue'
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { resolvedClientThemeMode } from '@/utils/themeMode'
import type { CodeContentType } from '@/types/preview-panel'
import { useCopyFeedback } from '@/composables/useCopyFeedback'
import { downloadText } from '@/utils/download'
import {
  getCodeContentFileExtension,
  isPreviewableCodeContentType,
  type PreviewableCodeContentType,
} from '@/utils/codeContent'
import { message } from '@/utils/message'
import CodePreviewSurface from '@/views/chat/components/UnifiedSidePanel/CodePreviewSurface.vue'

interface Props {
  content: string
  contentType: CodeContentType
  title?: string
  close: () => void
  variant?: 'side' | 'workspace'
  lockBodyScroll?: boolean
  manageSidebar?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  lockBodyScroll: true,
  manageSidebar: true,
})

const appStore = useAppStore()
const ms = message()
const { isMobile } = useViewport()

// --- Sidebar state ---
const sidebarStateBeforeOpen = ref(true)
const isWorkspace = computed(() => props.variant === 'workspace')
const shouldLockBodyScroll = computed(() => props.lockBodyScroll && isMobile.value)
const shouldManageSidebar = computed(() => props.manageSidebar && !isWorkspace.value)

// --- Mode switching ---
type ViewMode = 'preview' | 'source' | 'formatted'

const supportsPreview = computed(() => {
  return isPreviewableCodeContentType(props.contentType)
})

const supportsFormatted = computed(() => {
  return props.contentType === 'json'
})

const defaultMode = computed<ViewMode>(() => {
  if (supportsPreview.value) return 'preview'
  if (supportsFormatted.value) return 'formatted'
  return 'source'
})

const activeMode = ref<ViewMode>(defaultMode.value)
const draftContent = ref(props.content || '')
const isCodePaneVisible = ref(true)
const isWorkspaceResizing = ref(false)
const { copied: isCopied, copy } = useCopyFeedback()
const workspaceBodyRef = ref<HTMLElement | null>(null)
const workspaceResizeHandleRef = ref<HTMLElement | null>(null)
const codePaneWidthPercent = ref(39)
const isPreviewMode = computed(() => activeMode.value === 'preview')
const previewToggleLabel = computed(() =>
  isPreviewMode.value ? t('common.edit') : t('common.preview')
)
const codePaneToggleLabel = computed(() =>
  isCodePaneVisible.value ? t('previewer.hideCode') : t('previewer.showCode')
)
const shouldUseEditor = computed(() => {
  if (isWorkspace.value) return true
  return activeMode.value === 'source' || activeMode.value === 'formatted'
})
const shouldShowSidePreview = computed(() => !isWorkspace.value && activeMode.value === 'preview')
const shouldShowWorkspacePreview = computed(() => isWorkspace.value && supportsPreview.value)
const previewContentType = computed(() => props.contentType as PreviewableCodeContentType)
const workspaceBodyClasses = computed(() => ({
  'code-workspace-body-preview': shouldShowWorkspacePreview.value,
  'code-workspace-body-source-only': !shouldShowWorkspacePreview.value,
  'code-workspace-body-code-hidden': shouldShowWorkspacePreview.value && !isCodePaneVisible.value,
  'is-resizing': isWorkspaceResizing.value,
}))
const workspaceBodyStyle = computed(() => {
  if (shouldShowWorkspacePreview.value && isCodePaneVisible.value) {
    return {
      '--code-workspace-code-pane-width': `${codePaneWidthPercent.value}%`,
    }
  }
  return undefined
})
const shouldShowWorkspaceResizeHandle = computed(
  () => isWorkspace.value && shouldShowWorkspacePreview.value && isCodePaneVisible.value
)
let activeResizePointerId: number | null = null

const WORKSPACE_CODE_PANE_MIN_WIDTH = 300
const WORKSPACE_OUTPUT_PANE_MIN_WIDTH = 360

// --- Preview size ---
const previewSize = ref<'desktop' | 'tablet' | 'mobile'>('desktop')

function inferTitleFromContent() {
  const content = draftContent.value || ''

  if (props.contentType === 'markdown' || props.contentType === 'markmap') {
    const heading = content.match(/^\s*#\s+(.+)$/mu)?.[1]?.trim()
    if (heading) return heading
  }

  if (props.contentType === 'html') {
    const title = content.match(/<title[^>]*>(.*?)<\/title>/iu)?.[1]?.trim()
    if (title) return title
  }

  if (props.contentType === 'svg') {
    const title = content.match(/<title[^>]*>(.*?)<\/title>/iu)?.[1]?.trim()
    if (title) return title
  }

  return ''
}

const displayTitle = computed(() => {
  return props.title?.trim() || inferTitleFromContent() || t('previewer.contentPreview')
})

// --- JSON formatting ---
const formattedContent = computed(() => {
  if (props.contentType !== 'json') return draftContent.value
  try {
    return JSON.stringify(JSON.parse(draftContent.value), null, 2)
  } catch {
    return draftContent.value
  }
})

// --- CodeMirror ---
const editorContainerRef = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
const codeEditorSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  dropCursor(),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  highlightActiveLine(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
]
const blockEditorSearchKeymap = Prec.highest(
  keymap.of([
    { key: 'Mod-f', run: () => true },
    { key: 'Mod-g', run: () => true },
    { key: 'Shift-Mod-g', run: () => true },
  ])
)
const codePanelDarkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--panel-bg)',
      color: 'var(--panel-text)',
    },
    '.cm-scroller': {
      backgroundColor: 'var(--panel-bg) !important',
    },
    '.cm-editor, .cm-gutters, .cm-gutter, .cm-lineNumbers, .cm-lineNumbers .cm-gutterElement': {
      backgroundColor: 'var(--panel-bg) !important',
    },
    '.cm-content': {
      caretColor: 'var(--panel-caret)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--panel-bg) !important',
      color: 'var(--panel-text-subtle)',
      borderRight: '1px solid var(--panel-editor-gutter-border) !important',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--panel-editor-active-line) !important',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--panel-editor-active-line) !important',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--panel-selection)',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--panel-caret)',
    },
  },
  { dark: true }
)

/**
 * 语言支持按需加载：打开面板只下载当前这种代码要的那一个语言包（以前 10 个全打在面板分块里）。
 * 加载完成前先按纯文本显示，到了用 Compartment 换上，不重建编辑器
 */
async function loadLanguageExtension(contentType: string): Promise<Extension> {
  switch (contentType) {
    case 'html':
    case 'svg':
      return (await import('@codemirror/lang-html')).html()
    case 'css':
      return (await import('@codemirror/lang-css')).css()
    case 'json':
      return (await import('@codemirror/lang-json')).json()
    case 'javascript':
    case 'js':
      return (await import('@codemirror/lang-javascript')).javascript()
    case 'typescript':
    case 'ts':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
    case 'markdown':
    case 'md':
      return (await import('@codemirror/lang-markdown')).markdown()
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql()
    case 'python':
    case 'py':
      return (await import('@codemirror/lang-python')).python()
    case 'java':
      return (await import('@codemirror/lang-java')).java()
    case 'cpp':
    case 'c':
      return (await import('@codemirror/lang-cpp')).cpp()
    case 'rust':
      return (await import('@codemirror/lang-rust')).rust()
    default:
      return []
  }
}

const languageCompartment = new Compartment()
let languageRequest = 0
/** 外部内容同步进编辑器（流式、JSON 格式化显示）：不是用户的输入，不回写草稿 */
const externalSync = Annotation.define<boolean>()

async function applyLanguage() {
  const request = ++languageRequest
  const extension = await loadLanguageExtension(props.contentType).catch(() => [])
  if (request !== languageRequest || !editorView) return
  editorView.dispatch({ effects: languageCompartment.reconfigure(extension) })
}

function getEffectiveContent(): string {
  if (!isWorkspace.value && activeMode.value === 'formatted' && props.contentType === 'json') {
    return formattedContent.value
  }
  return draftContent.value
}

function createEditor() {
  if (!editorContainerRef.value) return

  destroyEditor()

  const isDark = resolvedClientThemeMode.value === 'dark'
  const docContent = getEffectiveContent()

  const extensions = [
    codeEditorSetup,
    blockEditorSearchKeymap,
    languageCompartment.of([]),
    EditorState.readOnly.of(false),
    EditorView.editable.of(true),
    EditorView.lineWrapping,
    EditorView.updateListener.of(update => {
      if (update.docChanged && !update.transactions.some(tr => tr.annotation(externalSync))) {
        draftContent.value = update.state.doc.toString()
      }
    }),
  ]

  if (isDark) {
    extensions.push(oneDark)
    extensions.push(Prec.highest(codePanelDarkTheme))
  }

  const state = EditorState.create({
    doc: docContent,
    extensions,
  })

  editorView = new EditorView({
    state,
    parent: editorContainerRef.value,
  })
  void applyLanguage()
}

function destroyEditor() {
  if (editorView) {
    editorView.destroy()
    editorView = null
  }
}

/**
 * 内容变了（流式输出时每帧都变）：只把差别写进现有的编辑器，不重建状态——光标、滚动与已经做完的
 * 语法解析都保留。新内容以旧内容开头（流式追加）时只在末尾插入增量；这些改动不进撤销历史
 */
function updateEditorContent() {
  if (!editorView) return
  const next = getEffectiveContent()
  const current = editorView.state.doc.toString()
  if (next === current) return
  const appended = next.startsWith(current)
  editorView.dispatch({
    changes: appended
      ? { from: current.length, insert: next.slice(current.length) }
      : { from: 0, to: current.length, insert: next },
    annotations: [Transaction.addToHistory.of(false), externalSync.of(true)],
  })
}

// --- Toolbar actions ---

function handleCopyCode() {
  void copy(draftContent.value)
}

/** 本包登记的预览类型对应的下载扩展名；内核类型走 getCodeContentFileExtension */
const PACK_DOWNLOAD_EXTENSIONS: Record<string, string> = {
  mermaid: 'mmd',
  markmap: 'md',
}

function handleDownload() {
  const ext =
    PACK_DOWNLOAD_EXTENSIONS[props.contentType] ||
    getCodeContentFileExtension(props.contentType) ||
    'txt'
  downloadText(draftContent.value, getDownloadFilename(ext))
  ms.success(t('previewer.fileDownloadStarted'))
}

function sanitizeFilename(value: string) {
  return replaceAsciiControlCharacters(value)
    .replaceAll(/[<>:"/\\|?*]/gu, '_')
    .replaceAll(/\s+/gu, ' ')
    .replaceAll(/^\.+|\.+$/gu, '')
    .trim()
    .slice(0, 120)
}

function replaceAsciiControlCharacters(value: string) {
  return Array.from(value, char => ((char.codePointAt(0) ?? 0) < 0x20 ? '_' : char)).join('')
}

function getDownloadFilename(ext: string) {
  const baseTitle = sanitizeFilename(displayTitle.value)
  if (!baseTitle) return `preview.${ext}`

  const extensionPattern = new RegExp(`\\.${ext}$`, 'iu')
  if (extensionPattern.test(baseTitle)) return baseTitle
  if (/\.[A-Za-z0-9]{1,8}$/u.test(baseTitle)) return baseTitle

  return `${baseTitle}.${ext}`
}

function handleClose() {
  if (
    shouldManageSidebar.value &&
    !isMobile.value &&
    !sidebarStateBeforeOpen.value &&
    appStore.siderCollapsed
  ) {
    appStore.setSiderCollapsed(false)
  }
  props.close()
  if (shouldLockBodyScroll.value) {
    document.documentElement.classList.remove('overflow-hidden')
    document.body.classList.remove('overflow-hidden')
  }
}

function setPreviewSize(size: 'desktop' | 'tablet' | 'mobile') {
  previewSize.value = size
}

function switchMode(mode: ViewMode) {
  activeMode.value = mode
}

function togglePreviewSource() {
  if (activeMode.value === 'preview') {
    switchMode('source')
  } else {
    switchMode('preview')
  }
}

function toggleCodePane() {
  if (!shouldShowWorkspacePreview.value) return
  isCodePaneVisible.value = !isCodePaneVisible.value
}

function getCodePaneWidthBounds() {
  const body = workspaceBodyRef.value
  if (!body) return { min: 20, max: 78 }

  const rect = body.getBoundingClientRect()
  if (rect.width <= 0) return { min: 20, max: 78 }

  const minCodePercent = (WORKSPACE_CODE_PANE_MIN_WIDTH / rect.width) * 100
  const maxCodePercent = 100 - (WORKSPACE_OUTPUT_PANE_MIN_WIDTH / rect.width) * 100
  const min = Math.min(48, Math.max(20, minCodePercent))
  const max = Math.max(min, Math.min(78, maxCodePercent))

  return { min, max }
}

function clampCodePaneWidthPercent(value: number) {
  const { min, max } = getCodePaneWidthBounds()
  return Math.min(max, Math.max(min, value))
}

function clampCodePaneWidth(clientX: number) {
  const body = workspaceBodyRef.value
  if (!body) return codePaneWidthPercent.value

  const rect = body.getBoundingClientRect()
  if (rect.width <= 0) return codePaneWidthPercent.value

  const nextPercent = ((clientX - rect.left) / rect.width) * 100

  return clampCodePaneWidthPercent(nextPercent)
}

function handleWorkspaceResizeMove(event: PointerEvent) {
  if (!isWorkspaceResizing.value) return
  if (activeResizePointerId !== null && event.pointerId !== activeResizePointerId) return

  event.preventDefault()
  codePaneWidthPercent.value = clampCodePaneWidth(event.clientX)
}

function stopWorkspaceResize(event?: PointerEvent) {
  if (!isWorkspaceResizing.value) return
  if (event && activeResizePointerId !== null && event.pointerId !== activeResizePointerId) {
    return
  }

  if (activeResizePointerId !== null) {
    try {
      workspaceResizeHandleRef.value?.releasePointerCapture(activeResizePointerId)
    } catch {
      // Pointer capture may already be released by the browser.
    }
  }

  isWorkspaceResizing.value = false
  activeResizePointerId = null
  document.documentElement.classList.remove('code-workspace-is-resizing')
  window.removeEventListener('pointermove', handleWorkspaceResizeMove)
  window.removeEventListener('pointerup', stopWorkspaceResize)
  window.removeEventListener('pointercancel', stopWorkspaceResize)

  nextTick(() => {
    editorView?.requestMeasure()
  })
}

function startWorkspaceResize(event: PointerEvent) {
  if (!shouldShowWorkspaceResizeHandle.value || isMobile.value) return
  if (event.button !== 0) return

  event.preventDefault()
  event.stopPropagation()
  activeResizePointerId = event.pointerId
  workspaceResizeHandleRef.value?.setPointerCapture(event.pointerId)
  isWorkspaceResizing.value = true
  codePaneWidthPercent.value = clampCodePaneWidth(event.clientX)
  document.documentElement.classList.add('code-workspace-is-resizing')
  window.addEventListener('pointermove', handleWorkspaceResizeMove)
  window.addEventListener('pointerup', stopWorkspaceResize)
  window.addEventListener('pointercancel', stopWorkspaceResize)
}

function handleWorkspaceResizeKeydown(event: KeyboardEvent) {
  if (!shouldShowWorkspaceResizeHandle.value || isMobile.value) return

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

  event.preventDefault()
  const delta = event.key === 'ArrowRight' ? 2 : -2
  codePaneWidthPercent.value = clampCodePaneWidthPercent(codePaneWidthPercent.value + delta)

  nextTick(() => {
    editorView?.requestMeasure()
  })
}

function handlePreviewContentUpdate(nextContent: string) {
  if (
    (props.contentType !== 'html' && props.contentType !== 'svg') ||
    typeof nextContent !== 'string'
  ) {
    return
  }
  if (draftContent.value === nextContent) return

  draftContent.value = nextContent

  const currentEditorContent = editorView?.state.doc.toString()
  if (!editorView || currentEditorContent === nextContent) return

  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: nextContent,
    },
  })
}

// --- Watchers ---

watch(
  () => props.content,
  () => {
    draftContent.value = props.content || ''
    if (shouldUseEditor.value && editorView) {
      updateEditorContent()
    }
  }
)

watch(
  () => resolvedClientThemeMode.value,
  () => {
    if (shouldUseEditor.value) {
      nextTick(() => {
        createEditor()
      })
    }
  }
)

watch(
  () => props.contentType,
  () => {
    draftContent.value = props.content || ''
    activeMode.value = defaultMode.value
    if (shouldUseEditor.value) {
      nextTick(() => {
        createEditor()
      })
    }
  }
)

watch(shouldUseEditor, value => {
  nextTick(() => {
    if (value) {
      createEditor()
    } else {
      destroyEditor()
    }
  })
})

watch(isCodePaneVisible, value => {
  if (!value) return
  nextTick(() => {
    editorView?.requestMeasure()
  })
})

// --- Lifecycle ---

onMounted(() => {
  sidebarStateBeforeOpen.value = appStore.siderCollapsed
  if (shouldManageSidebar.value && !appStore.siderCollapsed) {
    appStore.setSiderCollapsed(true)
  }

  if (shouldLockBodyScroll.value) {
    document.documentElement.classList.add('overflow-hidden')
    document.body.classList.add('overflow-hidden')
  }

  if (shouldUseEditor.value) {
    nextTick(() => {
      createEditor()
    })
  }
})

onUnmounted(() => {
  destroyEditor()
  stopWorkspaceResize()

  if (
    shouldManageSidebar.value &&
    !isMobile.value &&
    !sidebarStateBeforeOpen.value &&
    appStore.siderCollapsed
  ) {
    appStore.setSiderCollapsed(false)
  }

  if (shouldLockBodyScroll.value) {
    document.documentElement.classList.remove('overflow-hidden')
    document.body.classList.remove('overflow-hidden')
  }
})
</script>

<template>
  <div v-if="isWorkspace" class="code-workspace-shell">
    <div class="code-workspace-header">
      <div class="flex min-w-0 items-center">
        <UiButton
          v-if="shouldShowWorkspacePreview"
          type="button"
          :scale="false"
          class="code-workspace-code-toggle btn-icon-action"
          :aria-label="codePaneToggleLabel"
          :title="codePaneToggleLabel"
          @click="toggleCodePane"
        >
          <PanelLeftClose v-if="isCodePaneVisible" :size="20" :stroke-width="2.2" />
          <PanelLeftOpen v-else :size="20" :stroke-width="2.2" />
          <span>{{ codePaneToggleLabel }}</span>
        </UiButton>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <ActionIcon
          :label="t('chat.copy')"
          :scale="false"
          :tooltip="t('chat.copy')"
          tooltip-placement="bottom"
          @click="handleCopyCode"
        >
          <CopyFeedbackIcon :copied="isCopied" :size="20" />
        </ActionIcon>
        <ActionIcon
          :label="t('common.download')"
          :tooltip="t('common.download')"
          tooltip-placement="bottom"
          @click="handleDownload"
        >
          <Download :size="20" />
        </ActionIcon>
        <ActionIcon
          :label="t('common.close')"
          :tooltip="t('previewer.closePreview')"
          tooltip-placement="bottom"
          @click="handleClose"
        >
          <X :size="20" />
        </ActionIcon>
      </div>
    </div>

    <div
      ref="workspaceBodyRef"
      class="code-workspace-body"
      :class="workspaceBodyClasses"
      :style="workspaceBodyStyle"
    >
      <section
        v-show="isCodePaneVisible"
        class="code-workspace-editor-pane"
        :aria-label="t('previewer.codeEditorRegion')"
      >
        <div ref="editorContainerRef" class="h-full w-full"></div>
      </section>

      <div
        v-if="shouldShowWorkspaceResizeHandle"
        ref="workspaceResizeHandleRef"
        class="code-workspace-resize-handle"
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('previewer.resizeCodeAndPreview')"
        tabindex="0"
        @pointerdown="startWorkspaceResize"
        @keydown="handleWorkspaceResizeKeydown"
      ></div>

      <section
        v-if="shouldShowWorkspacePreview"
        class="code-workspace-preview-pane"
        :aria-label="t('previewer.previewRegion')"
      >
        <div class="code-workspace-preview-card">
          <CodePreviewSurface
            :content-type="previewContentType"
            :content="draftContent"
            :preview-size="previewSize"
            :editable="props.contentType === 'html' || props.contentType === 'svg'"
            @update:preview-size="setPreviewSize"
            @update:content="handlePreviewContentUpdate"
          />
        </div>
      </section>
    </div>
  </div>

  <div v-else class="panel-shell">
    <!-- Header -->
    <div
      class="panel-header"
      :class="{
        'px-2': isMobile,
        'px-4': !isMobile,
      }"
    >
      <!-- Left side: title -->
      <div class="flex min-w-0 flex-1 items-center gap-4">
        <div class="flex min-w-0 flex-1 items-center gap-2 leading-tight">
          <div class="type-control min-w-0 truncate text-text-primary">
            {{ displayTitle }}
          </div>
        </div>
      </div>

      <!-- Right side: toolbar -->
      <div class="flex shrink-0 items-center space-x-1">
        <!-- Preview / edit toggle -->
        <div v-if="supportsPreview" class="relative group mx-1">
          <ActionIcon
            :label="previewToggleLabel"
            :tooltip="previewToggleLabel"
            tooltip-placement="bottom"
            @click="togglePreviewSource"
          >
            <SquarePen v-if="isPreviewMode" :size="20" />
            <Play v-else :size="20" />
          </ActionIcon>
        </div>

        <!-- Download -->
        <div class="relative group mx-1">
          <ActionIcon
            :label="t('common.download')"
            :tooltip="t('common.download')"
            tooltip-placement="bottom"
            @click="handleDownload"
          >
            <Download :size="20" />
          </ActionIcon>
        </div>

        <!-- Close -->
        <div class="relative group">
          <ActionIcon :label="t('common.close')" @click="handleClose">
            <X :size="20" />
          </ActionIcon>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-grow overflow-hidden relative rounded-bl-2xl">
      <!-- Preview mode: HTML/Mermaid/MarkMap -->
      <div v-if="shouldShowSidePreview" class="absolute inset-0 p-1">
        <CodePreviewSurface
          :content-type="previewContentType"
          :content="draftContent"
          :preview-size="previewSize"
          @update:preview-size="setPreviewSize"
        />
      </div>

      <!-- Source / Formatted mode (CodeMirror) -->
      <div v-show="shouldUseEditor" class="absolute inset-0">
        <div ref="editorContainerRef" class="h-full w-full"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.cm-editor) {
  height: 100%;
  font-size: var(--type-meta-size);
}

:deep(.cm-scroller) {
  overflow: auto;
  font-family: var(--font-mono);
}

.code-workspace-shell {
  --code-workspace-editor-bg: var(--app-surface);

  position: relative;
  z-index: var(--z-content);
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-surface);
  color: var(--text-primary);
}

.code-workspace-header {
  display: flex;
  height: var(--chat-header-height);
  min-height: var(--chat-header-height);
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 20px;
  background: var(--app-surface);
}

.code-workspace-code-toggle {
  display: inline-flex;
  height: 40px;
  align-items: center;
  gap: 9px;
  border-radius: var(--btn-radius);
  padding: 0 13px;
  font-size: var(--type-control-size);
  font-weight: 500;
  line-height: 1;
}

.code-workspace-body {
  display: grid;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--app-surface);
}

.code-workspace-body-preview {
  grid-template-columns:
    minmax(300px, var(--code-workspace-code-pane-width, 39%)) 16px
    minmax(360px, 1fr);
}

.code-workspace-body-source-only,
.code-workspace-body-code-hidden {
  grid-template-columns: minmax(0, 1fr);
}

.code-workspace-editor-pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--code-workspace-editor-bg);
}

.code-workspace-resize-handle {
  position: relative;
  z-index: 2;
  min-width: 16px;
  min-height: 0;
  cursor: ew-resize;
  touch-action: none;
  background: transparent;
}

.code-workspace-resize-handle::before {
  position: absolute;
  top: 22px;
  bottom: 28px;
  left: calc(100% - 3px);
  width: 2px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--text-primary) 18%, transparent);
  content: '';
  opacity: 0;
  transform: translateX(-50%) scaleY(0.92);
  transition:
    background-color var(--motion-duration-sm) ease,
    opacity var(--motion-duration-sm) ease,
    transform var(--motion-duration-sm) ease,
    width var(--motion-duration-sm) ease;
}

.code-workspace-resize-handle:hover::before,
.code-workspace-resize-handle:focus-visible::before,
.code-workspace-body.is-resizing .code-workspace-resize-handle::before {
  width: 3px;
  background: color-mix(in srgb, var(--text-primary) 24%, transparent);
  opacity: 1;
  transform: translateX(-50%) scaleY(1);
}

@media (prefers-reduced-motion: reduce) {
  .code-workspace-resize-handle::before {
    transition: none;
  }
}

.code-workspace-resize-handle:focus-visible {
  outline: none;
}

.code-workspace-body-source-only .code-workspace-editor-pane {
  border-right: 0;
}

.code-workspace-preview-pane {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 18px 22px 28px 8px;
  background: transparent;
}

.code-workspace-preview-card {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: var(--radius-3xl);
  background: transparent;
  box-shadow:
    0 18px 46px -32px color-mix(in srgb, var(--text-primary) 34%, transparent),
    0 0 24px -18px color-mix(in srgb, var(--text-primary) 28%, transparent);
}

.code-workspace-preview-card :deep(.content-renderer),
.code-workspace-preview-card :deep(.preview-device-stage) {
  background: transparent;
}

.code-workspace-preview-card :deep(.preview-device-frame-device) {
  box-shadow: 0 16px 40px -22px color-mix(in srgb, var(--text-primary) 24%, transparent);
}

:deep(.cm-gutters) {
  border-right: 1px solid var(--panel-editor-gutter-border);
}

.code-workspace-editor-pane :deep(.cm-editor) {
  height: 100%;
  font-size: var(--type-body-sm-size);
}

.code-workspace-editor-pane :deep(.cm-focused) {
  outline: none;
}

.code-workspace-editor-pane :deep(.cm-scroller) {
  line-height: 1.55;
}

.code-workspace-editor-pane :deep(.cm-gutters) {
  display: none;
}

.code-workspace-editor-pane :deep(.cm-content) {
  padding: 18px 22px 28px;
}

.code-workspace-editor-pane :deep(.cm-line) {
  padding: 0;
}

.code-workspace-editor-pane :deep(.cm-activeLine) {
  background: transparent !important;
}

/*
 * 暗色主题下面板模式的编辑器跟随面板底色。写成「html.dark + 本组件容器 + :deep」：
 * :global(html.dark) 后面再接 :deep 会被编译成裸的 html.dark，改掉整页根元素而编辑器一条都不生效。
 */
html.dark .panel-shell :deep(.cm-editor),
html.dark .panel-shell :deep(.cm-scroller),
html.dark .panel-shell :deep(.cm-gutters),
html.dark .panel-shell :deep(.cm-gutter),
html.dark .panel-shell :deep(.cm-lineNumbers),
html.dark .panel-shell :deep(.cm-lineNumbers .cm-gutterElement) {
  background-color: var(--panel-bg) !important;
}

html.dark .panel-shell :deep(.cm-gutters) {
  border-right: 1px solid var(--panel-editor-gutter-border) !important;
}

html.dark .panel-shell :deep(.cm-activeLine),
html.dark .panel-shell :deep(.cm-activeLineGutter) {
  background-color: var(--panel-editor-active-line) !important;
}

.code-workspace-editor-pane :deep(.cm-editor),
.code-workspace-editor-pane :deep(.cm-scroller),
.code-workspace-editor-pane :deep(.cm-content),
.code-workspace-editor-pane :deep(.cm-gutters),
.code-workspace-editor-pane :deep(.cm-gutter),
.code-workspace-editor-pane :deep(.cm-lineNumbers),
.code-workspace-editor-pane :deep(.cm-lineNumbers .cm-gutterElement) {
  background-color: var(--code-workspace-editor-bg) !important;
}

.code-workspace-editor-pane :deep(.cm-activeLine),
.code-workspace-editor-pane :deep(.cm-activeLineGutter) {
  background-color: transparent !important;
}

@media (max-width: 767.9px) {
  .code-workspace-header {
    padding: 0 10px;
  }

  .code-workspace-code-toggle {
    height: 40px;
    padding: 0 11px;
  }

  .code-workspace-body-preview {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 48%) minmax(0, 52%);
  }

  .code-workspace-resize-handle {
    display: none;
  }

  .code-workspace-body-code-hidden {
    grid-template-rows: minmax(0, 1fr);
  }

  .code-workspace-editor-pane {
    border-bottom: 1px solid var(--app-divider);
  }

  .code-workspace-preview-pane {
    padding: 10px;
  }

  .code-workspace-preview-card {
    border-radius: var(--radius-card);
  }
}

:global(html.code-workspace-is-resizing),
:global(html.code-workspace-is-resizing *) {
  cursor: ew-resize !important;
}
</style>
