<script lang="ts" setup>
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useChatStore, useGlobalStoreWithOut } from '@/store'
import { Copy, Delete, Edit } from '@icon-park/vue-next'
import mermaid from 'mermaid'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const { isMobile } = useBasicLayout()

interface Props {
  chatId?: number
  inversion?: boolean
  content?: string
  modelType?: number
  status?: number
  loading?: boolean
  asRawText?: boolean
  fileInfo?: string
  ttsUrl?: string
  model?: string
  drawId?: string
  extend?: string
  customId?: string
  modelName?: string
  index?: number
}

interface Emit {
  (ev: 'delete'): void
  (ev: 'copy'): void
}

const props = defineProps<Props>()

const emit = defineEmits<Emit>()
const mermaidContainerRef = ref()
const textRef = ref<HTMLElement>()
const chatStore = useChatStore()
const globalStore = useGlobalStoreWithOut()
const isRendering = ref(false)
const isDarkMode = computed(() => document.documentElement.classList.contains('dark'))

// 从内容中提取第一个Mermaid代码块
const extractMermaidContent = computed(() => {
  if (!props.content) return ''

  // 查找 ```mermaid 和 ``` 之间的内容
  const mermaidRegex = /```mermaid\s+([\s\S]*?)```/g
  const matches = [...props.content.matchAll(mermaidRegex)]

  if (matches.length > 0 && matches[0][1]) {
    return matches[0][1].trim()
  }

  return ''
})

// 清理和验证Mermaid内容 - 修复"Syntax error in text"问题
const cleanMermaidContent = (content: string): string => {
  if (!content) return ''

  // 移除可能导致问题的字符和格式
  let cleaned = content
    .replace(/\r\n/g, '\n') // 统一换行符
    .replace(/\r/g, '\n') // 统一换行符
    .trim()

  // 确保内容不为空且有效
  if (!cleaned) return ''

  // 基本的语法验证
  const lines = cleaned.split('\n').filter(line => line.trim())
  if (lines.length === 0) return ''

  return cleaned
}

// 从内容中提取标题（如果有）
const extractTitle = computed(() => {
  if (!props.content) return '流程图'

  // 先查找mermaid代码块前的一级标题
  const lines = props.content.split('\n')
  let foundMermaid = false

  for (const line of lines) {
    if (line.trim().startsWith('```mermaid')) {
      foundMermaid = true
      break
    }
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) {
      return trimmed.substring(2).trim()
    }
  }

  // 如果没有找到标题，再查找整个内容中的第一个一级标题
  if (!foundMermaid) {
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('# ')) {
        return trimmed.substring(2).trim()
      }
    }
  }

  return '流程图'
})

// 初始化mermaid配置
const initializeMermaid = () => {
  mermaid.initialize({
    startOnLoad: false,
    theme: isDarkMode.value ? 'dark' : 'default',
    securityLevel: 'loose',
    logLevel: 'error',
    // 官方解决方案：禁止错误渲染到DOM
    suppressErrorRendering: true,
  })
}

// 渲染mermaid图表
const renderMermaid = async () => {
  if (!mermaidContainerRef.value || !extractMermaidContent.value) return
  if (isRendering.value) return // 防止重复渲染

  isRendering.value = true

  // 添加延迟确保DOM已更新
  setTimeout(async () => {
    try {
      // 清空容器内容
      mermaidContainerRef.value.innerHTML = ''

      // 生成唯一ID
      const uniqueId = `mermaid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

      // 清理可能的mermaid缓存
      if (typeof (mermaid as any).clear === 'function') {
        try {
          ;(mermaid as any).clear()
        } catch (clearError) {
          // 静默处理缓存清理错误
        }
      }

      try {
        // 清理和验证Mermaid内容
        const cleanedContent = cleanMermaidContent(extractMermaidContent.value)

        if (!cleanedContent) {
          displayError('Mermaid内容为空或无效')
          return
        }

        // 渲染图表
        const { svg } = await mermaid.render(uniqueId, cleanedContent)
        if (mermaidContainerRef.value) {
          mermaidContainerRef.value.innerHTML = svg
        }
      } catch (renderError) {
        // 显示渲染错误信息
        displayError(renderError instanceof Error ? renderError.message : String(renderError))
      }
    } catch (error) {
      // 显示异常信息
      displayError(error instanceof Error ? error.message : String(error))
    } finally {
      isRendering.value = false
    }
  }, 50)
}

// 显示错误信息
const displayError = (message: string) => {
  if (!mermaidContainerRef.value) return

  mermaidContainerRef.value.innerHTML = `
    <div class="p-4 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg">
      <h3 class="font-bold mb-2">Mermaid 渲染错误</h3>
      <p class="mb-2">${message}</p>
    </div>
  `
}

// 使用一个变量跟踪内容是否变化
const lastContent = ref('')

onMounted(() => {
  initializeMermaid()
  lastContent.value = extractMermaidContent.value
  renderMermaid()
})

onUnmounted(() => {
  // 组件卸载时的清理工作
})

// 监听内容变化
watch(
  () => extractMermaidContent.value,
  newContent => {
    // 只有当内容发生实际变化时才重新渲染
    if (newContent !== lastContent.value) {
      lastContent.value = newContent
      renderMermaid()
    }
  }
)

// 监听暗黑模式变化
watch(isDarkMode, () => {
  initializeMermaid()
  renderMermaid()
})

// 监听loading状态变化
watch(
  () => props.loading,
  (newLoading, oldLoading) => {
    // 当loading从true变为false时，需要触发渲染
    if (oldLoading === true && newLoading === false) {
      // 添加短暂延迟确保DOM已更新
      setTimeout(() => {
        renderMermaid()
      }, 100)
    }
  }
)

function handleCopy() {
  emit('copy')
}

function handleDelete() {
  emit('delete')
}

// 修改为使用HTML预览器显示流程图
const showFullscreen = () => {
  if (extractMermaidContent.value && extractMermaidContent.value.trim() !== '') {
    // 设置全局存储的内容和类型
    globalStore.updateHtmlContent(extractMermaidContent.value, 'mermaid')
    // 打开HTML预览器
    globalStore.updateHtmlPreviewer(true)
  }
}

defineExpose({ textRef })
</script>

<template>
  <div class="flex flex-col group max-w-full w-full">
    <div ref="textRef" class="leading-relaxed break-words w-full">
      <div class="w-full flex flex-col items-start" :class="isMobile ? '' : 'pr-10'">
        <!-- 卡片容器 -->
        <div
          class="w-full text-base text-gray-800 dark:text-gray-100 rounded-xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-850 p-0 border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col relative font-sans leading-7 tracking-wide transition-all duration-300"
          style="width: 100%"
        >
          <!-- 卡片标题 -->
          <div
            class="px-5 pt-3 pb-3 flex-shrink-0 border-b border-gray-200/30 dark:border-gray-700/30 relative"
          >
            <div
              class="font-medium mb-0 text-gray-900 dark:text-gray-200 text-center text-lg pb-2 relative"
            >
              {{ extractTitle }}
              <div
                class="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-[60px] h-[1px] bg-gradient-to-r from-transparent via-primary-500 to-transparent rounded"
              ></div>
            </div>

            <!-- 编辑按钮 -->
            <div class="group-btn absolute top-3 right-3">
              <button
                @click="showFullscreen"
                disabled
                class="btn-icon btn-md btn-icon-action"
                aria-label="编辑流程图"
              >
                <Edit size="18" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-left">编辑功能即将上线</div>
            </div>
          </div>

          <!-- 卡片内容区域 -->
          <div class="px-5 py-4 flex-1 overflow-hidden relative">
            <!-- 加载状态 -->
            <div
              v-if="loading"
              class="py-8 flex flex-col items-center justify-center h-full min-h-[40vh]"
            >
              <div class="loading-animation mb-3"><span></span></div>
              <span class="text-gray-500 dark:text-gray-400">正在生成流程图，请稍候...</span>
            </div>

            <!-- 正常渲染状态 -->
            <div v-else class="flex w-full relative">
              <!-- 渲染中动画 -->
              <div
                v-if="isRendering"
                class="absolute top-10 left-1/2 transform -translate-x-1/2 z-30 flex items-center justify-center"
              >
                <div class="loading-animation">
                  <span></span>
                </div>
              </div>

              <!-- Mermaid内容容器 -->
              <div
                ref="mermaidContainerRef"
                class="w-full min-h-[40vh] flex justify-center items-center mermaid-content"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="flex transition-opacity duration-300 text-gray-700 opacity-0 group-hover:opacity-100"
    >
      <div>
        <div class="mt-2 flex group">
          <!-- 复制按钮 -->
          <div class="relative group-btn">
            <button
              class="btn-icon btn-sm btn-icon-action mx-1"
              @click="handleCopy"
              aria-label="复制"
            >
              <Copy />
            </button>
            <div v-if="!isMobile" class="tooltip tooltip-top">复制</div>
          </div>

          <!-- 删除按钮 -->
          <div class="relative group-btn">
            <button
              class="btn-icon btn-sm btn-icon-action mx-1"
              @click="handleDelete"
              aria-label="删除"
            >
              <Delete />
            </button>
            <div v-if="!isMobile" class="tooltip tooltip-top">删除</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 加载动画 */
.loading-animation {
  display: inline-block;
  position: relative;
  width: 60px;
  height: 20px;
}

.loading-animation:before,
.loading-animation:after,
.loading-animation span {
  content: '';
  display: block;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #6366f1;
  animation: dotBounce 1.4s infinite ease-in-out;
}

.loading-animation:before {
  left: 0;
  animation-delay: 0s;
}

.loading-animation span {
  left: 26px;
  animation-delay: 0.2s;
}

.loading-animation:after {
  left: 52px;
  animation-delay: 0.4s;
}

@keyframes dotBounce {
  0%,
  80%,
  100% {
    transform: translateY(-50%) scale(0.6);
    opacity: 0.6;
  }
  40% {
    transform: translateY(-50%) scale(1);
    opacity: 1;
  }
}

/* Mermaid样式 */
.mermaid-content :deep(svg) {
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
</style>
