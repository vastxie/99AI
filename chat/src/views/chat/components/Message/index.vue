<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { message } from '@/utils/message'
import { computed, inject, provide, ref } from 'vue'
import Avatar from './Avatar.vue'
import MermaidComponent from './Mermaid/index.vue'
import TextComponent from './Text/index.vue'

import { useGlobalStoreWithOut } from '@/store'
import { copyText } from '@/utils/format'

interface Props {
  chatId?: number
  dateTime?: string
  content?: string
  model?: string
  modelName?: string
  modelType?: number
  status?: number
  role?: string
  loading?: boolean
  imageUrl?: string
  ttsUrl?: string
  useFileSearch?: boolean
  fileUrl?: string
  videoUrl?: string
  audioUrl?: string
  drawId?: string
  extend?: string
  customId?: string
  modelAvatar?: string
  action?: string
  taskData?: string
  pluginParam?: string
  progress?: string
  index: number
  promptReference?: string
  networkSearchResult?: string
  fileVectorResult?: string
  tool_calls?: string
  isLast?: boolean
  usingNetwork?: boolean
  usingDeepThinking?: boolean
  usingMcpTool?: boolean
  reasoningText?: string
  taskId?: string
  isWorkflowMessage?: boolean
  nodeType?: string
  stepName?: string
  workflowProgress?: number
}

// 添加计算属性判断是否是用户消息
const isUserMessage = computed(() => props.role === 'user')

// 添加判断是否应显示工作流状态框
const showWorkflowCard = computed(() => {
  return !isUserMessage.value && props.isWorkflowMessage
})

interface Emit {
  (ev: 'regenerate'): void
  (ev: 'delete'): void
}

const { isMobile } = useBasicLayout()
const globalStore = useGlobalStoreWithOut()

// 获取预览器状态
const isPreviewerVisible = computed(
  () =>
    globalStore.showHtmlPreviewer ||
    globalStore.showTextEditor ||
    globalStore.showImagePreviewer ||
    globalStore.isMarkdownPreviewerVisible
)

const props = defineProps<Props>()
const emit = defineEmits<Emit>()
const ms = message()

const textRef = ref<HTMLElement>()

const messageRef = ref<HTMLElement>()

// 从父组件接收onOpenImagePreviewer
const onOpenImagePreviewer =
  inject<(imageUrls: string[], initialIndex: number, mjData?: any) => void>('onOpenImagePreviewer')

// 将onOpenImagePreviewer提供给子组件，确保依赖注入链不断
provide('onOpenImagePreviewer', onOpenImagePreviewer)

function handleDetele() {
  emit('delete')
}

function handleCopy() {
  copyText({ text: props.content ?? '' })
  props.content && ms.success('复制成功！')
}

function handleRegenerate() {
  messageRef.value?.scrollIntoView()
  emit('regenerate')
}
</script>

<template>
  <div ref="messageRef" class="flex w-full my-2 overflow-visible items-start flex-row">
    <div
      v-if="!isUserMessage && !isMobile && !isPreviewerVisible"
      class="items-center justify-center mr-2 rounded-full group-btn relative flex-shrink-0"
    >
      <Avatar
        v-if="!isUserMessage"
        :image="isUserMessage"
        :model="model"
        :modelAvatar="modelAvatar"
      />
      <div class="tooltip tooltip-top">{{ modelName }}</div>
    </div>

    <div class="overflow-visible text-sm items-start w-full">
      <div class="flex items-end gap-1 flex-row">
        <MermaidComponent
          v-if="pluginParam === 'mermaid' && !isUserMessage"
          ref="textRef"
          :isUserMessage="isUserMessage"
          :drawId="drawId"
          :extend="extend"
          :customId="customId"
          :content="content"
          :modelType="modelType"
          :ttsUrl="ttsUrl"
          :model="model"
          :modelName="modelName"
          :loading="loading"
          :status="status"
          :index="index"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDetele"
        />
        <TextComponent
          v-else
          ref="textRef"
          :index="index"
          :modelName="modelName"
          :chatId="chatId"
          :isUserMessage="isUserMessage"
          :content="content"
          :modelType="modelType"
          :imageUrl="imageUrl"
          :ttsUrl="ttsUrl"
          :fileUrl="fileUrl"
          :useFileSearch="useFileSearch"
          :model="model"
          :loading="loading"
          :promptReference="promptReference"
          :networkSearchResult="networkSearchResult"
          :fileVectorResult="fileVectorResult"
          :tool_calls="tool_calls"
          :isLast="isLast"
          :usingNetwork="usingNetwork"
          :usingDeepThinking="usingDeepThinking"
          :usingMcpTool="usingMcpTool"
          :reasoningText="reasoningText"
          :isWorkflowMessage="isWorkflowMessage"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDetele"
        />
      </div>
    </div>
  </div>
</template>
