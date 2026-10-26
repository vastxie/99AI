import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import i18n from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import ChatBase from './chatBase.vue'
import ConversationSkeleton from './components/ConversationSkeleton.vue'
import FooterComponent from './components/Footer/index.vue'
import Message from './components/Message/index.vue'

const A = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'
const X = 'g_xxxxxxxxxxxxxxxxxxxxxxxx'
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
// 页面里与路由状态无关的组合式函数换成最小实现：这里只看路由状态决定输入区与重试区块怎么摆
vi.mock('./composables/useChatTurnController', () => ({
  useChatTurnController: () => ({
    onConversation: vi.fn(),
    requestRegenerate: vi.fn(),
    reconnect: vi.fn(),
    stopReply: vi.fn(),
    isStopping: () => false,
    checkAndReconnect: vi.fn(async () => undefined),
    confirmDeleteMessage: vi.fn(),
  }),
}))
vi.mock('./hooks/useScroll', () => ({
  useScroll: () => ({
    scrollRef: ref(null),
    isAtBottom: ref(true),
    scrollToBottom: vi.fn(async () => undefined),
    pinToBottomNow: vi.fn(),
    followIfPinned: vi.fn(),
    adjustScrollTopBy: vi.fn(),
    recordProgrammaticScroll: vi.fn(),
    handleScroll: vi.fn(),
  }),
}))
vi.mock('./composables/useConversationLayoutFollow', () => ({
  useConversationLayoutFollow: () => ({
    footerDockHeight: ref(0),
    refreshDockObserver: vi.fn(async () => undefined),
    refreshLayoutObserver: vi.fn(async () => undefined),
    settle: vi.fn(),
    cancelSettle: vi.fn(),
    stop: vi.fn(),
  }),
}))
vi.mock('./composables/useSelectionQuote', () => ({
  useSelectionQuote: () => ({
    popover: reactive({ visible: false, top: 0, left: 0, placement: 'top' }),
    handleSelectionChange: vi.fn(),
    hidePopover: vi.fn(),
    quoteSelection: vi.fn(),
  }),
}))
vi.mock('./hooks/useMessageEntrance', () => ({
  useMessageEntrance: () => ({
    mark: vi.fn(),
    isEntering: () => false,
    handleAnimationEnd: vi.fn(),
    clear: vi.fn(),
  }),
}))
vi.mock('./composables/useConversationSwitchTransition', () => ({
  useConversationSwitchTransition: () => ({ isCanvasSwitching: ref(false) }),
}))
vi.mock('./composables/useMessageFocus', () => ({
  useMessageFocus: () => ({
    highlightedCid: ref(''),
    hasPendingFocus: () => false,
    focusMessage: vi.fn(),
  }),
}))
vi.mock('./composables/useHistoryPagination', () => ({
  useHistoryPagination: () => ({
    isLoadingOlderMessages: ref(false),
    suppressHistoryPrefetch: vi.fn(),
    maybeLoadOlderMessagesOnScroll: vi.fn(),
    retryOlderMessages: vi.fn(),
  }),
}))
vi.mock('./composables/useLandingQuery', () => ({
  useLandingQuery: () => ({ consume: vi.fn(async () => undefined) }),
}))
vi.mock('./composables/useChatShortcuts', () => ({ useChatShortcuts: vi.fn() }))
vi.mock('./composables/useConversationNavigator', () => ({
  useConversationNavigator: () => ({ startNewConversation: vi.fn() }),
}))

const conversation = (id: string) => ({
  name: 'ChatConversation',
  path: `/c/${id}`,
  params: { workspaceId: id },
  hash: '',
  query: {},
})
const groupRow = (gid: string) => ({ gid, channel: 'web', title: gid })

let wrapper: VueWrapper | undefined

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  groupsApi.query.mockReset()
  routing.replace = vi.fn(async () => undefined)
  const auth = useAuthStore()
  auth.loadInit = true
  auth.globalConfigLoading = false
  vi.spyOn(auth, 'getUserInfo').mockResolvedValue(undefined as any)
  const chat = useChatStore()
  vi.spyOn(chat, 'activateWorkspaceFromRoute').mockImplementation(async (id?: string) => {
    chat.active = id || ''
    chat.chatList = [{ role: 'assistant', cid: `${id}-1`, content: `${id} 的消息` }] as Chat.Chat[]
    return true as any
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

function mountPage() {
  wrapper = shallowMount(ChatBase, {
    global: { plugins: [i18n], stubs: { UiButton: false } },
  })
  return wrapper
}

function deferredQuery() {
  let settle: { resolve: (value: unknown) => void; reject: (error: unknown) => void } = {
    resolve: () => undefined,
    reject: () => undefined,
  }
  groupsApi.query.mockImplementationOnce(
    () => new Promise((resolve, reject) => (settle = { resolve, reject }))
  )
  return () => settle
}

describe('对话页：会话地址还没确认时的输入区', () => {
  it('首次打开深链：等列表时只有骨架，输入区不指向任何会话；列表失败换成重试区块，不跳首页；重试拉到后打开会话', async () => {
    routing.route = reactive(conversation(A))
    const chat = useChatStore()
    const pending = deferredQuery()
    const page = mountPage()
    await flushPromises()

    // 等待：骨架、没有旧消息，输入区不指向任何会话（发送时也不会另建会话，见导航的用例）
    expect(page.findComponent(ConversationSkeleton).exists()).toBe(true)
    expect(page.findAllComponents(Message)).toHaveLength(0)
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(chat.active).toBe('')

    // 失败：重试区块替换输入区，地址保留
    pending().reject(new Error('offline'))
    await flushPromises()
    const alert = page.get('[role="alert"]')
    expect(alert.text()).toContain('会话列表没有加载出来，暂时无法打开这个对话')
    expect(page.findComponent(FooterComponent).exists()).toBe(false)
    expect(page.findComponent(ConversationSkeleton).exists()).toBe(false)
    expect(routing.replace).not.toHaveBeenCalled()

    // 重试：拉到了就打开这个会话，输入区回来
    groupsApi.query.mockResolvedValueOnce({ success: true, data: [groupRow(A)] })
    await alert.get('button').trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(chat.active).toBe(A)
    expect(page.findAllComponents(Message)).toHaveLength(1)
    expect(page.findComponent(FooterComponent).exists()).toBe(true)
    expect(routing.replace).not.toHaveBeenCalled()
  })

  it('已经打开 A 时切到不在列表里的地址：等列表期间 A 的消息与发送目标都清掉', async () => {
    routing.route = reactive(conversation(A))
    const chat = useChatStore()
    groupsApi.query.mockResolvedValueOnce({ success: true, data: [groupRow(A)] })
    const page = mountPage()
    await flushPromises()
    expect(chat.active).toBe(A)
    expect(page.findAllComponents(Message)).toHaveLength(1)

    deferredQuery()
    Object.assign(routing.route, conversation(X))
    await flushPromises()
    expect(chat.active).toBe('')
    expect(page.findAllComponents(Message)).toHaveLength(0)
    expect(page.findComponent(ConversationSkeleton).exists()).toBe(true)
  })
})
