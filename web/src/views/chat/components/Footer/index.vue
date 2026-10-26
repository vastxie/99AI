<script setup lang="ts">
import {
  ArrowUp,
  CornerDownRight,
  ImagePlus,
  Maximize,
  Minimize,
  Plus,
  Square,
  Trash2,
  X,
} from '@lucide/vue'
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { chatDataEpoch, useChatStore } from '@/store/modules/chat'
import { useComposerAttachmentsStore } from '@/store/modules/chat/attachments'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { confirmDialog } from '@/utils/dialog'
import { message } from '@/utils/message'
import { ChatActionsKey } from '../../chatActions'
import { useConversationNavigator } from '../../composables/useConversationNavigator'
import { useSocketStatus } from '../../composables/useSocketStatus'
import { buildQuotedPrompt } from '../../quotePrompt'
import ModelSelector from '../ModelSelector/index.vue'
import { classifyAttachment, rejectAttachment, UPLOAD_ACCEPT } from './attachmentRules'
import FilePreview from './components/FilePreview.vue'
import { getLocalFilePreviewKey } from './footer.helpers'
import { useComposerAutosize } from './useComposerAutosize'
import { useComposerFiles } from './useComposerFiles'
import { useFollowUpQueue } from './useFollowUpQueue'

/**
 * 输入区：文字、引用、附件都按会话保存在 store 里（空状态与有消息两处输入框切换时会重建本组件）；
 * 空闲时发送新一轮，生成中改为把补充要求排进这一轮，并保留停止。
 */
defineOptions({ inheritAttrs: false })

const emit = defineEmits<{
  'pause-request': []
}>()

const chatActions = inject(ChatActionsKey)
const globalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const chatStore = useChatStore()
const attachmentsStore = useComposerAttachmentsStore()
const { isMobile } = useViewport()
const { isDisconnected } = useSocketStatus()
const { createConversationForSubmit } = useConversationNavigator()
const ms = message()

const siteName = computed(() => authStore.globalConfig?.siteName || '99Agent')
const uploadFileLimit = computed(() => Number(authStore.globalConfig?.uploadFileLimit) || 5)
const uploadFileSizeLimit = computed(
  () => Number(authStore.globalConfig?.uploadFileSizeLimit) || 20
)

const inputRef = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)

const prompt = computed({
  get: () => chatStore.prompt ?? '',
  set: value => chatStore.setPrompt(value || ''),
})
const hasPromptText = computed(() => Boolean(prompt.value.trim()))
const previewQuote = computed(() => chatStore.activeQuote)
/** 当前会话输入框里的附件（选中即在后台上传） */
const attachments = computed(() => attachmentsStore.list(chatStore.active))

// 生效配置统一取 store 的 effectiveModelConfig，与模型选择器、发送链路同源
const activeModel = computed(() => {
  const modelInfo = chatStore.effectiveModelConfig?.modelInfo || {}
  const id = Number(modelInfo.id)
  return {
    model: String(modelInfo.model || chatStore.activeModel || ''),
    modelName: String(modelInfo.modelName || chatStore.activeModelName || 'AI'),
    modelId: Number.isFinite(id) && id > 0 ? id : undefined,
  }
})

const autosize = useComposerAutosize({ input: inputRef, text: () => prompt.value })
const { isExpanded } = autosize

const followUp = useFollowUpQueue({ model: () => activeModel.value })
const {
  queuedText: followUpQueuedText,
  queueing: queueingFollowUp,
  canceling: cancelingFollowUp,
} = followUp
// 生成中输入框切换为「加入下一轮」：提交走队列而不是新开一轮
const isFollowUpInputMode = followUp.isRunning

/** 加一个附件：类型与大小不合规时提示原因，合规的立即在后台上传 */
function addAttachment(file: File) {
  const kind = classifyAttachment(file)
  const rejection = rejectAttachment(file, kind, uploadFileSizeLimit.value)
  if (rejection) ms.warning(rejection)
  else attachmentsStore.add(chatStore.active, file, kind)
}

const files = useComposerFiles({
  fileInput,
  count: () => attachments.value.length,
  limit: () => uploadFileLimit.value,
  add: addAttachment,
  // 与上传按钮同一条件：粘贴、拖放、选择框晚到的结果都不能绕过
  disabled: () => isFollowUpInputMode.value || isSending.value,
})
const { isDragging, isDraggingOverPage } = files

/** 已点发送、这一轮还没开始（上传附件、等服务端接受与 agent.start）：输入框锁住，发送按钮转圈 */
const isSending = computed(
  () => (chatStore.isSubmitting || isUploading.value) && !isFollowUpInputMode.value
)
const isStopping = computed(() => Boolean(chatActions?.isStopping()))
const uploadButtonLabel = computed(() =>
  isFollowUpInputMode.value ? t('chat.attachmentsUnavailableWhileRunning') : t('chat.uploadFile')
)
// 生成中：输入框有字时多出「加入下一轮」，停止按钮始终保留
const shouldShowSendButton = computed(() => !isFollowUpInputMode.value || hasPromptText.value)
const buttonDisabled = computed(
  () =>
    isUploading.value || queueingFollowUp.value || cancelingFollowUp.value || !hasPromptText.value
)
const shouldShowInputActions = computed(
  () => autosize.showsExpandButton.value && !isDraggingOverPage.value
)
const sendTooltip = computed(() => {
  if (isFollowUpInputMode.value) return t('chat.queueFollowUp')
  return isMobile.value ? t('chat.sendMessage') : t('chat.sendShortcutHint')
})
const placeholderText = computed(() => {
  if (isDragging.value) return t('chat.dropFileHere')
  if (isFollowUpInputMode.value) return t('chat.followUpPlaceholder')
  return siteName.value ? t('chat.sendMessageTo', { site: siteName.value }) : t('chat.sendMessage')
})

function focusInput() {
  if (!isMobile.value) inputRef.value?.focus()
}

// 引用进了输入框：桌面上聚焦输入框接着写；手机上关掉挡住输入框的底部面板，让人看到引用已经加上
watch(previewQuote, quote => {
  if (!quote) return
  if (isMobile.value) globalStore.closePanel()
  else focusInput()
})

/** 引用拼在问题前面发出去（写法见 quotePrompt.ts，用户气泡按同样的写法拆开显示） */
function withQuote(text: string) {
  const quoteText = previewQuote.value?.text?.trim()
  if (!quoteText) return text
  return buildQuotedPrompt({ text: quoteText, sourceTitle: previewQuote.value?.sourceTitle }, text)
}

/** 清空输入框：桌面上用编辑命令删除，浏览器的撤销（Ctrl / ⌘ + Z）还能找回；不支持时直接清空 */
function clearInput() {
  const input = inputRef.value
  let deleted = false
  if (input && !isMobile.value) {
    input.focus()
    input.select()
    deleted = document.execCommand?.('delete') ?? false
  }
  if (!deleted) prompt.value = ''
  autosize.reset()
  nextTick(focusInput)
}

/**
 * 排进正在运行的这一轮。回执回来前可能已经切到别的会话：记下排给的是哪个会话，
 * 只清那个会话里这次发出去的文字与引用（等待期间新写的保留）
 */
async function queueFollowUp(text: string, baseText: string) {
  if (attachments.value.length > 0) {
    ms.warning(t('chat.followUpAttachmentsUnsupported'))
    return
  }
  const draftKey = chatStore.active
  const quoteSnapshot = previewQuote.value
  const epoch = chatDataEpoch()
  if (!(await followUp.queue(text, baseText, quoteSnapshot?.id))) return
  // 期间身份换了：草稿与引用属于新身份，不动
  if (chatDataEpoch() !== epoch) return
  if (chatStore.drafts[draftKey] === baseText) chatStore.setDraft(draftKey, '')
  if (quoteSnapshot && chatStore.quotes[draftKey]?.id === quoteSnapshot.id) {
    chatStore.clearQuote(draftKey)
  }
  if (chatStore.active !== draftKey) return
  autosize.reset()
  focusInput()
}

async function handleSubmit() {
  if (isUploading.value || chatStore.isSubmitting) return
  const baseText = prompt.value
  if (!baseText.trim()) return
  const text = withQuote(baseText)
  if (isFollowUpInputMode.value) {
    await queueFollowUp(text, baseText)
    return
  }

  // 草稿、引用与附件按会话保存，发送成功前都不清：失败时原样留在输入区。
  // 记下它们属于哪个会话（在首页发送时建会话后跟着新会话走），发送途中切换会话也清对的那一份
  const quoteSnapshot = previewQuote.value
  // 提交锁：服务端确认前草稿还没清，回车 / 点击可以重复进入，会发出两条请求而前端只保留最后一个订阅。
  // 建会话要等，锁必须在这之前拿到。锁被停止按钮作废或身份换了之后，这次提交不再改草稿、引用与附件
  const lock = chatStore.acquireSubmitLock()
  if (!lock) return
  const owns = () => chatStore.isSubmitLockCurrent(lock)
  try {
    let draftKey = chatStore.active
    if (!draftKey) {
      try {
        draftKey = await createConversationForSubmit()
      } catch {
        // 期间身份换了（建会话、跳转被作废）：静默结束，草稿留着
        return
      }
      if (!draftKey || !owns()) return
    }

    // 附件选中时已在后台上传：这里只等还没传完的
    if (attachmentsStore.list(draftKey).some(item => item.status === 'uploading')) {
      isUploading.value = true
      try {
        await attachmentsStore.settled(draftKey)
      } finally {
        isUploading.value = false
      }
      if (!owns()) return
    }
    const pending = attachmentsStore.list(draftKey)
    const sent = pending.filter(item => item.status === 'uploaded' && item.uploaded)
    const failed = pending.filter(item => item.status !== 'uploaded')

    // 有附件上传失败时，由用户确认是否只发成功的部分，避免「部分发送」被误以为全部发出
    if (failed.length > 0) {
      const sendWithoutFailed = await confirmDialog({
        title: t('chat.attachmentUploadFailedTitle'),
        content: t('chat.attachmentUploadFailedConfirm', {
          names: failed.map(item => item.file.name).join(', '),
        }),
        positiveText: t('chat.sendWithoutFailedAttachments'),
        negativeText: t('common.cancel'),
      })
      if (!owns()) return
      if (!sendWithoutFailed) {
        focusInput()
        return
      }
    }

    try {
      await chatActions!.onConversation({
        msg: text,
        model: activeModel.value.model,
        modelName: activeModel.value.modelName,
        urlItems: sent.map(item => item.uploaded as Chat.UrlItem),
      })
    } catch {
      // 失败原因已由发送方提示；被作废（停止、身份变化）的静默结束
      if (owns()) focusInput()
      return
    }
    // 发送途中被停止按钮作废、或身份换了：草稿、引用、附件都不再由这次提交改动
    if (!owns()) return

    // 只清掉这次发出去的内容：等待期间新输入的文字与新加的引用保留
    if (chatStore.drafts[draftKey] === baseText) chatStore.setDraft(draftKey, '')
    if (quoteSnapshot && chatStore.quotes[draftKey]?.id === quoteSnapshot.id) {
      chatStore.clearQuote(draftKey)
    }
    autosize.reset()
    chatStore.releaseSubmitLock(lock)
    // 发送按钮在发送途中被换掉，焦点会掉到页面上：放回输入框，接着就能写下一句
    focusInput()
    // 只放掉随消息发出的附件，上传失败的留在输入框里可以重试
    attachmentsStore.release(
      draftKey,
      sent.map(item => item.id)
    )

    // 正在预览的待发送附件已随消息发出时，关掉预览面板，不停留在已发送的本地文件上
    const panel = globalStore.rightPreviewPanel
    if (
      panel?.type === 'file' &&
      panel.file.sourceKind === 'local' &&
      sent.some(item => getLocalFilePreviewKey(item.file) === panel.file.key)
    ) {
      globalStore.closePanel()
    }
  } finally {
    // 只释放自己仍持有的锁：已被作废的旧提交结束时不会解开新提交的锁
    chatStore.releaseSubmitLock(lock)
  }
}

/**
 * 输入框按键：桌面回车发送、Shift+回车换行，移动端 Ctrl+回车发送；生成中单按 Esc 停止
 * （带修饰键的 Esc 留给别的快捷键，如 Shift+Esc 聚焦输入框）。
 * 输入法组词期间的按键交给输入法（Safari 结束组词的那次按键 keyCode 为 229）。
 */
function handleComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Escape') {
    const modified = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey
    if (!isFollowUpInputMode.value || modified) return
    event.preventDefault()
    handleStop()
    return
  }
  if (event.key !== 'Enter') return
  if (isMobile.value ? !event.ctrlKey : event.shiftKey) return
  event.preventDefault()
  if (!buttonDisabled.value) void handleSubmit()
}

function handleStop() {
  emit('pause-request')
  // 作废正在进行的提交：锁空出来，那次提交之后不再改草稿、订阅，也不会解开之后的新提交的锁
  chatStore.revokeSubmitLock()
  focusInput()
}

/** 「引导」：输入框有字就把它排进这一轮，没有就聚焦输入框 */
function handleGuideFollowUp() {
  if (prompt.value.trim()) void handleSubmit()
  else nextTick(() => inputRef.value?.focus())
}

onMounted(() => nextTick(focusInput))
</script>

<template>
  <div class="relative" v-bind="$attrs">
    <div class="pointer-events-auto flex flex-col items-center justify-center w-full">
      <footer
        class="flex flex-col items-center justify-center w-full chat-composer-width bg-transparent"
        @dragover="files.onDragOver"
        @dragleave="files.onDragLeave"
        @drop="files.onDrop"
      >
        <div class="chat-footer-input-stack relative w-full">
          <!-- 实时连接断开：回复暂时收不到，socket 会自动重连 -->
          <div v-if="isDisconnected" class="chat-connection-notice" role="status">
            <UiSpinner size="sm" />
            <span>{{ t('chat.connectionLost') }}</span>
          </div>
          <div
            class="chat-footer-input-shell"
            :class="{
              'ring-1 ring-accent': isDragging,
              'border-[color:var(--composer-emphasis-border)] ring-1 ring-[color:var(--composer-emphasis-border)]':
                isFollowUpInputMode,
              'bg-agent-placeholder': isDraggingOverPage,
            }"
            :style="{ minHeight: '1.5rem', position: 'relative' }"
          >
            <FilePreview
              :attachments="attachments"
              :locked="isSending"
              @remove="id => attachmentsStore.remove(chatStore.active, id)"
              @retry="id => attachmentsStore.retry(id)"
            />

            <div
              v-if="previewQuote"
              class="relative mt-2 flex w-full items-start gap-2 rounded-t-2xl rounded-b-md bg-app-sunken px-3 py-2 text-text-secondary shadow-sm"
            >
              <CornerDownRight :size="17" class="mt-0.5 flex-shrink-0 text-text-muted" />
              <div class="min-w-0 flex-1">
                <div
                  class="mb-0.5 flex min-w-0 items-center gap-1 text-xs font-medium text-text-muted"
                >
                  <span class="shrink-0">{{ t('previewer.quote') }}</span>
                  <span v-if="previewQuote.sourceTitle" class="min-w-0 truncate">
                    · {{ previewQuote.sourceTitle }}
                  </span>
                </div>
                <p
                  class="max-h-10 overflow-hidden whitespace-pre-wrap break-words text-sm leading-5 text-text-secondary"
                >
                  {{ previewQuote.text }}
                </p>
              </div>
              <UiTooltip :text="t('previewer.removeQuote')">
                <UiButton
                  icon
                  pill
                  :scale="false"
                  type="button"
                  class="btn-icon-action"
                  :aria-label="t('previewer.removeQuote')"
                  @click="chatStore.clearQuote()"
                >
                  <X :size="15" />
                </UiButton>
              </UiTooltip>
            </div>

            <!-- 排进这一轮的补充要求：跟丢时服务端可能仍在跑、排队也还在，照样显示、可以撤回；
                 「引导」只在生成中有意义 -->
            <div
              v-if="followUpQueuedText"
              class="relative mt-2 flex h-12 w-full items-center justify-start rounded-t-2xl rounded-b-md bg-app-sunken px-3 text-text-secondary shadow-sm"
            >
              <CornerDownRight :size="18" class="mr-2 flex-shrink-0 text-text-muted" />
              <p class="min-w-0 flex-1 truncate pr-3 text-base text-text-secondary">
                {{ followUpQueuedText }}
              </p>

              <div class="ml-2 flex flex-shrink-0 items-center gap-1">
                <UiTooltip :text="t('chat.deleteFollowUp')">
                  <UiButton
                    icon
                    pill
                    :scale="false"
                    type="button"
                    class="btn-icon-action"
                    :disabled="cancelingFollowUp"
                    :aria-label="t('chat.deleteFollowUp')"
                    @click="followUp.cancel"
                  >
                    <Trash2 :size="15" />
                  </UiButton>
                </UiTooltip>
                <UiButton
                  v-if="isFollowUpInputMode"
                  pill
                  :scale="false"
                  type="button"
                  :disabled="queueingFollowUp || cancelingFollowUp || isUploading"
                  @click="handleGuideFollowUp"
                >
                  {{ t('chat.guideFollowUp') }}
                </UiButton>
              </div>
            </div>

            <div class="chat-footer-composer-row">
              <div class="chat-footer-editor relative min-w-0">
                <!-- 长内容操作 -->
                <div
                  v-if="shouldShowInputActions"
                  class="absolute right-2 top-0 z-1 flex items-center gap-1 bg-[var(--chat-input-surface)]"
                >
                  <UiTooltip
                    v-if="prompt && prompt.trim()"
                    class="shrink-0"
                    :text="t('chat.clearContent')"
                    placement="bottom"
                  >
                    <UiButton
                      variant="secondary"
                      icon
                      pill
                      type="button"
                      @click="clearInput"
                      :aria-label="t('chat.clearContent')"
                    >
                      <Trash2 :size="15" />
                    </UiButton>
                  </UiTooltip>

                  <UiTooltip
                    class="shrink-0"
                    :text="isExpanded ? t('chat.collapse') : t('chat.expand')"
                    placement="bottom"
                  >
                    <UiButton
                      variant="secondary"
                      icon
                      pill
                      type="button"
                      @click="autosize.toggleExpanded"
                      :aria-label="
                        isExpanded ? t('chat.collapseInputBox') : t('chat.expandInputBox')
                      "
                    >
                      <Minimize v-if="isExpanded" :size="15" />
                      <Maximize v-else :size="15" />
                    </UiButton>
                  </UiTooltip>
                </div>

                <!-- 拖拽提示覆盖层 - 替代文本区域 -->
                <div v-if="isDraggingOverPage" class="flex h-12 w-full items-center justify-center">
                  <div class="flex items-center justify-center gap-2">
                    <ImagePlus
                      :size="20"
                      :class="isDragging ? 'text-agent-running' : 'text-text-muted'"
                    />
                    <p
                      class="text-center text-sm"
                      :class="isDragging ? 'text-agent-running font-medium' : 'text-text-muted'"
                    >
                      {{ isDragging ? t('chat.dropFileHere') : t('chat.dragFileHere') }}
                    </p>
                  </div>
                </div>

                <!-- 文本区域 - 非拖拽状态显示 -->
                <textarea
                  v-if="!isDraggingOverPage"
                  ref="inputRef"
                  v-model="prompt"
                  :placeholder="placeholderText"
                  rows="1"
                  class="chat-footer-textarea custom-scrollbar"
                  :class="{ 'has-actions': shouldShowInputActions }"
                  :readonly="isSending"
                  :aria-busy="isSending || undefined"
                  @input="autosize.resize"
                  @keydown="handleComposerKeydown"
                  @paste="files.onPaste"
                  :style="{
                    maxHeight: isExpanded ? 'none' : '30vh',
                  }"
                  :aria-label="t('chat.chatMessageInput')"
                  role="textbox"
                ></textarea>
              </div>

              <div class="chat-footer-toolbar">
                <!-- 文件上传按钮区域 -->
                <div class="chat-footer-leading-action">
                  <UiTooltip :text="uploadButtonLabel">
                    <!-- 生成中补充的要求只能是文字：附件按钮停用并说明原因 -->
                    <UiButton
                      variant="ghost"
                      icon
                      pill
                      :scale="false"
                      type="button"
                      :disabled="isFollowUpInputMode || isSending"
                      :aria-label="uploadButtonLabel"
                      @click="files.pick"
                    >
                      <Plus :size="18" aria-hidden="true" />
                    </UiButton>
                  </UiTooltip>

                  <input
                    ref="fileInput"
                    type="file"
                    :accept="UPLOAD_ACCEPT"
                    multiple
                    class="hidden"
                    @change="files.onFileSelect"
                  />
                </div>

                <div class="chat-footer-trailing-actions">
                  <!-- 模型选择器 - 在发送按钮左侧 -->
                  <div class="min-w-0 shrink-1">
                    <ModelSelector menu-position="top-right" />
                  </div>
                  <!-- 生成中的停止按钮放在发送 / 加入下一轮的左边：最右侧始终是发送，顺手点不会误停 -->
                  <UiTooltip
                    v-if="isFollowUpInputMode"
                    class="shrink-0"
                    :text="t('chat.stopGenerating')"
                  >
                    <UiButton
                      :variant="shouldShowSendButton ? 'secondary' : 'primary'"
                      icon
                      pill
                      type="button"
                      class="btn-stop"
                      :disabled="isStopping"
                      :aria-busy="isStopping || undefined"
                      @click="handleStop()"
                      :aria-label="isStopping ? t('chat.stopping') : t('chat.stopGenerating')"
                    >
                      <UiSpinner
                        v-if="isStopping"
                        size="sm"
                        :tone="shouldShowSendButton ? 'current' : 'inverse'"
                      />
                      <Square v-else :size="16" aria-hidden="true" />
                    </UiButton>
                  </UiTooltip>

                  <UiTooltip v-if="shouldShowSendButton" class="shrink-0" :text="sendTooltip">
                    <UiButton
                      variant="primary"
                      icon
                      pill
                      :scale="false"
                      type="button"
                      class="btn-send"
                      :class="{
                        'cursor-not-allowed': buttonDisabled,
                      }"
                      :disabled="buttonDisabled || isSending"
                      :aria-busy="isSending || undefined"
                      @click="handleSubmit()"
                      :aria-label="
                        isSending
                          ? t('chat.sending')
                          : isFollowUpInputMode
                            ? t('chat.queueFollowUp')
                            : t('chat.sendMessage')
                      "
                    >
                      <UiSpinner v-if="isSending" size="sm" tone="inverse" />
                      <ArrowUp v-else :size="20" :stroke-width="2" aria-hidden="true" />
                    </UiButton>
                  </UiTooltip>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>
