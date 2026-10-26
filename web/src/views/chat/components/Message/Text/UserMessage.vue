<script lang="ts" setup>
import { ArrowUp, ChevronDown, ChevronUp, SquarePen, X } from '@lucide/vue'
import { computed, inject, nextTick, ref, watch } from 'vue'
import ActionIcon from '@/components/common/ActionIcon'
import CopyFeedbackIcon from '@/components/common/CopyFeedbackIcon.vue'
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import { useCopyFeedback } from '@/composables/useCopyFeedback'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { parseChatMessage } from '@/utils/messageParser'
import { ChatActionsKey, ChatReadonlyKey } from '@/views/chat/chatActions'
import { buildQuotedPrompt, parseQuotedPrompt } from '@/views/chat/quotePrompt'
import MediaOutput from './MediaOutput.vue'
import { useUserMessageCollapse } from './useUserMessageCollapse'

/**
 * 用户的提问：原文纯文本显示（不套助手正文的 Markdown 归一化，否则公式定界符会被改写），
 * 附带上传的文件；长提问可折叠；可以复制、编辑后重新发送。
 */
const props = defineProps<{
  cid?: string
  index: number
  content?: string
  message?: string
}>()

const { isMobile } = useViewport()
const chatActions = inject(ChatActionsKey)
const readonlyChannel = inject(ChatReadonlyKey, null)
const isReadonly = computed(() => Boolean(readonlyChannel?.value))

const text = computed(() => props.content || '')
/** 带引用发出的提问：拆成引用块和问题显示，不露出拼接用的标签 */
const quoted = computed(() => parseQuotedPrompt(text.value))
const bubbleText = computed(() => quoted.value?.question ?? text.value)
const isEditing = ref(false)
const draft = ref('')
/** 编辑后的提问正在发出：期间回车、发送键都不再发（最长要等到这一轮开始） */
const isSubmitting = ref(false)
/** 有一轮正在发出或生成：编辑重发先停用 */
const isTurnBusy = computed(() => Boolean(chatActions?.isTurnBusy.value))
const textarea = ref<HTMLTextAreaElement | null>(null)
const { copied, copy } = useCopyFeedback()
const collapse = useUserMessageCollapse({
  content: () => bubbleText.value,
  editing: () => isEditing.value,
})

/** 提问附带的文件：消息结构里第一份带 files 的工具输出 */
const attachments = computed(() => {
  for (const round of parseChatMessage(props.message)?.rounds || []) {
    for (const toolCall of round.toolCalls || []) {
      const output = toolCall.display || toolCall.output
      if (output?.files) return output
    }
  }
  return null
})

function fitTextarea() {
  const element = textarea.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

/** 编辑、复制的都是问题本身；带引用的提问编辑后重新拼上原来的引用发出 */
async function startEditing() {
  draft.value = bubbleText.value
  isEditing.value = true
  await nextTick()
  fitTextarea()
  const element = textarea.value
  if (!element) return
  element.focus()
  element.setSelectionRange(element.value.length, element.value.length)
}

function cancelEditing() {
  isEditing.value = false
  draft.value = bubbleText.value
}

function editedPrompt() {
  const quote = quoted.value
  return quote
    ? buildQuotedPrompt({ text: quote.quote, sourceTitle: quote.source }, draft.value)
    : draft.value
}

/** 用户取消了替换后续回答的确认、或发送失败时保留编辑框（失败原因已由发送方提示） */
async function submitEdit() {
  if (isSubmitting.value || !draft.value.trim()) return
  isSubmitting.value = true
  let sent: boolean | undefined
  try {
    sent = await chatActions!.onConversation({
      msg: editedPrompt(),
      cid: props.cid,
      message: props.message,
    })
  } catch {
    return
  } finally {
    isSubmitting.value = false
  }
  if (sent !== false) isEditing.value = false
}

/** 与主输入框一致：桌面回车发送、Shift+回车换行，手机 Ctrl+回车发送；Esc 取消；输入法组词中的按键不处理 */
function handleEditKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEditing()
    return
  }
  if (event.key !== 'Enter') return
  if (isMobile.value ? !event.ctrlKey : event.shiftKey) return
  event.preventDefault()
  // 按住回车的连发不算再次提交
  if (event.repeat || isTurnBusy.value) return
  void submitEdit()
}

watch(draft, () => {
  if (isEditing.value) nextTick(fitTextarea)
})
</script>

<template>
  <div class="message-hover-scope text-wrap relative flex w-full flex-col group">
    <div class="message-content-shell relative order-2 w-full max-w-full">
      <div class="message-text-content flex w-full min-w-0 max-w-full overflow-clip">
        <div
          class="flex justify-end w-full max-w-full overflow-hidden"
          :class="[isEditing ? 'pl-0' : isMobile ? 'pl-20' : 'pl-28']"
        >
          <div v-if="isEditing" class="w-full message-user-edit-shell">
            <blockquote v-if="quoted" class="message-user-quote">
              <span v-if="quoted.source" class="message-user-quote-source">
                {{ quoted.source }}
              </span>
              <span class="message-user-quote-text">{{ quoted.quote }}</span>
            </blockquote>
            <textarea
              ref="textarea"
              v-model="draft"
              class="min-w-full text-base resize-none overflow-y-auto bg-transparent whitespace-pre-wrap text-text-primary"
              style="max-height: 60vh"
              :aria-label="t('chat.editQuestion')"
              @keydown="handleEditKeydown"
            ></textarea>
            <div class="flex items-center justify-end gap-2 mt-3">
              <UiTooltip :text="t('common.cancel')">
                <UiButton
                  variant="ghost"
                  icon
                  pill
                  :scale="false"
                  type="button"
                  :aria-label="t('common.cancel')"
                  @click="cancelEditing"
                >
                  <X :size="18" aria-hidden="true" />
                </UiButton>
              </UiTooltip>
              <UiTooltip :text="t('chat.sendMessage')">
                <UiButton
                  variant="primary"
                  icon
                  pill
                  :scale="false"
                  type="button"
                  class="btn-send"
                  :disabled="!draft.trim() || isSubmitting || isTurnBusy"
                  :aria-label="t('chat.sendMessage')"
                  @click="submitEdit"
                >
                  <ArrowUp :size="20" :stroke-width="2" aria-hidden="true" />
                </UiButton>
              </UiTooltip>
            </div>
          </div>
          <div v-else class="user-message-width flex flex-col gap-2 items-end max-w-full">
            <MediaOutput v-if="attachments" :output="attachments" variant="user-message" />
            <div v-if="text" class="message-user-bubble">
              <blockquote v-if="quoted" class="message-user-quote">
                <span v-if="quoted.source" class="message-user-quote-source">
                  {{ quoted.source }}
                </span>
                <span class="message-user-quote-text">{{ quoted.quote }}</span>
              </blockquote>
              <div
                :ref="collapse.contentRef"
                class="message-user-bubble-content"
                :style="collapse.contentStyle.value"
                v-text="bubbleText"
              />
              <button
                v-if="collapse.isLong.value"
                type="button"
                class="message-user-expand-button"
                :aria-expanded="collapse.isExpanded.value"
                @click="collapse.toggle"
              >
                <span>{{ collapse.isExpanded.value ? t('chat.collapse') : t('chat.expand') }}</span>
                <ChevronUp v-if="collapse.isExpanded.value" :size="14" />
                <ChevronDown v-else :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作栏：悬停、键盘焦点进入消息、触屏设备上显示（规则见 styles/message.css）；只读会话不显示 -->
    <div
      v-if="!isReadonly"
      :class="[
        'message-action-row user-message-action-row order-4 mt-1 flex min-h-[2.25rem] max-w-full items-center justify-end text-text-secondary transition-opacity duration-md',
        isEditing ? 'opacity-100 pointer-events-auto' : 'message-actions-reveal',
      ]"
    >
      <div
        v-if="!isEditing"
        class="flex max-w-full flex-wrap items-center justify-end gap-1 pt-0 group"
      >
        <ActionIcon
          variant="ghost"
          :scale="false"
          :label="t('chat.copy')"
          :tooltip="t('chat.copy')"
          tooltip-placement="top"
          @click="copy(bubbleText)"
        >
          <CopyFeedbackIcon :copied="copied" />
        </ActionIcon>
        <ActionIcon
          variant="ghost"
          :label="t('chat.editQuestion')"
          :tooltip="t('chat.editQuestion')"
          tooltip-placement="top"
          @click="startEditing"
        >
          <SquarePen :size="16" />
        </ActionIcon>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-action-row :deep(.action-icon) {
  color: var(--btn-icon-action-text);
}
.message-action-row :deep(.action-icon:hover:not(:disabled)),
.message-action-row :deep(.action-icon:focus-visible) {
  color: var(--btn-icon-action-text-hover);
}
.user-message-width {
  max-width: 100%;
}
.message-user-quote {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  margin: 0 0 0.5rem;
  border-left: 2px solid var(--app-border-strong);
  padding-left: 0.625rem;
  color: var(--text-secondary);
  font-size: var(--type-meta-size);
  line-height: 1.25rem;
}
.message-user-quote-source {
  color: var(--text-muted);
  font-weight: 500;
}
.message-user-quote-text {
  display: -webkit-box;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
@media (min-width: 768px) {
  .user-message-width {
    max-width: min(48rem, 100%);
  }
}
</style>
