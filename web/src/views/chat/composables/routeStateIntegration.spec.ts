import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import { useChatStore } from '@/store/modules/chat'
import { useAuthStore } from '@/store/modules/auth'
import { useChatRouteState } from './useChatRouteState'

const A = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'
const B = 'g_bbbbbbbbbbbbbbbbbbbbbbbb'
const groupsApi = vi.hoisted(() => ({ query: vi.fn() }))
const routing = vi.hoisted(() => ({ route: {} as any, replace: vi.fn() }))

vi.mock('@/api/chatGroup', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/chatGroup')>()),
  fetchQueryChatGroupsAPI: groupsApi.query,
}))
vi.mock('vue-router', () => ({
  useRoute: () => routing.route,
  useRouter: () => ({ replace: routing.replace }),
}))

const conversation = (id: string) => ({
  name: 'ChatConversation',
  path: `/c/${id}`,
  params: { workspaceId: id },
  hash: '',
  query: {},
})
const groupRow = (gid: string) => ({ gid, channel: 'web', title: gid })
const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await nextTick()
    await Promise.resolve()
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  groupsApi.query.mockReset()
  routing.replace = vi.fn(async () => undefined)
  routing.route = reactive(conversation(A))
  const auth = useAuthStore()
  auth.loadInit = true
  auth.globalConfigLoading = false
})

/** 页面已经打开 A、显示着 A 的消息 */
async function openedOnA() {
  const chat = useChatStore()
  groupsApi.query.mockResolvedValueOnce({ success: true, data: [groupRow(A), groupRow(B)] })
  vi.spyOn(chat, 'activateWorkspaceFromRoute').mockImplementation(async (id?: string) => {
    chat.active = id || ''
    chat.chatList = [{ role: 'assistant', cid: 'a-1', content: 'A 的消息' }] as Chat.Chat[]
    return true as any
  })
  const scope = effectScope()
  const state = scope.run(useChatRouteState)!
  await settle()
  expect(chat.active).toBe(A)
  return { chat, state, scope }
}

describe('重连后的会话核对（真实 store）', () => {
  it('补拉成功、A 已被删除：直接回首页，不再查第二次，先清掉 A 的消息', async () => {
    const { chat, state, scope } = await openedOnA()
    groupsApi.query.mockResolvedValueOnce({ success: true, data: [groupRow(B)] })
    await chat.queryMyGroup()
    // store 已把 active 清空，A 的消息还在：核对时清掉并回首页
    expect(chat.active).toBe('')
    await state.recheckRouteAfterReconnect()
    await settle()
    expect(groupsApi.query).toHaveBeenCalledTimes(2)
    expect(chat.chatList).toEqual([])
    expect(routing.replace).toHaveBeenCalledWith({ name: 'Chat', hash: '', query: {} })
    scope.stop()
  })

  it('补拉失败、A 不在已知列表：保留地址进入「暂时无法确认」，不再查第二次', async () => {
    const { chat, state, scope } = await openedOnA()
    chat.groupList = []
    groupsApi.query.mockRejectedValueOnce(new Error('offline'))
    await chat.queryMyGroup()
    await state.recheckRouteAfterReconnect()
    await settle()
    expect(groupsApi.query).toHaveBeenCalledTimes(2)
    expect(state.isConversationUnavailable.value).toBe(true)
    expect(routing.replace).not.toHaveBeenCalled()
    expect(chat.chatList).toEqual([])
    scope.stop()
  })

  it('A 的补拉查询途中切到 B：列表里只剩 B 也不离开 B', async () => {
    const { chat, state, scope } = await openedOnA()
    let resolveQuery: (value: unknown) => void = () => undefined
    groupsApi.query.mockImplementationOnce(() => new Promise(resolve => (resolveQuery = resolve)))
    const refreshing = chat.queryMyGroup()
    Object.assign(routing.route, conversation(B))
    await settle()
    resolveQuery({ success: true, data: [groupRow(B)] })
    await refreshing
    await state.recheckRouteAfterReconnect()
    await settle()
    expect(routing.replace).not.toHaveBeenCalled()
    expect(state.isConversationUnavailable.value).toBe(false)
    scope.stop()
  })

  it('查询过列表后 active 已被清空、旧消息还挂着：切到未知地址时等列表期间先清掉', async () => {
    const { chat, scope } = await openedOnA()
    chat.active = ''
    expect(chat.chatList).toHaveLength(1)
    groupsApi.query.mockImplementationOnce(() => new Promise(() => undefined))
    Object.assign(routing.route, conversation('g_zzzzzzzzzzzzzzzzzzzzzzzz'))
    await settle()
    expect(chat.chatList).toEqual([])
    scope.stop()
  })

  it('深链首开时列表没拉到、停在「暂时无法确认」：重连补拉到了就直接打开它，不再查第二次', async () => {
    const chat = useChatStore()
    const activate = vi
      .spyOn(chat, 'activateWorkspaceFromRoute')
      .mockImplementation(async (id?: string) => {
        chat.active = id || ''
        chat.chatList = [{ role: 'assistant', cid: 'a-1', content: 'A 的消息' }] as Chat.Chat[]
        return true as any
      })
    groupsApi.query.mockRejectedValueOnce(new Error('offline'))
    const scope = effectScope()
    const state = scope.run(useChatRouteState)!
    await settle()
    expect(state.isConversationUnavailable.value).toBe(true)

    groupsApi.query.mockResolvedValueOnce({ success: true, data: [groupRow(A)] })
    await chat.queryMyGroup()
    await state.recheckRouteAfterReconnect()
    await settle()
    expect(groupsApi.query).toHaveBeenCalledTimes(2)
    expect(activate).toHaveBeenCalledWith(A, expect.anything())
    expect(state.isConversationUnavailable.value).toBe(false)
    expect(state.isConversationReady.value).toBe(true)
    expect(chat.active).toBe(A)
    expect(routing.replace).not.toHaveBeenCalled()
    scope.stop()
  })

  it('路由激活还在等消息时重连核对确认 A 已删除：回首页，之后激活才返回也不改状态', async () => {
    const chat = useChatStore()
    groupsApi.query.mockResolvedValueOnce({ success: true, data: [groupRow(A)] })
    let finishActivation: () => void = () => undefined
    vi.spyOn(chat, 'activateWorkspaceFromRoute').mockImplementation(async (id?: string) => {
      // 与真实 store 一样：先切到目标会话，再等消息
      chat.active = id || ''
      await new Promise<void>(resolve => (finishActivation = resolve))
    })
    const scope = effectScope()
    const state = scope.run(useChatRouteState)!
    await settle()
    expect(chat.active).toBe(A)
    expect(state.status.value).toBe('conversation-loading')

    groupsApi.query.mockResolvedValueOnce({ success: true, data: [groupRow(B)] })
    await chat.queryMyGroup()
    await state.recheckRouteAfterReconnect()
    await settle()
    expect(routing.replace).toHaveBeenCalledWith({ name: 'Chat', hash: '', query: {} })
    expect(state.status.value).toBe('conversation-empty')

    finishActivation()
    await settle()
    expect(state.status.value).toBe('conversation-empty')
    expect(groupsApi.query).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('路由激活还在等消息、A 已被同步移出列表、重连补拉失败：进入「暂时无法确认」，之后激活才返回也不覆盖', async () => {
    const chat = useChatStore()
    groupsApi.query.mockResolvedValueOnce({ success: true, data: [groupRow(A), groupRow(B)] })
    let finishActivation: () => void = () => undefined
    vi.spyOn(chat, 'activateWorkspaceFromRoute').mockImplementation(async (id?: string) => {
      chat.active = id || ''
      await new Promise<void>(resolve => (finishActivation = resolve))
    })
    const scope = effectScope()
    const state = scope.run(useChatRouteState)!
    await settle()
    expect(chat.active).toBe(A)

    // 别处删除了 A（同步事件移出列表），随后重连补拉失败
    chat.groupList = chat.groupList.filter(item => item.uuid !== A)
    groupsApi.query.mockRejectedValueOnce(new Error('offline'))
    await chat.queryMyGroup()
    await state.recheckRouteAfterReconnect()
    await settle()
    expect(state.isConversationUnavailable.value).toBe(true)

    finishActivation()
    await settle()
    expect(state.isConversationUnavailable.value).toBe(true)
    expect(routing.replace).not.toHaveBeenCalled()
    scope.stop()
  })
})
