import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import i18n from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import List from './List.vue'
import SearchDialog from './SearchDialog.vue'

const api = vi.hoisted(() => ({ search: vi.fn() }))
const navigation = vi.hoisted(() => ({
  openConversation: vi.fn(async () => true),
  startNewConversation: vi.fn(),
  canNavigate: vi.fn(() => true),
  leaveConversation: vi.fn(),
}))
vi.mock('@/api/chatLog', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/chatLog')>()),
  fetchSearchChatLogsAPI: api.search,
}))
vi.mock('../../composables/useConversationNavigator', () => ({
  useConversationNavigator: () => navigation,
}))
vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(false) }) }
})

let wrapper: VueWrapper | undefined
const group = (uuid: string, title: string, isSticky = false) =>
  ({ uuid, title, isSticky, channel: 'web' }) as Chat.ConversationGroup

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('侧栏会话列表', () => {
  it('加载中、失败可重试、确实没有会话三种状态都有说明，不再一片空白', async () => {
    const chatStore = useChatStore()
    const retry = vi.spyOn(chatStore, 'queryMyGroup').mockResolvedValue()
    chatStore.groupPagination = {
      initialized: false,
      loading: true,
      hasMore: false,
      nextCursor: null,
    }
    wrapper = mount(List, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { PackSlot: true } },
    })
    // 播报区常驻（一开始就在），状态变化时只换文字；加载中不标 aria-busy（标了读屏会等它结束才念）
    const status = wrapper.get('[role="status"]')
    expect(status.text()).toBe('加载中...')
    expect(status.attributes('aria-busy')).toBeUndefined()

    chatStore.groupPagination = {
      initialized: false,
      loading: false,
      failed: true,
      hasMore: false,
      nextCursor: null,
    }
    await nextTick()
    expect(wrapper.get('[role="status"]').element).toBe(status.element)
    expect(status.text()).toContain('会话列表没有加载出来')
    const stateView = wrapper.get('.ui-state-view')
    await stateView.get('button').trigger('click')
    expect(retry).toHaveBeenCalledTimes(1)
    // 重试键随即被「加载中」替换：焦点先落在状态块上，不掉回页面开头
    expect(document.activeElement).toBe(stateView.element)

    chatStore.groupPagination = {
      initialized: true,
      loading: false,
      hasMore: false,
      nextCursor: null,
    }
    await nextTick()
    expect(status.text()).toBe('还没有对话')
  })

  it('重试后列表出来了：焦点落到第一条会话（状态块随之移除，不掉回页面开头）', async () => {
    const chatStore = useChatStore()
    chatStore.groupPagination = {
      initialized: false,
      loading: false,
      failed: true,
      hasMore: false,
      nextCursor: null,
    }
    vi.spyOn(chatStore, 'queryMyGroup').mockImplementation(async () => {
      chatStore.groupList = [group('g_a', '周报'), group('g_b', '旅行计划')]
      chatStore.groupPagination = {
        initialized: true,
        loading: false,
        hasMore: false,
        nextCursor: null,
      }
    })
    wrapper = mount(List, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { PackSlot: true } },
    })
    await wrapper.get('.ui-state-view button').trigger('click')
    await flushPromises()
    await nextTick()
    expect(wrapper.find('.ui-state-view').exists()).toBe(false)
    expect(document.activeElement).toBe(
      wrapper.get('button.chat-sidebar-conversation-open').element
    )
  })

  it('每行用行内按钮打开，当前会话标 aria-current，置顶的读屏能听到「已置顶」', async () => {
    const chatStore = useChatStore()
    chatStore.groupPagination = {
      initialized: true,
      loading: false,
      hasMore: false,
      nextCursor: null,
    }
    chatStore.groupList = [group('g_a', '周报', true), group('g_b', '旅行计划')]
    chatStore.active = 'g_b'
    wrapper = mount(List, { global: { plugins: [i18n], stubs: { PackSlot: true } } })
    const buttons = wrapper.findAll('button.chat-sidebar-conversation-open')
    expect(buttons.map(button => button.text())).toEqual(['已置顶周报', '旅行计划'])
    expect(buttons[1].attributes('aria-current')).toBe('page')
    expect(buttons[0].attributes('aria-current')).toBeUndefined()
    expect(wrapper.find('.chat-sidebar-conversation[role="button"]').exists()).toBe(false)
    await buttons[0].trigger('click')
    expect(navigation.openConversation).toHaveBeenCalledWith('g_a')
  })
})

describe('搜索弹窗', () => {
  function renderSearch() {
    wrapper = mount(SearchDialog, {
      attachTo: document.body,
      props: { modelValue: true },
      global: { plugins: [i18n], stubs: { teleport: true } },
    })
    return wrapper
  }

  it('上下键在结果间移动高亮、回车打开；结果数量播报给读屏', async () => {
    vi.useFakeTimers()
    const chatStore = useChatStore()
    chatStore.groupList = [group('g_a', '周报草稿'), group('g_b', '周报定稿')]
    vi.spyOn(chatStore, 'openSearchResult').mockResolvedValue('g_b')
    api.search.mockResolvedValue({ data: { rows: [] } })
    const dialog = renderSearch()
    const input = dialog.get('input[role="combobox"]')
    await input.setValue('周报')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    const options = dialog.findAll('[role="option"]')
    expect(options).toHaveLength(2)
    expect(input.attributes('aria-activedescendant')).toBe(options[0].attributes('id'))
    expect(dialog.get('[role="status"].sr-only').text()).toBe('2 条结果')

    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(input.attributes('aria-activedescendant')).toBe(options[1].attributes('id'))
    expect(options[1].attributes('aria-selected')).toBe('true')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(navigation.openConversation).toHaveBeenCalledWith(
      'g_b',
      expect.objectContaining({ checkLock: false })
    )
  })

  it('搜索失败：不留上一次的结果，给出重试；只由一个播报区读出，重试后焦点回到搜索框', async () => {
    vi.useFakeTimers()
    api.search.mockRejectedValueOnce(new Error('offline'))
    const dialog = renderSearch()
    const input = dialog.get('input[role="combobox"]')
    await input.setValue('不存在的词')
    // 防抖期间就算在搜：不先报「无结果」
    expect(dialog.get('[role="status"].sr-only').text()).toBe('正在搜索')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(dialog.get('[role="status"].sr-only').text()).toBe('搜索没有完成')
    expect(dialog.findAll('[role="alert"]')).toHaveLength(0)
    expect(dialog.get('.ui-state-view').text()).toContain('搜索没有完成')
    api.search.mockResolvedValueOnce({ data: { rows: [] } })
    await dialog.get('.ui-state-view button').trigger('click')
    expect(document.activeElement).toBe(input.element)
    await flushPromises()
    expect(api.search).toHaveBeenCalledTimes(2)
  })

  it('标题匹配还在时搜索失败：看得见原因，也能重试', async () => {
    vi.useFakeTimers()
    const chatStore = useChatStore()
    chatStore.groupList = [group('g_a', '周报草稿')]
    api.search.mockRejectedValueOnce(new Error('offline'))
    const dialog = renderSearch()
    await dialog.get('input').setValue('周报')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(dialog.findAll('[role="option"]')).toHaveLength(1)
    const notice = dialog.get('.ui-state-view')
    expect(notice.text()).toContain('搜索没有完成')
    api.search.mockResolvedValueOnce({ data: { rows: [] } })
    await notice.get('button').trigger('click')
    await flushPromises()
    expect(api.search).toHaveBeenCalledTimes(2)
  })

  it('关键字改了以后，回车选不到上一个关键字的结果，晚到的旧结果也不再落地', async () => {
    vi.useFakeTimers()
    const chatStore = useChatStore()
    const open = vi.spyOn(chatStore, 'openSearchResult').mockResolvedValue('g_a')
    api.search.mockResolvedValueOnce({
      data: {
        rows: [{ matchType: 'message', gid: 'g_a', targetCid: 'c_1', title: 'alpha 的一句话' }],
      },
    })
    const dialog = renderSearch()
    const input = dialog.get('input[role="combobox"]')
    await input.setValue('alpha')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(dialog.findAll('[role="option"]')).toHaveLength(1)

    // 改成 beta：防抖期间按回车，旧结果已不在、不会被打开
    let resolveBeta: (value: unknown) => void = () => undefined
    api.search.mockImplementationOnce(() => new Promise(resolve => (resolveBeta = resolve)))
    await input.setValue('beta')
    expect(dialog.findAll('[role="option"]')).toHaveLength(0)
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(open).not.toHaveBeenCalled()
    expect(navigation.openConversation).not.toHaveBeenCalled()

    // 再改回空、beta 的请求才回来：不再落地，也不把加载状态错算
    await vi.advanceTimersByTimeAsync(300)
    await input.setValue('')
    resolveBeta({
      data: { rows: [{ matchType: 'message', gid: 'g_a', targetCid: 'c_2', title: 'beta' }] },
    })
    await flushPromises()
    expect(dialog.findAll('[role="option"]').every(option => !option.text().includes('beta'))).toBe(
      true
    )
  })

  it('服务端结果晚到时保住键盘选中的那条，不跳回第一条', async () => {
    vi.useFakeTimers()
    const chatStore = useChatStore()
    chatStore.groupList = [group('g_a', '周报草稿'), group('g_b', '周报定稿')]
    let resolveSearch: (value: unknown) => void = () => undefined
    api.search.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSearch = resolve
        })
    )
    const dialog = renderSearch()
    const input = dialog.get('input[role="combobox"]')
    await input.setValue('周报')
    await input.trigger('keydown', { key: 'ArrowDown' })
    const options = dialog.findAll('[role="option"]')
    expect(input.attributes('aria-activedescendant')).toBe(options[1].attributes('id'))

    await vi.advanceTimersByTimeAsync(300)
    resolveSearch({
      data: {
        rows: [{ matchType: 'message', gid: 'g_a', targetCid: 'c_1', title: '周报里的一句话' }],
      },
    })
    await flushPromises()
    expect(dialog.findAll('[role="option"]')).toHaveLength(3)
    expect(input.attributes('aria-activedescendant')).toBe(
      dialog.findAll('[role="option"]')[1].attributes('id')
    )
  })
})
