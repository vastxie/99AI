import { effectScope, nextTick, reactive, shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearUserToken, setUserToken } from '@/services/identity'
import { useChatRouteState } from './useChatRouteState'

const mocks = vi.hoisted(() => ({
  chatEpoch: 0,
  route: {} as any,
  auth: {} as any,
  chat: {} as any,
  replace: null as any,
  attachments: { moveTo: null as any },
}))
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('@/store/modules/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/store/modules/chat', () => ({
  useChatStore: () => mocks.chat,
  chatDataEpoch: () => mocks.chatEpoch,
}))
vi.mock('@/store/modules/chat/attachments', () => ({
  useComposerAttachmentsStore: () => mocks.attachments,
}))

beforeEach(() => {
  clearUserToken()
  mocks.chatEpoch = 0
  mocks.auth = reactive({ loadInit: true, globalConfigLoading: false, token: '' })
  mocks.chat = reactive({
    chatList: [{ role: 'assistant' }],
    groupList: ['g_aaaaaaaaaaaaaaaaaaaaaaaa', 'g_bbbbbbbbbbbbbbbbbbbbbbbb'].map(uuid => ({ uuid })),
    groupPagination: { initialized: false },
    queryMyGroup: vi.fn(async () => {
      mocks.chat.groupPagination.initialized = true
    }),
    activateWorkspaceFromRoute: vi.fn(async () => {}),
    resetRouteConversation: vi.fn(),
    moveDraft: vi.fn(),
  })
  mocks.replace = vi.fn(async () => undefined)
  mocks.attachments.moveTo = vi.fn()
})

describe('设置 hash 与会话路由隔离', () => {
  it('同一会话切换设置、查询参数不重新加载；真正切换会话仍加载', async () => {
    const current = shallowRef({
      name: 'ChatConversation',
      path: '/c/g_aaaaaaaaaaaaaaaaaaaaaaaa',
      params: { workspaceId: 'g_aaaaaaaaaaaaaaaaaaaaaaaa' },
      hash: '',
      query: {},
    })
    // Vue Router exposes route fields through getters backed by the same currentRoute ref.
    mocks.route = Object.fromEntries(Object.keys(current.value).map(key => [key, undefined]))
    for (const key of Object.keys(current.value)) {
      Object.defineProperty(mocks.route, key, {
        get: () => current.value[key as keyof typeof current.value],
      })
    }
    const scope = effectScope()
    const state = scope.run(useChatRouteState)!
    const settle = async () => {
      await nextTick()
      await Promise.resolve()
      await nextTick()
    }
    try {
      await settle()
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenCalledTimes(1)
      for (const hash of ['#settings', '#settings/plans', '#settings/account', '']) {
        current.value = { ...current.value, hash }
        await settle()
        expect(state.isConversationLoading.value).toBe(false)
      }
      current.value = { ...current.value, query: { view: 'test' } }
      await settle()
      expect(mocks.chat.queryMyGroup).toHaveBeenCalledTimes(1)
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenCalledTimes(1)
      current.value = {
        ...current.value,
        path: '/c/g_bbbbbbbbbbbbbbbbbbbbbbbb',
        params: { workspaceId: 'g_bbbbbbbbbbbbbbbbbbbbbbbb' },
      }
      await settle()
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenCalledTimes(2)
      expect(state.targetWorkspaceId.value).toBe('g_bbbbbbbbbbbbbbbbbbbbbbbb')
    } finally {
      scope.stop()
    }
  })
})

describe('登录后回到原会话', () => {
  function conversationRoute(workspaceId: string) {
    return {
      name: 'ChatConversation',
      path: `/c/${workspaceId}`,
      params: { workspaceId },
      hash: '',
      query: {},
    }
  }
  const settle = async () => {
    await nextTick()
    await Promise.resolve()
    await nextTick()
  }

  it('登录（含过期后重新登录）按当前路由重新激活会话；退出登录不触发', async () => {
    mocks.route = conversationRoute('g_aaaaaaaaaaaaaaaaaaaaaaaa')
    const scope = effectScope()
    scope.run(useChatRouteState)
    try {
      await settle()
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenCalledTimes(1)

      // 登录会按新身份清空会话数据（store 把列表标成未加载）
      mocks.chat.groupPagination.initialized = false
      mocks.auth.token = 'user-token'
      await settle()
      expect(mocks.chat.queryMyGroup).toHaveBeenCalledTimes(2)
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenCalledTimes(2)
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenLastCalledWith(
        'g_aaaaaaaaaaaaaaaaaaaaaaaa',
        expect.anything()
      )

      mocks.auth.token = ''
      await settle()
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenCalledTimes(2)
    } finally {
      scope.stop()
    }
  })
})

describe('切换会话不重拉整张会话列表', () => {
  it('路由里的会话已在列表里时直接激活；不在列表里（别处新建的）才拉列表', async () => {
    const current = shallowRef({
      name: 'ChatConversation',
      path: '/c/g_aaaaaaaaaaaaaaaaaaaaaaaa',
      params: { workspaceId: 'g_aaaaaaaaaaaaaaaaaaaaaaaa' },
      hash: '',
      query: {},
    })
    mocks.route = {}
    for (const key of Object.keys(current.value)) {
      Object.defineProperty(mocks.route, key, {
        get: () => current.value[key as keyof typeof current.value],
      })
    }
    const settle = async () => {
      await nextTick()
      await Promise.resolve()
      await nextTick()
    }
    const scope = effectScope()
    scope.run(useChatRouteState)
    try {
      await settle()
      expect(mocks.chat.queryMyGroup).toHaveBeenCalledTimes(1)

      const go = async (workspaceId: string) => {
        current.value = {
          ...current.value,
          path: `/c/${workspaceId}`,
          params: { workspaceId },
        }
        await settle()
      }
      await go('g_bbbbbbbbbbbbbbbbbbbbbbbb')
      expect(mocks.chat.queryMyGroup).toHaveBeenCalledTimes(1)
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenLastCalledWith(
        'g_bbbbbbbbbbbbbbbbbbbbbbbb',
        expect.anything()
      )

      mocks.chat.queryMyGroup.mockImplementationOnce(async () => {
        mocks.chat.groupList.push({ uuid: 'g_cccccccccccccccccccccccc' })
      })
      await go('g_cccccccccccccccccccccccc')
      expect(mocks.chat.queryMyGroup).toHaveBeenCalledTimes(2)
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenLastCalledWith(
        'g_cccccccccccccccccccccccc',
        expect.anything()
      )
    } finally {
      scope.stop()
    }
  })
})

describe('首页就是新对话', () => {
  const settle = async () => {
    await nextTick()
    await Promise.resolve()
    await nextTick()
  }

  it('首页不接着显示之前的会话：回到新对话状态，不激活任何会话', async () => {
    mocks.route = reactive({ name: 'Chat', path: '/', params: {}, hash: '', query: {} })
    const scope = effectScope()
    const state = scope.run(useChatRouteState)!
    try {
      await settle()
      expect(mocks.chat.resetRouteConversation).toHaveBeenCalledTimes(1)
      expect(mocks.chat.activateWorkspaceFromRoute).not.toHaveBeenCalled()
      expect(state.status.value).toBe('conversation-empty')
    } finally {
      scope.stop()
    }
  })

  it('地址里的会话不存在（已删除、不属于当前身份）：回到首页新对话', async () => {
    mocks.route = reactive({
      name: 'ChatConversation',
      path: '/c/g_zzzzzzzzzzzzzzzzzzzzzzzz',
      params: { workspaceId: 'g_zzzzzzzzzzzzzzzzzzzzzzzz' },
      hash: '#settings',
      query: {},
    })
    const scope = effectScope()
    scope.run(useChatRouteState)
    try {
      await settle()
      expect(mocks.chat.resetRouteConversation).toHaveBeenCalled()
      expect(mocks.replace).toHaveBeenCalledWith({ name: 'Chat', hash: '#settings', query: {} })
      expect(mocks.chat.activateWorkspaceFromRoute).not.toHaveBeenCalled()
    } finally {
      scope.stop()
    }
  })

  it('游客在自己的会话里写了一半后登录：会话不属于账号，回到首页并把草稿与附件带过去', async () => {
    const visitorConversation = 'g_vvvvvvvvvvvvvvvvvvvvvvvv'
    mocks.chat.groupList.push({ uuid: visitorConversation })
    mocks.route = reactive({
      name: 'ChatConversation',
      path: `/c/${visitorConversation}`,
      params: { workspaceId: visitorConversation },
      hash: '',
      query: {},
    })
    mocks.replace = vi.fn(async (location: { name: string }) => {
      Object.assign(mocks.route, { name: location.name, path: '/', params: {} })
    })
    const scope = effectScope()
    scope.run(useChatRouteState)
    try {
      await settle()
      // 登录：列表按新身份重拉，游客会话不在其中
      mocks.chat.groupPagination.initialized = false
      mocks.chat.groupList.splice(-1, 1)
      mocks.auth.token = 'user-token'
      await settle()
      await settle()
      expect(mocks.chat.moveDraft).toHaveBeenCalledWith(visitorConversation, '')
      expect(mocks.attachments.moveTo).toHaveBeenCalledWith(visitorConversation, '')
    } finally {
      scope.stop()
    }
  })
})

describe('会话列表没拉到时不丢地址', () => {
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await nextTick()
      await Promise.resolve()
    }
  }
  const Z = 'g_zzzzzzzzzzzzzzzzzzzzzzzz'
  const B = 'g_bbbbbbbbbbbbbbbbbbbbbbbb'
  const conversationRoute = (id: string) =>
    reactive({
      name: 'ChatConversation',
      path: `/c/${id}`,
      params: { workspaceId: id },
      hash: '',
      query: {},
    })

  it('首次打开深链时列表请求失败：保留地址进入「暂时无法确认」，重试拉到后打开该会话', async () => {
    mocks.route = conversationRoute(Z)
    mocks.chat.groupList = []
    mocks.chat.queryMyGroup = vi.fn(async () => {
      mocks.chat.groupPagination.failed = true
    })
    const scope = effectScope()
    const state = scope.run(useChatRouteState)!
    try {
      await settle()
      expect(state.isConversationUnavailable.value).toBe(true)
      expect(mocks.replace).not.toHaveBeenCalled()
      expect(mocks.chat.resetRouteConversation).toHaveBeenCalled()
      // 消息数变化不覆盖这个状态
      mocks.chat.chatList = [{ role: 'assistant' }, { role: 'user' }]
      await settle()
      expect(state.isConversationUnavailable.value).toBe(true)

      mocks.chat.queryMyGroup = vi.fn(async () => {
        mocks.chat.groupPagination = { initialized: true, failed: false }
        mocks.chat.groupList = [{ uuid: Z }]
      })
      await state.retryRouteSync()
      await settle()
      expect(state.isConversationUnavailable.value).toBe(false)
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenCalledWith(Z, expect.anything())
      expect(mocks.replace).not.toHaveBeenCalled()
    } finally {
      scope.stop()
    }
  })

  it('从已打开的会话切到未知地址：等列表期间先清掉原来会话的显示', async () => {
    mocks.route = conversationRoute(Z)
    mocks.chat.active = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'
    mocks.chat.groupPagination = { initialized: true }
    let resolveQuery: () => void = () => undefined
    mocks.chat.queryMyGroup = vi.fn(() => new Promise<void>(resolve => (resolveQuery = resolve)))
    const scope = effectScope()
    scope.run(useChatRouteState)
    try {
      await settle()
      // 列表还没回来：已经不显示原来的会话
      expect(mocks.chat.resetRouteConversation).toHaveBeenCalled()
      expect(mocks.chat.activateWorkspaceFromRoute).not.toHaveBeenCalled()
      resolveQuery()
      await settle()
    } finally {
      scope.stop()
    }
  })

  it('重连后的核对按此刻的地址：会话还在不打扰；已经换到别的会话不离开；确认不在才回首页，拉取失败不离开', async () => {
    const current = shallowRef(conversationRoute(B))
    mocks.route = new Proxy({}, { get: (_target, key) => (current.value as any)[key] })
    mocks.chat.groupPagination = { initialized: true, failed: false }
    const scope = effectScope()
    const state = scope.run(useChatRouteState)!
    try {
      await settle()
      mocks.chat.activateWorkspaceFromRoute.mockClear()
      // B 已经打开、还在列表里：什么都不做
      mocks.chat.active = B
      await state.recheckRouteAfterReconnect()
      expect(mocks.chat.queryMyGroup).toHaveBeenCalledTimes(0)
      expect(mocks.chat.activateWorkspaceFromRoute).not.toHaveBeenCalled()
      expect(mocks.replace).not.toHaveBeenCalled()

      // 重连补拉成功、列表里没有 B 了：直接用这次结果回首页，不再查第二次
      mocks.chat.groupList = [{ uuid: 'g_aaaaaaaaaaaaaaaaaaaaaaaa' }]
      await state.recheckRouteAfterReconnect()
      await settle()
      expect(mocks.chat.queryMyGroup).toHaveBeenCalledTimes(0)
      expect(mocks.chat.resetRouteConversation).toHaveBeenCalled()
      expect(mocks.replace).toHaveBeenCalledWith({ name: 'Chat', hash: '', query: {} })

      // 重连补拉失败：保留地址，进入「暂时无法确认」
      mocks.replace.mockClear()
      mocks.chat.groupPagination.failed = true
      await state.recheckRouteAfterReconnect()
      await settle()
      expect(mocks.chat.queryMyGroup).toHaveBeenCalledTimes(0)
      expect(mocks.replace).not.toHaveBeenCalled()
      expect(state.isConversationUnavailable.value).toBe(true)
    } finally {
      scope.stop()
    }
  })
})

describe('身份变化后的路由同步', () => {
  const visitorConversation = 'g_vvvvvvvvvvvvvvvvvvvvvvvv'
  const settle = async () => {
    await nextTick()
    await Promise.resolve()
    await nextTick()
  }

  it('登录后的同步刚走完（导航途中）又过期（会话数据代次变了）：不按这次登录搬草稿与附件', async () => {
    mocks.chat.groupList.push({ uuid: visitorConversation })
    mocks.route = reactive({
      name: 'ChatConversation',
      path: `/c/${visitorConversation}`,
      params: { workspaceId: visitorConversation },
      hash: '',
      query: {},
    })
    // 回首页的导航途中过期了：同步本身已经走完，接下来不能再按这次登录搬草稿
    mocks.replace = vi.fn(async (location: { name: string }) => {
      Object.assign(mocks.route, { name: location.name, path: '/', params: {} })
      mocks.chatEpoch += 1
    })
    const scope = effectScope()
    scope.run(useChatRouteState)
    try {
      await settle()
      expect(mocks.replace).not.toHaveBeenCalled()
      mocks.chat.groupPagination.initialized = false
      mocks.chat.groupList.splice(-1, 1)
      mocks.auth.token = 'user-token'
      await settle()
      await settle()
      expect(mocks.replace).toHaveBeenCalled()
      expect(mocks.chat.moveDraft).not.toHaveBeenCalled()
      expect(mocks.attachments.moveTo).not.toHaveBeenCalled()
    } finally {
      scope.stop()
    }
  })

  it('未登录时身份代次变了（过期、访客身份被换掉）：按当前地址重新同步；登录时不重复同步', async () => {
    mocks.route = reactive({
      name: 'ChatConversation',
      path: '/c/g_aaaaaaaaaaaaaaaaaaaaaaaa',
      params: { workspaceId: 'g_aaaaaaaaaaaaaaaaaaaaaaaa' },
      hash: '',
      query: {},
    })
    const scope = effectScope()
    scope.run(useChatRouteState)
    try {
      await settle()
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenCalledTimes(1)
      // 登录又退出：身份代次两次变化，令牌为空时按地址重新同步
      setUserToken('someone')
      clearUserToken()
      await settle()
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenCalledTimes(2)

      // 登录（令牌不为空）由令牌 watcher 负责，这里不再多同步一次
      mocks.auth.token = 'user-token'
      setUserToken('user-token')
      await settle()
      expect(mocks.chat.activateWorkspaceFromRoute).toHaveBeenCalledTimes(3)
    } finally {
      scope.stop()
    }
  })
})
