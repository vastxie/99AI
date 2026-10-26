import { computed, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import { t } from '@/locales'

/**
 * 活动提示即时反映当前状态，不延迟保留已结束的思考 / 工具提示。
 * 运行耗时计时器随 loading 自启停，卸载时清理。
 */

interface ActivityStatusOptions {
  isUserMessage: () => boolean
  loading: () => boolean
  /** 运行中提示（来自消息活动投影），空串表示当前无活动 */
  runningActivityHint: ComputedRef<string>
  /** 计时起点候选值，按优先级排列，取第一个可解析项；全不可解析时按当前时间起算 */
  startedAtCandidates: () => unknown[]
}

function parseActivityTime(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }
  if (typeof value !== 'string' || !value.trim()) return null

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function useActivityStatus(options: ActivityStatusOptions) {
  const { isUserMessage, loading, runningActivityHint, startedAtCandidates } = options

  // ====== 运行耗时计时 ======
  const activityElapsedTick = ref(Date.now())
  let activityElapsedTimer: ReturnType<typeof setInterval> | null = null

  function getActivityStartedAtMs(): number {
    for (const candidate of startedAtCandidates()) {
      const parsed = parseActivityTime(candidate)
      if (parsed !== null) return parsed
    }
    return Date.now()
  }

  function formatRunningElapsed(startedAtMs: number): string {
    const elapsedMs = Math.max(0, activityElapsedTick.value - startedAtMs)
    const totalSeconds = Math.max(1, Math.floor(elapsedMs / 1000))
    if (totalSeconds < 60) return t('activity.seconds', { count: totalSeconds })

    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes < 60) {
      return seconds > 0
        ? t('activity.minutesSeconds', { minutes, seconds })
        : t('activity.minutes', { count: minutes })
    }

    const hours = Math.floor(minutes / 60)
    const restMinutes = minutes % 60
    return restMinutes > 0
      ? t('activity.hoursMinutes', { hours, minutes: restMinutes })
      : t('activity.hours', { count: hours })
  }

  const runningActivityElapsedText = computed(() => {
    if (!loading() || isUserMessage()) return ''
    return formatRunningElapsed(getActivityStartedAtMs())
  })

  function stopActivityElapsedTimer() {
    if (!activityElapsedTimer) return
    clearInterval(activityElapsedTimer)
    activityElapsedTimer = null
  }

  watch(
    () => Boolean(loading() && !isUserMessage()),
    isRunning => {
      stopActivityElapsedTimer()
      if (!isRunning) return

      activityElapsedTick.value = Date.now()
      activityElapsedTimer = setInterval(() => {
        activityElapsedTick.value = Date.now()
      }, 1000)
    },
    { immediate: true }
  )

  const visibleActivityHint = computed(() =>
    loading() && !isUserMessage() ? runningActivityHint.value.trim() : ''
  )

  onUnmounted(stopActivityElapsedTimer)

  return {
    visibleActivityHint,
    runningActivityElapsedText,
  }
}
