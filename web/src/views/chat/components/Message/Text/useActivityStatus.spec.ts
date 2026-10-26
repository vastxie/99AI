import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref } from 'vue'

vi.mock('@/locales', () => ({
  t: (key: string, named?: Record<string, unknown>) =>
    named ? `${key}|${JSON.stringify(named)}` : key,
  tp: (key: string, count: number, named?: Record<string, unknown>) =>
    `${key}|${JSON.stringify({ count, ...named })}`,
}))

import { useActivityStatus } from './useActivityStatus'

/** 在真实组件 setup 中运行 composable，保证 watch / onUnmounted 生命周期生效 */
function mountActivityStatus(options: {
  isUserMessage?: boolean
  loading: ReturnType<typeof ref<boolean>>
  hint: ReturnType<typeof ref<string>>
  startedAt?: unknown
}) {
  let exposed!: ReturnType<typeof useActivityStatus>
  const wrapper = mount(
    defineComponent({
      setup() {
        exposed = useActivityStatus({
          isUserMessage: () => Boolean(options.isUserMessage),
          loading: () => Boolean(options.loading.value),
          runningActivityHint: computed(() => options.hint.value || ''),
          startedAtCandidates: () => [options.startedAt],
        })
        return () => null
      },
    })
  )
  return { wrapper, exposed }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-11T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useActivityStatus 运行耗时计时', () => {
  it('按计时起点输出已运行时长，并随定时器推进（正例）', async () => {
    const loading = ref(true)
    const hint = ref('')
    const { wrapper, exposed } = mountActivityStatus({
      loading,
      hint,
      startedAt: Date.now() - 5000,
    })

    expect(exposed.runningActivityElapsedText.value).toBe('activity.seconds|{"count":5}')

    vi.advanceTimersByTime(61000)
    expect(exposed.runningActivityElapsedText.value).toBe(
      'activity.minutesSeconds|{"minutes":1,"seconds":6}'
    )

    wrapper.unmount()
  })

  it('非加载态与用户消息不输出计时（反例）', async () => {
    const loading = ref(false)
    const hint = ref('')
    const { wrapper, exposed } = mountActivityStatus({ loading, hint, startedAt: Date.now() })
    expect(exposed.runningActivityElapsedText.value).toBe('')
    wrapper.unmount()

    const userCase = mountActivityStatus({
      isUserMessage: true,
      loading: ref(true),
      hint: ref(''),
      startedAt: Date.now(),
    })
    expect(userCase.exposed.runningActivityElapsedText.value).toBe('')
    userCase.wrapper.unmount()
  })

  it('计时起点不可解析时按当前时间起算（边界）', () => {
    const { wrapper, exposed } = mountActivityStatus({
      loading: ref(true),
      hint: ref(''),
      startedAt: 'not-a-date',
    })
    // 起点回落为 now，elapsed=0 → 至少展示 1 秒
    expect(exposed.runningActivityElapsedText.value).toBe('activity.seconds|{"count":1}')
    wrapper.unmount()
  })
})

describe('useActivityStatus 提示跟随当前活动', () => {
  it('新提示立即展示，活动变化时立即替换', async () => {
    const hint = ref('')
    const { wrapper, exposed } = mountActivityStatus({ loading: ref(true), hint })

    hint.value = '提示A'
    await vi.advanceTimersByTimeAsync(0)
    expect(exposed.visibleActivityHint.value).toBe('提示A')

    vi.advanceTimersByTime(500)
    hint.value = '提示B'
    await vi.advanceTimersByTimeAsync(0)
    expect(exposed.visibleActivityHint.value).toBe('提示B')

    wrapper.unmount()
  })

  it('开始输出正文或活动结束时立即清除，不保留旧状态', async () => {
    const hint = ref('')
    const { wrapper, exposed } = mountActivityStatus({ loading: ref(true), hint })

    hint.value = '提示A'
    await vi.advanceTimersByTimeAsync(0)

    vi.advanceTimersByTime(600)
    hint.value = ''
    await vi.advanceTimersByTimeAsync(0)
    expect(exposed.visibleActivityHint.value).toBe('')

    wrapper.unmount()
  })

  it('后续活动可以重新出现，结束回复后忽略残留提示', async () => {
    const hint = ref('')
    const loading = ref(true)
    const { wrapper, exposed } = mountActivityStatus({ loading, hint })

    hint.value = '提示A'
    await vi.advanceTimersByTimeAsync(0)
    hint.value = ''
    await vi.advanceTimersByTimeAsync(100)
    hint.value = '提示A'
    await vi.advanceTimersByTimeAsync(2000)
    expect(exposed.visibleActivityHint.value).toBe('提示A')
    loading.value = false
    expect(exposed.visibleActivityHint.value).toBe('')

    wrapper.unmount()
  })

  it('用户消息不展示活动提示（反例）', async () => {
    const hint = ref('')
    const { wrapper, exposed } = mountActivityStatus({
      isUserMessage: true,
      loading: ref(true),
      hint,
    })

    hint.value = '提示A'
    await vi.advanceTimersByTimeAsync(0)
    expect(exposed.visibleActivityHint.value).toBe('')

    wrapper.unmount()
  })
})
