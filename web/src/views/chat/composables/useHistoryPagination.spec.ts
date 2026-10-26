import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useHistoryPagination } from './useHistoryPagination'

/**
 * happy-dom 元素 scrollTop / clientHeight 均为 0：距顶距离 0 必然小于
 * 预取阈值下限 260，触发条件恒满足，便于聚焦各闸门逻辑的正反断言。
 */
function setup(overrides?: {
  hasMore?: boolean
  paginationLoading?: boolean
  olderLoadFailed?: boolean
  loadOlderMessages?: (workspaceId: string) => Promise<{ added: boolean }>
}) {
  const scrollRef = ref<HTMLElement | null>(document.createElement('div'))
  const isCanvasSwitching = ref(false)
  const adjustScrollTopBy = vi.fn()
  const loadOlderMessages = vi.fn(overrides?.loadOlderMessages || (async () => ({ added: true })))
  const getPagination = vi.fn(() => ({
    hasMore: overrides?.hasMore ?? true,
    loading: overrides?.paginationLoading ?? false,
    olderLoadFailed: overrides?.olderLoadFailed ?? false,
  }))

  const pagination = useHistoryPagination({
    scrollRef,
    adjustScrollTopBy,
    activeWorkspaceId: computed(() => 'ws-1'),
    hasMessages: computed(() => true),
    isCanvasSwitching,
    getPagination,
    loadOlderMessages,
  })

  return { pagination, loadOlderMessages, getPagination, isCanvasSwitching, scrollRef }
}

describe('useHistoryPagination', () => {
  it('接近顶部且还有更早消息时触发加载（正例）', async () => {
    const { pagination, loadOlderMessages } = setup()

    await pagination.maybeLoadOlderMessagesOnScroll()

    expect(loadOlderMessages).toHaveBeenCalledTimes(1)
    expect(loadOlderMessages).toHaveBeenCalledWith('ws-1')
    expect(pagination.isLoadingOlderMessages.value).toBe(false)
  })

  it('没有更早消息或分页加载中时不触发（反例）', async () => {
    const noMore = setup({ hasMore: false })
    await noMore.pagination.maybeLoadOlderMessagesOnScroll()
    expect(noMore.loadOlderMessages).not.toHaveBeenCalled()

    const inFlight = setup({ paginationLoading: true })
    await inFlight.pagination.maybeLoadOlderMessagesOnScroll()
    expect(inFlight.loadOlderMessages).not.toHaveBeenCalled()
  })

  it('会话切换过渡期间不触发（反例）', async () => {
    const { pagination, loadOlderMessages, isCanvasSwitching } = setup()
    isCanvasSwitching.value = true

    await pagination.maybeLoadOlderMessagesOnScroll()

    expect(loadOlderMessages).not.toHaveBeenCalled()
  })

  it('预取冷却窗口内不触发（反例）', async () => {
    const { pagination, loadOlderMessages } = setup()

    pagination.suppressHistoryPrefetch(60000)
    await pagination.maybeLoadOlderMessagesOnScroll()

    expect(loadOlderMessages).not.toHaveBeenCalled()
  })

  it('加载在途时重复滚动不会并发加载（反例）', async () => {
    let release!: (value: { added: boolean }) => void
    const { pagination, loadOlderMessages } = setup({
      loadOlderMessages: () =>
        new Promise(resolve => {
          release = resolve
        }),
    })

    const first = pagination.maybeLoadOlderMessagesOnScroll()
    expect(pagination.isLoadingOlderMessages.value).toBe(true)

    await pagination.maybeLoadOlderMessagesOnScroll()
    expect(loadOlderMessages).toHaveBeenCalledTimes(1)

    release({ added: true })
    await first
    expect(pagination.isLoadingOlderMessages.value).toBe(false)
  })

  it('加载完成后进入短冷却，紧接着的滚动不重复加载（正例：节流闭环）', async () => {
    const { pagination, loadOlderMessages } = setup()

    await pagination.maybeLoadOlderMessagesOnScroll()
    await pagination.maybeLoadOlderMessagesOnScroll()

    expect(loadOlderMessages).toHaveBeenCalledTimes(1)
  })

  it('滚动容器缺失时直接返回（边界）', async () => {
    const { pagination, loadOlderMessages, scrollRef } = setup()
    scrollRef.value = null

    await pagination.maybeLoadOlderMessagesOnScroll()

    expect(loadOlderMessages).not.toHaveBeenCalled()
  })

  it('上一次加载更早消息失败后，不随滚动自动重试；点重试时照常再取', async () => {
    const { pagination, loadOlderMessages } = setup({ olderLoadFailed: true })

    await pagination.maybeLoadOlderMessagesOnScroll()
    expect(loadOlderMessages).not.toHaveBeenCalled()

    await pagination.retryOlderMessages()
    expect(loadOlderMessages).toHaveBeenCalledTimes(1)
    expect(pagination.isLoadingOlderMessages.value).toBe(false)
  })
})
