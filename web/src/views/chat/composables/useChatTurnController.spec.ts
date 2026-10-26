import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import type { AgentEvent } from '@99agent/contracts'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import { eventBus } from '@/core/events/eventBus'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { useChatTurnController } from './useChatTurnController'

/** 假 socket：记录订阅，测试里按服务端的样子推事件 */
const socket = vi.hoisted(() => {
  const listeners = new Map<string, Set<(data: unknown) => void>>()
  return {
    listeners,
    connected: true,
    on(event: string, handler: (data: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
      return () => listeners.get(event)?.delete(handler)
    },
    push(event: string, data?: unknown) {
      listeners.get(event)?.forEach(handler => handler(data))
    },
  }
})
const api = vi.hoisted(() => ({
  startChat: vi.fn(),
  resyncChat: vi.fn(),
  stopChat: vi.fn(),
}))
const ui = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  confirm: vi.fn(async () => true),
}))
const navigation = vi.hoisted(() => ({
  createConversationForSubmit: vi.fn(async () => ''),
  openConversation: vi.fn(async () => true),
  leaveConversation: vi.fn(async () => undefined),
}))
const chatApi = vi.hoisted(() => ({
  groups: vi.fn(async () => ({ success: true, data: [] as unknown[] })),
  logs: vi.fn(async () => ({ data: { rows: [] as unknown[], pageInfo: { hasMore: false } } })),
  around: vi.fn(async () => ({ data: { rows: [] as unknown[] } })),
}))

vi.mock('@/services/socket-io', () => ({
  socketService: {
    on: socket.on,
    get connected() {
      return socket.connected
    },
  },
}))
vi.mock('@/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api')>()),
  startChat: api.startChat,
  resyncChat: api.resyncChat,
  stopChat: api.stopChat,
  createSubmissionId: () => 'submission-1',
}))
vi.mock('@/utils/message', () => ({
  message: () => ui,
  notifyError: vi.fn(),
}))
vi.mock('@/utils/dialog', () => ({ confirmDialog: ui.confirm }))
vi.mock('@/views/chat/composables/useConversationNavigator', () => ({
  useConversationNavigator: () => navigation,
}))
vi.mock('@/api/chatGroup', () => ({
  fetchQueryChatGroupsAPI: chatApi.groups,
  fetchCreateChatGroupAPI: vi.fn(),
  fetchUpdateChatGroupAPI: vi.fn(),
  fetchDeleteChatGroupAPI: vi.fn(),
}))
vi.mock('@/api/chatLog', () => ({
  fetchQueryChatLogListAPI: chatApi.logs,
  fetchQueryChatLogAroundAPI: chatApi.around,
  fetchDelChatLogAPI: vi.fn(),
}))

const GID = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER_GID = 'g_bbbbbbbbbbbbbbbbbbbbbbbb'
const TURN = 't-1'
let wrapper: VueWrapper | undefined

function event(
  type: AgentEvent['type'],
  data: Record<string, unknown>,
  messageId = 'a-1'
): AgentEvent {
  return {
    type,
    chatId: messageId,
    messageId,
    turnId: TURN,
    timestamp: Date.now(),
    data,
  } as AgentEvent
}

function start(messageId = 'a-1') {
  return event(
    'agent.start',
    {
      initialMessages: {
        user: { cid: 'u-1', role: 'user', content: '你好' },
        assistant: { cid: messageId, role: 'assistant', content: '' },
      },
    },
    messageId
  )
}

function startOf(submissionId: string, messageId = 'a-1', userCid = 'u-1') {
  const base = start(messageId)
  return {
    ...base,
    data: {
      ...base.data,
      submissionId,
      initialMessages: {
        user: { cid: userCid, role: 'user', content: '你好' },
        assistant: { cid: messageId, role: 'assistant', content: '' },
      },
    },
  } as AgentEvent
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const codedError = (message: string, code: string, data?: unknown) =>
  Object.assign(new Error(message), { code, data })

async function settle() {
  await flushPromises()
  await nextTick()
  await flushPromises()
}

function setup(extra: { recheckRoute?: () => Promise<void> } = {}) {
  const chatStore = useChatStore()
  chatStore.groupList = [GID, OTHER_GID].map(uuid => ({ uuid, title: '', config: '{}' }))
  chatStore.active = GID
  for (const gid of [GID, OTHER_GID]) {
    chatStore.messageCacheByWorkspace[gid] = []
    chatStore.messagePaginationByWorkspace[gid] = {
      initialized: true,
      loading: false,
      hasMore: false,
      beforeCursor: null,
    }
  }
  const view = {
    followLatest: vi.fn(),
    scrollToBottom: vi.fn(async () => undefined),
    settleLayout: vi.fn(),
    isAtBottom: () => true,
    markEnteringUserMessage: vi.fn(),
  }
  let controller!: ReturnType<typeof useChatTurnController>
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useChatTurnController({
          view,
          isMobile: ref(false),
          isAuthenticatedUser: ref(true),
          ...extra,
        })
        return () => null
      },
    })
  )
  return { chatStore, controller, view }
}

const assistant = (cid = 'a-1') => useChatStore().chatList.find(item => item.cid === cid)

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  socket.listeners.clear()
  // 关掉平滑揭示：正文增量与收尾都在同一拍落盘，断言不依赖动画帧
  window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia
  api.startChat.mockResolvedValue({ ok: true, data: { accepted: true } })
  api.resyncChat.mockResolvedValue({ ok: true, data: {} })
  api.stopChat.mockResolvedValue({ kind: 'accepted' })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('发送一轮对话', () => {
  it('发出 chat:start；agent.start 插入提问与回复占位；正文增量写进回复；agent.end 收尾并刷新会话列表', async () => {
    const { controller, view } = setup()
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    expect(api.startChat).toHaveBeenCalledWith(
      expect.objectContaining({ gid: GID, prompt: '你好', submissionId: 'submission-1' })
    )

    socket.push('agent:event', start())
    await settle()
    expect(useChatStore().chatList.map(item => item.cid)).toEqual(['u-1', 'a-1'])
    expect(assistant()).toMatchObject({ loading: true, status: ChatLogStatus.GENERATING })
    expect(view.markEnteringUserMessage).toHaveBeenCalledWith('u-1')

    socket.push('agent:event', event('message.delta', { delta: '你好，' }))
    socket.push('agent:event', event('message.delta', { delta: '有什么可以帮你？' }))
    socket.push('agent:event', event('agent.end', { finishReason: 'stop' }))
    await settle()
    expect(assistant()).toMatchObject({
      content: '你好，有什么可以帮你？',
      status: ChatLogStatus.COMPLETED,
      loading: false,
    })
    expect(chatApi.groups).toHaveBeenCalled()
    await expect(sending).resolves.toBeUndefined()
  })

  it('服务端接受后要等这一轮开始（agent.start）才算发送完成，输入框在此之前保持「发送中」', async () => {
    const { controller } = setup()
    let settled = false
    const sending = controller.onConversation({ msg: '你好' }).then(() => {
      settled = true
    })
    await settle()
    expect(api.startChat).toHaveBeenCalled()
    expect(settled).toBe(false)

    socket.push('agent:event', start())
    await sending
    expect(settled).toBe(true)
  })

  it('服务端没接受（ack 失败）：提示原因并把失败抛给输入框，由它放回草稿', async () => {
    const { controller } = setup()
    api.startChat.mockRejectedValueOnce(new Error('服务暂时不可用'))
    await expect(controller.onConversation({ msg: '你好' })).rejects.toThrow('服务暂时不可用')
    expect(ui.error).toHaveBeenCalledWith('服务暂时不可用')
  })

  it('回复出错（agent.error）：标记失败、提示原因、之后的事件不再写进这条回复', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    socket.push(
      'agent:event',
      event('agent.error', {
        code: 'AI_ERROR',
        message: '模型出错',
        retryable: true,
        turnStatus: 'failed',
      })
    )
    await settle()
    expect(assistant()).toMatchObject({ error: true, loading: false })
    expect(ui.error).toHaveBeenCalledWith('模型出错')

    socket.push('agent:event', event('message.delta', { delta: '迟到的内容' }))
    await settle()
    expect(assistant()?.content).not.toContain('迟到的内容')
  })

  it('回复中途出错：已经流出的正文留在消息里（rounds 里是全文）', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    for (const delta of ['片段 1。', '片段 2。', '片段 3。']) {
      socket.push('agent:event', event('message.delta', { delta }))
      await settle()
    }
    socket.push(
      'agent:event',
      event('agent.error', { message: '模型服务中断', turnStatus: 'failed' })
    )
    await settle()

    expect(assistant()).toMatchObject({ error: true, loading: false })
    expect(assistant()?.content).toBe('片段 1。片段 2。片段 3。')
    expect(JSON.parse(assistant()!.message as string).rounds[0].text).toBe(
      '片段 1。片段 2。片段 3。'
    )
  })

  it('发起失败：先到的 agent.error 与随后的失败回执只提示一次', async () => {
    const { controller } = setup()
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', {
      type: 'agent.error',
      chatId: 'socket:1',
      timestamp: 1,
      data: { code: 'BAD_REQUEST', message: '模型暂时不可用' },
    })
    await settle()
    ack.reject(codedError('模型暂时不可用', 'BAD_REQUEST'))
    await expect(sending).rejects.toThrow('模型暂时不可用')
    expect(ui.error).toHaveBeenCalledTimes(1)
  })

  it('回执超时：用同一提交号重发一次；仍然超时、再等一会儿也没等到这一轮开始（结果不确定）就提示，按服务端刷新会话，这一轮若已建好就接上', async () => {
    const { controller } = setup()
    api.startChat
      .mockRejectedValueOnce(codedError('连接超时', 'TIMEOUT'))
      .mockRejectedValueOnce(codedError('连接超时', 'TIMEOUT'))
    chatApi.logs.mockResolvedValueOnce({
      data: {
        rows: [
          { cid: 'u-7', role: 'user', content: '你好' },
          { cid: 'a-7', role: 'assistant', content: '', status: ChatLogStatus.GENERATING },
        ],
        pageInfo: { hasMore: false },
      },
    })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const sending = controller.onConversation({ msg: '你好' })
    const rejected = expect(sending).rejects.toThrow('连接超时')
    await vi.advanceTimersByTimeAsync(8000)
    vi.useRealTimers()
    await rejected
    await settle()
    expect(api.startChat).toHaveBeenCalledTimes(2)
    expect(api.startChat.mock.calls[1][0]).toEqual(api.startChat.mock.calls[0][0])
    expect(ui.error).toHaveBeenCalledTimes(1)
    expect(chatApi.logs).toHaveBeenCalled()
    expect(api.resyncChat).toHaveBeenCalledWith('a-7')
  })

  it('发送期间身份变了（回执 IDENTITY_CHANGED）：按取消结束，不提示、不重发', async () => {
    const { controller } = setup()
    api.startChat.mockRejectedValueOnce(codedError('', 'IDENTITY_CHANGED'))
    const sending = controller.onConversation({ msg: '你好' })
    await expect(sending).rejects.toThrow('submission cancelled')
    await settle()
    expect(api.startChat).toHaveBeenCalledTimes(1)
    expect(ui.error).not.toHaveBeenCalled()
  })

  it('超时重发时身份变了：重发的回执 IDENTITY_CHANGED 同样按取消结束', async () => {
    const { controller } = setup()
    api.startChat
      .mockRejectedValueOnce(codedError('连接超时', 'TIMEOUT'))
      .mockRejectedValueOnce(codedError('', 'IDENTITY_CHANGED'))
    const sending = controller.onConversation({ msg: '你好' })
    await expect(sending).rejects.toThrow('submission cancelled')
    expect(api.startChat).toHaveBeenCalledTimes(2)
    expect(ui.error).not.toHaveBeenCalled()
  })

  it.each(['SESSION_UNAVAILABLE', 'SESSION_INVALID'])(
    '发送回执 %s：提示一次、按服务端核对这次会话（结果不确定），不当成成功',
    async code => {
      const { controller } = setup()
      api.startChat.mockRejectedValueOnce(codedError('服务暂时不可用', code))
      const sending = controller.onConversation({ msg: '你好' })
      await expect(sending).rejects.toThrow('服务暂时不可用')
      await settle()
      expect(api.startChat).toHaveBeenCalledTimes(1)
      expect(ui.error).toHaveBeenCalledTimes(1)
      expect(chatApi.logs).toHaveBeenCalled()
    }
  )

  it.each(['SESSION_UNAVAILABLE', 'SESSION_INVALID'])(
    '超时重发得到 %s：第一次可能已被接受，按服务端核对这次会话，提示一次',
    async code => {
      const { controller } = setup()
      api.startChat
        .mockRejectedValueOnce(codedError('连接超时', 'TIMEOUT'))
        .mockRejectedValueOnce(codedError('服务暂时不可用', code))
      const sending = controller.onConversation({ msg: '你好' })
      await expect(sending).rejects.toThrow('服务暂时不可用')
      await settle()
      expect(api.startChat).toHaveBeenCalledTimes(2)
      expect(ui.error).toHaveBeenCalledTimes(1)
      expect(chatApi.logs).toHaveBeenCalled()
    }
  )

  it('回执超时后重发得到「重复提交」，这一轮的 agent.start 已经到了：当成已接受，接着收这一轮', async () => {
    const { controller } = setup()
    const firstAck = deferred<unknown>()
    api.startChat
      .mockReturnValueOnce(firstAck.promise)
      .mockResolvedValueOnce({ ok: true, data: { accepted: false, duplicate: true, cid: 'a-1' } })
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', startOf('submission-1'))
    await settle()
    firstAck.reject(codedError('连接超时', 'TIMEOUT'))
    await sending
    expect(api.startChat).toHaveBeenCalledTimes(2)
    expect(chatApi.logs).not.toHaveBeenCalled()
    expect(api.resyncChat).not.toHaveBeenCalled()
    socket.push('agent:event', event('message.delta', { delta: '接着收' }))
    await settle()
    expect(assistant()?.content).toBe('接着收')
    expect(ui.error).not.toHaveBeenCalled()
  })

  it('预检拒绝：服务端先推具体原因（限流、访客额度），再回笼统的失败回执：提示具体原因，不再按服务端刷新', async () => {
    const { controller } = setup()
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', {
      type: 'agent.error',
      chatId: 'pending',
      timestamp: 1,
      data: {
        code: 'RATE_LIMIT',
        message: '访客体验次数已达上限，请注册后继续使用！',
        submissionId: 'submission-1',
      },
    })
    await settle()
    ack.reject(codedError('请求未创建消息，请稍后再试', 'NOT_ACCEPTED'))
    await expect(sending).rejects.toThrow('请求未创建消息')
    await settle()
    expect(ui.error).toHaveBeenCalledTimes(1)
    expect(ui.error).toHaveBeenCalledWith('访客体验次数已达上限，请注册后继续使用！')
    expect(chatApi.logs).not.toHaveBeenCalled()
  })

  it('写入之后才失败（INTERNAL_ERROR）：服务端也先推了错误，但结果不确定，照样按服务端刷新会话', async () => {
    const { controller } = setup()
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', {
      type: 'agent.error',
      chatId: 'pending',
      timestamp: 1,
      data: { code: 'INTERNAL_ERROR', message: '处理请求时发生错误', submissionId: 'submission-1' },
    })
    await settle()
    ack.reject(codedError('处理请求时发生错误', 'INTERNAL_ERROR'))
    await expect(sending).rejects.toThrow('处理请求时发生错误')
    await settle()
    expect(ui.error).toHaveBeenCalledTimes(1)
    expect(chatApi.logs).toHaveBeenCalled()
  })

  it('写入后认领失败：先到的错误已经指向这一轮的消息，再回「未创建」回执：只提示一次，并按服务端刷新会话', async () => {
    const { controller } = setup()
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', {
      type: 'agent.error',
      chatId: 'a-9',
      messageId: 'a-9',
      timestamp: 1,
      data: { code: 'INTERNAL_ERROR', message: '发生未知错误', submissionId: 'submission-1' },
    })
    await settle()
    ack.reject(codedError('请求未创建消息，请稍后再试', 'NOT_ACCEPTED'))
    await expect(sending).rejects.toThrow('请求未创建消息')
    await settle()
    expect(ui.error).toHaveBeenCalledTimes(1)
    expect(ui.error).toHaveBeenCalledWith('发生未知错误')
    expect(chatApi.logs).toHaveBeenCalled()
  })

  it('两次回执都超时，但稍等之后这一轮的 agent.start 到了：当成已接受，接着收这一轮，不提示失败', async () => {
    const { controller, chatStore } = setup()
    api.startChat
      .mockRejectedValueOnce(codedError('连接超时', 'TIMEOUT'))
      .mockRejectedValueOnce(codedError('连接超时', 'TIMEOUT'))
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', startOf('submission-1'))
    await sending
    expect(chatStore.chatList.map(item => item.cid)).toEqual(['u-1', 'a-1'])
    socket.push('agent:event', event('message.delta', { delta: '晚到的这一轮' }))
    await settle()
    expect(assistant()?.content).toBe('晚到的这一轮')
    expect(ui.error).not.toHaveBeenCalled()
    expect(chatApi.logs).not.toHaveBeenCalled()
  })

  it('两次回执都超时之前，这一轮已经开始并结束（订阅已清掉）：仍当成已接受，不提示失败', async () => {
    const { controller, chatStore } = setup()
    const second = deferred<unknown>()
    api.startChat
      .mockRejectedValueOnce(codedError('连接超时', 'TIMEOUT'))
      .mockReturnValueOnce(second.promise)
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', startOf('submission-1'))
    await settle()
    socket.push('agent:event', event('agent.end', { finishReason: 'stop' }))
    await settle()
    second.reject(codedError('连接超时', 'TIMEOUT'))
    await expect(sending).resolves.toBeUndefined()
    expect(chatStore.chatList.map(item => item.cid)).toEqual(['u-1', 'a-1'])
    expect(assistant()?.status).toBe(ChatLogStatus.COMPLETED)
    expect(ui.error).not.toHaveBeenCalled()
  })

  it('两次回执都超时、这一轮已接续到下一轮而接续轮出错：仍当成已接受，只提示接续轮的错误', async () => {
    const { controller } = setup()
    const second = deferred<unknown>()
    api.startChat
      .mockRejectedValueOnce(codedError('连接超时', 'TIMEOUT'))
      .mockReturnValueOnce(second.promise)
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', startOf('submission-1'))
    await settle()
    socket.push('agent:event', event('agent.end', { finishReason: 'handoff' }))
    await settle()
    socket.push('agent:event', {
      type: 'agent.error',
      chatId: 'pending',
      timestamp: 1,
      data: {
        code: 'EXECUTION_START_FAILED',
        message: '执行未能启动，请重试',
        submissionId: 'submission-1',
        parentTurnId: TURN,
      },
    })
    await settle()
    second.reject(codedError('连接超时', 'TIMEOUT'))
    await expect(sending).resolves.toBeUndefined()
    expect(ui.error).toHaveBeenCalledTimes(1)
    expect(ui.error).toHaveBeenCalledWith('执行未能启动，请重试')
  })

  it('两次回执都超时、等这一轮开始时先到了发起失败的原因：马上提示这个原因，不再干等', async () => {
    const { controller } = setup()
    api.startChat
      .mockRejectedValueOnce(codedError('连接超时', 'TIMEOUT'))
      .mockRejectedValueOnce(codedError('连接超时', 'TIMEOUT'))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const sending = controller.onConversation({ msg: '你好' })
      const rejected = expect(sending).rejects.toThrow('连接超时')
      await vi.advanceTimersByTimeAsync(0)
      socket.push('agent:event', {
        type: 'agent.error',
        chatId: 'pending',
        timestamp: 1,
        data: { code: 'RATE_LIMITED', message: '请求太频繁', submissionId: 'submission-1' },
      })
      await vi.advanceTimersByTimeAsync(100)
      expect(ui.error).toHaveBeenCalledWith('请求太频繁')
      await vi.advanceTimersByTimeAsync(8000)
      await rejected
      expect(ui.error).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('回执前收到与这次发送无关的错误（别的一串回合、这个连接上别的操作）：服务端接受后照常进行', async () => {
    const { controller, chatStore } = setup()
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    // 别的一串回合的接续轮没能启动：带着它自己的提交号、占位 id
    socket.push('agent:event', {
      type: 'agent.error',
      chatId: 'pending',
      timestamp: 1,
      data: { code: 'QUEUE_TURN_ERROR', message: '接续消息处理失败', submissionId: 'other' },
    })
    // 这个连接上别的操作失败：不带提交号、不指向消息
    socket.push('agent:event', {
      type: 'agent.error',
      chatId: 'socket:1',
      timestamp: 1,
      data: { code: 'BAD_REQUEST', message: '别的操作失败' },
    })
    await settle()
    ack.resolve({ ok: true, data: { accepted: true } })
    await settle()
    socket.push('agent:event', startOf('submission-1'))
    await sending
    expect(chatStore.chatList.map(item => item.cid)).toEqual(['u-1', 'a-1'])
    socket.push('agent:event', event('message.delta', { delta: '正文' }))
    await settle()
    expect(assistant()?.content).toBe('正文')
    expect(ui.error).not.toHaveBeenCalled()
  })

  it('接续下一轮之前（handoff 窗口）：别的提交的 agent.start 不认，这一串的下一轮照常接上', async () => {
    const { controller, chatStore } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', startOf('submission-1'))
    await settle()
    socket.push('agent:event', event('agent.end', { finishReason: 'handoff' }))
    await settle()
    socket.push('agent:event', startOf('submission-other', 'a-other', 'u-other'))
    await settle()
    expect(chatStore.chatList.map(item => item.cid)).toEqual(['u-1', 'a-1'])
    socket.push('agent:event', startOf('submission-1', 'a-2', 'u-2'))
    await settle()
    expect(chatStore.chatList.map(item => item.cid)).toEqual(['u-1', 'a-1', 'u-2', 'a-2'])
  })

  it('接续的下一轮没能开始（服务端推来错误）：提示原因，并按服务端刷新会话看那条补充要求落成了什么', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', startOf('submission-1'))
    await settle()
    socket.push('agent:event', event('agent.end', { finishReason: 'handoff' }))
    await settle()
    chatApi.logs.mockClear()
    socket.push('agent:event', {
      type: 'agent.error',
      chatId: 'pending',
      timestamp: 1,
      data: {
        code: 'EXECUTION_START_FAILED',
        message: '执行未能启动，请重试',
        submissionId: 'submission-1',
      },
    })
    await settle()
    expect(ui.error).toHaveBeenCalledWith('执行未能启动，请重试')
    expect(chatApi.logs).toHaveBeenCalled()
  })

  it('首轮带附件时，接续轮的提问用服务端给的，不沿用首轮的附件', async () => {
    const { controller, chatStore } = setup()
    void controller.onConversation({
      msg: '看看这张图',
      urlItems: [{ type: 'image', url: 'https://example.com/photo.png', name: 'photo.png' }],
    })
    await settle()
    socket.push('agent:event', startOf('submission-1'))
    await settle()
    expect(chatStore.chatList.find(item => item.cid === 'u-1')?.message).toContain('photo.png')
    socket.push('agent:event', event('agent.end', { finishReason: 'handoff' }))
    await settle()
    socket.push('agent:event', startOf('submission-1', 'a-2', 'u-2'))
    await settle()
    expect(chatStore.chatList.find(item => item.cid === 'u-2')?.message).toBeUndefined()
  })

  it('等自己这一轮开始时，别的提交（别的页签）的 agent.start 不认', async () => {
    const { controller, chatStore } = setup()
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', startOf('submission-other', 'a-other', 'u-other'))
    await settle()
    expect(chatStore.chatList).toEqual([])
    socket.push('agent:event', startOf('submission-1'))
    await sending
    expect(chatStore.chatList.map(item => item.cid)).toEqual(['u-1', 'a-1'])
  })

  it('重复提交被拒：刷新消息列表，并接上正在运行的那一轮（发送还占着提交锁时也接）', async () => {
    const { controller, chatStore } = setup()
    // 输入框在发送期间占着提交锁
    chatStore.acquireSubmitLock()
    api.startChat.mockResolvedValueOnce({ ok: true, data: { accepted: false, cid: 'a-9' } })
    chatApi.logs.mockResolvedValueOnce({
      data: {
        rows: [
          {
            cid: 'a-9',
            role: 'assistant',
            content: '',
            status: ChatLogStatus.GENERATING,
            loading: true,
          },
        ],
        pageInfo: { hasMore: false },
      },
    })
    await controller.onConversation({ msg: '你好' })
    await settle()
    expect(chatApi.logs).toHaveBeenCalled()
    expect(api.resyncChat).toHaveBeenCalledWith('a-9')
  })
})

describe('重新生成 / 编辑重发', () => {
  function withEarlierTurns() {
    const chatStore = useChatStore()
    chatStore.chatList = [
      { cid: 'c_0000000000000000q1', role: 'user', content: '第一问' },
      { cid: 'a-old-1', role: 'assistant', content: '第一答', status: ChatLogStatus.COMPLETED },
      { cid: 'c_0000000000000000q2', role: 'user', content: '第二问' },
      { cid: 'a-old-2', role: 'assistant', content: '第二答', status: ChatLogStatus.COMPLETED },
    ] as Chat.Chat[]
    return chatStore
  }

  it('把要替换的回合交给服务端：没被接受时原来的问答原样保留', async () => {
    const { controller } = setup()
    const chatStore = withEarlierTurns()
    api.startChat.mockRejectedValueOnce(new Error('服务暂时不可用'))
    await expect(
      controller.onConversation({ msg: '第二问', cid: 'c_0000000000000000q2' })
    ).rejects.toThrow('服务暂时不可用')
    expect(api.startChat).toHaveBeenCalledWith(
      expect.objectContaining({ replaceFromCid: 'c_0000000000000000q2' })
    )
    expect(chatStore.chatList.map(item => item.cid)).toEqual([
      'c_0000000000000000q1',
      'a-old-1',
      'c_0000000000000000q2',
      'a-old-2',
    ])
  })

  it('服务端开始新一轮时本地才去掉原来的回合，换上新的问答', async () => {
    const { controller } = setup()
    const chatStore = withEarlierTurns()
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    void controller.onConversation({ msg: '第二问（改）', cid: 'c_0000000000000000q2' })
    await settle()
    expect(chatStore.chatList).toHaveLength(4)
    socket.push('agent:event', start())
    await settle()
    ack.resolve({ ok: true, data: { accepted: true } })
    await settle()
    expect(chatStore.chatList.map(item => item.cid)).toEqual([
      'c_0000000000000000q1',
      'a-old-1',
      'u-1',
      'a-1',
    ])
  })

  it('连点两次只发一次；发出期间占着提交锁（输入框显示发送中、切换会话先等）', async () => {
    const { controller } = setup()
    const chatStore = withEarlierTurns()
    const first = controller.onConversation({ msg: '第二问', cid: 'c_0000000000000000q2' })
    await expect(
      controller.onConversation({ msg: '第二问', cid: 'c_0000000000000000q2' })
    ).resolves.toBe(false)
    await settle()
    expect(chatStore.isSubmitting).toBe(true)
    expect(api.startChat).toHaveBeenCalledTimes(1)
    expect(api.startChat).toHaveBeenCalledWith(
      expect.objectContaining({ replaceFromCid: 'c_0000000000000000q2', replaceLaterTurns: 0 })
    )
    socket.push('agent:event', start())
    await first
    expect(chatStore.isSubmitting).toBe(false)
  })

  it('有跟丢的回复（服务端可能仍在跑）：先说明原因，不确认也不发', async () => {
    const { controller } = setup()
    const chatStore = withEarlierTurns()
    chatStore.chatList[3] = {
      ...chatStore.chatList[3],
      status: ChatLogStatus.GENERATING,
      recovery: 'stalled',
    }
    await expect(
      controller.onConversation({ msg: '第一问', cid: 'c_0000000000000000q1' })
    ).rejects.toThrow()
    expect(ui.info).toHaveBeenCalledWith(expect.stringContaining('重新连接'))
    expect(ui.confirm).not.toHaveBeenCalled()
    expect(api.startChat).not.toHaveBeenCalled()
  })

  it('确认框开着期间页面换了会话：不再发', async () => {
    const { controller, chatStore } = setup()
    withEarlierTurns()
    ui.confirm.mockImplementationOnce(async () => {
      chatStore.active = OTHER_GID
      return true
    })
    await expect(
      controller.onConversation({ msg: '第一问', cid: 'c_0000000000000000q1' })
    ).resolves.toBe(false)
    expect(api.startChat).not.toHaveBeenCalled()
  })

  it('页面只显示了一部分：服务端说后面实际有 3 轮，按实际轮数再确认一次后重发', async () => {
    const { controller } = setup()
    withEarlierTurns()
    api.startChat.mockRejectedValueOnce(
      codedError('对不上', 'REPLACE_RANGE_CHANGED', { laterTurns: 3 })
    )
    const sending = controller.onConversation({ msg: '第一问（改）', cid: 'c_0000000000000000q1' })
    await settle()
    expect(ui.confirm).toHaveBeenCalledTimes(2)
    expect(ui.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: expect.stringContaining('3') })
    )
    expect(api.startChat).toHaveBeenCalledTimes(2)
    expect(api.startChat.mock.calls[0][0]).toMatchObject({ replaceLaterTurns: 1 })
    expect(api.startChat.mock.calls[1][0]).toMatchObject({ replaceLaterTurns: 3 })
    expect(ui.error).not.toHaveBeenCalled()
    socket.push('agent:event', start())
    await sending
  })

  it('再确认时取消：不再发，按服务端刷新会话', async () => {
    const { controller } = setup()
    withEarlierTurns()
    ui.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    api.startChat.mockRejectedValueOnce(
      codedError('对不上', 'REPLACE_RANGE_CHANGED', { laterTurns: 3 })
    )
    await expect(
      controller.onConversation({ msg: '第一问（改）', cid: 'c_0000000000000000q1' })
    ).resolves.toBe(false)
    await settle()
    expect(api.startChat).toHaveBeenCalledTimes(1)
    expect(chatApi.logs).toHaveBeenCalled()
  })

  it('这条提问已经不在、后面还有回复在生成：说明原因并按服务端刷新，不当成普通失败提示', async () => {
    for (const [code, notice] of [
      ['REPLACE_TARGET_GONE', ui.warning],
      ['TURN_RUNNING', ui.info],
    ] as const) {
      const { controller } = setup()
      withEarlierTurns()
      vi.clearAllMocks()
      api.startChat.mockRejectedValueOnce(codedError('拒绝', code))
      await expect(
        controller.onConversation({ msg: '第二问', cid: 'c_0000000000000000q2' })
      ).rejects.toThrow('拒绝')
      await settle()
      expect(notice).toHaveBeenCalledTimes(1)
      expect(ui.error).not.toHaveBeenCalled()
      expect(chatApi.logs).toHaveBeenCalled()
      wrapper?.unmount()
    }
  })

  it('替换被拒时服务端先推 agent.error、再回失败回执：只按冲突说明一次，不当成普通失败', async () => {
    const { controller } = setup()
    withEarlierTurns()
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    const sending = controller.onConversation({ msg: '第二问', cid: 'c_0000000000000000q2' })
    await settle()
    socket.push('agent:event', {
      type: 'agent.error',
      chatId: 'socket:1',
      timestamp: 1,
      data: {
        code: 'REPLACE_TARGET_GONE',
        message: '这条消息已不在',
        submissionId: 'submission-1',
      },
    })
    await settle()
    ack.reject(codedError('这条消息已不在', 'REPLACE_TARGET_GONE'))
    await expect(sending).rejects.toThrow('这条消息已不在')
    await settle()
    expect(ui.warning).toHaveBeenCalledTimes(1)
    expect(ui.error).not.toHaveBeenCalled()
  })

  it('刚停下回复就重新生成：服务端还没落成已停止（TURN_RUNNING）时稍等自动再发一次，不打扰用户', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    try {
      const { controller } = setup()
      const chatStore = withEarlierTurns()
      chatStore.chatList[3] = {
        ...chatStore.chatList[3],
        status: ChatLogStatus.GENERATING,
        loading: true,
      }
      await controller.stopReply()
      expect(api.stopChat).toHaveBeenCalledWith('a-old-2', expect.any(Function))

      api.startChat.mockRejectedValueOnce(codedError('还在生成', 'TURN_RUNNING'))
      const sending = controller.onConversation({ msg: '第二问', cid: 'c_0000000000000000q2' })
      await vi.advanceTimersByTimeAsync(0)
      expect(api.startChat).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1500)
      expect(api.startChat).toHaveBeenCalledTimes(2)
      // 只确认一次（这里后面没有更多轮，不弹确认框），被拒的那次不提示
      expect(ui.confirm).not.toHaveBeenCalled()
      expect(ui.info).not.toHaveBeenCalled()
      socket.push('agent:event', start())
      await vi.advanceTimersByTimeAsync(0)
      await sending
      expect(chatStore.chatList.map(item => item.cid)).toEqual([
        'c_0000000000000000q1',
        'a-old-1',
        'u-1',
        'a-1',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('刚停下的回复不在这次替换的范围里（在替换起点之前）：服务端说还在生成就照常说明，不自动重试', async () => {
    const { controller } = setup()
    const chatStore = withEarlierTurns()
    chatStore.chatList[1] = {
      ...chatStore.chatList[1],
      status: ChatLogStatus.GENERATING,
      loading: true,
    }
    await controller.stopReply('a-old-1')
    // 第二问之后的回合才会被替换：刚停下的第一答不在范围里
    chatStore.chatList[1] = {
      ...chatStore.chatList[1],
      status: ChatLogStatus.STOPPED,
      loading: false,
    }
    api.startChat.mockRejectedValueOnce(codedError('还在生成', 'TURN_RUNNING'))
    await expect(
      controller.onConversation({ msg: '第二问', cid: 'c_0000000000000000q2' })
    ).rejects.toThrow('还在生成')
    expect(api.startChat).toHaveBeenCalledTimes(1)
    expect(ui.info).toHaveBeenCalled()
  })

  it('替换被接受、agent.start 到之前已经切走：那个会话缓存里的旧回合也去掉', async () => {
    const { controller, chatStore } = setup()
    withEarlierTurns()
    chatStore.messageCacheByWorkspace[GID] = chatStore.chatList
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    void controller.onConversation({ msg: '第二问（改）', cid: 'c_0000000000000000q2' })
    await settle()
    chatStore.active = OTHER_GID
    chatStore.chatList = []
    await settle()
    ack.resolve({ ok: true, data: { accepted: true } })
    await settle()
    expect(chatStore.messageCacheByWorkspace[GID].map(item => item.cid)).toEqual([
      'c_0000000000000000q1',
      'a-old-1',
    ])
  })
})

describe('停止与切换', () => {
  it('停止：发出停止请求，本地落成已停止，之后的事件不再写入', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()

    await controller.stopReply()
    expect(api.stopChat).toHaveBeenCalledWith('a-1', expect.any(Function))
    expect(assistant()).toMatchObject({ status: ChatLogStatus.STOPPED, loading: false })

    socket.push('agent:event', event('message.delta', { delta: '停止后的内容' }))
    await settle()
    expect(assistant()?.content).not.toContain('停止后的内容')
  })

  it('停止：已经流出的正文留在消息里（rounds 里是全文，不只是这一轮的第一段）', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    for (const delta of ['片段 1。', '片段 2。', '片段 3。']) {
      socket.push('agent:event', event('message.delta', { delta }))
      await settle()
    }

    await controller.stopReply()
    expect(assistant()).toMatchObject({ status: ChatLogStatus.STOPPED, loading: false })
    expect(assistant()?.content).toBe('片段 1。片段 2。片段 3。')
    // 不再生成的消息按 rounds 渲染：这里少了，界面上就少了
    expect(JSON.parse(assistant()!.message as string).rounds[0].text).toBe(
      '片段 1。片段 2。片段 3。'
    )
  })

  it('回复已按服务端落成终态后，再发下一条不会把旧会话手里的正文写回去', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    for (const delta of ['片段 1。', '片段 2。']) {
      socket.push('agent:event', event('message.delta', { delta }))
      await settle()
    }
    // 结束事件没送到，这条回复由刷新按服务端内容落成了完成（旧会话还订阅着，没有结束）
    const serverMessage = JSON.stringify({ rounds: [{ text: '片段 1。片段 2。片段 3。' }] })
    const chatStore = useChatStore()
    chatStore.updateGroupChatSome(
      chatStore.chatList.findIndex(item => item.cid === 'a-1'),
      {
        content: '片段 1。片段 2。片段 3。',
        message: serverMessage,
        status: ChatLogStatus.COMPLETED,
        loading: false,
      }
    )

    // 发下一条会先清掉旧订阅
    void controller.onConversation({ msg: '下一条' })
    await settle()

    expect(assistant()).toMatchObject({
      content: '片段 1。片段 2。片段 3。',
      message: serverMessage,
      status: ChatLogStatus.COMPLETED,
    })
  })

  it('停止请求发出到有结果之间这一条显示停止中，重复点击不再发；别的回复不受影响', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    const result = deferred<unknown>()
    api.stopChat.mockReturnValueOnce(result.promise)
    const stopping = controller.stopReply()
    await settle()
    expect(controller.isStopping()).toBe(true)
    expect(controller.isStopping('a-1')).toBe(true)
    expect(controller.isStopping('a-0')).toBe(false)
    await controller.stopReply()
    expect(api.stopChat).toHaveBeenCalledTimes(1)
    // 结果回来之前订阅、加载态都不动：事件照常写入
    socket.push('agent:event', event('message.delta', { delta: '回执前' }))
    await settle()
    expect(assistant()).toMatchObject({ loading: true })
    expect(assistant()?.content).toContain('回执前')
    result.resolve({ kind: 'accepted' })
    await stopping
    expect(controller.isStopping()).toBe(false)
    expect(assistant()).toMatchObject({ status: ChatLogStatus.STOPPED, loading: false })
  })

  it('停止跟丢的回复：只停这一条，正在接收的另一轮不受影响', async () => {
    const { controller, chatStore } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    chatStore.chatList = [
      {
        cid: 'a-0',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        recovery: 'stalled',
        recoveryRejected: true,
      },
      ...chatStore.chatList,
    ] as Chat.Chat[]

    await controller.stopReply('a-0')
    expect(api.stopChat).toHaveBeenCalledWith('a-0', expect.any(Function))
    expect(assistant('a-0')).toMatchObject({ status: ChatLogStatus.STOPPED, loading: false })
    expect(assistant('a-0')?.recovery).toBeUndefined()
    expect(assistant('a-0')?.recoveryRejected).toBeUndefined()

    socket.push('agent:event', event('message.delta', { delta: '另一轮照常' }))
    await settle()
    expect(assistant()?.content).toBe('另一轮照常')
  })

  it('停止结果无法确认：提示稍后重试，不落成已停止，订阅与加载态照旧', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    api.stopChat.mockResolvedValueOnce({ kind: 'unknown' })
    await controller.stopReply()
    expect(ui.warning).toHaveBeenCalledWith('暂时无法确认是否已停止，请稍后重试')
    expect(assistant()?.status).not.toBe(ChatLogStatus.STOPPED)
    expect(assistant()?.loading).toBe(true)
    socket.push('agent:event', event('message.delta', { delta: '继续生成' }))
    await settle()
    expect(assistant()?.content).toContain('继续生成')
  })

  it('停止被拒：提示服务端的说明（请求层已提示过的不再提示），回复照常生成', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    api.stopChat.mockResolvedValueOnce({
      kind: 'rejected',
      message: '无权操作此任务',
      notified: false,
    })
    await controller.stopReply()
    expect(ui.error).toHaveBeenCalledWith('无权操作此任务')
    api.stopChat.mockResolvedValueOnce({ kind: 'rejected', message: '已提示过', notified: true })
    await controller.stopReply()
    expect(ui.error).toHaveBeenCalledTimes(1)
    expect(assistant()).toMatchObject({ loading: true })
    expect(assistant()?.status).not.toBe(ChatLogStatus.STOPPED)
    socket.push('agent:event', event('message.delta', { delta: '照常' }))
    await settle()
    expect(assistant()?.content).toContain('照常')
  })

  it('结果已作废（换了身份或页面）：什么都不做', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    api.stopChat.mockResolvedValueOnce({ kind: 'cancelled' })
    await controller.stopReply()
    expect(ui.error).not.toHaveBeenCalled()
    expect(ui.warning).not.toHaveBeenCalled()
    expect(assistant()).toMatchObject({ loading: true })
  })

  it('回执前流给出了权威的失败结局：保留失败，不改成已停止，加载态立即收起', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    const result = deferred<unknown>()
    api.stopChat.mockReturnValueOnce(result.promise)
    const stopping = controller.stopReply()
    await settle()
    socket.push('agent:event', event('agent.error', { message: '上游出错', turnStatus: 'failed' }))
    await settle()
    result.resolve({ kind: 'accepted' })
    await stopping
    expect(assistant()).toMatchObject({ status: ChatLogStatus.FAILED, loading: false })
  })

  it('回执前只收到错误标记（不是终态）：服务端已受理取消，落成已停止', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    const result = deferred<unknown>()
    api.stopChat.mockReturnValueOnce(result.promise)
    const stopping = controller.stopReply()
    await settle()
    socket.push('agent:event', event('agent.error', { message: '连接中断' }))
    await settle()
    expect(assistant()?.error).toBe(true)
    result.resolve({ kind: 'accepted' })
    await stopping
    // 错误标记一并清掉：卡片优先按错误标记显示出错，留着就会显示「生成失败」
    expect(assistant()).toMatchObject({
      status: ChatLogStatus.STOPPED,
      loading: false,
      error: false,
    })
    expect(assistant()?.errorMessage).toBeUndefined()
  })

  it('换了身份后才回来的受理结果不落地、不滚动', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    try {
      const { controller, chatStore, view } = setup()
      void controller.onConversation({ msg: '你好' })
      await vi.advanceTimersByTimeAsync(0)
      socket.push('agent:event', start())
      await vi.advanceTimersByTimeAsync(0)
      const result = deferred<unknown>()
      api.stopChat.mockReturnValueOnce(result.promise)
      const stopping = controller.stopReply()
      await vi.advanceTimersByTimeAsync(0)
      const before = assistant()
      chatStore.clearChat({ keepDraft: true })
      chatStore.active = GID
      chatStore.chatList = before ? [before] : []
      vi.mocked(view.followLatest).mockClear()
      result.resolve({ kind: 'accepted' })
      await stopping
      await vi.advanceTimersByTimeAsync(1500)
      expect(assistant()?.status).not.toBe(ChatLogStatus.STOPPED)
      expect(view.followLatest).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('回复其实已经结束：按 cid 取这一条核对，服务端终态替换本地并收起订阅，不标成已停止', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    socket.push('agent:event', event('message.delta', { delta: '前半' }))
    await settle()
    // 之前流里来过一次非权威的错误：核对到服务端已完成后不再显示出错
    const index = useChatStore().chatList.findIndex(item => item.cid === 'a-1')
    useChatStore().updateGroupChatSome(index, { error: true, errorMessage: '连接中断' })
    chatApi.around.mockResolvedValueOnce({
      data: {
        rows: [
          { cid: 'u-1', role: 'user', content: '你好' },
          {
            cid: 'a-1',
            role: 'assistant',
            content: '前半与后半',
            status: ChatLogStatus.COMPLETED,
          },
        ],
      },
    })
    api.stopChat.mockResolvedValueOnce({ kind: 'ended', status: 'completed' })
    await controller.stopReply()
    expect(chatApi.around).toHaveBeenCalledWith(
      { gid: expect.any(String), targetCid: 'a-1', limit: 3 },
      { silentError: true }
    )
    expect(assistant()).toMatchObject({
      status: ChatLogStatus.COMPLETED,
      loading: false,
      content: '前半与后半',
      error: false,
    })
    expect(assistant()?.errorMessage).toBeUndefined()
    socket.push('agent:event', event('message.delta', { delta: '之后的事件' }))
    await settle()
    expect(assistant()?.content).toBe('前半与后半')
  })

  it('核对时服务端仍在生成或请求失败：什么都不改，订阅照旧', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    chatApi.around.mockResolvedValueOnce({
      data: {
        rows: [{ cid: 'a-1', role: 'assistant', content: '', status: ChatLogStatus.GENERATING }],
      },
    })
    api.stopChat.mockResolvedValueOnce({ kind: 'verify' })
    await controller.stopReply()
    chatApi.around.mockRejectedValueOnce(new Error('offline'))
    api.stopChat.mockResolvedValueOnce({ kind: 'ended', status: 'error' })
    await controller.stopReply()
    expect(assistant()).toMatchObject({ loading: true })
    expect(assistant()?.status).not.toBe(ChatLogStatus.STOPPED)
    socket.push('agent:event', event('message.delta', { delta: '照常' }))
    await settle()
    expect(assistant()?.content).toContain('照常')
  })

  it('核对请求回来时已切到别的会话：失败、找不到、仍在生成都丢掉原会话缓存，不改别的会话', async () => {
    const outcomes: Array<() => Promise<any>> = [
      () => Promise.reject(new Error('offline')),
      () => Promise.resolve({ data: { rows: [] } }),
      () =>
        Promise.resolve({
          data: {
            rows: [
              { cid: 'a-1', role: 'assistant', content: '', status: ChatLogStatus.GENERATING },
            ],
          },
        }),
    ]
    for (const respond of outcomes) {
      const { controller, chatStore } = setup()
      void controller.onConversation({ msg: '你好' })
      await settle()
      socket.push('agent:event', start())
      await settle()
      chatStore.messageCacheByWorkspace[GID] = chatStore.chatList
      const fetched = deferred<void>()
      chatApi.around.mockImplementationOnce(async () => {
        await fetched.promise
        return respond()
      })
      api.stopChat.mockResolvedValueOnce({ kind: 'verify' })
      const stopping = controller.stopReply()
      await settle()
      chatStore.active = OTHER_GID
      chatStore.chatList = []
      fetched.resolve()
      await stopping
      expect(chatStore.messageCacheByWorkspace[GID]).toBeUndefined()
      expect(chatStore.chatList).toEqual([])
      wrapper?.unmount()
      wrapper = undefined
      setActivePinia(createPinia())
      socket.listeners.clear()
    }
  })

  it('本地已有终态时不发核对请求', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      { cid: 'a-9', role: 'assistant', content: '完', status: ChatLogStatus.COMPLETED },
    ] as Chat.Chat[]
    api.stopChat.mockResolvedValueOnce({ kind: 'ended', status: 'completed' })
    await controller.stopReply('a-9')
    expect(chatApi.around).not.toHaveBeenCalled()
  })

  it('结果回来时已切到别的会话：不改当前会话，丢掉原会话的缓存，下次打开按服务端重新加载', async () => {
    const { controller, chatStore } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    chatStore.messageCacheByWorkspace[GID] = chatStore.chatList
    const result = deferred<unknown>()
    api.stopChat.mockReturnValueOnce(result.promise)
    const stopping = controller.stopReply()
    await settle()
    chatStore.active = OTHER_GID
    chatStore.chatList = []
    await settle()
    result.resolve({ kind: 'accepted' })
    await stopping
    expect(chatStore.messageCacheByWorkspace[GID]).toBeUndefined()
    expect(chatStore.messagePaginationByWorkspace[GID]).toBeUndefined()
  })

  describe('先清订阅再落地：积压的正文与待完成的终态不会盖掉落定的结果', () => {
    /** 打开平滑揭示，动画帧永远不到：正文积压在会话里，终态等着补完 */
    function holdFrames() {
      window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn(() => 1)
      )
      vi.stubGlobal('cancelAnimationFrame', vi.fn())
    }
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('发送的会话有积压正文时受理：正文冲刷进来，再落成已停止', async () => {
      holdFrames()
      const { controller } = setup()
      void controller.onConversation({ msg: '你好' })
      await settle()
      socket.push('agent:event', start())
      await settle()
      socket.push('agent:event', event('message.delta', { delta: '积压的一大段正文' }))
      await settle()
      await controller.stopReply()
      expect(assistant()?.content).toContain('积压的一大段正文')
      expect(assistant()).toMatchObject({ status: ChatLogStatus.STOPPED, loading: false })
    })

    it('发送的会话终态在等正文补完时受理：保留完成，不改成已停止，加载态立即收起', async () => {
      holdFrames()
      const { controller } = setup()
      void controller.onConversation({ msg: '你好' })
      await settle()
      socket.push('agent:event', start())
      await settle()
      // 第一段立即揭示，第二段积压：终态要等它补完
      socket.push('agent:event', event('message.delta', { delta: '第一段' }))
      socket.push('agent:event', event('message.delta', { delta: '还没揭示完的第二段' }))
      socket.push('agent:event', event('agent.end', { finishReason: 'stop' }))
      await settle()
      expect(assistant()?.status).not.toBe(ChatLogStatus.COMPLETED)
      await controller.stopReply()
      expect(assistant()?.content).toContain('还没揭示完的第二段')
      expect(assistant()).toMatchObject({ status: ChatLogStatus.COMPLETED, loading: false })
    })

    it('清订阅时补完的终态引发了会话切换：再核对时发现，丢掉原会话缓存、不再落地', async () => {
      holdFrames()
      const { controller, chatStore } = setup()
      void controller.onConversation({ msg: '你好' })
      await settle()
      socket.push('agent:event', start())
      await settle()
      socket.push('agent:event', event('message.delta', { delta: '第一段' }))
      socket.push('agent:event', event('message.delta', { delta: '第二段' }))
      socket.push('agent:event', event('agent.end', { finishReason: 'stop' }))
      await settle()
      chatStore.messageCacheByWorkspace[GID] = chatStore.chatList
      // 补完的终态收尾时会刷新侧栏：在这一步同步切到别的会话
      chatApi.groups.mockImplementationOnce(async () => {
        chatStore.active = OTHER_GID
        return { success: true, data: [] }
      })
      await controller.stopReply()
      expect(chatStore.messageCacheByWorkspace[GID]).toBeUndefined()
    })

    it('回复已结束、本地还有积压正文：先清订阅再合并，服务端的完整正文不被冲刷的部分正文盖掉', async () => {
      holdFrames()
      const { controller } = setup()
      void controller.onConversation({ msg: '你好' })
      await settle()
      socket.push('agent:event', start())
      await settle()
      socket.push('agent:event', event('message.delta', { delta: '本地积压的部分' }))
      await settle()
      chatApi.around.mockResolvedValueOnce({
        data: {
          rows: [
            {
              cid: 'a-1',
              role: 'assistant',
              content: '服务端完整正文',
              status: ChatLogStatus.COMPLETED,
            },
          ],
        },
      })
      api.stopChat.mockResolvedValueOnce({ kind: 'ended', status: 'completed' })
      await controller.stopReply()
      expect(assistant()).toMatchObject({
        status: ChatLogStatus.COMPLETED,
        loading: false,
        content: '服务端完整正文',
      })
    })

    it('重连续接的会话终态在等正文补完时受理：保留完成，加载态不等 300 毫秒', async () => {
      holdFrames()
      const { controller, chatStore } = setup()
      chatStore.chatList = [
        { cid: 'u-2', role: 'user', content: '问题' },
        {
          cid: 'a-2',
          role: 'assistant',
          content: '前半段',
          status: ChatLogStatus.GENERATING,
          loading: true,
        },
      ] as Chat.Chat[]
      await controller.checkAndReconnect()
      socket.push('agent:event', event('message.delta', { delta: '中段' }, 'a-2'))
      socket.push('agent:event', event('message.delta', { delta: '后半段' }, 'a-2'))
      socket.push('agent:event', event('agent.end', { finishReason: 'stop' }, 'a-2'))
      await settle()
      expect(assistant('a-2')?.status).not.toBe(ChatLogStatus.COMPLETED)
      await controller.stopReply('a-2')
      expect(assistant('a-2')?.status).toBe(ChatLogStatus.COMPLETED)
      expect(assistant('a-2')?.loading).toBe(false)
    })
  })

  it('旧网关：先推这条的错误事件、不回执，HTTP 再被拒——不抛错、不写已停止，提示不超过两条', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    api.stopChat.mockImplementationOnce(async () => {
      socket.push(
        'agent:event',
        event('agent.error', { code: 'FORBIDDEN', message: '无权操作此任务' })
      )
      await settle()
      return { kind: 'rejected', message: '无权操作此任务', notified: false }
    })
    await expect(controller.stopReply()).resolves.toBeUndefined()
    expect(controller.isStopping()).toBe(false)
    expect(assistant()?.status).not.toBe(ChatLogStatus.STOPPED)
    expect(ui.error.mock.calls.length + ui.warning.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('生成中切到别的会话：旧回复的订阅清掉，事件不会写进来', async () => {
    const { controller, chatStore } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    const cached = chatStore.chatList
    chatStore.active = OTHER_GID
    await settle()
    socket.push('agent:event', event('message.delta', { delta: '切走后的内容' }))
    await settle()
    expect(cached.find(item => item.cid === 'a-1')?.content).not.toContain('切走后的内容')
  })
})

describe('断线恢复', () => {
  it('最后一条回复仍在运行：请求补发，补发的事件写进这条回复；结束后按服务端刷新', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      { cid: 'u-2', role: 'user', content: '问题' },
      {
        cid: 'a-2',
        role: 'assistant',
        content: '前半段',
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    await controller.checkAndReconnect()
    expect(api.resyncChat).toHaveBeenCalledWith('a-2')

    socket.push('agent:event', event('message.delta', { delta: '后半段' }, 'a-2'))
    await settle()
    expect(assistant('a-2')?.content).toContain('后半段')

    socket.push('agent:event', event('agent.end', { finishReason: 'stop' }, 'a-2'))
    await settle()
    expect(chatApi.logs).toHaveBeenCalled()
  })

  it('服务端不接受恢复：标成跟丢（不再算生成中），留下原因；手动重新连接成功后事件照常写入', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      {
        cid: 'a-3',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    api.resyncChat.mockResolvedValueOnce({ ok: false, message: '任务不存在' })
    await controller.checkAndReconnect()
    expect(assistant('a-3')).toMatchObject({
      loading: false,
      recovery: 'stalled',
      recoveryMessage: '任务不存在',
    })
    expect(chatStore.isStreamIn).toBe(false)

    await controller.reconnect('a-3')
    expect(api.resyncChat).toHaveBeenLastCalledWith('a-3')
    // 服务端接受了恢复：不再是跟丢，回到生成中
    expect(assistant('a-3')).toMatchObject({ recovery: undefined, loading: true })
    socket.push('agent:event', event('message.delta', { delta: '继续' }, 'a-3'))
    await settle()
    expect(assistant('a-3')).toMatchObject({ content: '继续', recovery: undefined })
  })

  it('正在接收的回复被标成跟丢：已经流出的正文留在消息里（rounds 里是全文）', async () => {
    vi.useFakeTimers()
    try {
      const { controller } = setup()
      void controller.onConversation({ msg: '你好' })
      await vi.advanceTimersByTimeAsync(0)
      socket.push('agent:event', { ...start(), seq: 1 })
      await vi.advanceTimersByTimeAsync(0)
      for (const [seq, delta] of [
        [2, '片段 1。'],
        [3, '片段 2。'],
        [4, '片段 3。'],
      ] as const) {
        socket.push('agent:event', { ...event('message.delta', { delta }), seq })
        await vi.advanceTimersByTimeAsync(50)
      }
      // 序号跳了一截：请求补发，服务端答复这条任务已经不在
      api.resyncChat.mockResolvedValueOnce({ ok: false, message: '任务不存在' })
      socket.push('agent:event', { ...event('message.delta', { delta: '片段 9。' }), seq: 9 })
      await vi.advanceTimersByTimeAsync(500)

      expect(assistant()).toMatchObject({ loading: false, recovery: 'stalled' })
      const text = JSON.parse(assistant()!.message as string).rounds[0].text
      expect(text).toContain('片段 1。片段 2。片段 3。')
      expect(text).toBe(assistant()?.content)
    } finally {
      vi.useRealTimers()
    }
  })

  it('补发请求没送到（网络还没恢复）：不判跟丢，等网络恢复再接', async () => {
    const { controller } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    api.resyncChat.mockResolvedValueOnce({ ok: false, code: 'TIMEOUT', message: '连接超时' })
    await controller.checkAndReconnect()
    expect(api.resyncChat).toHaveBeenCalledWith('a-1', undefined)
    expect(assistant()?.loading).toBe(true)
    expect(assistant()?.recovery).toBeUndefined()
  })

  it.each(['SESSION_UNAVAILABLE', 'SESSION_INVALID', 'IDENTITY_CHANGED'])(
    '补发请求回执 %s：不判跟丢、不标记拒绝过恢复，看门狗与重连入口再试',
    async code => {
      const { controller } = setup()
      void controller.onConversation({ msg: '你好' })
      await settle()
      socket.push('agent:event', start())
      await settle()
      api.resyncChat.mockResolvedValueOnce({ ok: false, code, message: 'x' })
      await controller.checkAndReconnect()
      expect(assistant()?.loading).toBe(true)
      expect(assistant()?.recovery).toBeUndefined()
      expect(assistant()?.recoveryRejected).toBeUndefined()
    }
  )

  it.each([
    ['SESSION_UNAVAILABLE', undefined],
    ['SESSION_INVALID', undefined],
    ['NOT_FOUND', true],
  ])('重新连接回复时回执 %s：拒绝过恢复的标记为 %s', async (code, rejected) => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      {
        cid: 'a-3',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    api.resyncChat.mockResolvedValueOnce({ ok: false, code, message: 'x' })
    await controller.checkAndReconnect()
    expect(api.resyncChat).toHaveBeenCalledWith('a-3')
    expect(assistant('a-3')?.recoveryRejected).toBe(rejected)
  })

  it('跟丢的回复在切回会话、网络恢复时自动再接；服务端确认还在就回到生成中', async () => {
    const { controller, chatStore } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    chatStore.updateGroupChatSome(1, { loading: false, recovery: 'stalled' })
    expect(chatStore.isStreamIn).toBe(false)
    await controller.checkAndReconnect()
    expect(api.resyncChat).toHaveBeenCalledWith('a-1', undefined)
    expect(assistant()).toMatchObject({ loading: true, recovery: undefined })
  })

  it('服务端明确拒绝过恢复：切回页面、联网时不再自动重连；手动重新连接照常发出并清掉这个标记', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      {
        cid: 'a-3',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    // 真实的先后：服务端先推一条指向这条回复的错误，再回失败回执
    api.resyncChat.mockImplementationOnce(async () => {
      socket.push('agent:event', {
        type: 'agent.error',
        chatId: 'a-3',
        messageId: 'a-3',
        timestamp: 1,
        data: { code: 'BAD_REQUEST', message: '任务不存在' },
      })
      await settle()
      return { ok: false, code: 'BAD_REQUEST', message: '任务不存在' }
    })
    await controller.checkAndReconnect()
    expect(assistant('a-3')).toMatchObject({
      recovery: 'stalled',
      recoveryRejected: true,
      error: false,
    })
    // 拒绝那条错误不当成回复出错：不弹提示
    expect(ui.error).not.toHaveBeenCalled()

    api.resyncChat.mockClear()
    await controller.checkAndReconnect()
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(api.resyncChat).not.toHaveBeenCalled()
    expect(assistant('a-3')?.loading).toBe(false)

    await controller.reconnect('a-3')
    expect(api.resyncChat).toHaveBeenCalledWith('a-3')
    expect(assistant('a-3')?.recoveryRejected).toBeUndefined()
  })

  it('恢复被拒时不拿空内容覆盖这条回复已有的轮次', async () => {
    const { controller, chatStore } = setup()
    const rounds = JSON.stringify({ role: 'assistant', rounds: [{ text: '已经生成的一段' }] })
    chatStore.chatList = [
      {
        cid: 'a-3',
        role: 'assistant',
        content: '已经生成的一段',
        message: rounds,
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    api.resyncChat.mockImplementationOnce(async () => {
      socket.push('agent:event', {
        type: 'agent.error',
        chatId: 'a-3',
        messageId: 'a-3',
        timestamp: 1,
        data: { code: 'BAD_REQUEST', message: '任务不存在' },
      })
      await settle()
      return { ok: false, code: 'BAD_REQUEST', message: '任务不存在' }
    })
    await controller.checkAndReconnect()
    expect(assistant('a-3')?.message).toBe(rounds)
  })

  it('连接刚建好、鉴权还没完成时回的「请先登录」：不算拒绝过恢复，之后照常自动再接', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      {
        cid: 'a-3',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    api.resyncChat.mockResolvedValueOnce({ ok: false, code: 'UNAUTHORIZED', message: '请先登录' })
    await controller.checkAndReconnect()
    expect(assistant('a-3')?.recoveryRejected).toBeUndefined()
    api.resyncChat.mockClear()
    await controller.checkAndReconnect()
    expect(api.resyncChat).toHaveBeenCalledWith('a-3', undefined)
  })

  it('握手期间这条回复本身失败了（权威的失败事件）、回执又超时：保留失败与原因，照常提示', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      {
        cid: 'a-3',
        role: 'assistant',
        content: '',
        turnId: TURN,
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    const resync = deferred<unknown>()
    api.resyncChat.mockReturnValueOnce(resync.promise)
    const resuming = controller.checkAndReconnect()
    await settle()
    socket.push(
      'agent:event',
      event('agent.error', { code: 'AI_ERROR', message: '模型出错', turnStatus: 'failed' }, 'a-3')
    )
    await settle()
    resync.resolve({ ok: false, code: 'TIMEOUT', message: '连接超时' })
    await resuming
    expect(assistant('a-3')).toMatchObject({
      status: ChatLogStatus.FAILED,
      error: true,
      errorMessage: '模型出错',
      loading: false,
    })
    expect(assistant('a-3')?.recovery).toBeUndefined()
    expect(ui.error).toHaveBeenCalledWith('模型出错')
  })

  it('恢复的回执没到，但服务端已推来拒绝恢复的错误：按跟丢显示（不当成回复出错），不再自动重试', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      {
        cid: 'a-3',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    const resync = deferred<unknown>()
    api.resyncChat.mockReturnValueOnce(resync.promise)
    const resuming = controller.checkAndReconnect()
    await settle()
    socket.push(
      'agent:event',
      event('agent.error', { code: 'FORBIDDEN', message: '无权恢复这条回复' }, 'a-3')
    )
    await settle()
    // 回执超时时 resyncChat 照常返回失败回执（不是抛错）
    resync.resolve({ ok: false, code: 'TIMEOUT', message: '连接超时' })
    await resuming
    expect(assistant('a-3')).toMatchObject({
      error: false,
      loading: false,
      recovery: 'stalled',
      recoveryRejected: true,
      recoveryMessage: '无权恢复这条回复',
    })
    expect(ui.error).not.toHaveBeenCalled()
  })

  it('恢复接上的回复出错：和发送时一样按错误种类提示（违规弹说明），不只弹一句文字', async () => {
    const { controller, chatStore } = setup()
    const violation = vi.spyOn(useGlobalStoreWithOut(), 'updateContentViolationDialog')
    chatStore.chatList = [
      {
        cid: 'a-2',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    await controller.checkAndReconnect()
    socket.push(
      'agent:event',
      event('agent.error', { code: 'CONTENT_VIOLATION', message: '内容违规' }, 'a-2')
    )
    await settle()
    expect(violation).toHaveBeenCalledWith(true)
    expect(ui.error).not.toHaveBeenCalled()
  })

  /** 接续轮的 agent.start：服务端带着父回合（恢复按它认）与发起时的提交号（发送按它认） */
  const continuationStart = (
    messageId: string,
    userCid: string,
    parentTurnId: string,
    submissionId?: string
  ) =>
    ({
      type: 'agent.start',
      chatId: messageId,
      messageId,
      turnId: `turn-${messageId}`,
      timestamp: Date.now(),
      data: {
        ...(submissionId ? { submissionId } : {}),
        turn: { id: `turn-${messageId}`, status: 'running', parentTurnId },
        initialMessages: {
          user: { cid: userCid, role: 'user', content: '排队的追问' },
          assistant: { cid: messageId, role: 'assistant', content: '' },
        },
      },
    }) as AgentEvent
  const handoffSnapshot = (messageId: string) =>
    event(
      'snapshot.sync',
      {
        reason: 'resync',
        content: '父轮定稿',
        status: 'completed',
        finishReason: 'handoff',
        turn: { id: TURN, status: 'completed' },
      },
      messageId
    )

  it('恢复接上的回复补发得到「完成 + handoff」快照：父轮落成完成，别的父回合的 agent.start 不认，本父回合的接续轮被接上', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      { cid: 'u-1', role: 'user', content: '你好' },
      {
        cid: 'a-2',
        role: 'assistant',
        content: '',
        turnId: TURN,
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    api.resyncChat.mockImplementationOnce(async () => {
      socket.push('agent:event', handoffSnapshot('a-2'))
      return { ok: true, data: { accepted: true, mode: 'snapshot' } }
    })
    await controller.checkAndReconnect()
    await settle()
    expect(assistant('a-2')).toMatchObject({
      content: '父轮定稿',
      status: ChatLogStatus.COMPLETED,
      loading: false,
    })

    socket.push('agent:event', continuationStart('a-x', 'u-x', 't-other'))
    await settle()
    expect(chatStore.chatList.map(item => item.cid)).toEqual(['u-1', 'a-2'])

    socket.push('agent:event', continuationStart('a-3', 'u-3', TURN))
    await settle()
    socket.push('agent:event', event('message.delta', { delta: '接续' }, 'a-3'))
    await settle()
    expect(chatStore.chatList.map(item => item.cid)).toEqual(['u-1', 'a-2', 'u-3', 'a-3'])
    expect(assistant('a-3')?.content).toBe('接续')
    expect(assistant('a-2')?.content).toBe('父轮定稿')
  })

  it('发送中的会话补发得到「完成 + handoff」快照：别的提交号的 agent.start 不认，本次提交号的接续轮被接上', async () => {
    const { controller, chatStore } = setup()
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', startOf('submission-1'))
    await sending
    api.resyncChat.mockImplementationOnce(async () => {
      socket.push('agent:event', handoffSnapshot('a-1'))
      return { ok: true, data: { accepted: true, mode: 'snapshot' } }
    })
    await controller.checkAndReconnect()
    await settle()
    expect(assistant('a-1')).toMatchObject({ status: ChatLogStatus.COMPLETED, loading: false })

    socket.push('agent:event', continuationStart('a-x', 'u-x', TURN, 'submission-other'))
    await settle()
    expect(chatStore.chatList.map(item => item.cid)).toEqual(['u-1', 'a-1'])

    socket.push('agent:event', continuationStart('a-2', 'u-2', TURN, 'submission-1'))
    await settle()
    socket.push('agent:event', event('message.delta', { delta: '接续' }, 'a-2'))
    await settle()
    expect(chatStore.chatList.map(item => item.cid)).toEqual(['u-1', 'a-1', 'u-2', 'a-2'])
    expect(assistant('a-2')?.content).toBe('接续')
  })

  it('恢复接上的回复在接续下一轮时被限流（服务端带着父回合推错误）：提示原因并按服务端刷新', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      {
        cid: 'a-2',
        role: 'assistant',
        content: '',
        turnId: TURN,
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    await controller.checkAndReconnect()
    socket.push('agent:event', event('agent.end', { finishReason: 'handoff' }, 'a-2'))
    await settle()
    chatApi.logs.mockClear()
    socket.push('agent:event', {
      type: 'agent.error',
      chatId: 'pending',
      timestamp: 1,
      data: {
        code: 'RATE_LIMIT',
        message: '1 小时内对话次数过多',
        submissionId: 'submission-x',
        parentTurnId: TURN,
      },
    })
    await settle()
    expect(ui.error).toHaveBeenCalledWith('1 小时内对话次数过多')
    expect(chatApi.logs).toHaveBeenCalled()
  })

  it('恢复接上的那一轮结束：侧栏按服务端的顺序刷新，不把会话当成刚有新回复顶到最前', async () => {
    const { controller, chatStore } = setup()
    chatStore.groupList = chatStore.groupList.map(group => ({ ...group, title: '有标题' }))
    chatStore.chatList = [
      {
        cid: 'a-2',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    await controller.checkAndReconnect()
    chatApi.groups.mockClear()
    socket.push('agent:event', event('agent.end', { finishReason: 'stop' }, 'a-2'))
    await settle()
    expect(chatApi.groups).toHaveBeenCalled()
  })

  it('续接被发送挡住后，发送没成（如确认框里取消、建会话失败）：提交锁一释放就补一次', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      { cid: 'u-8', role: 'user', content: '上一问' },
      {
        cid: 'a-8',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        recovery: 'stalled',
      },
    ] as Chat.Chat[]
    chatStore.acquireSubmitLock()
    await controller.checkAndReconnect()
    expect(api.resyncChat).not.toHaveBeenCalled()
    // 输入框没发出去就释放了提交锁（没有走到发送失败的补救）
    chatStore.revokeSubmitLock()
    await settle()
    await new Promise(resolve => setTimeout(resolve, 0))
    await settle()
    expect(api.resyncChat).toHaveBeenCalledWith('a-8')
  })

  it('续接途中被新一轮接走，而服务端回执说那条早已结束：按服务端刷新，不标跟丢', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      { cid: 'u-8', role: 'user', content: '上一问' },
      {
        cid: 'a-8',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        recovery: 'stalled',
      },
    ] as Chat.Chat[]
    const resync = deferred<unknown>()
    api.resyncChat.mockReturnValueOnce(resync.promise)
    const resuming = controller.checkAndReconnect()
    await settle()
    chatStore.acquireSubmitLock()
    void controller.onConversation({ msg: '你好' })
    await settle()
    resync.resolve({ ok: true, data: { accepted: true, mode: 'terminal', terminal: true } })
    await resuming
    await settle()
    expect(chatApi.logs).toHaveBeenCalled()
    expect(assistant('a-8')?.recoveryMessage).toBeUndefined()
    chatStore.revokeSubmitLock()
  })

  it('正在发出新一轮时不自动续接跟丢的回复（否则会挤掉这一轮）；发送失败后再补一次', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      { cid: 'u-8', role: 'user', content: '上一问' },
      {
        cid: 'a-8',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        recovery: 'stalled',
      },
    ] as Chat.Chat[]
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    chatStore.acquireSubmitLock()
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    // 连接恢复、网络恢复都会触发续接入口（连接恢复时顺带补拉的会话列表里当前会话还在）
    chatApi.groups.mockResolvedValueOnce({
      success: true,
      data: [GID, OTHER_GID].map(gid => ({ gid, channel: 'web', title: '' })),
    })
    socket.push('socket:connected')
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(api.resyncChat).not.toHaveBeenCalled()

    ack.reject(codedError('服务暂时不可用', 'BAD_REQUEST'))
    await expect(sending).rejects.toThrow('服务暂时不可用')
    // 输入框在发送失败后释放提交锁
    chatStore.revokeSubmitLock()
    await new Promise(resolve => setTimeout(resolve, 0))
    await settle()
    expect(api.resyncChat).toHaveBeenCalledWith('a-8')
  })

  it('续接途中用户发出了新一轮：续接返回后不动新一轮的订阅，跟丢的回复回到跟丢', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      { cid: 'u-8', role: 'user', content: '上一问' },
      {
        cid: 'a-8',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        recovery: 'stalled',
        recoveryMessage: '连接恢复暂未确认',
      },
    ] as Chat.Chat[]
    const resync = deferred<unknown>()
    api.resyncChat.mockReturnValueOnce(resync.promise)
    const resuming = controller.checkAndReconnect()
    await settle()

    chatStore.acquireSubmitLock()
    void controller.onConversation({ msg: '你好' })
    await settle()
    resync.resolve({ ok: true, data: {} })
    await resuming
    expect(assistant('a-8')).toMatchObject({ recovery: 'stalled', loading: false })

    socket.push('agent:event', startOf('submission-1'))
    await settle()
    socket.push('agent:event', event('message.delta', { delta: '新一轮' }))
    await settle()
    expect(assistant()?.content).toBe('新一轮')
    chatStore.revokeSubmitLock()
  })

  it('续接途中用户发出了新一轮、握手期间服务端推来拒绝恢复的错误：这条按跟丢显示，不停在「出错」', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      { cid: 'u-8', role: 'user', content: '上一问' },
      {
        cid: 'a-8',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        recovery: 'stalled',
        recoveryMessage: '连接恢复暂未确认',
      },
    ] as Chat.Chat[]
    const resync = deferred<unknown>()
    api.resyncChat.mockReturnValueOnce(resync.promise)
    const resuming = controller.checkAndReconnect()
    await settle()
    socket.push(
      'agent:event',
      event('agent.error', { code: 'FORBIDDEN', message: '无权恢复这条回复' }, 'a-8')
    )
    await settle()

    chatStore.acquireSubmitLock()
    void controller.onConversation({ msg: '你好' })
    await settle()
    resync.resolve({ ok: false, code: 'FORBIDDEN', message: '无权恢复这条回复' })
    await resuming
    expect(assistant('a-8')).toMatchObject({
      error: false,
      loading: false,
      recovery: 'stalled',
      recoveryRejected: true,
      recoveryMessage: '无权恢复这条回复',
    })
    chatStore.revokeSubmitLock()
  })

  it('手动重新连接时网络还没恢复：回到跟丢，按钮还在，可以再试', async () => {
    const { controller, chatStore } = setup()
    chatStore.chatList = [
      {
        cid: 'a-8',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        recovery: 'stalled',
      },
    ] as Chat.Chat[]
    api.resyncChat.mockResolvedValueOnce({ ok: false, code: 'CONNECTION_FAILED' })
    await controller.reconnect('a-8')
    expect(assistant('a-8')).toMatchObject({ recovery: 'stalled' })
    expect(assistant('a-8')?.recoveryMessage).toBeTruthy()
  })

  it('长时间没有事件、重连也没有结果：先按服务端刷新，服务端已结束就用服务端的结局，不判失败', async () => {
    vi.useFakeTimers()
    try {
      const { controller, chatStore } = setup()
      chatStore.chatList = [
        {
          cid: 'a-4',
          role: 'assistant',
          content: '',
          status: ChatLogStatus.GENERATING,
          loading: true,
        },
      ] as Chat.Chat[]
      chatStore.messageCacheByWorkspace[GID] = chatStore.chatList
      await controller.checkAndReconnect()
      // 之后的补发都没送到（网络一直没恢复）：看门狗重试耗尽
      api.resyncChat.mockResolvedValue({ ok: false, code: 'TIMEOUT' })
      chatApi.logs.mockResolvedValue({
        data: {
          rows: [
            {
              cid: 'a-4',
              role: 'assistant',
              content: '早就写完了',
              status: ChatLogStatus.COMPLETED,
            },
          ],
          pageInfo: { hasMore: false },
        },
      })
      // watchdog：每 50 秒检查一次，3 次重试后耗尽
      for (let round = 0; round < 5; round += 1) await vi.advanceTimersByTimeAsync(50_000)
      expect(assistant('a-4')).toMatchObject({
        status: ChatLogStatus.COMPLETED,
        content: '早就写完了',
      })
      expect(assistant('a-4')?.error).toBeFalsy()
      expect(assistant('a-4')?.recovery).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('会话激活后的续接', () => {
  it('迟到的、别的会话的激活不处理', async () => {
    const { chatStore } = setup()
    chatStore.chatList = [
      {
        cid: 'a-5',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    eventBus.emit('chat:workspaceChanged', { workspaceId: OTHER_GID })
    await settle()
    expect(api.resyncChat).not.toHaveBeenCalled()

    eventBus.emit('chat:workspaceChanged', { workspaceId: GID })
    await settle()
    expect(api.resyncChat).toHaveBeenCalledWith('a-5')
  })

  it('订阅挂在别的会话的消息上：清掉，按当前会话重新续接', async () => {
    const { controller, chatStore } = setup()
    void controller.onConversation({ msg: '你好' })
    await settle()
    socket.push('agent:event', start())
    await settle()
    // 当前会话的消息换成了另一个会话的（订阅着的 a-1 不在其中）
    chatStore.chatList = [
      {
        cid: 'a-6',
        role: 'assistant',
        content: '',
        status: ChatLogStatus.GENERATING,
        loading: true,
      },
    ] as Chat.Chat[]
    eventBus.emit('chat:workspaceChanged', { workspaceId: GID })
    await settle()
    expect(api.resyncChat).toHaveBeenCalledWith('a-6')
    socket.push('agent:event', event('message.delta', { delta: '旧订阅的内容' }))
    await settle()
    expect(chatStore.chatList.find(item => item.cid === 'a-6')?.content).not.toContain('旧订阅')
  })
})

describe('断线重连', () => {
  it('重连后强制补拉会话列表，再交给路由状态核对当前会话（离开与否由它按此刻的地址决定）', async () => {
    const order: string[] = []
    const recheckRoute = vi.fn(async () => {
      order.push('recheck')
    })
    setup({ recheckRoute })
    chatApi.groups.mockImplementationOnce(async () => {
      order.push('groups')
      return { success: true, data: [{ gid: OTHER_GID, channel: 'web', title: '' }] }
    })
    socket.push('socket:connected')
    await settle()
    expect(order).toEqual(['groups', 'recheck'])
    // 控制器自己不再按查询前记下的会话离开（用户可能已经换了会话）
    expect(navigation.leaveConversation).not.toHaveBeenCalled()
  })

  it('挂载时还没连上：第一次连上不补拉列表', async () => {
    socket.connected = false
    setup()
    socket.push('socket:connected')
    await settle()
    expect(chatApi.groups).not.toHaveBeenCalled()
    socket.connected = true
  })
})

describe('别处同步来的变化', () => {
  it('当前会话在别处被删除：不受提交锁限制地换到下一个会话', async () => {
    setup()
    socket.push('chat:sync', { type: 'conversation_updated', conversationGid: GID, deleted: true })
    await settle()
    expect(navigation.openConversation).toHaveBeenCalledWith(OTHER_GID, { passive: true })
  })
})

describe('提交被作废之后才回来的回执', () => {
  it('停止按钮作废了这次提交，回执随后报错：不提示、不按服务端重同步，错误交给调用方静默处理', async () => {
    const { controller, chatStore } = setup()
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    chatStore.acquireSubmitLock()
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    chatStore.revokeSubmitLock()
    ack.reject(codedError('余额不足', 'INSUFFICIENT_BALANCE'))
    await expect(sending).rejects.toBeTruthy()
    await settle()
    expect(ui.error).not.toHaveBeenCalled()
    expect(api.resyncChat).not.toHaveBeenCalled()
  })

  it('发出之前就被作废（建会话、等消息加载期间）：抛「提交已取消」，不发出', async () => {
    const { controller, chatStore } = setup()
    chatStore.messagePaginationByWorkspace[GID].initialized = false
    const logs = deferred<unknown>()
    chatApi.logs.mockReturnValueOnce(logs.promise as any)
    chatStore.acquireSubmitLock()
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    chatStore.revokeSubmitLock()
    logs.resolve({ data: { rows: [], pageInfo: { hasMore: false } } })
    await expect(sending).rejects.toMatchObject({ code: 'SUBMISSION_CANCELLED' })
    expect(api.startChat).not.toHaveBeenCalled()
  })

  it('等消息加载期间身份换了：抛「身份已变化」，不为新身份发出旧问题', async () => {
    const { controller, chatStore } = setup()
    chatStore.messagePaginationByWorkspace[GID].initialized = false
    const logs = deferred<unknown>()
    chatApi.logs.mockReturnValueOnce(logs.promise as any)
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    chatStore.clearChat({ keepDraft: true })
    logs.resolve({ data: { rows: [], pageInfo: { hasMore: false } } })
    await expect(sending).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    expect(api.startChat).not.toHaveBeenCalled()
  })
})

describe('重新生成在确认、等待重试期间被作废', () => {
  function withEarlierTurns() {
    const chatStore = useChatStore()
    chatStore.chatList = [
      { cid: 'c_0000000000000000q1', role: 'user', content: '第一问' },
      { cid: 'a-old-1', role: 'assistant', content: '第一答', status: ChatLogStatus.COMPLETED },
      { cid: 'c_0000000000000000q2', role: 'user', content: '第二问' },
      { cid: 'a-old-2', role: 'assistant', content: '第二答', status: ChatLogStatus.COMPLETED },
    ] as Chat.Chat[]
    chatStore.messageCacheByWorkspace[GID] = chatStore.chatList
    return chatStore
  }

  it('确认框开着期间身份换了（之后又回到同一个会话）：不发出，抛「身份已变化」', async () => {
    const { controller } = setup()
    const chatStore = withEarlierTurns()
    const confirm = deferred<boolean>()
    ui.confirm.mockImplementationOnce(() => confirm.promise)
    const sending = controller.onConversation({ msg: '第一问（改）', cid: 'c_0000000000000000q1' })
    await settle()
    chatStore.clearChat({ keepDraft: true })
    chatStore.active = GID
    confirm.resolve(true)
    await expect(sending).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    expect(api.startChat).not.toHaveBeenCalled()
  })

  it('刚停下就重新生成、等待重试期间又点了停止：不再重新取锁发第二次', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    try {
      const { controller } = setup()
      const chatStore = withEarlierTurns()
      chatStore.chatList[3] = {
        ...chatStore.chatList[3],
        status: ChatLogStatus.GENERATING,
        loading: true,
      }
      await controller.stopReply()
      api.startChat.mockRejectedValueOnce(codedError('还在生成', 'TURN_RUNNING'))
      const sending = controller.onConversation({ msg: '第二问', cid: 'c_0000000000000000q2' })
      await vi.advanceTimersByTimeAsync(0)
      expect(api.startChat).toHaveBeenCalledTimes(1)
      chatStore.revokeSubmitLock()
      const done = expect(sending).rejects.toMatchObject({ code: 'SUBMISSION_CANCELLED' })
      await vi.advanceTimersByTimeAsync(1500)
      await done
      expect(api.startChat).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('作废之后才成功的回执', () => {
  it('回执成功时这次提交已被作废：按「已取消」交给调用方，不当成功', async () => {
    const { controller, chatStore } = setup()
    const ack = deferred<unknown>()
    api.startChat.mockReturnValueOnce(ack.promise)
    chatStore.acquireSubmitLock()
    const sending = controller.onConversation({ msg: '你好' })
    await settle()
    chatStore.revokeSubmitLock()
    ack.resolve({ ok: true, data: { accepted: true } })
    await expect(sending).rejects.toMatchObject({ code: 'SUBMISSION_CANCELLED' })
  })

  it('回执成功后、等这一轮开始期间被作废：不滚动，按「已取消」交给调用方', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    try {
      const { controller, chatStore, view } = setup()
      chatStore.acquireSubmitLock()
      const sending = controller.onConversation({ msg: '你好' })
      const done = expect(sending).rejects.toMatchObject({ code: 'SUBMISSION_CANCELLED' })
      await vi.advanceTimersByTimeAsync(0)
      view.followLatest.mockClear()
      chatStore.revokeSubmitLock()
      await vi.advanceTimersByTimeAsync(30_000)
      await done
      expect(view.followLatest).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
