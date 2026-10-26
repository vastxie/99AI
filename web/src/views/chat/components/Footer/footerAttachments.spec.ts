import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import { useComposerAttachmentsStore } from '@/store/modules/chat/attachments'
import { useGlobalStore } from '@/store/modules/global'
import { chatActionsProvide } from '@/views/chat/chatActions.testkit'
import Footer from './index.vue'

type Upload = { resolve: (data: unknown) => void; reject: (error: unknown) => void }
const uploads = vi.hoisted(() => [] as Upload[])
const dialogs = vi.hoisted(() => ({ confirm: vi.fn(async () => false) }))
const toasts = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}))

vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(false) }) }
})
vi.mock('@/views/chat/composables/useConversationNavigator', () => ({
  useConversationNavigator: () => ({ createConversationForSubmit: vi.fn(async () => '') }),
}))
vi.mock('@/views/chat/composables/useSocketStatus', async () => {
  const { ref } = await import('vue')
  return { useSocketStatus: () => ({ isDisconnected: ref(false) }) }
})
vi.mock('@/api/upload', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/upload')>()),
  uploadFile: vi.fn(
    (_file: File, _dir: unknown, options?: { signal?: AbortSignal }) =>
      new Promise((resolve, reject) => {
        uploads.push({ resolve, reject })
        options?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }))
        )
      })
  ),
}))
vi.mock('@/utils/dialog', () => ({ confirmDialog: dialogs.confirm }))
vi.mock('@/utils/message', () => ({ message: () => toasts, notifyError: vi.fn() }))

const A = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'
const B = 'g_bbbbbbbbbbbbbbbbbbbbbbbb'
let wrapper: VueWrapper | undefined

function render(
  onConversation = vi.fn(
    async (_params: Chat.ConversationParams) => undefined as boolean | undefined
  )
) {
  wrapper = mount(Footer, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      provide: chatActionsProvide({ onConversation }),
      stubs: { ModelSelector: true },
    },
  })
  return { wrapper, onConversation }
}

async function pickFiles(target: VueWrapper, files: File[]) {
  const input = target.get<HTMLInputElement>('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
  await flushPromises()
}

const pdf = () => new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  uploads.length = 0
  dialogs.confirm.mockReset().mockResolvedValue(false)
  Object.values(toasts).forEach(toast => toast.mockReset())
  URL.createObjectURL = vi.fn(() => 'blob:preview') as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
  useChatStore().active = A
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('输入框附件', () => {
  it('选中即上传并显示进度；发送时等它传完，消息里带上上传结果，发出后从输入框移除', async () => {
    const { wrapper, onConversation } = render()
    await pickFiles(wrapper, [pdf()])
    expect(uploads).toHaveLength(1)
    expect(wrapper.text()).toContain('上传中')

    await wrapper.get('textarea').setValue('看看这份报告')
    await wrapper.get('button.btn-send').trigger('click')
    await flushPromises()
    expect(onConversation).not.toHaveBeenCalled()

    uploads[0].resolve({ data: { fileId: 'file_1', previewUrl: '/files/1' } })
    await flushPromises()
    expect(onConversation).toHaveBeenCalledTimes(1)
    expect(onConversation.mock.calls[0]?.[0].urlItems).toEqual([
      expect.objectContaining({ type: 'file', name: 'report.pdf', fileId: 'file_1' }),
    ])
    expect(useComposerAttachmentsStore().list(A)).toEqual([])
  })

  it('附件卡上的移除按钮用键盘操作时，父卡片不截获、不打开预览', async () => {
    const { wrapper } = render()
    await pickFiles(wrapper, [pdf()])
    const openPanel = vi.spyOn(useGlobalStore(), 'openPanel')
    const close = wrapper.get<HTMLButtonElement>('button.uploaded-file-close')
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      close.element.dispatchEvent(event)
      // 父卡片只处理落在自己身上的按键：子按钮的原生键盘激活（触发 click）不被取消
      expect(event.defaultPrevented).toBe(false)
    }
    expect(openPanel).not.toHaveBeenCalled()
    // 卡片本身获得焦点时按键仍打开预览
    const card = close.element.closest<HTMLElement>('[role="button"]')!
    card.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    expect(openPanel).toHaveBeenCalledTimes(1)
    await close.trigger('click')
    await flushPromises()
    expect(useComposerAttachmentsStore().list(A)).toEqual([])
  })

  it('发送在等附件传完时可以移除还在上传的附件，发送不再等它；传完的不能移除', async () => {
    const { wrapper, onConversation } = render()
    await pickFiles(wrapper, [pdf(), new File(['%PDF'], 'big.pdf', { type: 'application/pdf' })])
    uploads[0].resolve({ data: { fileId: 'file_1', previewUrl: '/files/1' } })
    await flushPromises()

    await wrapper.get('textarea').setValue('看看这两份')
    await wrapper.get('button.btn-send').trigger('click')
    await flushPromises()
    expect(onConversation).not.toHaveBeenCalled()

    const [uploaded, uploading] = wrapper.findAll<HTMLButtonElement>('button.uploaded-file-close')
    expect(uploaded.element.disabled).toBe(true)
    expect(uploading.element.disabled).toBe(false)
    await uploading.trigger('click')
    await flushPromises()
    expect(onConversation).toHaveBeenCalledTimes(1)
    expect(onConversation.mock.calls[0]?.[0].urlItems).toEqual([
      expect.objectContaining({ name: 'report.pdf', fileId: 'file_1' }),
    ])
  })

  it('生成中粘贴、拖放、选择框晚到的文件都只提示不上传；普通文字粘贴照常', async () => {
    const chatStore = useChatStore()
    const { wrapper } = render()
    // 文件选择框在生成开始前打开
    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    chatStore.chatList = [
      { role: 'user', cid: 'user-1', content: 'hi' },
      { role: 'assistant', cid: 'reply-1', loading: true },
    ] as Chat.Chat[]
    await flushPromises()

    Object.defineProperty(input.element, 'files', { value: [pdf()], configurable: true })
    await input.trigger('change')
    const textarea = wrapper.get('textarea').element
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(paste, 'clipboardData', {
      value: { items: [{ kind: 'file', getAsFile: () => pdf() }] },
    })
    textarea.dispatchEvent(paste)
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [pdf()], types: ['Files'] } })
    wrapper.get('footer').element.dispatchEvent(drop)
    await flushPromises()

    expect(uploads).toHaveLength(0)
    expect(useComposerAttachmentsStore().list(A)).toEqual([])
    expect(toasts.warning).toHaveBeenCalledWith('生成中不能添加附件，可等这一轮结束后再发')
    expect(toasts.warning).toHaveBeenCalledTimes(3)
    // 拖放仍阻止浏览器直接打开文件
    expect(drop.defaultPrevented).toBe(true)

    // 普通文字粘贴不受影响（不阻止默认行为、不提示）
    toasts.warning.mockReset()
    const text = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(text, 'clipboardData', {
      value: { items: [{ kind: 'string', getAsFile: () => null }] },
    })
    textarea.dispatchEvent(text)
    expect(text.defaultPrevented).toBe(false)
    expect(toasts.warning).not.toHaveBeenCalled()
  })

  it('补充要求的回执回来前切到了别的会话：记在发起的会话名下，只清那个会话的草稿', async () => {
    const chatStore = useChatStore()
    chatStore.chatList = [
      { role: 'user', cid: 'user-1', content: 'hi' },
      { role: 'assistant', cid: 'reply-1', loading: true },
    ] as Chat.Chat[]
    let ack = (_value: unknown) => {}
    vi.spyOn(chatStore, 'submitQueueFollowUpIntent').mockReturnValueOnce(
      new Promise(resolve => {
        ack = resolve
      }) as any
    )
    const { wrapper } = render()
    await wrapper.get('textarea').setValue('再补充一点')
    await wrapper.get('button.btn-send').trigger('click')
    await flushPromises()

    chatStore.active = B
    chatStore.chatList = []
    await chatStore.setPrompt('B 里写了一半')
    ack({ ok: true, data: { queuedPrompt: '再补充一点', parentTurnId: 'turn-1' } })
    await flushPromises()
    expect(chatStore.drafts[A]).toBeUndefined()
    expect(chatStore.drafts[B]).toBe('B 里写了一半')
    expect(chatStore.queuedFollowUps[A]).toMatchObject({ text: '再补充一点' })
    expect(chatStore.queuedFollowUps[B]).toBeUndefined()
  })

  it('这一轮跟丢了（服务端可能仍在跑）：排队的补充要求还在；有了结局才清掉', async () => {
    const chatStore = useChatStore()
    chatStore.chatList = [
      { role: 'user', cid: 'user-1', content: 'hi' },
      { role: 'assistant', cid: 'reply-1', loading: true },
    ] as Chat.Chat[]
    chatStore.setQueuedFollowUp({ text: '再补充一点', turnId: '' }, A)
    const { wrapper } = render()
    expect(wrapper.text()).toContain('再补充一点')

    chatStore.updateGroupChatSome(1, { loading: false, recovery: 'stalled' })
    await flushPromises()
    expect(chatStore.queuedFollowUps[A]).toBeTruthy()
    // 跟丢时照样显示、可以撤回；「引导」只在生成中出现
    expect(wrapper.text()).toContain('再补充一点')
    const buttons = wrapper.findAll('button')
    expect(buttons.some(button => button.attributes('aria-label') === '删除后续要求')).toBe(true)
    expect(buttons.some(button => button.text() === '引导')).toBe(false)
    // 重新接上后照常显示
    chatStore.updateGroupChatSome(1, { loading: true, recovery: undefined })
    await flushPromises()
    expect(wrapper.text()).toContain('再补充一点')

    chatStore.updateGroupChatSome(1, { loading: false, status: 3 })
    await flushPromises()
    expect(chatStore.queuedFollowUps[A]).toBeUndefined()
  })

  it('上传失败：发送前问是否不带它发；取消就什么都不发，附件留着可以重新上传', async () => {
    const { wrapper, onConversation } = render()
    await pickFiles(wrapper, [pdf()])
    uploads[0].reject(new Error('网络错误'))
    await flushPromises()
    expect(wrapper.text()).toContain('上传失败')

    await wrapper.get('textarea').setValue('看看这份报告')
    await wrapper.get('button.btn-send').trigger('click')
    await flushPromises()
    expect(dialogs.confirm).toHaveBeenCalledTimes(1)
    expect(onConversation).not.toHaveBeenCalled()

    const retry = wrapper.findAll('button').find(button => button.text() === '重新上传')
    await retry!.trigger('click')
    expect(uploads).toHaveLength(2)
  })

  it('拖放和粘贴的文件同样加进附件；超出数量上限时只收能放下的并提示', async () => {
    const { wrapper } = render()
    const pdfs = (count: number, from = 0) =>
      Array.from(
        { length: count },
        (_, i) => new File(['%PDF'], `r${from + i}.pdf`, { type: 'application/pdf' })
      )
    await wrapper.get('footer').trigger('drop', { dataTransfer: { files: pdfs(2) } })
    expect(uploads).toHaveLength(2)

    const items = pdfs(4, 2).map(file => ({ kind: 'file', getAsFile: () => file }))
    await wrapper.get('textarea').trigger('paste', { clipboardData: { items } })
    // 默认上限 5 个：已有 2 个，粘贴 4 个只收前 3 个
    expect(uploads).toHaveLength(5)
    expect(toasts.warning).toHaveBeenCalledTimes(1)
    expect(
      useComposerAttachmentsStore()
        .list(A)
        .map(item => item.file.name)
    ).toEqual(['r0.pdf', 'r1.pdf', 'r2.pdf', 'r3.pdf', 'r4.pdf'])
  })

  it('附件按会话保存：切到别的会话看不到，切回来还在', async () => {
    const { wrapper } = render()
    await pickFiles(wrapper, [pdf()])
    const chatStore = useChatStore()
    chatStore.active = B
    await flushPromises()
    expect(wrapper.text()).not.toContain('report.pdf')
    chatStore.active = A
    await flushPromises()
    expect(wrapper.text()).toContain('report.pdf')
  })

  it('生成中补充的要求只能是文字：附件按钮停用并说明原因', async () => {
    const chatStore = useChatStore()
    chatStore.chatList = [
      { role: 'user', cid: 'user-1', content: 'hi' },
      { role: 'assistant', cid: 'reply-1', loading: true },
    ] as Chat.Chat[]
    const { wrapper } = render()
    const upload = wrapper.get<HTMLButtonElement>(
      'button[aria-label="生成中不能添加附件，可等这一轮结束后再发"]'
    )
    expect(upload.element.disabled).toBe(true)
  })

  it('发送途中换了会话：成功后清掉的是发出的那个会话的草稿，不动当前会话的', async () => {
    let finish = () => {}
    const onConversation = vi.fn(
      (_params: Chat.ConversationParams) =>
        new Promise<boolean | undefined>(resolve => {
          finish = () => resolve(undefined)
        })
    )
    const { wrapper } = render(onConversation)
    await wrapper.get('textarea').setValue('发给 A 的问题')
    await wrapper.get('button.btn-send').trigger('click')
    await flushPromises()
    expect(onConversation).toHaveBeenCalledTimes(1)

    const chatStore = useChatStore()
    chatStore.active = B
    await chatStore.setPrompt('B 里写了一半')
    finish()
    await flushPromises()
    expect(chatStore.drafts[A]).toBeUndefined()
    expect(chatStore.drafts[B]).toBe('B 里写了一半')
  })

  it('引用按会话保存：切到别的会话看不到，切回来还在', async () => {
    const chatStore = useChatStore()
    chatStore.setQuote({ text: '要引用的一段话' })
    const { wrapper } = render()
    expect(wrapper.text()).toContain('要引用的一段话')
    chatStore.active = B
    await flushPromises()
    expect(wrapper.text()).not.toContain('要引用的一段话')
    chatStore.active = A
    await flushPromises()
    expect(wrapper.text()).toContain('要引用的一段话')
  })
})
