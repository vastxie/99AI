<script lang="ts" setup>
import { formatQuestionText } from '@99agent/contracts'
import { CircleAlert, CircleStop, Ellipsis, RefreshCw, Trash2, Unplug } from '@lucide/vue'
import { computed, inject, onMounted, ref } from 'vue'
import ActionIcon from '@/components/common/ActionIcon'
import CopyFeedbackIcon from '@/components/common/CopyFeedbackIcon.vue'
import DropdownMenu from '@/components/common/DropdownMenu'
import MenuItem from '@/components/common/DropdownMenu/MenuItem.vue'
import UiButton from '@/components/common/UiButton.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'
import { useCopyFeedback } from '@/composables/useCopyFeedback'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import { t } from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import type { Round } from '@/types/chat'
import type { CodeContentType } from '@/types/preview-panel'
import { ChatActionsKey, ChatReadonlyKey } from '@/views/chat/chatActions'
import ActivitySummaryRow from './ActivitySummaryRow.vue'
import { injectThemeStyles } from './highlightThemeStyles.helpers'
import InterjectionBubble from './InterjectionBubble.vue'
import { getAssistantMarkdownSource, getStreamingMarkdownSource } from './markdownSource.helpers'
import MarkdownVNodeRenderer from './MarkdownVNodeRenderer.vue'
import { mediaPlaceholderStyle } from './mediaGeneration.helpers'
import MediaGenerationPlaceholder from './MediaGenerationPlaceholder.vue'
import MediaOutput from './MediaOutput.vue'
import { messageMarkdown } from './messageMarkdown'
import ReplyFiles from './ReplyFiles.vue'
import ReplyQuestion from './ReplyQuestion.vue'
import { useMediaGenerationPlaceholders } from './useMediaGenerationPlaceholders'
import { useMessageActivityRow } from './useMessageActivityRow'
import { useMessageRounds } from './useMessageRounds'

/**
 * 助手的回复：按轮渲染正文、插话、媒体生成占位与最终产物；正文上方（运行中在下方）一行活动状态；
 * 失败、停止、跟丢时留下状态行与就地操作；结束后出现复制、重新生成与更多操作。
 * 正文只有回答轮的文字，过程话术在还没有回答时显示最新一段（较淡）；agent 选了成果文件时
 * 成果与过程文件集中在回答后面；以提问收尾时最后是问题与可点的选项。
 */
const props = defineProps<{
  cid?: string
  index: number
  content?: string
  status?: number
  createdAt?: string
  startedAt?: string
  loading?: boolean
  model?: string
  modelName?: string
  isLast?: boolean
  message?: string
  progress?: number | string
  error?: boolean
  errorMessage?: string
  /** 服务端说明这次失败不能重试（布尔属性缺省为 false，所以用否定式） */
  retryDisabled?: boolean
  recovery?: Chat.Chat['recovery']
  recoveryMessage?: string
  conversationId?: string
  liveToolCalls?: Chat.LiveToolCall[]
}>()

const emit = defineEmits<{
  delete: []
}>()

const chatActions = inject(ChatActionsKey)
const readonlyChannel = inject(ChatReadonlyKey, null)
const isReadonly = computed(() => Boolean(readonlyChannel?.value))
/** 有一轮正在发出或生成：重新生成、重试与重新连接先停用 */
const isTurnBusy = computed(() => Boolean(chatActions?.isTurnBusy.value))
/** 这条回复自己的停止请求还没有结果（停别的回复时这里的按钮照常可用） */
const isStopping = computed(() => Boolean(props.cid && chatActions?.isStopping(props.cid)))
const globalStore = useGlobalStoreWithOut()
const chatStore = useChatStore()

const {
  parsedMessage,
  rounds,
  activityRounds,
  toolCallsOf,
  streamingText,
  visibleFinalFilesOf,
  streamsRound,
  roundText,
  showsStreamingFallback,
  markdownSourceOf,
  isAnswerRound,
  presentation,
  presentedFiles,
  processFiles,
  question,
  visibleNoteIndex,
} = useMessageRounds(props)

// 回退渲染的源文本只随正文变化重算，不在每次渲染时现算
const streamingFallbackSource = computed(() => getStreamingMarkdownSource(streamingText.value))
const staticContentSource = computed(() => getAssistantMarkdownSource(props.content || ''))

// 活动行要知道有没有媒体占位，媒体占位要知道回合是否在运行：先建活动行，占位用的状态惰性读取
const activityRow = useMessageActivityRow({
  props,
  parsedMessage,
  activityRounds,
  streamingText,
  hasMediaPlaceholder: () => media.hasRunning.value,
})
const media = useMediaGenerationPlaceholders({
  rounds: () => rounds.value,
  toolCallsOf,
  running: () => activityRow.isRunning.value,
})
const { isRunning, row: activity } = activityRow

/**
 * 回复的结局与异常状态：失败、被停止、达到工具轮次上限、输出达到上限（可能没写完），
 * 以及本页跟丢了仍在运行的回复（等用户手动重连 / 正在重连）。
 * 失败原因与操作（重试、重新连接）就地展示，不只靠一次性 toast
 */
const terminalStateKind = computed<
  'failed' | 'stopped' | 'maxRounds' | 'truncated' | 'stalled' | 'reconnecting' | null
>(() => {
  if (props.recovery === 'stalled') return 'stalled'
  if (props.recovery === 'reconnecting') return 'reconnecting'
  if (props.loading) return null
  if (props.error || props.status === ChatLogStatus.FAILED) return 'failed'
  // 输出达到上限的回复按完成保存，靠 turn 上的原因提示可能没写完
  if (props.status === ChatLogStatus.COMPLETED) {
    return parsedMessage.value?.turn?.stopReason === 'length' ? 'truncated' : null
  }
  if (props.status !== ChatLogStatus.STOPPED) return null
  // 达到工具轮次上限是宿主收的尾，和用户点停用同一个 STOPPED 状态，靠 turn 上的原因区分
  return parsedMessage.value?.turn?.stopReason === 'max_rounds' ? 'maxRounds' : 'stopped'
})

const terminalStateLabel = computed(() => {
  switch (terminalStateKind.value) {
    case 'failed':
      return t('chat.generationFailed')
    case 'maxRounds':
      return t('chat.generationMaxRounds')
    case 'truncated':
      return t('chat.generationTruncated')
    case 'stopped':
      return t('chat.generationStopped')
    case 'stalled':
      return t('chat.streamStalled')
    case 'reconnecting':
      return t('chat.streamReconnecting')
    default:
      return ''
  }
})

/** 服务端把失败的回复落库时，失败原因写在 content 里（刷新后没有 errorMessage） */
const isPersistedFailure = computed(
  () => !props.errorMessage && props.status === ChatLogStatus.FAILED
)

/** 状态行里的说明：失败原因、跟丢时的说明 */
const terminalStateDetail = computed(() => {
  if (terminalStateKind.value === 'failed') {
    return (props.errorMessage || (isPersistedFailure.value ? props.content : '') || '').trim()
  }
  if (terminalStateKind.value === 'stalled') return props.recoveryMessage || ''
  return ''
})

/** 失败的回复可以就地重试（服务端说明不能重试的除外）；跟丢的回复可以重新连接 */
const terminalStateAction = computed<'retry' | 'reconnect' | null>(() => {
  if (isReadonly.value) return null
  if (terminalStateKind.value === 'failed' && !props.retryDisabled) return 'retry'
  if (terminalStateKind.value === 'stalled' && props.cid) return 'reconnect'
  return null
})

function runTerminalStateAction() {
  if (terminalStateAction.value === 'retry') void chatActions?.requestRegenerate(props.index)
  if (terminalStateAction.value === 'reconnect' && props.cid) void chatActions?.reconnect(props.cid)
}

/** 跟丢的回复服务端可能仍在跑：除了重新连接，也可以直接停止（停止前不能重新生成它之前的提问） */
function stopStalledReply() {
  if (props.cid) void chatActions?.stop(props.cid)
}

/** 只读的旧数据没有 rounds 时按 content 渲染；落库的失败回复 content 就是失败原因，已在状态行里展示 */
const showsStaticContent = computed(
  () =>
    !props.loading &&
    rounds.value.length === 0 &&
    !isPersistedFailure.value &&
    Boolean(props.content?.trim())
)

/** 过程轮的文字不进正文（见 visibleNoteIndex）；插话、媒体占位与产物仍在原位置 */
function roundHasBody(round: Round, roundIdx: number) {
  return Boolean(
    (isAnswerRound(roundIdx) && round.text?.trim()) ||
    round.interjections?.length ||
    media.placeholderFor(roundIdx) ||
    visibleFinalFilesOf(roundIdx).length > 0
  )
}

/** 代码块展开 / 预览状态按「会话 → 消息 → 轮」记住，切回来时保持 */
const codeBlockScope = (roundIdx: number) =>
  `conversation-${props.conversationId || 'current'}:message-${props.index}:round-${roundIdx}`
const allowCodeBlockWorkspace = computed(() => !isReadonly.value)

function openCodePreview(payload: {
  content: string
  contentType: CodeContentType
  title?: string
  sourceKey?: string
}) {
  const { content, contentType, title, sourceKey } = payload
  globalStore.openPanel({ type: 'code', content, contentType, title, sourceKey })
}

function openImagePreview(src: string) {
  globalStore.updateImagePreviewer(true, [src], 0)
}

/** 问题的选项能点：最后一条、回合已正常完成、没有进行中的回合、不是只读会话 */
const canAnswerQuestion = computed(
  () =>
    Boolean(props.isLast) &&
    !props.loading &&
    props.status === ChatLogStatus.COMPLETED &&
    !isReadonly.value &&
    !isTurnBusy.value
)

/** 点选项即作为下一条消息发出；与输入框共用提交锁，连点或同时在输入框发送都只发一次 */
async function answerQuestion(option: string) {
  if (!canAnswerQuestion.value || !chatActions) return
  const lock = chatStore.acquireSubmitLock()
  if (!lock) return
  try {
    await chatActions.onConversation({ msg: option })
  } catch {
    // 失败原因已由发送方提示；被作废（停止、身份变化）的静默结束
  } finally {
    // 只释放自己仍持有的锁
    chatStore.releaseSubmitLock(lock)
  }
}

const { copied, copy } = useCopyFeedback()

/**
 * 复制的文字：回答轮正文（含流式回退部分）去重后按段拼接，以提问收尾时接上问题与选项；
 * 没有回答时复制正文里显示的那段过程话术，都没有时复制 content
 */
function copyReply() {
  const segments: string[] = []
  const push = (value?: string | null) => {
    const normalized = value?.trim()
    if (normalized && !segments.includes(normalized)) segments.push(normalized)
  }
  rounds.value.forEach((round, roundIdx) => {
    if (isAnswerRound(roundIdx)) push(roundText(round, roundIdx))
  })
  push(showsStreamingFallback.value ? streamingText.value : '')
  if (question.value) push(formatQuestionText(question.value))
  if (segments.length === 0 && visibleNoteIndex.value >= 0) {
    const note = rounds.value[visibleNoteIndex.value]
    if (note) push(roundText(note, visibleNoteIndex.value))
  }
  if (segments.length === 0) push(props.content)
  void copy(segments.join('\n\n'))
}

const isMoreMenuOpen = ref(false)
const modelLabel = computed(() => props.modelName || props.model || '')

function deleteFromMenu(close: () => void) {
  emit('delete')
  close()
}

onMounted(injectThemeStyles)
</script>

<template>
  <div
    class="message-hover-scope text-wrap relative flex w-full flex-col group"
    data-assistant-growth-root="true"
  >
    <!-- 活动行：live / quiet / final 三种形态共用同一节点（见 useMessageActivityRow），
         运行中排在正文下方紧跟输出，结束后换 order 回到正文上方，不重建节点也不做过渡 -->
    <div
      v-if="activity"
      :class="['assistant-content-width', activity.belowBody ? 'order-3 pt-3' : 'order-1 pb-3']"
    >
      <ActivitySummaryRow
        :class="['max-w-full', activity.className]"
        :activity="activity.panel"
        :label="activity.label"
        :suffix="activity.suffix"
        :icon="activity.icon"
        :clickable="activity.clickable"
        :shimmer="activity.mode === 'live'"
        @open="activityRow.openRow"
      />
    </div>

    <div class="message-content-shell relative order-2 w-full max-w-full">
      <div class="message-text-content flex w-full min-w-0 max-w-full overflow-clip">
        <div class="assistant-text-content w-full min-w-0 max-w-full overflow-clip">
          <div data-assistant-content-body class="assistant-content-body">
            <template v-for="(round, roundIdx) in rounds" :key="`round-${roundIdx}`">
              <div
                v-if="roundHasBody(round, roundIdx)"
                :key="`round-body-${roundIdx}`"
                class="round-container flex flex-col gap-2 mb-3 last:mb-0"
              >
                <div
                  v-if="round.text && isAnswerRound(roundIdx)"
                  key="text"
                  class="md-prose chat-markdown assistant-content-width text-chat-assistant-text"
                >
                  <MarkdownVNodeRenderer
                    :source="markdownSourceOf(round, roundIdx)"
                    :markdown="messageMarkdown"
                    :streaming="streamsRound(roundIdx)"
                    :state-scope="codeBlockScope(roundIdx)"
                    :allow-workspace="allowCodeBlockWorkspace"
                    @preview-code="openCodePreview"
                    @preview-image="openImagePreview"
                  />
                </div>

                <div
                  v-if="round.interjections && round.interjections.length > 0"
                  key="interjections"
                  class="flex flex-col gap-1"
                >
                  <InterjectionBubble
                    v-for="(interjection, interjectionIdx) in round.interjections"
                    :key="`interj-${roundIdx}-${interjectionIdx}`"
                    :content="interjection.content"
                  />
                </div>

                <MediaGenerationPlaceholder
                  v-if="media.placeholderFor(roundIdx)"
                  key="media-placeholder"
                  :kind="media.placeholderFor(roundIdx)!.kind"
                  :label="media.placeholderFor(roundIdx)!.label"
                  :sub-label="media.placeholderFor(roundIdx)!.subLabel"
                  :progress-percent="media.placeholderFor(roundIdx)!.progressPercent"
                  :placeholder-style="mediaPlaceholderStyle(media.placeholderFor(roundIdx)!)"
                  @click="activityRow.openLive"
                />

                <div
                  v-if="visibleFinalFilesOf(roundIdx).length > 0"
                  key="files"
                  class="assistant-content-width flex flex-col gap-1"
                >
                  <MediaOutput
                    v-for="(fileOutput, fileIdx) in visibleFinalFilesOf(roundIdx)"
                    :key="`round-file-${roundIdx}-${fileIdx}`"
                    :output="fileOutput"
                    file-mode="inline"
                  />
                </div>
              </div>
            </template>

            <!-- 流式回退：content 比 rounds 多出来的正文 -->
            <div
              v-if="showsStreamingFallback"
              key="streaming-fallback"
              class="md-prose chat-markdown assistant-content-width text-chat-assistant-text"
            >
              <MarkdownVNodeRenderer
                :source="streamingFallbackSource"
                :markdown="messageMarkdown"
                streaming
                :state-scope="codeBlockScope(rounds.length)"
                :allow-workspace="allowCodeBlockWorkspace"
                @preview-code="openCodePreview"
                @preview-image="openImagePreview"
              />
            </div>

            <!-- 只读旧数据回退：没有 rounds 时按 content 渲染 -->
            <div
              v-if="showsStaticContent"
              key="static-fallback"
              class="md-prose chat-markdown assistant-content-width text-chat-assistant-text"
            >
              <MarkdownVNodeRenderer
                :source="staticContentSource"
                :markdown="messageMarkdown"
                :state-scope="codeBlockScope(rounds.length)"
                :allow-workspace="allowCodeBlockWorkspace"
                @preview-code="openCodePreview"
                @preview-image="openImagePreview"
              />
            </div>

            <!-- 还没有回答时（运行中，或只有过程话术就结束了）显示最新一段过程话术：较淡、完整不截断 -->
            <div
              v-if="visibleNoteIndex >= 0 && rounds[visibleNoteIndex]"
              key="process-note"
              class="reply-note md-prose chat-markdown assistant-content-width"
            >
              <MarkdownVNodeRenderer
                :source="markdownSourceOf(rounds[visibleNoteIndex], visibleNoteIndex)"
                :markdown="messageMarkdown"
                :streaming="streamsRound(visibleNoteIndex)"
                :state-scope="codeBlockScope(visibleNoteIndex)"
                :allow-workspace="allowCodeBlockWorkspace"
                @preview-code="openCodePreview"
                @preview-image="openImagePreview"
              />
            </div>

            <!-- agent 选定的成果文件（按清单顺序、带说明）与收起的过程文件 -->
            <ReplyFiles
              v-if="presentation"
              key="reply-files"
              class="mt-3 first:mt-0"
              :presented="presentedFiles"
              :process-outputs="processFiles"
            />

            <!-- 以提问收尾：问题与可点的选项 -->
            <ReplyQuestion
              v-if="question"
              key="reply-question"
              class="mt-3 first:mt-0"
              :question="question"
              :interactive="canAnswerQuestion"
              @answer="answerQuestion"
            />

            <!-- 状态行：失败（附原因与重试）、已停止、跟丢（附重新连接）必须留下可见状态，
                 否则刷新后与正常消息无法区分，且首个 token 之前失败时气泡完全空白 -->
            <div
              v-if="terminalStateLabel"
              key="terminal-status"
              class="assistant-content-width mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 type-control"
              :class="
                terminalStateKind === 'failed' ? 'text-semantic-danger' : 'text-text-secondary'
              "
              role="status"
            >
              <CircleAlert
                v-if="terminalStateKind === 'failed'"
                class="w-3.5 h-3.5 shrink-0"
                aria-hidden="true"
              />
              <Unplug
                v-else-if="terminalStateKind === 'stalled'"
                class="w-3.5 h-3.5 shrink-0"
                aria-hidden="true"
              />
              <UiSpinner v-else-if="terminalStateKind === 'reconnecting'" size="sm" />
              <CircleStop v-else class="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{{ terminalStateLabel }}</span>
              <span
                v-if="terminalStateDetail"
                class="min-w-0 basis-full break-words text-text-secondary [overflow-wrap:anywhere]"
                >{{ terminalStateDetail }}</span
              >
              <UiButton
                v-if="terminalStateAction"
                variant="secondary"
                type="button"
                class="terminal-state-action"
                :disabled="isTurnBusy"
                @click="runTerminalStateAction"
              >
                <RefreshCw :size="14" aria-hidden="true" />
                {{ terminalStateAction === 'retry' ? t('common.retry') : t('chat.reconnect') }}
              </UiButton>
              <UiButton
                v-if="terminalStateAction === 'reconnect'"
                variant="secondary"
                type="button"
                class="terminal-state-action"
                :disabled="isStopping"
                @click="stopStalledReply"
              >
                <CircleStop :size="14" aria-hidden="true" />
                {{ isStopping ? t('chat.stopping') : t('chat.stopGenerating') }}
              </UiButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作栏：只读会话仍可复制，隐藏重新生成等写操作 -->
    <div
      class="message-action-row assistant-action-row order-4 flex max-w-full items-center text-text-secondary opacity-100 pointer-events-auto transition-opacity duration-md"
    >
      <div class="assistant-action-layers assistant-content-width">
        <!-- 运行中隐藏但保留高度（当前活动显示在活动行），结束后直接出现 -->
        <div
          v-show="!isRunning"
          class="assistant-action-layer assistant-controls-slot flex max-w-full min-w-0 items-center gap-1"
          :aria-hidden="isRunning"
          :inert="isRunning || undefined"
        >
          <div
            :class="[
              'flex min-w-0 items-center gap-1 transition-opacity duration-sm',
              isMoreMenuOpen ? 'opacity-100 pointer-events-auto' : 'message-actions-reveal',
            ]"
          >
            <ActionIcon
              variant="ghost"
              :scale="false"
              :label="t('chat.copy')"
              :tooltip="t('chat.copy')"
              tooltip-placement="top"
              @click="copyReply"
            >
              <CopyFeedbackIcon :copied="copied" />
            </ActionIcon>

            <ActionIcon
              v-if="!isReadonly"
              variant="ghost"
              :label="t('chat.regenerate')"
              :tooltip="t('chat.regenerate')"
              tooltip-placement="top"
              :disabled="isTurnBusy"
              @click="chatActions?.requestRegenerate(index)"
            >
              <RefreshCw :size="16" />
            </ActionIcon>

            <DropdownMenu
              v-if="!isReadonly"
              v-model="isMoreMenuOpen"
              trigger="click"
              position="top-center"
              menu-class="menu-action message-more-menu"
              :min-width="'128px'"
              teleport
            >
              <template #trigger="{ triggerProps }">
                <ActionIcon
                  v-bind="triggerProps"
                  variant="ghost"
                  :label="t('chat.more')"
                  :tooltip="isMoreMenuOpen ? undefined : t('chat.more')"
                  tooltip-placement="top"
                >
                  <Ellipsis :size="16" />
                </ActionIcon>
              </template>

              <template #menu="{ close }">
                <div class="menu-action-list">
                  <div v-if="modelLabel" class="menu-action-meta" :title="modelLabel">
                    {{ modelLabel }}
                  </div>
                  <MenuItem @click="() => deleteFromMenu(close)">
                    <template #icon>
                      <Trash2 :size="17" aria-hidden="true" />
                    </template>
                    <span>{{ t('chat.delete') }}</span>
                  </MenuItem>
                </div>
              </template>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* highlight.js 主题由 injectThemeStyles 注入；Markdown 正文的排版规则作用在子组件上，放在 styles/message.css */
.assistant-content-width {
  align-self: flex-start;
  width: 100%;
  max-width: min(48rem, 100%);
  min-width: 0;
  box-sizing: border-box;
}
.md-prose.assistant-content-width {
  display: block;
  /* 正文占满对话栏宽度（其余助手内容仍限 48rem），与样式隔离前的实际效果一致 */
  max-width: 100%;
}
/* 过程话术：与正文同一套排版，颜色降一档，表明它不是回答 */
.reply-note {
  --md-text: var(--text-secondary);
  --md-heading: var(--text-secondary);
}
.assistant-action-row {
  height: 2.25rem;
  min-height: 2.25rem;
  overflow: visible;
}
.assistant-action-layers {
  display: grid;
  height: 2.25rem;
  min-height: 2.25rem;
  overflow: visible;
}
.assistant-action-layer {
  grid-area: 1 / 1;
  height: 2.25rem;
  min-height: 2.25rem;
  overflow: visible;
}
.message-action-row :deep(.action-icon) {
  color: var(--btn-icon-action-text);
}
.message-action-row :deep(.action-icon:hover:not(:disabled)),
.message-action-row :deep(.action-icon:focus-visible) {
  color: var(--btn-icon-action-text-hover);
}
</style>
