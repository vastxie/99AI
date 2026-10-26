import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import i18n from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import ChatHeader from './Header/index.vue'
import TurnNavigator from './TurnNavigator.vue'
import MobileContextSheet from './UnifiedSidePanel/MobileContextSheet.vue'
import PanelOverlays from './UnifiedSidePanel/PanelOverlays.vue'

const viewport = vi.hoisted(() => ({ mobile: false }))
const navigation = vi.hoisted(() => ({ startNewConversation: vi.fn() }))
vi.mock('../composables/useConversationNavigator', () => ({
  useConversationNavigator: () => navigation,
}))
vi.mock('@/hooks/useViewport', () => ({ useViewport: () => ({ isMobile: ref(viewport.mobile) }) }))
vi.mock('./UnifiedSidePanel/UnifiedSidePanel.vue', () => ({
  __esModule: true,
  default: { template: '<div class="panel-stub" />' },
}))

let wrapper: VueWrapper | undefined

beforeEach(() => {
  setActivePinia(createPinia())
  viewport.mobile = false
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('轮次导航', () => {
  it('键盘聚焦时展开，焦点离开整个导航后收起', async () => {
    vi.useFakeTimers()
    useChatStore().chatList = [
      { role: 'user', cid: 'u1', content: '第一个问题' },
      { role: 'assistant', cid: 'a1', content: '回答一' },
      { role: 'user', cid: 'u2', content: '第二个问题' },
      { role: 'assistant', cid: 'a2', content: '回答二' },
    ] as Chat.Chat[]
    wrapper = mount(TurnNavigator, {
      attachTo: document.body,
      props: { scrollElement: null, recordProgrammaticScroll: vi.fn() },
      global: { plugins: [i18n] },
    })
    const nav = wrapper.get('nav')
    const [first, second] = nav.findAll('button')

    await first.trigger('focusin')
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(nav.classes()).toContain('is-expanded')

    await first.trigger('focusout', { relatedTarget: second.element })
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(nav.classes()).toContain('is-expanded')

    await second.trigger('focusout', { relatedTarget: document.body })
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(nav.classes()).not.toContain('is-expanded')
  })
})

describe('手机上的底部面板', () => {
  it('打开时锁住页面滚动，关掉后恢复', async () => {
    viewport.mobile = true
    wrapper = mount(PanelOverlays, {
      attachTo: document.body,
      global: { plugins: [i18n], stubs: { transition: false } },
    })
    const globalStore = useGlobalStoreWithOut()
    globalStore.openPanel({
      type: 'file',
      file: { name: 'a.pdf', sourceKind: 'public-url', previewUrl: '/a.pdf' },
    })
    await flushPromises()
    expect(document.documentElement.classList.contains('overflow-hidden')).toBe(true)
    expect(document.body.classList.contains('overflow-hidden')).toBe(true)
    // 面板内容占抓手下面剩下的高度（内容长时自己滚动），不再是整个面板的高度、底部被裁掉
    const content = wrapper.get('.mobile-context-sheet-panel > .ds-workspace-surface')
    expect(content.classes()).toEqual(expect.arrayContaining(['min-h-0', 'flex-1']))

    globalStore.closePanel()
    await flushPromises()
    expect(document.documentElement.classList.contains('overflow-hidden')).toBe(false)
    expect(document.body.classList.contains('overflow-hidden')).toBe(false)
  })
})

describe('底部面板下滑关闭', () => {
  it('按住抓手往下拖一段就关掉；只是点一下不关', async () => {
    wrapper = mount(MobileContextSheet, {
      attachTo: document.body,
      slots: { default: '<p>内容</p>' },
    })
    const grabber = wrapper.get('.mobile-context-sheet-grabber')

    await grabber.trigger('pointerdown', { clientY: 100, pointerType: 'touch' })
    await grabber.trigger('pointerup', { clientY: 100, pointerType: 'touch' })
    expect(wrapper.emitted('close')).toBeUndefined()

    // 碰一下抓手的轻微抖动：哪怕很快也不算下滑
    await grabber.trigger('pointerdown', { clientY: 100, pointerType: 'touch' })
    await grabber.trigger('pointermove', { clientY: 108, pointerType: 'touch' })
    await grabber.trigger('pointerup', { clientY: 108, pointerType: 'touch' })
    expect(wrapper.emitted('close')).toBeUndefined()

    await grabber.trigger('pointerdown', { clientY: 100, pointerType: 'touch' })
    await grabber.trigger('pointermove', { clientY: 260, pointerType: 'touch' })
    expect(wrapper.get('section').attributes('style')).toContain('--sheet-drag-offset: 160px')
    await grabber.trigger('pointerup', { clientY: 260, pointerType: 'touch' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

describe('手机页头', () => {
  it('在会话里时给出新对话入口；欢迎页不重复给', async () => {
    viewport.mobile = true
    wrapper = mount(ChatHeader, {
      props: { conversationTitle: '周报' },
      global: { plugins: [i18n], stubs: { AccountMenu: true } },
    })
    await wrapper.get('button[aria-label="新对话"]').trigger('click')
    expect(navigation.startNewConversation).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ conversationTitle: '' })
    expect(wrapper.find('button[aria-label="新对话"]').exists()).toBe(false)
  })
})
