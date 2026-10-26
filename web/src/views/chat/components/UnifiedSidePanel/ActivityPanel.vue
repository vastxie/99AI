<script setup lang="ts">
import { X } from '@lucide/vue'
import { useViewport } from '@/hooks/useViewport'
import ActionIcon from '@/components/common/ActionIcon/index.vue'
import ScrollShadow from '@/components/common/ScrollShadow/index.vue'
import { t } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import type { ActivityEvent, ActivityPanelPayload } from '@/types/preview-panel'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getActivityIcon, getActivityTimelineIconClass } from '../activityIcons'
import PanelHeader from './shared/PanelHeader.vue'
import ToolExecutionDetail from './ToolExecutionDetail.vue'

const props = defineProps<{
  activity: ActivityPanelPayload
  close: () => void
  presentation?: 'side' | 'sheet'
}>()

const appStore = useAppStore()
const { isMobile } = useViewport()
const sidebarStateBeforeOpen = ref(true)
let didCollapseSidebar = false
let didLockBodyScroll = false
const isSheetPresentation = computed(() => props.presentation === 'sheet')

/** 思考合并置顶；过程话术与工具按轮次顺序排在后面（每轮先话术后工具） */
const stepEvents = computed(() => props.activity.events.filter(event => event.type !== 'thinking'))
const thinkingEvents = computed(() =>
  props.activity.events.filter(event => event.type === 'thinking')
)

const headerDuration = computed(() => formatDuration(props.activity.duration))

const thinkingDuration = computed(() => {
  return thinkingEvents.value.reduce((total, event) => total + Number(event.duration || 0), 0)
})

const thinkingContent = computed(() => {
  const seen = new Set<string>()
  const contents: string[] = []

  for (const event of thinkingEvents.value) {
    const content = (event.content || event.summary || '').trim()
    if (!content || seen.has(content)) continue
    seen.add(content)
    contents.push(content)
  }

  return contents.join('\n\n')
})

const mergedThinkingEvent = computed<ActivityEvent | null>(() => {
  if (thinkingEvents.value.length === 0) return null
  const isThinking = thinkingEvents.value.some(event => event.status === 'loading')

  return {
    id: 'thinking-merged',
    title: isThinking ? t('activity.thinking') : t('activity.thought'),
    status: isThinking ? 'loading' : 'success',
    type: 'thinking',
    content: thinkingContent.value,
    duration: thinkingDuration.value || undefined,
  }
})

const timelineEvents = computed<ActivityEvent[]>(() => {
  const events: ActivityEvent[] = []
  if (mergedThinkingEvent.value) {
    events.push(mergedThinkingEvent.value)
  }
  events.push(...stepEvents.value)
  return events
})

const panelTitle = computed(() => props.activity.title || t('activity.title'))
function formatDuration(duration?: number): string {
  if (!duration || duration <= 0) return ''
  if (duration < 1000) return t('activity.milliseconds', { count: Math.round(duration) })
  const totalSeconds = Math.round(duration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0
    ? t('activity.minutesSeconds', { minutes, seconds })
    : t('activity.seconds', { count: seconds })
}

function handleClose() {
  cleanupMountedSideEffects()
  props.close()
}

function cleanupMountedSideEffects() {
  if (didCollapseSidebar && !sidebarStateBeforeOpen.value && appStore.siderCollapsed) {
    appStore.setSiderCollapsed(false)
  }
  didCollapseSidebar = false

  if (didLockBodyScroll) {
    document.documentElement.classList.remove('overflow-hidden')
    document.body.classList.remove('overflow-hidden')
  }
  didLockBodyScroll = false
}

onMounted(() => {
  sidebarStateBeforeOpen.value = appStore.siderCollapsed
  if (!isSheetPresentation.value && !appStore.siderCollapsed) {
    appStore.setSiderCollapsed(true)
    didCollapseSidebar = true
  }

  if (!isSheetPresentation.value && isMobile.value) {
    document.documentElement.classList.add('overflow-hidden')
    document.body.classList.add('overflow-hidden')
    didLockBodyScroll = true
  }
})

onUnmounted(() => {
  cleanupMountedSideEffects()
})
</script>

<template>
  <div class="panel-shell">
    <PanelHeader title="" :show-close="false" @close="handleClose">
      <template #tabs>
        <div class="type-control flex min-w-0 items-center gap-1 truncate">
          <span class="min-w-0 truncate text-text-primary">{{ panelTitle }}</span>
          <template v-if="headerDuration">
            <span class="shrink-0 text-text-muted">·</span>
            <span class="shrink-0 font-normal text-text-muted">{{ headerDuration }}</span>
          </template>
        </div>
      </template>
      <template #actions>
        <ActionIcon :label="t('activity.closePanel')" @click="handleClose">
          <X :size="20" />
        </ActionIcon>
      </template>
    </PanelHeader>

    <ScrollShadow
      class="custom-scrollbar min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4"
    >
      <div v-if="timelineEvents.length === 0" class="type-control text-text-muted">
        {{ t('activity.noRecords') }}
      </div>

      <div v-else class="min-w-0 max-w-full">
        <section v-if="timelineEvents.length > 0" class="mb-3 min-w-0">
          <div class="type-control text-text-muted">{{ t('activity.records') }}</div>
        </section>

        <div
          v-for="(event, index) in timelineEvents"
          :key="event.id"
          class="relative min-w-0 max-w-full pb-5 pl-5 last:pb-0"
        >
          <div
            v-if="index < timelineEvents.length - 1"
            class="absolute bottom-3 left-[6px] top-6 w-px bg-panel-border"
          ></div>
          <component
            :is="getActivityIcon(event)"
            class="absolute left-0 top-1 h-[13px] w-[13px] bg-panel"
            :class="getActivityTimelineIconClass(event)"
            :size="13"
          />

          <ToolExecutionDetail :event="event" />
        </div>
      </div>
    </ScrollShadow>
  </div>
</template>
