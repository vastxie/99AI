import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import { computedStyle, installStylesheet, readStyle } from '@/styles/stylesheet.testkit'
import Footer from './index.vue'
import { chatActionsProvide } from '@/views/chat/chatActions.testkit'
import type { ChatActions } from '@/views/chat/chatActions'

vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(false) }) }
})
const navigation = vi.hoisted(() => ({ createConversationForSubmit: vi.fn(async () => '') }))
const connection = vi.hoisted(() => ({ isDisconnected: null as unknown as { value: boolean } }))
vi.mock('@/views/chat/composables/useSocketStatus', async () => {
  const { ref } = await import('vue')
  connection.isDisconnected = ref(false)
  return { useSocketStatus: () => ({ isDisconnected: connection.isDisconnected }) }
})
vi.mock('@/views/chat/composables/useConversationNavigator', () => ({
  useConversationNavigator: () => navigation,
}))

let removeStyles: () => void
let wrapper: VueWrapper | undefined

beforeAll(() => {
  removeStyles = installStylesheet(
    ['src/styles/tokens.css', 'src/styles/composer.css'].map(readStyle).join('\n')
  )
})

afterAll(() => {
  removeStyles()
})

beforeEach(() => {
  // 输入框内容会存进本地：上一个用例留下的草稿不能带进下一个
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

function render(actions: Partial<ChatActions> = {}) {
  wrapper = mount(Footer, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      provide: chatActionsProvide(actions),
      stubs: { ModelSelector: true, FilePreview: true },
    },
  })
  return wrapper
}

const WORKSPACE_ID = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'

/** 当前会话最后一条是仍在生成的回复 */
function streamReply() {
  const chatStore = useChatStore()
  chatStore.active = WORKSPACE_ID
  chatStore.chatList = [
    { role: 'user', cid: 'user-1', content: 'hi' },
    { role: 'assistant', cid: 'reply-1', loading: true },
  ] as any
}

describe('聊天输入栏', () => {
  it('输入框始终从一行开始，最小高度是共享样式里的一档定值', () => {
    const wrapper = render()
    const textarea = wrapper.get<HTMLTextAreaElement>('textarea')
    expect(textarea.attributes('rows')).toBe('1')
    expect(textarea.attributes('style')).not.toMatch(/min-height/)
    const minHeight = computedStyle(textarea.element).minHeight
    expect(minHeight).toMatch(/^\d+(\.\d+)?px$/)
    // 单行高度由行高决定，最小高度只是防止空框塌陷，不会把空框撑成两行
    expect(parseFloat(minHeight)).toBeLessThanOrEqual(
      parseFloat(computedStyle(textarea.element).lineHeight) * 1.5
    )
  })

  it('空草稿把高度交还给样式，有内容时才按内容测高并决定是否给出展开入口', async () => {
    const wrapper = render()
    const textarea = wrapper.get<HTMLTextAreaElement>('textarea')
    await textarea.setValue('draft text')
    expect(textarea.element.style.height).toMatch(/^\d+(\.\d+)?px$/)
    await textarea.setValue('')
    expect(textarea.element.style.height).toBe('auto')
    expect(wrapper.find('button[aria-label="展开输入框"]').exists()).toBe(false)
  })

  it('发送与上传按钮复用两类圆钮和同款向上箭头', async () => {
    const wrapper = render()
    const send = wrapper.get<HTMLButtonElement>('button.btn-send')
    expect(send.classes()).toEqual(
      expect.arrayContaining([
        'ui-button',
        'btn-primary',
        'ui-button-icon',
        'ui-button-pill',
        'ui-button-no-scale',
      ])
    )
    expect(send.attributes('aria-label')).toBe('发送')
    const arrow = send.get('svg.lucide-arrow-up')
    expect(arrow.attributes('width')).toBe('20')
    expect(arrow.attributes('stroke-width')).toBe('2')
    expect(send.element.disabled).toBe(true)
    await wrapper.get('textarea').setValue('hello')
    expect(send.element.disabled).toBe(false)

    const upload = wrapper.get('button[aria-label="上传文件"]')
    expect(upload.classes()).toEqual(
      expect.arrayContaining([
        'ui-button',
        'btn-ghost',
        'ui-button-icon',
        'ui-button-pill',
        'ui-button-no-scale',
      ])
    )
    expect(upload.classes()).not.toContain('btn-primary')
    expect(upload.find('svg.lucide-plus').exists()).toBe(true)
    expect(wrapper.find('svg.lucide-send').exists()).toBe(false)
  })
})

describe('聊天输入栏的发送与停止', () => {
  it('已点发送、这一轮还没开始：输入框只读，发送按钮转圈并禁用', async () => {
    const chatStore = useChatStore()
    const wrapper = render()
    await wrapper.get('textarea').setValue('你好')
    chatStore.acquireSubmitLock()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('textarea').attributes('readonly')).toBeDefined()
    const send = wrapper.get<HTMLButtonElement>('button.btn-send')
    expect(send.element.disabled).toBe(true)
    expect(send.attributes('aria-label')).toBe('正在发送')
    expect(send.find('.lucide-arrow-up').exists()).toBe(false)

    chatStore.revokeSubmitLock()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('textarea').attributes('readonly')).toBeUndefined()
  })

  it('停止请求进行中：停止按钮禁用并转圈', async () => {
    streamReply()
    const wrapper = render({ isStopping: () => true })
    const stop = wrapper.get<HTMLButtonElement>('button.btn-stop')
    expect(stop.element.disabled).toBe(true)
    expect(stop.attributes('aria-label')).toBe('正在停止')
  })

  it('停止中只看输入框的停止目标：在停别的（跟丢的）回复时，输入框的停止按钮照常可用', async () => {
    streamReply()
    const isStopping = vi.fn((cid?: string) => cid === 'a-stalled')
    const wrapper = render({ isStopping })
    const stop = wrapper.get<HTMLButtonElement>('button.btn-stop')
    expect(stop.element.disabled).toBe(false)
    expect(isStopping).toHaveBeenCalledWith()
  })

  it('实时连接断开：输入框上方提示正在重连', async () => {
    const wrapper = render()
    expect(wrapper.find('.chat-connection-notice').exists()).toBe(false)
    connection.isDisconnected.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.chat-connection-notice').attributes('role')).toBe('status')
    connection.isDisconnected.value = false
  })

  it('生成中输入框有字时，停止按钮仍在，排在「加入下一轮」左边（最右侧始终是发送）', async () => {
    streamReply()
    const wrapper = render()
    expect(wrapper.find('button.btn-stop').exists()).toBe(true)
    expect(wrapper.find('button.btn-send').exists()).toBe(false)
    expect(wrapper.get('button.btn-stop').classes()).toContain('btn-primary')
    await wrapper.get('textarea').setValue('再补充一点')
    const actions = wrapper.findAll('.chat-footer-trailing-actions button.ui-button-pill')
    expect(actions.map(button => button.classes().includes('btn-send'))).toEqual([false, true])
    expect(actions[0].classes()).toContain('btn-stop')
    // 两个按钮并排时发送是主按钮，停止降为次要样式
    expect(actions[0].classes()).toContain('btn-secondary')
  })

  it('生成中在输入框里按 Esc 停止；没有在生成时 Esc 不做任何事', async () => {
    streamReply()
    const wrapper = render()
    // 带修饰键的 Esc 留给别的快捷键（Shift+Esc 聚焦输入框），不停止
    for (const modifier of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) {
      await wrapper.get('textarea').trigger('keydown', { key: 'Escape', [modifier]: true })
    }
    expect(wrapper.emitted('pause-request')).toBeUndefined()
    await wrapper.get('textarea').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('pause-request')).toHaveLength(1)

    useChatStore().chatList = []
    await wrapper.vm.$nextTick()
    await wrapper.get('textarea').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('pause-request')).toHaveLength(1)
  })

  it('回车发送；输入法组词中的回车交给输入法', async () => {
    const onConversation = vi.fn().mockResolvedValue(undefined)
    useChatStore().active = WORKSPACE_ID
    const wrapper = render({ onConversation })
    const textarea = wrapper.get('textarea')
    await textarea.setValue('你好')
    await textarea.trigger('keydown', { key: 'Enter', isComposing: true })
    await textarea.trigger('keydown', { key: 'Enter', keyCode: 229 })
    expect(onConversation).not.toHaveBeenCalled()
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(onConversation).toHaveBeenCalledTimes(1)
    expect(onConversation.mock.calls[0][0].msg).toBe('你好')
  })

  it('发出后焦点回到输入框，接着就能写下一句；发送键的提示写明回车与换行', async () => {
    const onConversation = vi.fn().mockResolvedValue(undefined)
    useChatStore().active = WORKSPACE_ID
    const wrapper = render({ onConversation })
    const textarea = wrapper.get('textarea')
    await textarea.setValue('你好')
    expect(wrapper.text()).toContain('Enter 发送，Shift+Enter 换行')
    const send = wrapper.get('button.btn-send')
    ;(send.element as HTMLButtonElement).focus()
    await send.trigger('click')
    await flushPromises()
    expect(onConversation).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(textarea.element)
  })

  it('空状态与有消息两处输入框切换时组件会重建：没发出去的内容不丢', async () => {
    const first = render()
    await first.get('textarea').setValue('写了一半的问题')
    first.unmount()
    wrapper = undefined
    const second = render()
    await flushPromises()
    expect(second.get<HTMLTextAreaElement>('textarea').element.value).toBe('写了一半的问题')
  })

  it('新会话首条发送失败：输入内容留在新会话的输入框里', async () => {
    const chatStore = useChatStore()
    navigation.createConversationForSubmit.mockImplementationOnce(async () => {
      // 与 store 建会话时一样：首页草稿归到新会话名下
      chatStore.active = WORKSPACE_ID
      chatStore.moveDraft('', WORKSPACE_ID)
      return WORKSPACE_ID
    })
    const onConversation = vi.fn().mockRejectedValue(new Error('余额不足'))
    const wrapper = render({ onConversation })
    const textarea = wrapper.get<HTMLTextAreaElement>('textarea')
    await textarea.setValue('一段很长的需求')
    await wrapper.get('button.btn-send').trigger('click')
    await flushPromises()
    expect(onConversation).toHaveBeenCalledTimes(1)
    expect(chatStore.prompt).toBe('一段很长的需求')
    expect(textarea.element.value).toBe('一段很长的需求')
  })

  it('回复已出错（状态还停在生成中）时，输入框回到普通发送，不再显示停止', async () => {
    const chatStore = useChatStore()
    chatStore.active = WORKSPACE_ID
    chatStore.chatList = [
      { role: 'user', cid: 'user-1', content: 'hi' },
      { role: 'assistant', cid: 'reply-1', loading: false, status: 2, error: true },
    ] as any
    const wrapper = render()
    expect(wrapper.find('button.btn-stop').exists()).toBe(false)
    expect(wrapper.get('button.btn-send').attributes('aria-label')).toBe('发送')
  })
})

describe('发送途中被停止或身份变化', () => {
  it('停止作废了这次提交、随后新提交开始：旧提交的结果晚到，不清草稿、不释放新提交的锁', async () => {
    const chatStore = useChatStore()
    chatStore.active = WORKSPACE_ID
    let finishFirst: () => void = () => undefined
    const onConversation = vi.fn(
      () => new Promise<undefined>(resolve => (finishFirst = () => resolve(undefined)))
    )
    const wrapper = render({ onConversation })
    const textarea = wrapper.get<HTMLTextAreaElement>('textarea')
    await textarea.setValue('第一句')
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(onConversation).toHaveBeenCalledTimes(1)

    // 停止按钮：作废正在进行的提交；接着用户写了新内容，另一处提交拿到了锁
    chatStore.revokeSubmitLock()
    chatStore.setDraft(WORKSPACE_ID, '第一句')
    const next = chatStore.acquireSubmitLock()
    finishFirst()
    await flushPromises()
    expect(chatStore.drafts[WORKSPACE_ID]).toBe('第一句')
    expect(chatStore.isSubmitLockCurrent(next)).toBe(true)
    expect(chatStore.isSubmitting).toBe(true)
  })

  it('建会话期间身份变化（导航作废）：静默结束，不提示、不发送，草稿留着', async () => {
    const chatStore = useChatStore()
    navigation.createConversationForSubmit.mockImplementationOnce(async () => {
      const { IdentityChangedError } = await import('@/services/identity')
      throw new IdentityChangedError()
    })
    const onConversation = vi.fn()
    const wrapper = render({ onConversation })
    const textarea = wrapper.get<HTMLTextAreaElement>('textarea')
    await textarea.setValue('首页写的问题')
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(onConversation).not.toHaveBeenCalled()
    expect(chatStore.prompt).toBe('首页写的问题')
    expect(chatStore.isSubmitting).toBe(false)
  })
})
