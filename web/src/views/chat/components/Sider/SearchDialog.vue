<script setup lang="ts">
import { MessageCircle, Search, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { fetchSearchChatLogsAPI } from '@/api/chatLog'
import type { ApiResponse } from '@/utils/request'
import ActionIcon from '@/components/common/ActionIcon/index.vue'
import ScrollShadow from '@/components/common/ScrollShadow/index.vue'
import UiDialog from '@/components/common/UiDialog.vue'
import UiStateView from '@/components/common/UiStateView.vue'
import { t, tp } from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import { useConversationNavigator } from '../../composables/useConversationNavigator'

interface Props {
  modelValue: boolean
}

interface SearchResult {
  matchType: 'title' | 'message'
  gid?: string | null
  targetCid?: string | null
  title: string
  snippet?: string
  role?: 'user' | 'assistant' | null
  dateTime?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (ev: 'update:modelValue', value: boolean): void
}>()

const chatStore = useChatStore()
const navigation = useConversationNavigator()
const keyword = ref('')
const loading = ref(false)
const failed = ref(false)
const results = ref<SearchResult[]>([])
/** 键盘高亮的结果（上下键移动、回车打开）；焦点始终留在输入框，结果用 aria-activedescendant 指向 */
const activeIndex = ref(-1)
const inputRef = ref<HTMLInputElement | null>(null)
let searchTimer: number | null = null
let searchRequestId = 0
/** 正在打开选中的结果：按住回车或连按时不重复打开 */
let selecting = false

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const trimmedKeyword = computed(() => keyword.value.trim())
const newConversationLabel = computed(() => t('common.newConversation'))
// 与侧栏同一口径：只列网页端可以打开的会话
const conversationTitleRows = computed<SearchResult[]>(() =>
  chatStore.getSidebarGroupList().map(item => ({
    matchType: 'title',
    gid: item.uuid,
    targetCid: null,
    title: item.title || newConversationLabel.value,
  }))
)
const titleMatchRows = computed(() => {
  const query = trimmedKeyword.value.toLocaleLowerCase()
  if (!query) return []
  return conversationTitleRows.value.filter(row => row.title.toLocaleLowerCase().includes(query))
})
const recentRows = computed<SearchResult[]>(() => conversationTitleRows.value)
const displayRows = computed(() =>
  trimmedKeyword.value ? [...titleMatchRows.value, ...results.value] : recentRows.value
)
/** 读屏播报（对话框里唯一的播报区，下面的状态块不再各自播报）：正在搜索、搜到几条、搜索失败 */
const statusText = computed(() => {
  if (!trimmedKeyword.value) return ''
  if (loading.value) return t('chat.searching')
  if (failed.value) return t('chat.searchFailed')
  return displayRows.value.length
    ? tp('chat.searchResultCount', displayRows.value.length)
    : t('common.noSearchResults')
})

function optionId(index: number) {
  return `search-result-${index}`
}

function rowKey(row: SearchResult) {
  return `${row.matchType}-${row.gid || ''}-${row.targetCid || ''}`
}

// 关键字变了回到第一条；同一个关键字的结果刷新（服务端结果晚到）时保住键盘选中的那条
watch([displayRows, trimmedKeyword], ([rows, query], [previousRows, previousQuery]) => {
  const current = query === previousQuery ? previousRows?.[activeIndex.value] : undefined
  const kept = current ? rows.findIndex(row => rowKey(row) === rowKey(current)) : -1
  activeIndex.value = kept >= 0 ? kept : rows.length ? 0 : -1
})

function moveActive(step: number) {
  const count = displayRows.value.length
  if (!count) return
  activeIndex.value = (activeIndex.value + step + count) % count
  document.getElementById(optionId(activeIndex.value))?.scrollIntoView({ block: 'nearest' })
}

/** 输入框里的上下键移动高亮，Home / End 到头尾，回车打开高亮的结果；输入法组词中的按键不处理 */
function handleInputKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  const count = displayRows.value.length
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(event.key === 'ArrowDown' ? 1 : -1)
  } else if ((event.key === 'Home' || event.key === 'End') && count && event.ctrlKey) {
    event.preventDefault()
    activeIndex.value = event.key === 'Home' ? 0 : count - 1
  } else if (event.key === 'Enter' && activeIndex.value >= 0) {
    event.preventDefault()
    const row = displayRows.value[activeIndex.value]
    if (row) void handleSelect(row)
  }
}

function closeDialog() {
  visible.value = false
}

// 打开时聚焦搜索输入框
const focusSearchInput = () => inputRef.value

function splitHighlight(value?: string) {
  const text = value || ''
  const query = trimmedKeyword.value
  if (!query) return [{ text, active: false }]

  const parts: Array<{ text: string; active: boolean }> = []
  const lowerText = text.toLocaleLowerCase()
  const lowerQuery = query.toLocaleLowerCase()
  let cursor = 0
  let index = lowerText.indexOf(lowerQuery)

  while (index >= 0) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), active: false })
    parts.push({ text: text.slice(index, index + query.length), active: true })
    cursor = index + query.length
    index = lowerText.indexOf(lowerQuery, cursor)
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor), active: false })
  return parts.length > 0 ? parts : [{ text, active: false }]
}

function resolveConversationTitle(gid?: string | null) {
  if (!gid) return ''
  return chatStore.groupList.find(item => item.uuid === gid)?.title || newConversationLabel.value
}

function getRowTitle(row: SearchResult) {
  if (row.matchType === 'message') {
    return resolveConversationTitle(row.gid) || row.title
  }
  return row.title
}

function getRowSnippet(row: SearchResult) {
  if (row.matchType === 'message' && row.gid) {
    return row.snippet || row.title
  }
  return row.snippet || ''
}

async function runSearch() {
  const query = trimmedKeyword.value
  if (!query) {
    searchRequestId += 1
    loading.value = false
    results.value = []
    return
  }

  const currentRequestId = (searchRequestId += 1)
  loading.value = true
  failed.value = false
  try {
    const res = await fetchSearchChatLogsAPI<ApiResponse<{ rows?: SearchResult[] }>>({
      keyword: query,
      limit: 30,
    })
    if (currentRequestId !== searchRequestId || query !== trimmedKeyword.value) return
    results.value = Array.isArray(res?.data?.rows) ? res.data.rows : []
  } catch {
    // 失败时不留上一次的结果；标题匹配仍在本地给出
    if (currentRequestId !== searchRequestId) return
    results.value = []
    failed.value = true
  } finally {
    if (currentRequestId === searchRequestId) loading.value = false
  }
}

/** 重试：重试键随即被「正在搜索」替换，焦点回到搜索框，播报区读出进度 */
function retrySearch() {
  inputRef.value?.focus()
  void runSearch()
}

async function handleSelect(row: SearchResult) {
  if (selecting || !navigation.canNavigate()) return
  selecting = true
  try {
    // 先把目标消息附近的记录取到本地，再跳转；定位由会话页按 focusCid 完成
    const workspaceId = await chatStore.openSearchResult({
      gid: row.gid || null,
      targetCid: row.targetCid || null,
    })
    if (workspaceId) {
      await navigation.openConversation(workspaceId, {
        focusCid: row.targetCid || null,
        checkLock: false,
      })
    }
    closeDialog()
  } finally {
    selecting = false
  }
}

watch(
  () => props.modelValue,
  value => {
    if (!value) return
    searchRequestId += 1
    keyword.value = ''
    loading.value = false
    failed.value = false
    results.value = []
    // 初始聚焦搜索输入框由 useDialogA11y 的 initialFocus 承载
  }
)

watch(
  trimmedKeyword,
  query => {
    if (searchTimer) window.clearTimeout(searchTimer)
    // 关键字变了：上一个关键字的结果作废（在途的请求也不再落地），防抖期间只剩标题匹配，回车选不到旧结果
    searchRequestId += 1
    results.value = []
    // 防抖期间就算在搜：播报区不先报「无结果」，也不沿用上一次的失败
    failed.value = false
    loading.value = Boolean(query)
    searchTimer = window.setTimeout(runSearch, 260)
  },
  { flush: 'post' }
)
</script>

<template>
  <Teleport to="body">
    <UiDialog
      :open="visible"
      layer="dialog-elevated"
      as="section"
      :initial-focus="focusSearchInput"
      class="relative flex h-[min(500px,74vh)] w-[min(720px,calc(100vw-32px))] flex-col overflow-hidden text-text-primary"
      :aria-label="t('common.searchConversation')"
      @close="closeDialog"
    >
      <div class="flex h-14 shrink-0 items-center gap-3 border-b border-app-divider px-4">
        <Search class="shrink-0 text-text-subtle" :size="20" aria-hidden="true" />
        <input
          ref="inputRef"
          v-model="keyword"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="search-results"
          :aria-expanded="displayRows.length > 0"
          :aria-activedescendant="activeIndex >= 0 ? optionId(activeIndex) : undefined"
          :aria-label="t('common.searchConversation')"
          class="min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-subtle"
          :placeholder="t('common.searchChatPlaceholder')"
          autocomplete="off"
          @keydown="handleInputKeydown"
        />
        <ActionIcon :label="t('common.close')" @click="closeDialog">
          <X :size="20" aria-hidden="true" />
        </ActionIcon>
      </div>

      <ScrollShadow
        class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3 transition-[height,min-height,max-height] duration-md ease-out motion-reduce:transition-none"
      >
        <p class="sr-only" role="status" aria-live="polite">{{ statusText }}</p>
        <p
          v-if="!trimmedKeyword && recentRows.length"
          class="type-caption px-3 pb-2 text-text-muted"
        >
          {{ t('chat.historyConversations') }}
        </p>

        <UiStateView
          v-if="!trimmedKeyword && !recentRows.length"
          compact
          :live="false"
          state="empty"
          :message="t('chat.conversationListEmpty')"
        />
        <UiStateView
          v-else-if="loading && !displayRows.length"
          compact
          :live="false"
          state="loading"
        />
        <UiStateView
          v-else-if="failed && !displayRows.length"
          compact
          :live="false"
          state="error"
          :message="t('chat.searchFailed')"
          @retry="retrySearch"
        />
        <div
          v-else-if="trimmedKeyword && !displayRows.length"
          class="type-control px-3 py-8 text-center text-text-muted"
        >
          {{ t('common.noSearchResults') }}
        </div>

        <div
          v-else
          id="search-results"
          role="listbox"
          class="space-y-1"
          :aria-label="t('common.searchConversation')"
        >
          <div
            v-for="(row, index) in displayRows"
            :id="optionId(index)"
            :key="`${row.matchType}-${row.gid || ''}-${row.targetCid || ''}`"
            role="option"
            :aria-selected="index === activeIndex"
            class="menu-list-row group relative flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left"
            :class="{ 'is-keyboard-active': index === activeIndex }"
            @click="handleSelect(row)"
            @pointerenter="activeIndex = index"
          >
            <MessageCircle class="mt-0.5 shrink-0 text-inherit" :size="18" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2">
                <span class="type-control truncate text-text-primary">
                  <template
                    v-for="(part, partIndex) in splitHighlight(getRowTitle(row))"
                    :key="partIndex"
                  >
                    <mark v-if="part.active" class="bg-transparent p-0 font-medium text-text-link">
                      {{ part.text }}
                    </mark>
                    <span v-else>{{ part.text }}</span>
                  </template>
                </span>
                <span v-if="row.dateTime" class="type-caption ml-auto shrink-0 text-text-muted">
                  {{ row.dateTime }}
                </span>
              </span>
              <span
                v-if="getRowSnippet(row)"
                class="type-caption mt-1 block truncate text-text-muted"
              >
                <template
                  v-for="(part, partIndex) in splitHighlight(getRowSnippet(row))"
                  :key="partIndex"
                >
                  <mark v-if="part.active" class="bg-transparent p-0 font-medium text-text-link">
                    {{ part.text }}
                  </mark>
                  <span v-else>{{ part.text }}</span>
                </template>
              </span>
            </span>
          </div>
        </div>
        <!-- 标题匹配还在、消息内容没搜完：看得见原因，也能重试 -->
        <UiStateView
          v-if="trimmedKeyword && failed && displayRows.length"
          compact
          :live="false"
          state="error"
          class="mt-2"
          :message="t('chat.searchFailed')"
          @retry="retrySearch"
        />
      </ScrollShadow>
    </UiDialog>
  </Teleport>
</template>
