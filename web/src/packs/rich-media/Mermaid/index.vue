<script lang="ts" setup>
import { loadKatex } from '@/utils/markdown/katex'
import UiButton from '@/components/common/UiButton.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'

import { Copy, SquarePen, Trash2 } from '@lucide/vue'
import { useViewport } from '@/hooks/useViewport'
import { resolvedClientThemeMode } from '@/utils/themeMode'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import mermaid from 'mermaid'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { isMobile } = useViewport()
const { t } = useI18n()

interface Props {
  cid?: string
  content?: string
  status?: number
  loading?: boolean
  model?: string
  modelName?: string
  index?: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  delete: []
  copy: []
}>()
const mermaidContainerRef = ref()
const globalStore = useGlobalStoreWithOut()
const isRendering = ref(false)
const isDarkMode = computed(() => resolvedClientThemeMode.value === 'dark')

// 从内容中提取第一个Mermaid代码块
const extractMermaidContent = computed(() => {
  if (!props.content) return ''

  // 查找 ```mermaid 和 ``` 之间的内容
  const mermaidRegex = /```mermaid\s+([\s\S]*?)```/gu
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
  let cleaned = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim()

  // 确保内容不为空且有效
  if (!cleaned) return ''

  // 基本的语法验证
  const lines = cleaned.split('\n').filter(line => line.trim())
  if (lines.length === 0) return ''

  return cleaned
}

// 从内容中提取标题（如果有）
const extractTitle = computed(() => {
  if (!props.content) return t('chat.flowchart')

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
      return trimmed.slice(2).trim()
    }
  }

  // 如果没有找到标题，再查找整个内容中的第一个一级标题
  if (!foundMermaid) {
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('# ')) {
        return trimmed.slice(2).trim()
      }
    }
  }

  return t('chat.flowchart')
})

// 初始化mermaid配置
const initializeMermaid = () => {
  mermaid.initialize({
    startOnLoad: false,
    theme: isDarkMode.value ? 'dark' : 'default',
    // mermaid 12 把默认外观改成 neo，并把流程图、类图、状态图、ER 图、需求图的默认布局改成 ELK；
    // 这里沿用 classic 与 dagre，保持原有排版和配色（思维导图、泳道图等仍用各自的默认布局）
    look: 'classic',
    securityLevel: 'strict',
    // 官方解决方案：禁止错误渲染到DOM
    suppressErrorRendering: true,
    flowchart: {
      htmlLabels: false,
      layout: 'dagre',
    },
    class: { layout: 'dagre' },
    state: { layout: 'dagre' },
    er: { layout: 'dagre' },
    requirement: { layout: 'dagre' },
  })
}

/** 渲染途中内容又变了（流式输出）：这一次画完后按最新内容再画一次，不丢掉最后的内容 */
let rerenderQueued = false

// 渲染mermaid图表：流式输出时间隔长一些（内容还在变，少画几次），结束后照常
const renderMermaid = () => {
  if (!mermaidContainerRef.value || !extractMermaidContent.value) return
  if (isRendering.value) {
    rerenderQueued = true
    return
  }

  isRendering.value = true

  // 添加延迟确保DOM已更新
  setTimeout(
    async () => {
      try {
        // 清空容器内容
        mermaidContainerRef.value.innerHTML = ''

        // 生成唯一ID
        const uniqueId = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

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
            displayError(t('previewer.mermaidContentInvalid'))
            return
          }

          // 渲染图表
          // 图里有公式（$$…$$）时 Mermaid 用 KaTeX 排版：先按需加载 KaTeX 与它的样式
          if (cleanedContent.includes('$$')) await loadKatex().catch(() => undefined)
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
        if (rerenderQueued) {
          rerenderQueued = false
          renderMermaid()
        }
      }
    },
    props.loading ? 300 : 50
  )
}

// 显示错误信息
const displayError = (message: string) => {
  if (!mermaidContainerRef.value) return

  const wrapper = document.createElement('div')
  wrapper.className = 'p-4 text-semantic-danger rounded-lg'
  wrapper.style.background = 'color-mix(in srgb, var(--semantic-danger) 10%, transparent)'

  const title = document.createElement('h3')
  title.className = 'font-bold mb-2'
  title.textContent = t('previewer.mermaidRenderError')

  const description = document.createElement('p')
  description.className = 'mb-2'
  description.textContent = message

  wrapper.append(title, description)
  mermaidContainerRef.value.replaceChildren(wrapper)
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

// 使用统一右侧预览面板显示流程图
const showFullscreen = () => {
  if (extractMermaidContent.value && extractMermaidContent.value.trim() !== '') {
    globalStore.openPanel({
      type: 'code',
      content: extractMermaidContent.value,
      contentType: 'mermaid',
    })
  }
}
</script>

<template>
  <div class="flex flex-col group max-w-full w-full">
    <div class="leading-relaxed break-words w-full">
      <div class="w-full flex flex-col items-start" :class="isMobile ? '' : 'pr-10'">
        <!-- 卡片容器 -->
        <div
          class="w-full text-base text-text-primary rounded-xl p-0 border border-app-border shadow-sm flex flex-col relative font-sans leading-7 tracking-wide transition-colors duration-xl"
          style="
            width: 100%;
            background: linear-gradient(135deg, var(--app-surface), var(--app-surface-sunken));
          "
        >
          <!-- 卡片标题 -->
          <div class="px-5 pt-3 pb-3 flex-shrink-0 border-b border-app-divider relative">
            <div class="font-medium mb-0 text-text-primary text-center text-lg pb-2 relative">
              {{ extractTitle }}
              <div
                class="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-[60px] h-[1px] bg-gradient-to-r from-transparent via-accent to-transparent rounded"
              ></div>
            </div>

            <!-- 编辑按钮 -->
            <div class="absolute top-3 right-3">
              <UiTooltip :text="t('chat.editFlowchart')" placement="left">
                <UiButton
                  icon
                  type="button"
                  @click="showFullscreen"
                  class="btn-icon-action"
                  :aria-label="t('chat.editFlowchart')"
                >
                  <SquarePen :size="18" />
                </UiButton>
              </UiTooltip>
            </div>
          </div>

          <!-- 卡片内容区域 -->
          <div class="px-5 py-4 flex-1 overflow-hidden relative">
            <!-- 加载状态 -->
            <div
              v-if="loading"
              class="py-8 flex flex-col items-center justify-center h-full min-h-[40vh]"
            >
              <UiSpinner size="lg" tone="link" class="mb-3" />
              <span class="text-text-muted">{{ t('chat.generating') }}</span>
            </div>

            <!-- 正常渲染状态 -->
            <div v-else class="flex w-full relative">
              <!-- 渲染中动画 -->
              <div
                v-if="isRendering"
                class="absolute top-10 left-1/2 transform -translate-x-1/2 z-1 flex items-center justify-center"
              >
                <UiSpinner size="lg" tone="link" />
              </div>

              <!-- Mermaid内容容器 -->
              <div
                @click="showFullscreen"
                ref="mermaidContainerRef"
                class="w-full min-h-[40vh] flex justify-center items-center mermaid-content"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="flex transition-opacity duration-xl text-text-secondary opacity-0 group-hover:opacity-100"
    >
      <div>
        <div class="mt-2 flex group">
          <!-- 复制按钮 -->
          <UiTooltip :text="t('chat.copy')">
            <UiButton
              icon
              type="button"
              class="btn-icon-action mx-1"
              @click="handleCopy"
              :aria-label="t('chat.copy')"
            >
              <Copy />
            </UiButton>
          </UiTooltip>

          <!-- 删除按钮 -->
          <UiTooltip :text="t('chat.delete')">
            <UiButton
              icon
              type="button"
              class="btn-icon-action mx-1"
              @click="handleDelete"
              :aria-label="t('chat.delete')"
            >
              <Trash2 />
            </UiButton>
          </UiTooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Mermaid样式 */
.mermaid-content :deep(svg) {
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
</style>
