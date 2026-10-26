import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store/modules/app'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { closeHistoryLayers } from '@/composables/useHistoryLayer'
import { useConversationNavigator } from './useConversationNavigator'

const DUPLICATED = 16
const mocks = vi.hoisted(() => ({
  push: vi.fn(async (): Promise<unknown> => undefined),
  replace: vi.fn(async (): Promise<unknown> => undefined),
  // 按会话 id 与 hash 拼出地址，够判断「目标是不是当前地址」
  resolve: vi.fn((location: { params?: { workspaceId?: string }; hash?: string }) => ({
    fullPath: `/chat/${location.params?.workspaceId ?? ''}${location.hash ?? ''}`,
  })),
  route: { hash: '', fullPath: '/chat/current' } as {
    name?: string
    hash: string
    fullPath: string
  },
  isMobile: false,
  info: vi.fn(),
  notifyError: vi.fn(),
  order: [] as string[],
}))

vi.mock('@/composables/useHistoryLayer', () => ({
  closeHistoryLayers: vi.fn(async () => {
    mocks.order.push('close layers')
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, resolve: mocks.resolve }),
  useRoute: () => mocks.route,
  // 重复导航（目标就是当前地址）：路由不变，设置不会随 hash 去掉而关闭
  NavigationFailureType: { duplicated: 16 },
  isNavigationFailure: (failure: { type?: number } | undefined, type: number) =>
    failure?.type === type,
}))
vi.mock('@/hooks/useViewport', () => ({
  useViewport: () => ({
    isMobile: {
      get value() {
        return mocks.isMobile
      },
    },
  }),
}))
vi.mock('@/utils/message', () => ({
  message: () => ({ info: mocks.info, error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
  notifyError: mocks.notifyError,
}))

const GID = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.route = { hash: '', fullPath: '/chat/current' }
  mocks.isMobile = false
  mocks.order = []
})

describe('会话导航', () => {
  it('跳转之前先收起临时层并退掉它们的返回键记录，新地址不压在那几笔上面', async () => {
    const navigation = useConversationNavigator()
    mocks.push.mockImplementationOnce(async () => {
      mocks.order.push('push')
    })
    mocks.replace.mockImplementationOnce(async () => {
      mocks.order.push('replace')
    })
    await navigation.openConversation(GID)
    await navigation.openConversation(GID, { passive: true })
    expect(mocks.order).toEqual(['close layers', 'push', 'close layers', 'replace'])
  })

  it('打开会话只改路由：提交窗口内拦下并提示；记下要定位的消息、手机上收起侧栏；不先关设置', async () => {
    const chatStore = useChatStore()
    const globalStore = useGlobalStoreWithOut()
    const appStore = useAppStore()
    const navigation = useConversationNavigator()

    chatStore.isSubmitting = true
    await expect(navigation.openConversation(GID)).resolves.toBe(false)
    expect(mocks.info).toHaveBeenCalledTimes(1)
    expect(mocks.push).not.toHaveBeenCalled()

    chatStore.isSubmitting = false
    mocks.isMobile = true
    appStore.setSiderCollapsed(false)
    globalStore.updateSettingsDialog(true)
    await expect(navigation.openConversation(GID, { focusCid: 'c-9' })).resolves.toBe(true)
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'ChatConversation',
      params: { workspaceId: GID },
    })
    expect(chatStore.pendingFocusCid).toBe('c-9')
    // 换了会话：新地址不带设置的 hash，设置由覆盖层同步关闭；先关会让那边把这次跳转撤回
    expect(globalStore.settingsDialog).toBe(true)
    expect(appStore.siderCollapsed).toBe(true)
  })

  it('打开的就是当前会话（重复导航）：路由不变，临时层也不收，由这里关掉设置', async () => {
    const globalStore = useGlobalStoreWithOut()
    globalStore.updateSettingsDialog(true)
    mocks.route = { hash: '', fullPath: `/chat/${GID}` }
    mocks.push.mockResolvedValueOnce({ type: DUPLICATED })
    await useConversationNavigator().openConversation(GID)
    expect(closeHistoryLayers).not.toHaveBeenCalled()
    expect(globalStore.settingsDialog).toBe(false)
  })

  it('要定位到当前会话里的某条消息：地址不变也先收起临时层（工作台盖着对话区，定位会发生在它下面）', async () => {
    mocks.route = { hash: '', fullPath: `/chat/${GID}` }
    mocks.push.mockResolvedValueOnce({ type: DUPLICATED })
    await useConversationNavigator().openConversation(GID, { focusCid: 'c-target' })
    expect(closeHistoryLayers).toHaveBeenCalledTimes(1)
    expect(useChatStore().pendingFocusCid).toBe('c-target')
  })

  it('地址在收起临时层之后再算：等待期间 hash 变了（设置刚打开），被动跳转带上的是新的 hash', async () => {
    vi.mocked(closeHistoryLayers).mockImplementationOnce(async () => {
      mocks.route.hash = '#settings'
    })
    await useConversationNavigator().openConversation(GID, { passive: true })
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'ChatConversation',
      params: { workspaceId: GID },
      hash: '#settings',
    })
  })

  it('会话在别处被删除后的被动跳转：不受提交锁限制、替换历史、保留地址里的设置、不收起侧栏', async () => {
    const chatStore = useChatStore()
    const globalStore = useGlobalStoreWithOut()
    const appStore = useAppStore()
    chatStore.isSubmitting = true
    mocks.isMobile = true
    appStore.setSiderCollapsed(false)
    globalStore.updateSettingsDialog(true)
    mocks.route = { hash: '#settings/account', fullPath: '/chat/current#settings/account' }
    await expect(useConversationNavigator().openConversation(GID, { passive: true })).resolves.toBe(
      true
    )
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'ChatConversation',
      params: { workspaceId: GID },
      hash: '#settings/account',
    })
    expect(mocks.info).not.toHaveBeenCalled()
    expect(globalStore.settingsDialog).toBe(true)
    expect(appStore.siderCollapsed).toBe(false)
  })

  it('不是用户发起的跳转（当前会话在别处被删）不受提交锁限制，并替换历史记录', async () => {
    const chatStore = useChatStore()
    chatStore.isSubmitting = true
    const navigation = useConversationNavigator()
    await navigation.openConversation(GID, { replace: true, checkLock: false })
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'ChatConversation',
      params: { workspaceId: GID },
    })
    expect(mocks.info).not.toHaveBeenCalled()
  })

  it('开始新对话：当前已是空的新对话就留在原地；否则新建并跳过去；失败只提示一次', async () => {
    const chatStore = useChatStore()
    const navigation = useConversationNavigator()
    const create = vi.spyOn(chatStore, 'initializeWorkspace')

    vi.spyOn(chatStore, 'isCurrentConversationEmpty')
      .mockReturnValue(false)
      .mockReturnValueOnce(true)
    await expect(navigation.startNewConversation()).resolves.toBe(true)
    expect(create).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()

    create.mockResolvedValueOnce(GID)
    await expect(navigation.startNewConversation()).resolves.toBe(true)
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'ChatConversation',
      params: { workspaceId: GID },
    })

    const failure = new Error('network')
    create.mockRejectedValueOnce(failure)
    await expect(navigation.startNewConversation()).resolves.toBe(false)
    expect(mocks.notifyError).toHaveBeenCalledWith(failure, expect.any(String))
  })

  it('发送时建会话：沿用当前生效的模型（不带固定模型限制），保留地址里的 hash，替换历史记录', async () => {
    const chatStore = useChatStore()
    chatStore.draftConfig = { modelInfo: { model: 'm-1', isFixedModel: 1 } }
    mocks.route = { hash: '#settings', fullPath: '/chat/current#settings' }
    const navigation = useConversationNavigator()
    const create = vi.spyOn(chatStore, 'initializeWorkspace').mockImplementationOnce(async () => {
      chatStore.active = GID
      return GID
    })

    await expect(navigation.createConversationForSubmit()).resolves.toBe(GID)
    expect(create).toHaveBeenCalledWith(0, {
      modelInfo: { model: 'm-1', isFixedModel: false },
    })
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'ChatConversation',
      params: { workspaceId: GID },
      hash: '#settings',
    })

    create.mockRejectedValueOnce(new Error('quota'))
    await expect(navigation.createConversationForSubmit()).resolves.toBe('')
    expect(mocks.notifyError).toHaveBeenCalledTimes(1)
  })

  it('地址里的会话还没打开（列表或消息还在加载）时发送：不另建会话、不替换地址，提示正在加载', async () => {
    const chatStore = useChatStore()
    mocks.route = { name: 'ChatConversation', hash: '', fullPath: `/c/${GID}` }
    const navigation = useConversationNavigator()
    const create = vi.spyOn(chatStore, 'initializeWorkspace')

    await expect(navigation.createConversationForSubmit()).resolves.toBe('')
    expect(create).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalledWith('正在加载会话')
  })

  it('离开会话：先把当前会话清成首页状态，再回首页', async () => {
    const chatStore = useChatStore()
    chatStore.active = GID
    const navigation = useConversationNavigator()
    mocks.push.mockImplementationOnce(async () => {
      expect(chatStore.active).toBe('')
      return undefined
    })
    await navigation.leaveConversation()
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Chat' })
  })
})
