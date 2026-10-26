<script setup lang="ts">
import { slotByKey, type PackSlotContribution } from '@/packs'
import { t } from '@/locales'
import { copyText } from '@/utils/clipboard'
import {
  computed,
  defineAsyncComponent,
  defineComponent,
  h,
  inject,
  markRaw,
  type Component,
} from 'vue'
import AssistantMessage from './Text/AssistantMessage.vue'
import UserMessage from './Text/UserMessage.vue'
import { ChatReadonlyKey } from '../../chatActions'

// 特殊内容渲染器（图表类）由扩展包按消息 model 提供并异步加载，不进聊天主 chunk。
// 占位固定 min-height（与渲染器内容区 40vh 一致）防止 chunk 加载完成时滚动跳变。
const ChartChunkLoading = defineComponent({
  name: 'ChartChunkLoading',
  // 异步组件的 loading/error 占位会收到目标组件的全部 fallthrough attrs（含 content 消息全文），
  // 禁用继承避免其落到占位 div 的 DOM 属性上
  inheritAttrs: false,
  setup() {
    return () =>
      h('div', {
        class: 'w-full min-h-[40vh] rounded-xl border border-app-border animate-pulse',
        'aria-busy': 'true',
      })
  },
})

// chunk 拉取失败（弱网 / 资源缺失）的用户可见提示，保持同高占位避免布局跳变
const ChartChunkError = defineComponent({
  name: 'ChartChunkError',
  inheritAttrs: false,
  setup() {
    return () =>
      h(
        'div',
        {
          class:
            'w-full min-h-[40vh] rounded-xl border border-app-border flex items-center justify-center text-text-muted',
        },
        t('common.genericErrorRetry')
      )
  },
})

/** 扩展包登记的消息渲染器（message.renderer 挂载点，按消息 model 匹配；没有登记就按文本渲染） */
const specialRenderers = new Map<string, Component>()
function resolveSpecialRenderer(contribution: PackSlotContribution): Component {
  let renderer = specialRenderers.get(contribution.id)
  if (!renderer) {
    renderer = markRaw(
      defineAsyncComponent({
        loader: contribution.component,
        loadingComponent: ChartChunkLoading,
        errorComponent: ChartChunkError,
        delay: 0,
      })
    )
    specialRenderers.set(contribution.id, renderer)
  }
  return renderer
}

interface Props {
  cid?: string
  content?: string
  model?: string
  modelName?: string
  status?: number
  createdAt?: string
  startedAt?: string
  role?: string
  loading?: boolean
  progress?: number | string
  index: number
  isLast?: boolean
  conversationId?: string
  liveToolCalls?: Chat.LiveToolCall[]
  message?: string
  error?: boolean
  errorMessage?: string
  /** 服务端说明这次失败不能重试（布尔属性缺省为 false，所以用否定式） */
  retryDisabled?: boolean
  recovery?: Chat.Chat['recovery']
  recoveryMessage?: string
}

const props = defineProps<Props>()

const specialRenderer = computed(() => {
  const contribution = props.model ? slotByKey('message.renderer', props.model) : undefined
  return contribution ? resolveSpecialRenderer(contribution) : null
})
const emit = defineEmits<{
  delete: []
}>()

const readonlyChannel = inject(ChatReadonlyKey, null)
const isReadOnlyMode = computed(() => Boolean(readonlyChannel?.value))

// 添加计算属性判断是否是用户消息
const isUserMessage = computed(() => props.role === 'user')

function handleDelete() {
  if (!isReadOnlyMode.value) emit('delete')
}

function handleCopy() {
  if (!isReadOnlyMode.value) {
    void copyText(props.content ?? '')
  }
}
</script>

<template>
  <div
    :class="['chat-message w-full', isUserMessage ? 'chat-message-user' : 'chat-message-assistant']"
  >
    <div class="w-full min-w-0 overflow-visible">
      <component
        v-if="specialRenderer && !isUserMessage"
        :is="specialRenderer"
        :isUserMessage="isUserMessage"
        :content="content"
        :model="model"
        :modelName="modelName"
        :loading="loading"
        :status="status"
        :index="index"
        @copy="handleCopy"
        @delete="handleDelete"
      />
      <UserMessage
        v-else-if="isUserMessage"
        :index="index"
        :cid="cid"
        :content="content"
        :message="props.message"
      />
      <AssistantMessage
        v-else
        :index="index"
        :cid="cid"
        :content="content"
        :status="status"
        :created-at="createdAt"
        :started-at="startedAt"
        :model="model"
        :model-name="modelName"
        :loading="loading"
        :is-last="isLast"
        :conversation-id="conversationId"
        :live-tool-calls="liveToolCalls"
        :progress="progress"
        :message="props.message"
        :error="error"
        :error-message="errorMessage"
        :retry-disabled="retryDisabled"
        :recovery="recovery"
        :recovery-message="recoveryMessage"
        @delete="handleDelete"
      />
    </div>
  </div>
</template>
