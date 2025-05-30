<script setup lang="ts">
import { createShare } from '@/api/share'
import type { ResData } from '@/api/types'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useGlobalStoreWithOut } from '@/store'
import { message } from '@/utils/message'
import { html } from '@codemirror/lang-html'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { Close } from '@icon-park/vue-next'
import { EditorView, basicSetup } from 'codemirror'
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'

interface Props {
  visible: boolean
  html?: string
  editable?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits(['update:visible', 'update:html'])
const globalStore = useGlobalStoreWithOut()
const ms = message()
const htmlPreviewRef = ref<HTMLIFrameElement | null>(null)
const localEditableText = ref(props.html || '')
const { isMobile } = useBasicLayout()
const editorContainerRef = ref<HTMLDivElement | null>(null)
const isDarkMode = computed(() => document.documentElement.classList.contains('dark'))

// CodeMirror 编辑器实例
let editor: EditorView | null = null

// 当props.html变化时更新本地编辑文本和编辑器
watchEffect(() => {
  if (props.visible) {
    // Update local ref first
    if (props.html && props.html !== localEditableText.value) {
      localEditableText.value = props.html
    }

    // Update editor content if editor exists and content differs
    if (editor) {
      const currentContent = editor.state.doc.toString()
      if (localEditableText.value !== currentContent) {
        editor.dispatch({
          changes: {
            from: 0,
            to: editor.state.doc.length,
            insert: localEditableText.value || '',
          },
        })
      }
    }
  }
})

// 使用 watchEffect 来更新预览，当 localEditableText 变化时
watchEffect(() => {
  if (props.visible) {
    // 只在可见时更新预览
    updatePreview()
  }
})

// 初始化编辑器
const initializeEditor = () => {
  if (!editorContainerRef.value || editor) return // 防止重复初始化

  const extensions = [
    basicSetup,
    html(),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString()
        localEditableText.value = newContent
        emit('update:html', newContent) // Optional: emit update immediately
      }
    }),
  ]

  if (isDarkMode.value) {
    extensions.push(oneDark)
  }

  const state = EditorState.create({
    doc: localEditableText.value || '',
    extensions,
  })

  editor = new EditorView({
    state,
    parent: editorContainerRef.value,
  })
}

// 预览更新逻辑 (保持不变或根据需要调整)
const updatePreview = () => {
  if (htmlPreviewRef.value) {
    // 更新 iframe 的 srcDoc 更为推荐，避免潜在的 XSS
    htmlPreviewRef.value.srcdoc = localEditableText.value
    /* 或者保持原来的方式，如果需要执行脚本等
    const iframeDocument = htmlPreviewRef.value.contentDocument
    if (iframeDocument) {
      iframeDocument.open()
      iframeDocument.write(localEditableText.value)
      iframeDocument.close()
    }
    */
  }
}

function handleClose() {
  // 阻止事件冒泡和默认行为
  emit('update:visible', false)
  emit('update:html', localEditableText.value)
  globalStore.updateHtmlDialog(false)

  return false
}

const handleCopy = async () => {
  try {
    const success = await copyToClipboard(localEditableText.value)
    if (success) {
      ms.success('内容已复制到剪贴板')
    } else {
      // 复制失败时，提示用户手动复制
      ms.info('复制失败，请手动复制文本框中的内容')
    }
  } catch (err) {
    ms.error('复制失败')
  }
}

const handleShare = async () => {
  try {
    const res: ResData = await createShare({
      htmlContent: localEditableText.value,
    })

    const shareCode = res.data.shareCode
    const success = await copyToClipboard(shareCode)
    if (success) {
      ms.success('分享链接已复制到剪贴板')
    } else {
      localEditableText.value = shareCode
      ms.info('复制失败，分享链接已显示在文本框中，请手动复制')
    }
  } catch (err) {
    ms.error('分享失败')
  }
}

// 兼容性更好的剪贴板复制方法
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    return false
  }
}

// 组件挂载和卸载逻辑
onMounted(() => {
  // 如果初始可见，则初始化编辑器
  if (props.visible) {
    nextTick(initializeEditor)
  }
})

onUnmounted(() => {
  if (editor) {
    editor.destroy()
    editor = null
  }
})

// 监听可见性变化来创建/销毁编辑器
watch(
  () => props.visible,
  newVal => {
    if (newVal) {
      // 弹窗变为可见，延迟初始化编辑器以确保DOM可用
      nextTick(() => {
        if (!editor && editorContainerRef.value) {
          initializeEditor()
        }
        // 确保预览是最新的
        updatePreview()
      })
    } else {
      // 弹窗关闭时，无需立即销毁编辑器，onUnmounted 会处理
      // 但可以考虑保存状态等操作
      emit('update:html', localEditableText.value) // 确保关闭时内容已更新
    }
  }
)
</script>

<template>
  <teleport to="body">
    <div
      v-if="props.visible"
      class="fixed inset-0 z-50 flex items-center justify-center html-modal-container"
    >
      <div class="fixed inset-0 bg-black bg-opacity-50" @click.stop="handleClose"></div>

      <Close
        class="absolute top-3 right-3 cursor-pointer z-30"
        size="18"
        @click.stop.prevent="handleClose"
      />

      <div
        class="relative bg-white dark:bg-gray-900 w-full h-full p-4 z-10"
        :class="[isMobile ? 'flex-col' : 'flex']"
        @click.stop
      >
        <!-- 移动端预览区域 -->
        <div v-if="isMobile" class="p-2 w-full h-1/2">
          <iframe
            ref="htmlPreviewRef"
            :srcDoc="localEditableText"
            class="box-border w-full h-full border rounded-md"
            frameborder="0"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          ></iframe>
        </div>

        <!-- 编辑区域 -->
        <div
          v-if="props.editable !== false"
          class="p-2 flex flex-col"
          :class="[isMobile ? 'w-full h-1/2' : 'w-1/4']"
        >
          <!-- CodeMirror 编辑器容器 -->
          <div
            ref="editorContainerRef"
            class="w-full h-full border rounded-md overflow-hidden dark:border-gray-700 code-editor-container"
          ></div>

          <div class="mt-2 flex justify-end">
            <button
              @click="handleClose"
              class="px-4 py-2 shadow-sm ring-1 ring-inset bg-white ring-gray-300 hover:bg-gray-50 text-gray-900 rounded-md mr-4 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:ring-gray-700 dark:hover:ring-gray-600"
            >
              取消
            </button>
            <button
              @click="handleCopy"
              class="px-4 py-2 shadow-sm bg-primary-600 hover:bg-primary-500 text-white dark rounded-md mr-4"
            >
              复制
            </button>
            <button
              @click="handleShare"
              class="px-4 py-2 shadow-sm bg-primary-600 hover:bg-primary-500 text-white dark rounded-md"
            >
              分享
            </button>
          </div>
        </div>

        <!-- 桌面端预览区域 -->
        <div v-if="!isMobile" :class="[props.editable === false ? 'w-full' : 'w-3/4']" class="p-2">
          <iframe
            ref="htmlPreviewRef"
            :srcDoc="localEditableText"
            class="box-border w-full h-full border rounded-md"
            frameborder="0"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          ></iframe>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.fixed {
  position: fixed;
  -webkit-position: fixed;
}

iframe {
  width: 100%;
  height: 100%;
  border: none;
}

/* CodeMirror编辑器容器样式 (从 PythonDialog.vue 复制并调整) */
.code-editor-container {
  height: calc(100% - 40px); /* Adjust height based on button container */
}

.code-editor-container :deep(.cm-editor) {
  height: 100% !important;
  font-family: 'Fira Code', 'Consolas', 'Monaco', 'Andale Mono', 'Ubuntu Mono', monospace;
  font-size: 14px;
}

.code-editor-container :deep(.cm-scroller) {
  overflow: auto;
}

.code-editor-container :deep(.cm-gutters) {
  border-right: 1px solid #ddd;
}

.code-editor-container :deep(.dark .cm-gutters) {
  border-right: 1px solid #444;
  background-color: #1e1e1e;
}

.code-editor-container :deep(.cm-activeLineGutter) {
  background-color: rgba(0, 0, 0, 0.1);
}

.code-editor-container :deep(.dark .cm-activeLineGutter) {
  background-color: rgba(255, 255, 255, 0.1);
}

.code-editor-container :deep(.cm-focused) {
  outline: none !important;
}
</style>
