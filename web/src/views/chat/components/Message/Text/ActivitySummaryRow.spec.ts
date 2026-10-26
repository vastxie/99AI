import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import type { ActivityPanelPayload } from '@/types/preview-panel'
import ActivitySummaryRow from './ActivitySummaryRow.vue'

const activity: ActivityPanelPayload = {
  title: '活动',
  status: 'running',
  summary: '正在思考',
  events: [],
}

function mountRow(props: Record<string, unknown> = {}) {
  return mount(ActivitySummaryRow, {
    props: { activity, label: '正在思考', clickable: false, ...props },
    global: { plugins: [i18n], stubs: { transition: false } },
  })
}

describe('ActivitySummaryRow 文案切换动效', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('计时后缀首次出现时走全局文字切换入场，之后每秒更新不重播', async () => {
    const wrapper = mountRow()
    expect(wrapper.find('.tabular-nums').exists()).toBe(false)

    await wrapper.setProps({ suffix: '· 1 秒', clickable: true })
    const suffix = wrapper.get('.tabular-nums')
    expect(suffix.classes()).toContain('text-rise-enter')
    await vi.advanceTimersByTimeAsync(400)
    expect(suffix.classes()).not.toContain('text-rise-enter')

    await wrapper.setProps({ suffix: '· 2 秒' })
    expect(wrapper.get('.tabular-nums').element).toBe(suffix.element)
    expect(suffix.classes()).not.toContain('text-rise-enter')
    expect(suffix.text()).toBe('· 2 秒')
    wrapper.unmount()
  })

  it('文案变化时新文案入场、旧文案立即让位，按钮节点保持不变', async () => {
    const wrapper = mountRow({ suffix: '· 3 秒', clickable: true })
    await vi.advanceTimersByTimeAsync(400)
    const button = wrapper.element
    const previousCopy = wrapper.get('.activity-summary-copy').element

    await wrapper.setProps({ label: '正在搜索资料' })
    const copies = wrapper.findAll('.activity-summary-copy')
    const entering = copies.find(copy => copy.text().includes('正在搜索资料'))
    expect(entering?.classes()).toContain('text-rise-enter')
    const leaving = copies.find(copy => copy.element === previousCopy)
    expect(leaving?.classes()).toContain('activity-summary-leave')
    expect(wrapper.element).toBe(button)

    await vi.advanceTimersByTimeAsync(400)
    expect(wrapper.findAll('.activity-summary-copy')).toHaveLength(1)
    expect(wrapper.get('.activity-summary-copy').classes()).not.toContain('text-rise-enter')
    expect(wrapper.text()).toContain('正在搜索资料')
    wrapper.unmount()
  })
})

describe('ActivitySummaryRow 出错的工具', () => {
  it('按状态轻描淡写地记一笔，不看摘要文案（英文摘要也一样）', () => {
    for (const summary of ['搜索失败', 'Search failed: timeout', 'Read 3 files']) {
      const wrapper = mountRow({ label: '', activity: { ...activity, status: 'error', summary } })
      expect(wrapper.text()).toContain(i18n.global.t('activity.processed'))
      expect(wrapper.text()).not.toContain(summary)
      wrapper.unmount()
    }
  })
})
