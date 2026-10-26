import { computed, onUnmounted, ref, watch } from 'vue'
import { t } from '@/locales'
import type { Round, ToolCall } from '@/types/chat'
import {
  getMediaGenerationAspectRatio,
  getMediaGenerationKind,
  getPresentationProgressSubtitle,
  getWorkflowProgress,
  stableRandom,
  type MediaGenerationPlaceholder,
} from './mediaGeneration.helpers'

/**
 * 图片、视频、演示文稿生成中的占位框。
 *
 * 进度按工具给的预估时长在本地推进（每秒一次，先快后慢，封顶 98%），与服务端上报的进度取大，只增不减；
 * 回合不在运行时不出占位，计时器随之停掉。
 */
export function useMediaGenerationPlaceholders(options: {
  rounds: () => Round[]
  /** 该轮的工具调用（含尚未写进 rounds 的实时进度） */
  toolCallsOf: (round: Round, roundIdx: number) => ToolCall[]
  running: () => boolean
}) {
  const now = ref(Date.now())
  const maxPercentByKey = new Map<string, number>()
  let timer: ReturnType<typeof setInterval> | null = null

  function estimateProgress(toolCall: any): number | undefined {
    const progress =
      toolCall?.estimatedProgress ||
      toolCall?.display?.estimatedProgress ||
      toolCall?.output?.estimatedProgress
    if (!progress) return undefined

    const id = String(toolCall?.id || '')
    const key = String(progress.key || '')
    const startedAt = Number(progress.startedAt)
    const estimatedTotalMs = Number(progress.estimatedTotalMs)
    if (!id || !key || !Number.isFinite(startedAt) || !Number.isFinite(estimatedTotalMs)) {
      return Number.isFinite(Number(progress.percent)) ? Number(progress.percent) : undefined
    }

    const cacheKey = `${id}:${key}:${startedAt}`
    const seed = `${id}:${key}`
    const start = stableRandom(`${seed}:start`, 0.03, 0.08)
    const cap = stableRandom(`${seed}:cap`, 0.96, 0.98)
    const raw = Math.max(0, Math.max(0, now.value - startedAt) / Math.max(estimatedTotalMs, 1))
    const eased = 1 - Math.pow(1 - Math.min(raw, 1), 2.2)
    const localPercent = Math.max(
      1,
      Math.min(98, Math.floor((start + (cap - start) * eased) * 100))
    )
    const reported = Number.isFinite(Number(progress.percent))
      ? Math.min(98, Number(progress.percent))
      : 0
    const next = Math.max(maxPercentByKey.get(cacheKey) || 0, reported, localPercent)
    maxPercentByKey.set(cacheKey, next)
    return next
  }

  function placeholderOf(round: Round, roundIdx: number): MediaGenerationPlaceholder | null {
    const mediaTool = options
      .toolCallsOf(round, roundIdx)
      .findLast(toolCall => getMediaGenerationKind(toolCall))
    const kind = mediaTool ? getMediaGenerationKind(mediaTool) : null
    if (!mediaTool || !kind) return null

    let label = t('activity.generatingImage')
    if (kind === 'video') label = t('activity.generatingVideo')
    if (kind === 'presentation') {
      label = getWorkflowProgress(mediaTool)?.label || t('activity.generatingPresentation')
    }
    return {
      kind,
      label,
      subLabel: getPresentationProgressSubtitle(mediaTool),
      aspectRatio: kind === 'presentation' ? '16:9' : getMediaGenerationAspectRatio(mediaTool),
      progressPercent: estimateProgress(mediaTool),
    }
  }

  const placeholders = computed(() => {
    const map = new Map<number, MediaGenerationPlaceholder>()
    if (!options.running()) return map
    options.rounds().forEach((round, roundIdx) => {
      const placeholder = placeholderOf(round, roundIdx)
      if (placeholder) map.set(roundIdx, placeholder)
    })
    return map
  })
  const hasRunning = computed(() => placeholders.value.size > 0)

  function stopTimer() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  watch(
    hasRunning,
    running => {
      if (!running) {
        stopTimer()
        maxPercentByKey.clear()
        return
      }
      if (timer) return
      now.value = Date.now()
      timer = setInterval(() => {
        now.value = Date.now()
      }, 1000)
    },
    { immediate: true }
  )
  onUnmounted(stopTimer)

  return {
    placeholderFor: (roundIdx: number) => placeholders.value.get(roundIdx) || null,
    hasRunning,
  }
}
