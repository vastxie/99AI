<script lang="ts">
import { createMarkdownIt } from '@/utils/markdown/createMarkdownIt'

/** 所有活动条目共用一个 Markdown 实例（每个实例都要编译一遍链接识别的正则） */
const inlineMarkdown = createMarkdownIt({ breaks: true })
</script>

<script setup lang="ts">
import { ChevronDown, ChevronUp, FileSearch, Globe2 } from '@lucide/vue'

import UiSpinner from '@/components/common/UiSpinner.vue'
import { computed, nextTick, ref, watch } from 'vue'
import MediaOutput from '../Message/Text/MediaOutput.vue'
import { t, tp } from '@/locales'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import type { ActivityEvent } from '@/types/preview-panel'
import { getFileContentType } from '@/utils/codeContent'
import {
  cleanMarkdownText,
  cleanSourceTitle,
  cleanText,
  dedupeSourceCards,
  extractHostFromTitle,
  extractSearchQueryFromText,
  extractSourceUrlsFromText,
  extractTitleFromSourceText,
  formatDuration,
  getFaviconUrl,
  getSourceCardLinkAttrs,
  getSourceDisplayUrl,
  getSourceHost,
  isDuplicateMediaSummary,
  isDuplicateText,
  isDuplicateTitlePart,
  isInternalSearchSummary,
  isUrlLikeText,
  normalizePreviewDocumentItem,
  normalizeSourceCard,
  safeHttpUrl,
  type PreviewDocumentItem,
  type SourceCard,
} from './ToolExecutionDetail.helpers'
import {
  isFileSearchActivityDescriptor,
  isWebSearchActivityDescriptor,
} from '../Message/Text/activityTimeline'
import { outputFileName, readFileField } from '../../outputFile'

const props = defineProps<{
  event: ActivityEvent
}>()

const globalStore = useGlobalStoreWithOut()
const thinkingExpanded = ref(false)
const detailExpanded = ref(false)
const detailContentRef = ref<HTMLElement | null>(null)
const thinkingContentRef = ref<HTMLElement | null>(null)
const detailExpandedMaxHeight = ref('40rem')
const thinkingExpandedMaxHeight = ref('18rem')

const toolDisplay = computed(() => ((props.event as any).display || {}) as any)
const output = computed(() => {
  const base =
    props.event.output && typeof props.event.output === 'object' ? { ...props.event.output } : {}
  const display = toolDisplay.value
  if (display?.summary) {
    base.summary = display.summary
    base.content = display.markdown || display.summary
    base.thought = display.markdown || display.summary
  } else if (display?.markdown) {
    base.content = display.markdown
    base.thought = display.markdown
  }
  if (display?.title) base.title = display.title
  if (display?.json && typeof display.json === 'object') {
    const json = display.json
    if (Array.isArray(json.details)) base.details = json.details
    if (Array.isArray(json.results)) base.results = json.results
    if (Array.isArray(json.sources)) base.sources = json.sources
    if (Array.isArray(json.queries)) base.queries = json.queries
    if (json.answer) base.answer = json.answer
    if (json.markdown) base.markdown = json.markdown
    if (json.filePreview) base.filePreview = json.filePreview
    if (json.previewContent) base.previewContent = json.previewContent
    if (json.previewContentType) base.previewContentType = json.previewContentType
    if (json.workflowProgress) base.workflowProgress = json.workflowProgress
  }
  return base
})
/** 思考与过程话术都只是一段文字：同样渲染成可展开的正文 */
const isTextEvent = computed(() => props.event.type === 'thinking' || props.event.type === 'note')
const isSuccess = computed(() => props.event.status === 'success')
const isLoading = computed(() => props.event.status === 'loading')
const isError = computed(() => props.event.status === 'error')

const isInterrupted = computed(() => Boolean(props.event.interrupted))

const statusLabel = computed(() => {
  if (isLoading.value) return t('activity.running')
  if (isInterrupted.value) return t('activity.interrupted')
  if (isError.value) return t('activity.failed')
  return t('activity.completed')
})

// 失败用危险色标出；已中断只是没等到结束，用弱化色
const statusTextClass = computed(() =>
  isError.value && !isInterrupted.value ? 'text-semantic-danger' : 'text-text-muted'
)

const shouldShowStatusLabel = computed(() => isLoading.value || isError.value)

const errorText = computed(() => {
  return props.event.error?.trim() || String((props.event as any).trace?.message || '').trim()
})

const displaySummary = computed(() => {
  const summary = String(
    toolDisplay.value?.summary || props.event.summary || output.value?.summary || ''
  ).trim()
  if (!summary) return ''
  if (isError.value && errorText.value && isDuplicateText(summary, errorText.value)) return ''
  return summary
})

const hasMedia = computed(() => {
  const eventOutput = output.value
  return (eventOutput.files?.length ?? 0) > 0
})

const mediaFileNames = computed(() => {
  return readFileField(output.value?.files)
    .map(file => outputFileName(file))
    .filter(Boolean)
})

const rawSourceText = computed(() => {
  const eventOutput = output.value || {}
  const rawOutput = props.event.output
  return [
    toolDisplay.value?.summary,
    toolDisplay.value?.markdown,
    props.event.summary,
    typeof rawOutput === 'string' ? rawOutput : '',
    eventOutput.summary,
    eventOutput.markdown,
    eventOutput.content,
    eventOutput.thought,
    eventOutput.message,
  ]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join('\n')
})

const sourceDescriptor = computed(() => {
  return [
    props.event.type,
    props.event.title,
    props.event.outputHint,
    props.event.safeInputSummary,
    rawSourceText.value,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
})

const activityIdentityDescriptor = computed(() => {
  return [props.event.toolName, props.event.title, props.event.type].filter(Boolean).join(' ')
})

const isFileSearchToolEvent = computed(() =>
  isFileSearchActivityDescriptor(activityIdentityDescriptor.value)
)

const isReaderToolEvent = computed(() =>
  /reader|url|browser|网页|阅读|读取|crawl|fetch/u.test(sourceDescriptor.value)
)

const isSearchToolEvent = computed(
  () => !isFileSearchToolEvent.value && isWebSearchActivityDescriptor(sourceDescriptor.value)
)

const rawSearchDetails = computed(() => {
  const details = output.value?.details
  const results = output.value?.results
  const sources = output.value?.sources
  const items = [
    ...(Array.isArray(details) ? details : []),
    ...(Array.isArray(results) ? results : []),
    ...(Array.isArray(sources) ? sources : []),
  ]

  return items.filter(
    (detail: any) =>
      detail &&
      typeof detail === 'object' &&
      (detail.title ||
        detail.url ||
        detail.link ||
        detail.href ||
        detail.sourceUrl ||
        detail.domain)
  )
})

const sourceCards = computed<SourceCard[]>(() => {
  let cards = rawSearchDetails.value
    .map((detail: any, index: number) => normalizeSourceCard(detail, index))
    .filter((item): item is SourceCard => Boolean(item))

  if (cards.length === 0) {
    const readerCard = normalizeReaderSourceCard()
    if (readerCard) cards.push(readerCard)
  }

  if (cards.length === 0) {
    cards = parseFallbackSourceCards()
  }

  return dedupeSourceCards(cards)
})

const sourceHeaderDetail = computed(() => {
  const eventOutput = output.value || {}
  const query = getSearchQuery(eventOutput)
  const firstCard = sourceCards.value[0]
  const readerTitle = firstCard
    ? isUrlLikeText(firstCard.title)
      ? firstCard.chipLabel || firstCard.displayUrl || t('activity.webContent')
      : firstCard.title
    : ''

  if (isSearchToolEvent.value) return query
  if (isReaderToolEvent.value) return cleanSourceTitle(readerTitle || query || '', 96)
  return ''
})

const activityTitle = computed(() => {
  const rawTitle = cleanText(props.event.title || t('activity.tool'), 120)
  const normalizedTitle = isSearchToolEvent.value ? t('activity.webSearch') : rawTitle
  const detail = sourceHeaderDetail.value
  if (!detail) return normalizedTitle

  const baseTitle = normalizedTitle.split(/[·•]/u)[0]?.trim() || normalizedTitle
  if (isDuplicateTitlePart(baseTitle, detail)) return baseTitle
  return `${baseTitle} · ${detail}`
})

const visibleSourceChips = computed(() => sourceCards.value.slice(0, 3))
const hiddenSourceChips = computed(() => sourceCards.value.slice(3, 5))
const hiddenSourceCount = computed(() =>
  Math.max(0, sourceCards.value.length - visibleSourceChips.value.length)
)

const visibleSummary = computed(() => {
  if (sourceCards.value.length > 0) return ''
  if (sourceHeaderDetail.value && (isSearchToolEvent.value || isReaderToolEvent.value)) return ''

  const summary = displaySummary.value
  if (!summary) return ''

  if (
    hasMedia.value &&
    mediaFileNames.value.some(fileName => isDuplicateMediaSummary(summary, fileName))
  ) {
    return ''
  }

  return summary
})

const thinkingText = computed(() => {
  if (!isTextEvent.value) return ''
  return props.event.content?.trim() || ''
})

const canExpandThinking = computed(() => {
  return thinkingText.value.length > 120 || thinkingText.value.split(/\n/u).length > 2
})

const documentPreviewItem = computed<PreviewDocumentItem | null>(() => {
  const eventOutput = output.value
  const explicitItem = readFileField(eventOutput.filePreview, { splitUrls: false })
    .map(item => normalizePreviewDocumentItem(item))
    .find(Boolean)
  if (explicitItem) return explicitItem
  return normalizePreviewDocumentItem(eventOutput)
})

const documentTitle = computed(() => {
  return (
    documentPreviewItem.value?.title ||
    output.value?.title ||
    output.value?.fileName ||
    output.value?.filename ||
    t('previewer.viewContent')
  )
})

const documentContent = computed(() => documentPreviewItem.value?.previewContent || '')

const hasDocumentPreview = computed(() => {
  return isSuccess.value && Boolean(documentContent.value)
})

const durationText = computed(() => formatDuration(props.event.duration))

const isSearchEvent = computed(() => {
  return sourceCards.value.length > 0 || isSearchToolEvent.value
})

const isLongDetailSurface = computed(() => {
  if (visibleSummary.value.length > 220) return true
  if (errorText.value.length > 160) return true
  if (documentContent.value.length > 360) return true
  return false
})

const isSourceOnlyDetailSurface = computed(() => {
  return Boolean(
    sourceCards.value.length > 0 &&
    !visibleSummary.value &&
    !thinkingText.value &&
    !errorText.value &&
    !hasDocumentPreview.value &&
    !hasMedia.value
  )
})

const canCollapseDetailSurface = computed(() => {
  if (isTextEvent.value) return false
  if (isSourceOnlyDetailSurface.value) return false
  if (hasMedia.value && !visibleSummary.value && sourceCards.value.length === 0) return false
  return isSearchEvent.value || isLongDetailSurface.value
})

const shouldCollapseDetailSurface = computed(
  () => canCollapseDetailSurface.value && !detailExpanded.value
)

const detailContentClass = computed(() => [
  canCollapseDetailSurface.value ? 'activity-expandable-content' : '',
  shouldCollapseDetailSurface.value
    ? 'activity-soft-collapse activity-detail-content-collapsed'
    : '',
  canCollapseDetailSurface.value && detailExpanded.value ? 'activity-detail-content-expanded' : '',
])

const thinkingContentClass = computed(() => [
  canExpandThinking.value ? 'activity-expandable-content' : '',
  canExpandThinking.value && !thinkingExpanded.value
    ? 'activity-soft-collapse activity-thinking-content-collapsed'
    : '',
  canExpandThinking.value && thinkingExpanded.value
    ? 'activity-thinking-content-expanded overflow-auto overflow-x-hidden pr-1'
    : '',
])

const detailContentStyle = computed<Record<string, string> | undefined>(() => {
  if (canCollapseDetailSurface.value) {
    return { '--activity-expanded-height': detailExpandedMaxHeight.value }
  }
  return undefined
})

const thinkingContentStyle = computed<Record<string, string> | undefined>(() => {
  if (canExpandThinking.value) {
    return { '--activity-expanded-height': thinkingExpandedMaxHeight.value }
  }
  return undefined
})

const hasDetailSurface = computed(() => {
  return Boolean(
    visibleSummary.value ||
    thinkingText.value ||
    errorText.value ||
    sourceCards.value.length > 0 ||
    hasDocumentPreview.value ||
    hasMedia.value
  )
})

const isMediaOnlyDetailSurface = computed(() => {
  return Boolean(
    hasMedia.value &&
    !visibleSummary.value &&
    !thinkingText.value &&
    !errorText.value &&
    sourceCards.value.length === 0 &&
    !hasDocumentPreview.value
  )
})

const detailSurfaceClass = computed(() => [
  'activity-detail-surface',
  isMediaOnlyDetailSurface.value ? 'activity-detail-surface-media-only' : '',
  isSourceOnlyDetailSurface.value ? 'activity-detail-surface-source-only' : '',
])

function renderInlineMarkdown(value: string): string {
  if (!value) return ''
  return inlineMarkdown.renderInline(value)
}

function getSearchQuery(eventOutput: any): string {
  const queries = Array.isArray(eventOutput.queries) ? eventOutput.queries : []
  const firstQuery = queries.find((item: unknown) => typeof item === 'string' && item.trim())
  const safeInputSummary = isInternalSearchSummary(props.event.safeInputSummary)
    ? ''
    : props.event.safeInputSummary
  return (
    cleanSourceTitle(
      firstQuery ||
        eventOutput.query ||
        eventOutput.keyword ||
        eventOutput.searchQuery ||
        eventOutput.q ||
        safeInputSummary,
      96
    ) || extractSearchQueryFromText(rawSourceText.value)
  )
}

function extractHostFromEventTitle(): string {
  return extractHostFromTitle(props.event.title)
}

function parseFallbackSourceCards(): SourceCard[] {
  if (!isReaderToolEvent.value && !isSearchToolEvent.value) return []

  const text = rawSourceText.value
  const titleFromText = extractTitleFromSourceText(text)
  const query = getSearchQuery(output.value || {})
  const urls = extractSourceUrlsFromText(
    `${props.event.title || ''}\n${text}`,
    extractHostFromEventTitle()
  )

  const cards = urls.map((url, index) => {
    const host = getSourceHost(url)
    const title = cleanSourceTitle(titleFromText || query || host || t('activity.webSource'), 120)
    return {
      key: url,
      title,
      url,
      displayUrl: getSourceDisplayUrl(url),
      chipLabel: host || title,
      faviconUrl: getFaviconUrl(url),
      sourceLabel: host,
      snippet: cleanMarkdownText(text, 190),
    }
  })

  return cards
}

function normalizeReaderSourceCard(): SourceCard | null {
  const eventOutput = output.value || {}
  const url =
    safeHttpUrl(
      eventOutput.finalUrl || eventOutput.sourceUrl || eventOutput.url || eventOutput.link
    ) ||
    extractSourceUrlsFromText(
      `${props.event.title || ''}\n${rawSourceText.value}`,
      extractHostFromEventTitle()
    )[0] ||
    safeHttpUrl(extractHostFromEventTitle())
  if (!url || !isReaderToolEvent.value) return null

  const host = getSourceHost(url)
  const readableTitle = extractTitleFromSourceText(rawSourceText.value)
  const rawTitle = isUrlLikeText(eventOutput.title) ? '' : eventOutput.title
  const title = cleanSourceTitle(
    readableTitle || rawTitle || documentTitle.value || host || t('activity.webContent'),
    120
  )
  const snippet = cleanMarkdownText(
    eventOutput.markdown || eventOutput.content || rawSourceText.value,
    210
  )
  const sourceLabel = cleanText(eventOutput.sourceLabel || eventOutput.site || host, 80)

  return {
    key: url,
    title,
    url,
    displayUrl: getSourceDisplayUrl(url),
    chipLabel: host || sourceLabel || title,
    faviconUrl: getFaviconUrl(url),
    sourceLabel,
    snippet,
  }
}

function handleSourceIconError(event: Event) {
  const image = event.currentTarget as HTMLImageElement | null
  if (image) image.classList.add('activity-source-chip-favicon-error')
}

function openDocumentPreview() {
  if (!documentContent.value) return

  globalStore.openPanel({
    type: 'code',
    content: documentContent.value,
    contentType: getFileContentType(
      documentPreviewItem.value?.previewContentType ||
        documentPreviewItem.value?.fileType ||
        output.value?.fileType
    ),
    title: documentTitle.value,
  })
}

function syncExpandableHeights() {
  nextTick(() => {
    const detailHeight = detailContentRef.value?.scrollHeight
    const thinkingHeight = thinkingContentRef.value?.scrollHeight

    if (detailHeight) detailExpandedMaxHeight.value = `${detailHeight}px`
    if (thinkingHeight) thinkingExpandedMaxHeight.value = `${thinkingHeight}px`
  })
}

watch(
  () => props.event.id,
  () => {
    thinkingExpanded.value = false
    detailExpanded.value = false
  }
)

watch(
  [
    hasDetailSurface,
    canCollapseDetailSurface,
    shouldCollapseDetailSurface,
    displaySummary,
    thinkingText,
    errorText,
    sourceCards,
    hasDocumentPreview,
    hasMedia,
    documentContent,
    visibleSummary,
    detailExpanded,
    thinkingExpanded,
  ],
  syncExpandableHeights,
  { immediate: true, flush: 'post' }
)
</script>

<template>
  <div class="type-control min-w-0 max-w-full overflow-hidden">
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <div
            class="min-w-0 flex-1 truncate font-normal"
            :class="isError ? 'text-text-secondary' : 'text-text-primary'"
          >
            {{ activityTitle }}
          </div>
          <span v-if="durationText" class="type-caption shrink-0 whitespace-nowrap text-text-muted">
            {{ durationText }}
          </span>
          <span
            v-if="shouldShowStatusLabel"
            class="type-caption shrink-0 whitespace-nowrap"
            :class="statusTextClass"
          >
            {{ statusLabel }}
          </span>
        </div>
      </div>

      <UiSpinner v-if="isLoading" :size="15" class="mt-0.5 text-text-subtle" />
    </div>

    <div
      v-if="hasDetailSurface"
      class="mt-2 min-w-0 max-w-full space-y-2 overflow-hidden"
      :class="detailSurfaceClass"
    >
      <div
        ref="detailContentRef"
        class="activity-detail-content min-w-0 max-w-full space-y-2"
        :class="detailContentClass"
        :style="detailContentStyle"
      >
        <p
          v-if="visibleSummary"
          class="type-body-sm activity-inline-markdown break-words text-text-secondary [overflow-wrap:anywhere]"
          v-html="renderInlineMarkdown(visibleSummary)"
        ></p>

        <div v-if="thinkingText">
          <div
            ref="thinkingContentRef"
            class="type-body-sm activity-inline-markdown break-words text-text-secondary [overflow-wrap:anywhere]"
            :class="thinkingContentClass"
            :style="thinkingContentStyle"
            v-html="renderInlineMarkdown(thinkingText)"
          ></div>
          <button
            v-if="canExpandThinking"
            type="button"
            class="type-caption mt-1 inline-flex items-center gap-0.5 fg-quiet transition-colors"
            @click="thinkingExpanded = !thinkingExpanded"
          >
            <component :is="thinkingExpanded ? ChevronUp : ChevronDown" :size="12" />
            <span>{{ thinkingExpanded ? t('chat.collapse') : t('chat.expand') }}</span>
          </button>
        </div>

        <p
          v-if="errorText"
          class="type-body-sm break-words text-semantic-danger [overflow-wrap:anywhere]"
        >
          {{ cleanText(errorText, 96) }}
        </p>

        <div v-if="sourceCards.length > 0" class="activity-source-cluster min-w-0 max-w-full">
          <div class="activity-source-chip-row">
            <component
              :is="card.url ? 'a' : 'div'"
              v-for="card in visibleSourceChips"
              :key="card.key"
              class="activity-source-chip"
              v-bind="getSourceCardLinkAttrs(card)"
            >
              <span class="activity-source-chip-icon" aria-hidden="true">
                <Globe2 class="activity-source-chip-globe" :size="12" />
                <img
                  v-if="card.faviconUrl"
                  :src="card.faviconUrl"
                  alt=""
                  class="activity-source-chip-favicon"
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  @error="handleSourceIconError"
                />
              </span>
              <span class="activity-source-chip-label">{{ card.chipLabel }}</span>
            </component>

            <button
              v-if="hiddenSourceCount > 0"
              type="button"
              class="activity-source-chip activity-source-more-chip"
              @click="detailExpanded = !detailExpanded"
            >
              <span
                v-if="hiddenSourceChips.length > 0 && !detailExpanded"
                class="activity-source-more-icons"
                aria-hidden="true"
              >
                <span
                  v-for="card in hiddenSourceChips"
                  :key="`hidden-${card.key}`"
                  class="activity-source-more-icon"
                >
                  <Globe2 class="activity-source-chip-globe" :size="12" />
                  <img
                    v-if="card.faviconUrl"
                    :src="card.faviconUrl"
                    alt=""
                    class="activity-source-chip-favicon"
                    loading="lazy"
                    decoding="async"
                    referrerpolicy="no-referrer"
                    @error="handleSourceIconError"
                  />
                </span>
              </span>
              <span>{{
                detailExpanded
                  ? t('chat.collapse')
                  : tp('activity.showMoreSources', hiddenSourceCount)
              }}</span>
            </button>
          </div>

          <div
            v-if="detailExpanded && sourceCards.length > 3"
            class="activity-source-expanded-list"
          >
            <component
              :is="card.url ? 'a' : 'div'"
              v-for="card in sourceCards.slice(3)"
              :key="`expanded-${card.key}`"
              class="activity-source-expanded-item"
              v-bind="getSourceCardLinkAttrs(card)"
            >
              <span class="activity-source-chip-icon" aria-hidden="true">
                <Globe2 class="activity-source-chip-globe" :size="12" />
                <img
                  v-if="card.faviconUrl"
                  :src="card.faviconUrl"
                  alt=""
                  class="activity-source-chip-favicon"
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  @error="handleSourceIconError"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-text-secondary">{{ card.title }}</span>
                <span class="block truncate text-text-muted">{{ card.displayUrl }}</span>
              </span>
            </component>
          </div>
        </div>

        <div v-if="hasDocumentPreview">
          <button
            type="button"
            class="type-body-sm inline max-w-full cursor-pointer break-words border-0 border-b border-dotted border-[color:var(--text-muted)] bg-transparent p-0 text-left fg-link transition-colors [overflow-wrap:anywhere] hover:border-[var(--text-link-hover)]"
            @click="openDocumentPreview"
          >
            <FileSearch class="mr-1 inline-block align-[-2px]" :size="15" />
            {{ t('activity.previewDocument', { title: documentTitle }) }}
          </button>
        </div>

        <div v-if="hasMedia">
          <MediaOutput :output="output" file-mode="inline" inline-size="sm" inline-tone="muted" />
        </div>
      </div>

      <button
        v-if="canCollapseDetailSurface"
        type="button"
        class="type-caption inline-flex items-center gap-0.5 fg-quiet transition-colors"
        @click="detailExpanded = !detailExpanded"
      >
        <component :is="detailExpanded ? ChevronUp : ChevronDown" :size="12" />
        <span>{{ detailExpanded ? t('chat.collapse') : t('chat.expand') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.activity-inline-markdown {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.activity-inline-markdown :deep(strong) {
  color: var(--text-primary);
  font-weight: 500;
}

.activity-inline-markdown :deep(a) {
  color: var(--agent-running);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.activity-inline-markdown :deep(code) {
  border-radius: var(--radius-md);
  padding: 0.0625rem 0.25rem;
  color: var(--text-primary);
  font-size: 0.92em;
}

.activity-detail-content {
  position: relative;
}

.activity-detail-surface {
  border-radius: var(--radius-2xl);
  background: var(--app-surface-sunken);
  padding: 0.625rem 0.75rem;
}

.activity-detail-surface-media-only {
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.activity-detail-surface-source-only {
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.activity-source-cluster {
  color: var(--text-secondary);
}

.activity-source-chip-row {
  display: flex;
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  gap: 0.375rem 0.45rem;
}

.activity-source-chip {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  min-height: 1.5rem;
  align-items: center;
  gap: 0.3rem;
  border: 0;
  border-radius: var(--radius-full);
  background: var(--app-surface-sunken);
  cursor: default;
  font-family: inherit;
  padding: 0.2rem 0.55rem 0.2rem 0.35rem;
  color: var(--text-muted);
  font-size: var(--type-caption-size);
  line-height: 1.2;
  text-decoration: none;
  transition:
    background-color var(--motion-duration-sm) ease,
    color var(--motion-duration-sm) ease;
}

.activity-source-chip[href],
button.activity-source-chip {
  appearance: none;
  cursor: pointer;
}

.activity-source-chip[href]:hover,
button.activity-source-chip:hover {
  background: color-mix(in srgb, var(--app-surface-sunken) 78%, var(--agent-running) 22%);
  color: var(--text-primary);
}

.activity-source-chip-icon,
.activity-source-more-icon {
  position: relative;
  display: inline-flex;
  width: 1rem;
  height: 1rem;
  flex: 0 0 1rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--app-surface);
  color: var(--text-subtle);
}

.activity-source-chip-globe {
  width: 0.75rem;
  height: 0.75rem;
}

.activity-source-chip-favicon {
  position: absolute;
  inset: 0.0625rem;
  display: block;
  width: 0.875rem;
  height: 0.875rem;
  object-fit: contain;
  border-radius: var(--radius-full);
  background: var(--app-surface);
}

.activity-source-chip-favicon-error {
  display: none;
}

.activity-source-chip-label {
  min-width: 0;
  max-width: 9.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-source-more-chip {
  color: var(--text-muted);
}

.activity-source-more-icons {
  display: inline-flex;
  align-items: center;
}

.activity-source-more-icon {
  box-shadow: 0 0 0 1px var(--app-surface);
}

.activity-source-more-icon + .activity-source-more-icon {
  margin-left: -0.25rem;
}

.activity-source-expanded-list {
  display: grid;
  gap: 0.375rem;
  margin-top: 0.6rem;
}

.activity-source-expanded-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--radius-lg);
  padding: 0.25rem 0.35rem;
  color: inherit;
  font-size: var(--type-caption-size);
  line-height: 1.35;
  text-decoration: none;
}

.activity-source-expanded-item[href]:hover {
  background: color-mix(in srgb, var(--app-surface-sunken) 80%, transparent);
}

.activity-expandable-content {
  overflow: hidden;
  transition: max-height var(--motion-duration-lg) var(--motion-easing);
  will-change: max-height;
}

.activity-soft-collapse {
  overflow: hidden;
}

.activity-detail-content-collapsed {
  max-height: 10.5rem;
}

.activity-detail-content-expanded {
  max-height: var(--activity-expanded-height, 40rem);
}

.activity-thinking-content-collapsed {
  max-height: 3.15rem;
}

.activity-thinking-content-expanded {
  max-height: min(var(--activity-expanded-height, 18rem), 18rem);
}

@media (prefers-reduced-motion: reduce) {
  .activity-expandable-content {
    transition: none;
  }
}
</style>
