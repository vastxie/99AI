import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import {
  fetchCreateChatGroupAPI,
  fetchQueryChatGroupsAPI,
  fetchUpdateChatGroupAPI,
} from '@/api/chatGroup'
import {
  fetchDelChatLogAPI,
  fetchQueryChatLogAroundAPI,
  fetchQueryChatLogListAPI,
} from '@/api/chatLog'
import { eventBus } from '@/core/events/eventBus'
import { useModelCatalogStore } from '@/store/modules/modelCatalog'
import { MESSAGE_CACHE_LIMIT, useChatStore } from './index'

// 只 mock 会话组写接口：配置持久化走网络，测试只关心本地状态机与回滚
vi.mock('@/api/chatGroup', () => ({
  fetchUpdateChatGroupAPI: vi.fn(() => Promise.resolve({ success: true })),
  fetchCreateChatGroupAPI: vi.fn(() => Promise.resolve({ success: true, data: {} })),
  fetchDeleteChatGroupAPI: vi.fn(() => Promise.resolve({ success: true })),
  fetchQueryChatGroupsAPI: vi.fn(() => Promise.resolve({ success: true, data: [] })),
}))

// 激活会话会拉取消息列表：mock 成空列表，测试只关心会话状态机
vi.mock('@/api/chatLog', () => ({
  fetchDelChatLogAPI: vi.fn(() => Promise.resolve({ success: true })),
  fetchQueryChatLogAroundAPI: vi.fn(() => Promise.resolve({ data: { rows: [] } })),
  fetchQueryChatLogListAPI: vi.fn(() => Promise.resolve({ data: [] })),
}))

function makeGroup(uuid: string, config: unknown) {
  return {
    uuid,
    title: 't',
    isEdit: false,
    config: typeof config === 'string' ? config : JSON.stringify(config),
    updatedAt: Date.now(),
  } as any
}

const GID = 'g_abcdefghijklmnopqrstuvwx'
const OTHER_GID = 'g_zyxwvutsrqponmlkjihgfedc'

beforeEach(() => {
  vi.clearAllMocks()
  // 上一个用例没用掉的一次性返回值不串到下一个（clearAllMocks 不清它们）
  vi.mocked(fetchQueryChatLogListAPI)
    .mockReset()
    .mockResolvedValue({ data: [] } as any)
  vi.mocked(fetchQueryChatLogAroundAPI)
    .mockReset()
    .mockResolvedValue({ data: { rows: [] } } as any)
  // 草稿与偏好存在本地：上一个用例留下的不能带进下一个
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('conversation groups', () => {
  function confirmedEmpty() {
    const store = useChatStore()
    store.active = GID
    store.groupList = [makeGroup(GID, {})]
    store.chatList = []
    store.messageCacheByWorkspace[GID] = []
    store.messagePaginationByWorkspace[GID] = {
      initialized: true,
      loading: false,
      hasMore: false,
      beforeCursor: null,
    }
    return store
  }

  it('reuses a confirmed empty web conversation without clearing its draft', async () => {
    const store = confirmedEmpty()
    await store.setPrompt('unsent draft')
    expect(store.isCurrentConversationEmpty()).toBe(true)
    await expect(store.initializeWorkspace()).resolves.toBe(GID)
    expect(store.prompt).toBe('unsent draft')
    expect(fetchCreateChatGroupAPI).not.toHaveBeenCalled()
  })

  it.each([
    'uninitialized',
    'loading',
    'hasMore',
    'messages',
    'cache',
    'submitting',
    'channel',
    'missing',
  ])('does not treat %s as confirmed empty', kind => {
    const store = confirmedEmpty()
    const page = store.messagePaginationByWorkspace[GID]
    if (kind === 'uninitialized') page.initialized = false
    if (kind === 'loading') page.loading = true
    if (kind === 'hasMore') page.hasMore = true
    if (kind === 'messages') store.chatList = [{ role: 'user' } as any]
    if (kind === 'cache') delete store.messageCacheByWorkspace[GID]
    if (kind === 'submitting') store.isSubmitting = true
    if (kind === 'channel') store.groupList[0].channel = 'bot-channel'
    if (kind === 'missing') store.groupList = []
    expect(store.isCurrentConversationEmpty()).toBe(false)
  })

  it('deduplicates concurrent navigation creations and allows retry after failure', async () => {
    const store = useChatStore()
    let reject!: (error: Error) => void
    vi.mocked(fetchCreateChatGroupAPI).mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        })
    )
    const first = store.initializeWorkspace()
    const second = store.initializeWorkspace()
    const settled = Promise.allSettled([first, second])
    expect(fetchCreateChatGroupAPI).toHaveBeenCalledTimes(1)
    reject(new Error('offline'))
    expect((await settled).map(result => result.status)).toEqual(['rejected', 'rejected'])
    vi.mocked(fetchCreateChatGroupAPI).mockResolvedValueOnce({
      data: { gid: GID, channel: 'web', title: '新对话' },
    } as any)
    await expect(store.initializeWorkspace()).resolves.toBe(GID)
    expect(fetchCreateChatGroupAPI).toHaveBeenCalledTimes(2)
  })

  it('explicit first-send configuration still creates a conversation', async () => {
    const store = confirmedEmpty()
    const config = { modelInfo: { model: 'chosen-model' } }
    vi.mocked(fetchCreateChatGroupAPI).mockResolvedValueOnce({
      data: { gid: OTHER_GID, channel: 'web', title: '新对话' },
    } as any)
    await expect(store.initializeWorkspace(0, config)).resolves.toBe(OTHER_GID)
    expect(fetchCreateChatGroupAPI).toHaveBeenCalledWith({
      title: '新对话',
      config: JSON.stringify(config),
    })
  })

  it('creates a real conversation group and activates it', async () => {
    vi.mocked(fetchCreateChatGroupAPI).mockResolvedValueOnce({
      data: {
        gid: GID,
        channel: 'web',
        title: '新对话',
      },
    } as any)
    const store = useChatStore()

    await expect(store.initializeWorkspace()).resolves.toBe(GID)

    expect(fetchCreateChatGroupAPI).toHaveBeenCalledWith(
      expect.objectContaining({ title: '新对话' })
    )
    expect(store.active).toBe(GID)
    expect(store.groupList[0].uuid).toBe(GID)
  })

  it('removes a remotely deleted active conversation and selects the next visible one', () => {
    const store = useChatStore()
    store.active = GID
    store.groupList = [makeGroup(GID, {}), makeGroup(OTHER_GID, {})]
    store.chatList = [{ cid: 'old-message', role: 'assistant' } as any]
    store.messageCacheByWorkspace[GID] = store.chatList
    store.messageCacheByWorkspace[OTHER_GID] = [{ cid: 'next-message', role: 'assistant' } as any]

    expect(store.removeConversationGroupFromSync(GID)).toBe(OTHER_GID)
    expect(store.active).toBe(OTHER_GID)
    expect(store.groupList.map(item => item.uuid)).toEqual([OTHER_GID])
    expect(store.chatList.map(item => item.cid)).toEqual(['next-message'])
    expect(store.messageCacheByWorkspace[GID]).toBeUndefined()
  })
})

describe('queryMyGroup 响应新鲜度守卫', () => {
  it('交错双请求旧响应晚到：groupList / active 不被旧快照覆盖', async () => {
    const store = useChatStore()
    const staleRows = [{ gid: OTHER_GID, title: '旧会话', channel: 'web' }]
    const freshRows = [
      { gid: OTHER_GID, title: '旧会话', channel: 'web' },
      { gid: GID, title: '新会话', channel: 'web' },
    ]
    let releaseStaleResponse: (value: any) => void = () => {}
    const staleResponse = new Promise(resolve => {
      releaseStaleResponse = resolve
    })
    vi.mocked(fetchQueryChatGroupsAPI)
      .mockImplementationOnce(() => staleResponse as any)
      .mockResolvedValueOnce({ data: freshRows } as any)

    const staleRequest = store.queryMyGroup()
    const freshRequest = store.queryMyGroup()
    await freshRequest

    // 新响应先落地后，用户激活了新会话
    store.active = GID

    // 旧请求的响应最后才回来：必须被整体丢弃
    releaseStaleResponse({ data: staleRows })
    await staleRequest

    expect(store.groupList.map(item => item.uuid)).toEqual([OTHER_GID, GID])
    expect(store.active).toBe(GID)
  })

  it('自举失败时 initialized 保持 false（重连补拉可达），成功后失败刷新不回退', async () => {
    const store = useChatStore()
    vi.mocked(fetchQueryChatGroupsAPI).mockRejectedValueOnce(new Error('network down'))
    await store.queryMyGroup()
    expect(store.groupPagination.initialized).toBe(false)
    expect(store.groupPagination.loading).toBe(false)

    vi.mocked(fetchQueryChatGroupsAPI).mockResolvedValueOnce({ data: [] } as any)
    await store.queryMyGroup()
    expect(store.groupPagination.initialized).toBe(true)

    vi.mocked(fetchQueryChatGroupsAPI).mockRejectedValueOnce(new Error('network down'))
    await store.queryMyGroup()
    expect(store.groupPagination.initialized).toBe(true)
  })

  it('被取代请求的 await 调用方读到最新落地状态而非请求前旧状态', async () => {
    const store = useChatStore()
    let releaseStaleResponse: (value: any) => void = () => {}
    let releaseFreshResponse: (value: any) => void = () => {}
    vi.mocked(fetchQueryChatGroupsAPI)
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseStaleResponse = resolve
          }) as any
      )
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseFreshResponse = resolve
          }) as any
      )

    const staleRequest = store.queryMyGroup()
    const freshRequest = store.queryMyGroup()
    let staleSettled = false
    void staleRequest.then(() => {
      staleSettled = true
    })

    // 旧响应先回来：它已被取代，await 不得在最新请求落地前完成，
    // 否则深链路由同步会拿请求前旧 groupList 误判会话不存在
    releaseStaleResponse({ data: [] })
    for (let flush = 0; flush < 10; flush += 1) await Promise.resolve()
    expect(staleSettled).toBe(false)

    releaseFreshResponse({
      data: [{ gid: GID, title: '深链会话', channel: 'web' }],
    })
    await staleRequest
    expect(store.groupList.map(item => item.uuid)).toEqual([GID])
    expect(store.groupPagination.initialized).toBe(true)
    await freshRequest
  })
})

describe('activeSessionConfig', () => {
  it('固定模型会话不会被残留 draft 换掉模型，但推理档位仍可覆盖', () => {
    const store = useChatStore()
    store.active = GID
    store.groupList = [
      makeGroup(GID, {
        reasoningEffort: 'medium',
        modelInfo: { model: 'fixed-m', modelName: '固定模型', isFixedModel: 1 },
      }),
    ]
    // 从别的会话带过来的 draft
    store.draftConfig = {
      reasoningEffort: 'max',
      modelInfo: { model: 'other-m', modelName: '别的模型' },
    } as any

    expect(store.activeSessionConfig.modelInfo.model).toBe('fixed-m')
    expect(store.activeSessionConfig.reasoningEffort).toBe('max')
  })

  it('非固定模型会话仍允许 draft 覆盖模型', () => {
    const store = useChatStore()
    store.active = GID
    store.groupList = [makeGroup(GID, { modelInfo: { model: 'group-m', modelName: 'G' } })]
    store.draftConfig = { modelInfo: { model: 'draft-m', modelName: 'D' } } as any

    expect(store.activeSessionConfig.modelInfo.model).toBe('draft-m')
  })
})

describe('isStreamIn / isNavigationLocked', () => {
  it('提交窗口内两者都为真', () => {
    const store = useChatStore()
    store.acquireSubmitLock()

    expect(store.isStreamIn).toBe(true)
    expect(store.isNavigationLocked).toBe(true)
  })

  it('流式生成中只锁 isStreamIn，导航保持放行', () => {
    const store = useChatStore()
    store.revokeSubmitLock()
    store.chatList = [{ role: 'assistant', content: '', loading: true } as any]

    expect(store.isStreamIn).toBe(true)
    // 生成中允许切会话，否则「切走再切回自动恢复」永远触发不了
    expect(store.isNavigationLocked).toBe(false)
  })

  it('刷新合并丢掉 loading 后，仍按 status 判定为生成中', () => {
    const store = useChatStore()
    store.chatList = [{ role: 'assistant', content: '', status: ChatLogStatus.GENERATING } as any]

    expect(store.isStreamIn).toBe(true)
  })

  it('已完成的回复不再视为生成中', () => {
    const store = useChatStore()
    store.chatList = [
      { role: 'assistant', content: 'ok', loading: false, status: ChatLogStatus.COMPLETED } as any,
    ]

    expect(store.isStreamIn).toBe(false)
    expect(store.isNavigationLocked).toBe(false)
  })
})

describe('applySessionModelConfig', () => {
  it('已有会话：写回该会话自身 config，并清掉全局暂存', async () => {
    const store = useChatStore()
    store.active = GID
    store.groupList = [makeGroup(GID, { modelInfo: { model: 'old-m', modelName: 'Old' } })]
    store.draftConfig = { modelInfo: { model: 'stale', modelName: 'Stale' } } as any

    const ok = await store.applySessionModelConfig({
      modelInfo: { model: 'new-m', modelName: 'New' },
    })

    expect(ok).toBe(true)
    expect(JSON.parse(store.groupList[0].config).modelInfo.model).toBe('new-m')
    // 会话已自带配置，不能再留一份全局 draft，否则又是两套来源
    expect(store.draftConfig).toBeNull()
    expect(store.activeSessionConfig.modelInfo.model).toBe('new-m')
  })

  it('尚未建组：落到全局暂存，供建组时写进 config', async () => {
    const store = useChatStore()
    store.active = ''
    store.groupList = []

    await store.applySessionModelConfig({ modelInfo: { model: 'draft-m', modelName: 'D' } })

    expect(store.draftConfig?.modelInfo?.model).toBe('draft-m')
  })

  it('按调用方给出的会话写：该会话已经不在（删除、身份变化后清空）时放弃，不落全局暂存', async () => {
    const store = useChatStore()
    store.active = ''
    store.groupList = []
    store.draftConfig = { modelInfo: { model: 'home-m', modelName: 'Home' } } as any

    const ok = await store.applySessionModelConfig(
      { modelInfo: { model: 'late-m', modelName: 'Late' } },
      { workspaceId: GID }
    )

    expect(ok).toBe(false)
    expect(store.draftConfig?.modelInfo?.model).toBe('home-m')
  })

  it('固定模型会话拒绝改动，配置保持不变', async () => {
    const store = useChatStore()
    store.active = GID
    store.groupList = [
      makeGroup(GID, { modelInfo: { model: 'fixed-m', modelName: 'F', isFixedModel: 1 } }),
    ]

    const ok = await store.applySessionModelConfig({
      modelInfo: { model: 'hack-m', modelName: 'H' },
    })

    expect(ok).toBe(false)
    expect(JSON.parse(store.groupList[0].config).modelInfo.model).toBe('fixed-m')
  })

  it('切换会话后各自保留自己的模型，不再互相污染', async () => {
    const store = useChatStore()
    const GID_B = 'g_bbbbbbbbbbbbbbbbbbbbbbbb'
    store.groupList = [
      makeGroup(GID, { modelInfo: { model: 'a-model', modelName: 'A' } }),
      makeGroup(GID_B, { modelInfo: { model: 'b-model', modelName: 'B' } }),
    ]

    store.active = GID
    await store.applySessionModelConfig({ modelInfo: { model: 'a-changed', modelName: 'A2' } })
    expect(store.activeSessionConfig.modelInfo.model).toBe('a-changed')

    // 切到 B：B 必须还是自己的模型，而不是在 A 里选的那个
    store.active = GID_B
    expect(store.activeSessionConfig.modelInfo.model).toBe('b-model')

    // 切回 A：保留刚才的改动
    store.active = GID
    expect(store.activeSessionConfig.modelInfo.model).toBe('a-changed')
  })
})

describe('applySessionModelConfig 失败回滚', () => {
  it('持久化失败时把会话 config 回滚到改动前，并抛出给调用方提示', async () => {
    const store = useChatStore()
    store.active = GID
    store.groupList = [makeGroup(GID, { modelInfo: { model: 'old-m', modelName: 'Old' } })]

    vi.mocked(fetchUpdateChatGroupAPI).mockRejectedValueOnce(new Error('network down'))

    await expect(
      store.applySessionModelConfig({ modelInfo: { model: 'new-m', modelName: 'New' } })
    ).rejects.toThrow('network down')

    expect(JSON.parse(store.groupList[0].config).modelInfo.model).toBe('old-m')
  })
})

describe('会话标题', () => {
  it('服务端给新会话写的默认标题与空标题都当作未命名，显示时按界面语言补「新对话」', async () => {
    const store = useChatStore()
    vi.mocked(fetchQueryChatGroupsAPI).mockResolvedValueOnce({
      data: [
        { gid: GID, title: '新对话', channel: 'web' },
        { gid: OTHER_GID, title: '  ', channel: 'web' },
      ],
    } as any)
    await store.queryMyGroup()
    expect(store.groupList.map(item => item.title)).toEqual(['', ''])
  })

  it('用户或服务端生成的标题原样保留', async () => {
    const store = useChatStore()
    vi.mocked(fetchQueryChatGroupsAPI).mockResolvedValueOnce({
      data: [{ gid: GID, title: '周报整理', channel: 'web' }],
    } as any)
    await store.queryMyGroup()
    expect(store.groupList[0].title).toBe('周报整理')
  })
})

describe('effectiveModelConfig（显示与发送共用的生效模型）', () => {
  const FIRST = { id: 1, model: 'first-m', modelName: '列表第一个' }
  const BASE = { id: 2, model: 'base-m', modelName: '管理员默认' }

  function sidebarCreatedConversation() {
    const store = useChatStore()
    store.active = GID
    // 侧栏「新对话」建组时服务端写入 null，前端归一成 "{}"
    store.groupList = [makeGroup(GID, {})]
    store.draftConfig = null as any
    const catalog = useModelCatalogStore()
    catalog.modelList = [FIRST] as any
    return { store, catalog }
  }

  it('会话配置为空时回落到管理员默认模型；activeModel 与之一致（重新生成、编辑重发也发这个）', () => {
    const { store, catalog } = sidebarCreatedConversation()
    catalog.baseConfig = { modelInfo: BASE }
    expect(store.effectiveModelConfig.modelInfo.model).toBe('base-m')
    expect(store.activeModel).toBe('base-m')
    expect(store.activeModelName).toBe('管理员默认')
  })

  it('还没取到默认模型时回落到模型列表第一个', () => {
    const { store } = sidebarCreatedConversation()
    expect(store.effectiveModelConfig.modelInfo.model).toBe('first-m')
    expect(store.activeModel).toBe('first-m')
  })

  it('会话自带模型时以会话为准，不被默认模型顶掉', () => {
    const { store, catalog } = sidebarCreatedConversation()
    catalog.baseConfig = { modelInfo: BASE }
    store.groupList = [makeGroup(GID, { modelInfo: { id: 3, model: 'group-m', modelName: 'G' } })]
    expect(store.activeModel).toBe('group-m')
  })
})

describe('清空会话数据', () => {
  it('登录过期、重新登录（keepDraft）时保留没发出去的草稿与模型选择；主动退出时一起清掉', () => {
    const store = useChatStore()
    const fill = () => {
      store.active = GID
      store.groupList = [makeGroup(GID, {})]
      void store.setPrompt('还没发出去的问题')
      store.draftConfig = { modelInfo: { model: 'draft-m' } } as any
    }
    fill()
    store.clearChat({ keepDraft: true })
    expect(store.groupList).toEqual([])
    expect(store.active).toBe('')
    expect(store.drafts[GID]).toBe('还没发出去的问题')
    expect((store.draftConfig as any)?.modelInfo?.model).toBe('draft-m')

    fill()
    store.clearChat()
    expect(store.drafts).toEqual({})
    expect(store.draftConfig).toBeNull()
  })
})

describe('输入框草稿按会话保存', () => {
  it('每个会话各有一份草稿：切走再切回还在，重复激活同一会话也不清空', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {}), makeGroup(OTHER_GID, {})]
    await store.activateWorkspaceFromRoute(GID)
    await store.setPrompt('发送失败后放回的草稿')
    await store.activateWorkspaceFromRoute(GID)
    expect(store.prompt).toBe('发送失败后放回的草稿')

    await store.activateWorkspaceFromRoute(OTHER_GID)
    expect(store.prompt).toBe('')
    await store.setPrompt('另一个会话的问题')

    await store.activateWorkspaceFromRoute(GID)
    expect(store.prompt).toBe('发送失败后放回的草稿')
    await store.activateWorkspaceFromRoute(OTHER_GID)
    expect(store.prompt).toBe('另一个会话的问题')
  })

  it('重新登录后回到原会话：会话数据已清空，草稿仍保留', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {})]
    await store.activateWorkspaceFromRoute(GID)
    await store.setPrompt('登录过期前写的问题')
    store.clearChat({ keepDraft: true })
    expect(store.prompt).toBe('')
    store.groupList = [makeGroup(GID, {})]
    await store.activateWorkspaceFromRoute(GID)
    expect(store.prompt).toBe('登录过期前写的问题')
  })

  it('在首页写好问题再建会话：草稿跟着新会话走，首页不再留着这段话', async () => {
    const store = useChatStore()
    await store.setPrompt('首页写的问题')
    vi.mocked(fetchCreateChatGroupAPI).mockResolvedValueOnce({
      success: true,
      data: { gid: GID, channel: 'web', title: '' },
    } as any)
    await expect(store.initializeWorkspace(0, { modelInfo: { model: 'm' } })).resolves.toBe(GID)
    expect(store.prompt).toBe('首页写的问题')
    expect(store.drafts['']).toBeUndefined()
  })

  it('引用换到已有引用的会话名下：留较新的那个', () => {
    const store = useChatStore()
    store.setQuote({ text: '首页的旧引用', createdAt: 1 }, '')
    store.setQuote({ text: '原会话里的新引用', createdAt: 2 }, GID)
    store.moveDraft(GID, '')
    expect(store.quotes['']?.text).toBe('原会话里的新引用')
    expect(store.quotes[GID]).toBeUndefined()
  })

  it('草稿换到已有草稿的会话名下：两段接在一起，都不丢', () => {
    const store = useChatStore()
    store.setDraft(GID, '原会话里没发出的')
    store.setDraft('', '首页已有的')
    store.moveDraft(GID, '')
    expect(store.drafts['']).toBe('首页已有的\n\n原会话里没发出的')
    expect(store.drafts[GID]).toBeUndefined()
  })

  it('在别的会话里新建会话：新会话从空白开始，原会话的草稿留在原处', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(OTHER_GID, {})]
    await store.activateWorkspaceFromRoute(OTHER_GID)
    await store.setPrompt('原会话里写了一半')
    vi.mocked(fetchCreateChatGroupAPI).mockResolvedValueOnce({
      success: true,
      data: { gid: GID, channel: 'web', title: '' },
    } as any)
    await store.initializeWorkspace(0, { modelInfo: { model: 'm' } })
    expect(store.active).toBe(GID)
    expect(store.prompt).toBe('')
    expect(store.drafts[OTHER_GID]).toBe('原会话里写了一半')
  })

  it('草稿写本地存储：按键合并成一次写入，只留非空草稿，刷新后按会话恢复', async () => {
    vi.useFakeTimers()
    try {
      localStorage.clear()
      const store = useChatStore()
      store.groupList = [makeGroup(GID, {})]
      store.active = GID
      await store.setPrompt('刷')
      await store.setPrompt('刷新后还在')
      expect(localStorage.getItem('chatStorage')).toBeNull()
      vi.advanceTimersByTime(400)
      setActivePinia(createPinia())
      const reloaded = useChatStore()
      reloaded.active = GID
      expect(reloaded.prompt).toBe('刷新后还在')

      await reloaded.setPrompt('')
      vi.advanceTimersByTime(400)
      setActivePinia(createPinia())
      expect(useChatStore().drafts).toEqual({})
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('引用与排队的补充要求按会话保存', () => {
  it('引用跟草稿一样：各会话一份，首页的引用随新会话走，退出登录才清掉', async () => {
    const store = useChatStore()
    store.setQuote({ text: '首页引用' })
    vi.mocked(fetchCreateChatGroupAPI).mockResolvedValueOnce({
      success: true,
      data: { gid: GID, channel: 'web', title: '' },
    } as any)
    await store.initializeWorkspace(0, { modelInfo: { model: 'm' } })
    expect(store.activeQuote?.text).toBe('首页引用')
    expect(store.quotes['']).toBeUndefined()

    store.groupList = [makeGroup(GID, {}), makeGroup(OTHER_GID, {})]
    await store.activateWorkspaceFromRoute(OTHER_GID)
    expect(store.activeQuote).toBeNull()

    store.clearChat({ keepDraft: true })
    expect(store.quotes[GID]?.text).toBe('首页引用')
    store.clearChat()
    expect(store.quotes).toEqual({})
  })

  it('排队意图是别的会话发起的（发起后切走了）：不按当前会话的运行目标作废，回到原会话再按那里的判断', () => {
    const store = useChatStore()
    store.active = OTHER_GID
    store.pendingQueueIntent = {
      submissionId: 'submission-queue',
      targetCid: 'a-parent',
      parentTurnId: 't-parent',
      workspaceId: GID,
      payload: { prompt: '补充', model: 'm', modelId: null },
    }
    expect(store.clearPendingQueueIntentIfTargetChanged('a-other', 't-other')).toBe(false)
    expect(store.pendingQueueIntent).not.toBeNull()

    store.active = GID
    expect(store.clearPendingQueueIntentIfTargetChanged('a-next', 't-next')).toBe(true)
    expect(store.pendingQueueIntent).toBeNull()
  })

  it('排进下一轮的补充要求按会话记着；会话被删时一起清掉', () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {}), makeGroup(OTHER_GID, {})]
    store.active = GID
    store.setQueuedFollowUp({ text: '再补一句', turnId: 't-1' })
    store.active = OTHER_GID
    expect(store.activeQueuedFollowUp).toBeNull()
    store.active = GID
    expect(store.activeQueuedFollowUp).toEqual({ text: '再补一句', turnId: 't-1' })
    store.removeConversationGroupFromSync(GID)
    expect(store.queuedFollowUps[GID]).toBeUndefined()
  })
})

describe('首页新对话与会话列表', () => {
  it('列表加载后不再自动选一个会话；当前会话已不在列表里时才清掉', async () => {
    const store = useChatStore()
    vi.mocked(fetchQueryChatGroupsAPI).mockResolvedValue({
      success: true,
      data: [{ gid: GID, channel: 'web', title: 'A' }],
    } as any)
    await store.queryMyGroup()
    expect(store.active).toBe('')

    store.active = OTHER_GID
    await store.queryMyGroup()
    expect(store.active).toBe('')

    store.active = GID
    await store.queryMyGroup()
    expect(store.active).toBe(GID)
  })

  it('打开没有缓存的会话：加载期间不再显示上一个会话的消息；加载完才换了会话的激活不通知', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {}), makeGroup(OTHER_GID, {})]
    store.active = GID
    store.chatList = [
      { cid: 'old', role: 'assistant', content: '上一个会话', loading: true },
    ] as any
    let resolveList = (_value: unknown) => {}
    vi.mocked(fetchQueryChatLogListAPI).mockImplementationOnce(
      () => new Promise(resolve => (resolveList = resolve)) as any
    )
    const ready = vi.fn()
    eventBus.on('chat:workspaceChanged', ready)
    try {
      const activating = store.activateWorkspaceFromRoute(OTHER_GID)
      expect(store.chatList).toEqual([])
      // 加载期间用户又换回了原来的会话
      store.active = GID
      resolveList({ data: { rows: [], pageInfo: { hasMore: false } } })
      await activating
      expect(ready).not.toHaveBeenCalled()
    } finally {
      eventBus.off('chat:workspaceChanged', ready)
    }
  })
})

describe('草稿的归属与本地存储', () => {
  it('换成另一个账号时丢掉上一个账号的草稿、引用与模型选择；游客的草稿带进账号', async () => {
    const store = useChatStore()
    store.claimDraftsFor('visitor')
    await store.setPrompt('游客写的问题')
    store.claimDraftsFor('user:7')
    expect(store.prompt).toBe('游客写的问题')

    store.setQuote({ text: '引用' })
    store.draftConfig = { modelInfo: { model: 'm' } } as any
    store.claimDraftsFor('user:7')
    expect(store.prompt).toBe('游客写的问题')

    store.claimDraftsFor('user:8')
    expect(store.drafts).toEqual({})
    expect(store.quotes).toEqual({})
    expect(store.draftConfig).toBeNull()
  })

  it('登录过期后成了游客：账号的草稿先收起来不给游客看，同一个账号再登录时放回；换成别的账号就丢掉', () => {
    const store = useChatStore()
    store.claimDraftsFor('user:7')
    store.setDraft(GID, '账号里写了一半')
    store.setDraft('', '首页写的')
    store.setQuote({ text: '引用' }, GID)
    store.draftConfig = { modelInfo: { model: 'm' } } as any

    store.claimDraftsFor('visitor')
    expect(store.drafts).toEqual({})
    expect(store.quotes).toEqual({})
    expect(store.draftConfig).toBeNull()
    // 刷新后（从本地存储读回）游客照样看不到
    store.setDraft('', '游客写的')
    store.persist()
    setActivePinia(createPinia())
    const reloaded = useChatStore()
    expect(reloaded.drafts).toEqual({ '': '游客写的' })

    reloaded.claimDraftsFor('user:7')
    expect(reloaded.drafts).toEqual({ [GID]: '账号里写了一半', '': '首页写的\n\n游客写的' })
    expect(reloaded.quotes[GID]?.text).toBe('引用')
    expect(reloaded.draftConfig).toMatchObject({ modelInfo: { model: 'm' } })
    expect(reloaded.stashedDrafts).toBeNull()

    reloaded.claimDraftsFor('visitor')
    reloaded.claimDraftsFor('user:8')
    expect(reloaded.drafts).toEqual({})
    expect(reloaded.stashedDrafts).toBeNull()
  })

  it('别的页签已经换了身份（成了游客、收起了草稿）：还以旧身份开着的页签写入时不覆盖归属、收起的草稿，也不写进自己的草稿', () => {
    const store = useChatStore()
    store.claimDraftsFor('user:7')
    store.setDraft(GID, '旧账号的草稿')
    store.persist()
    // 另一个页签认领成游客：收起了账号的草稿
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = {
      ...stored.data,
      draftOwner: 'visitor',
      drafts: {},
      stashedDrafts: {
        owner: 'user:7',
        drafts: { [GID]: '旧账号的草稿' },
        quotes: {},
        draftConfig: null,
      },
    }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    store.setDraft(OTHER_GID, '旧页签又写了一句')
    store.persist()
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.draftOwner).toBe('visitor')
    expect(saved.stashedDrafts).toMatchObject({ owner: 'user:7' })
    expect(saved.drafts).toEqual({})
  })

  it('别的页签收起了草稿后，本页用同一个账号重新登录：再认领一次，收起的草稿放回，之后写的草稿照常存下来', () => {
    const store = useChatStore()
    store.claimDraftsFor('user:7')
    store.setDraft(GID, '旧账号的草稿')
    store.draftConfig = { modelInfo: { model: 'm-7' } }
    store.persist()
    // 另一个页签登录过期、刷新后认领成游客：收起了账号的草稿，写了一条游客草稿
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = {
      ...stored.data,
      draftOwner: 'visitor',
      drafts: { [OTHER_GID]: '游客写的' },
      draftConfig: null,
      stashedDrafts: {
        owner: 'user:7',
        drafts: { [GID]: '旧账号的草稿' },
        quotes: {},
        draftConfig: { modelInfo: { model: 'm-7' } },
      },
    }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    // 本页在登录框里重新登录同一个账号：内存里的归属本来就是 user:7
    store.claimDraftsFor('user:7')
    store.setDraft(GID, '重新登录后写的')
    store.persist()
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.draftOwner).toBe('user:7')
    expect(saved.stashedDrafts).toBeNull()
    expect(saved.drafts[GID]).toBe('重新登录后写的')
    // 游客那段时间在别的会话写的一并保留（按会话合并，不整份覆盖）
    expect(saved.drafts[OTHER_GID]).toBe('游客写的')
  })

  it('再认领时两个页签的草稿不一样：以本页的为准，不把同一个账号的两个版本接在一起', () => {
    const store = useChatStore()
    store.claimDraftsFor('user:7')
    store.setDraft(GID, 'v1')
    store.persist()
    // 另一个页签登录过期、刷新成了游客：收起了它当时的版本
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = {
      ...stored.data,
      draftOwner: 'visitor',
      drafts: {},
      stashedDrafts: { owner: 'user:7', drafts: { [GID]: 'v1' }, quotes: {}, draftConfig: null },
    }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    // 本页接着改了（写存储被拦住），然后在登录框里重新登录同一个账号
    store.setDraft(GID, 'v2')
    store.claimDraftsFor('user:7')
    expect(store.drafts[GID]).toBe('v2')
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.draftOwner).toBe('user:7')
    expect(saved.drafts[GID]).toBe('v2')
  })

  it('本页是游客、别的页签登录了账号：本页再确认游客身份时不去认领，不清空那个账号存下的草稿，也不清自己的输入', () => {
    const store = useChatStore()
    store.claimDraftsFor('visitor')
    store.setDraft('', '游客写的')
    store.persist()
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = {
      ...stored.data,
      draftOwner: 'user:7',
      drafts: { [GID]: '账号的草稿' },
      stashedDrafts: null,
    }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    store.claimDraftsFor('visitor')
    expect(store.drafts).toEqual({ '': '游客写的' })
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.draftOwner).toBe('user:7')
    expect(saved.drafts).toEqual({ [GID]: '账号的草稿' })
  })

  it('游客页签登录成账号时存储还归另一个账号：那个人的草稿不并到这个账号名下', () => {
    const store = useChatStore()
    store.claimDraftsFor('visitor')
    store.persist()
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = { ...stored.data, draftOwner: 'user:8', drafts: { '': '另一个账号的首页草稿' } }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    store.claimDraftsFor('user:7')
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.draftOwner).toBe('user:7')
    expect(saved.drafts).toEqual({})
  })

  it('再认领时，别的页签已经发出（清空）的草稿不被本页的旧内容写回；本页写不进去期间改过的以本页为准', () => {
    const store = useChatStore()
    store.claimDraftsFor('user:7')
    store.setDraft(GID, '已经在别的页签发出的问题')
    store.setDraft(OTHER_GID, '别的会话')
    store.persist()
    // 另一个页签发出了 GID 的问题（草稿清空），随后登录过期成了游客：收起的是存储里的样子
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = {
      ...stored.data,
      draftOwner: 'visitor',
      drafts: {},
      stashedDrafts: {
        owner: 'user:7',
        drafts: { [OTHER_GID]: '别的会话' },
        quotes: {},
        draftConfig: null,
      },
    }
    localStorage.setItem('chatStorage', JSON.stringify(stored))
    // 本页在写不进存储期间改了别的会话
    store.setDraft(OTHER_GID, '本页后来改的')
    store.persist()

    store.claimDraftsFor('user:7')
    expect(store.drafts).toEqual({ [OTHER_GID]: '本页后来改的' })
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.drafts[GID]).toBeUndefined()
    expect(saved.drafts[OTHER_GID]).toBe('本页后来改的')
  })

  it('登录过期成了游客：收起的是存储里这个账号的草稿（别的页签后来写的也在），不只是本页内存里的', () => {
    const store = useChatStore()
    store.claimDraftsFor('user:7')
    store.setDraft(GID, '本页写的')
    store.persist()
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = { ...stored.data, drafts: { ...stored.data.drafts, [OTHER_GID]: '别的页签写的' } }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    store.claimDraftsFor('visitor')
    expect(store.stashedDrafts?.drafts).toEqual({ [GID]: '本页写的', [OTHER_GID]: '别的页签写的' })
  })

  it('游客页签登录回原账号时，收起的草稿已被别的页签取走：不拿内存里的旧副本盖掉存储里更新的草稿', () => {
    const store = useChatStore()
    store.claimDraftsFor('user:7')
    store.setDraft(GID, 'v1')
    store.persist()
    store.claimDraftsFor('visitor')
    // 另一个页签重新登录、取走了收起的草稿，又改成了 v3
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = {
      ...stored.data,
      draftOwner: 'user:7',
      stashedDrafts: null,
      drafts: { [GID]: 'v3' },
    }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    store.claimDraftsFor('user:7')
    expect(store.drafts[GID]).toBe('v3')
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.drafts[GID]).toBe('v3')
  })

  it('别的页签登录了别的账号后，本页重新登录原账号：最后登录的一方接管本地存储；只是再取用户信息时不接管', () => {
    const store = useChatStore()
    store.claimDraftsFor('user:7')
    store.setDraft(GID, '账号 7 的草稿')
    store.persist()
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = { ...stored.data, draftOwner: 'user:8', drafts: { [OTHER_GID]: '账号 8 的草稿' } }
    localStorage.setItem('chatStorage', JSON.stringify(stored))
    const saved = () => JSON.parse(localStorage.getItem('chatStorage') || '{}').data

    store.claimDraftsFor('user:7')
    expect(saved().draftOwner).toBe('user:8')

    store.claimDraftsFor('user:7', { takeOver: true })
    expect(saved().draftOwner).toBe('user:7')
    expect(saved().drafts).toEqual({ [GID]: '账号 7 的草稿' })
    store.setDraft(GID, '之后写的')
    store.persist()
    expect(saved().drafts[GID]).toBe('之后写的')
  })

  it('又写得进存储后，写不进去期间改过的会话不再拿本页的旧值去盖别的页签后来写的', () => {
    const store = useChatStore()
    const setStored = (data: Record<string, unknown>) => {
      const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
      stored.data = { ...stored.data, ...data }
      localStorage.setItem('chatStorage', JSON.stringify(stored))
    }
    store.claimDraftsFor('user:7')
    store.persist()
    // 别的页签换成了 user:8：本页写不进去
    setStored({ draftOwner: 'user:8', drafts: {} })
    store.setDraft(GID, 'a1')
    store.persist()
    // 那个页签又登录回 user:7、写了 b2；本页又写得进去了
    setStored({ draftOwner: 'user:7', drafts: { [GID]: 'b2' } })
    store.setDraft(OTHER_GID, '别的会话')
    store.persist()
    // 那个页签之后登录过期成了游客，收起的是存储里的样子
    setStored({
      draftOwner: 'visitor',
      drafts: {},
      stashedDrafts: {
        owner: 'user:7',
        drafts: { [GID]: 'b2', [OTHER_GID]: '别的会话' },
        quotes: {},
        draftConfig: null,
      },
    })
    store.claimDraftsFor('user:7')
    expect(store.drafts[GID]).toBe('b2')
  })

  it('早就开着的游客页签登录回收起草稿的那个账号：用存储里收起的放回', () => {
    const store = useChatStore()
    store.claimDraftsFor('visitor')
    store.persist()
    // 另一个页签登录过期、收起了 user:7 的草稿（本页内存里没有这份）
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = {
      ...stored.data,
      draftOwner: 'visitor',
      drafts: {},
      stashedDrafts: {
        owner: 'user:7',
        drafts: { [GID]: '过期前写的' },
        quotes: {},
        draftConfig: null,
      },
    }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    store.claimDraftsFor('user:7')
    expect(store.drafts[GID]).toBe('过期前写的')
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.draftOwner).toBe('user:7')
    expect(saved.stashedDrafts ?? null).toBeNull()
    expect(saved.drafts[GID]).toBe('过期前写的')
  })

  it('两个游客页签：本页登录账号时以存储为底，别的页签后来改的、发出清掉的都以存储为准', () => {
    const store = useChatStore()
    store.claimDraftsFor('visitor')
    store.setDraft(GID, 'g0')
    store.setDraft(OTHER_GID, 'o0')
    store.persist()
    // 另一个游客页签把 GID 改成了 g1，又在 OTHER_GID 发出了问题（草稿清空）
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = { ...stored.data, drafts: { [GID]: 'g1' } }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    store.claimDraftsFor('user:7')
    expect(store.drafts).toEqual({ [GID]: 'g1' })
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.drafts).toEqual({ [GID]: 'g1' })
  })

  it('游客页签登录时存储已归这个账号：接着用存储里这个账号的草稿，打开页面时的旧快照不去盖', () => {
    const store = useChatStore()
    store.claimDraftsFor('visitor')
    store.setDraft(GID, 'g0')
    store.persist()
    // 另一个页签先登录了 user:7：在 GID 发出了问题，在 OTHER_GID 写了草稿
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = { ...stored.data, draftOwner: 'user:7', drafts: { [OTHER_GID]: 'o7' } }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    store.claimDraftsFor('user:7')
    expect(store.drafts).toEqual({ [OTHER_GID]: 'o7' })
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.drafts).toEqual({ [OTHER_GID]: 'o7' })
  })

  it('早就开着的游客页签（内存里是旧快照）用存储里收起的放回：不和旧快照拼接，账号里已发出的不带回', () => {
    const store = useChatStore()
    store.claimDraftsFor('visitor')
    store.setDraft(GID, 'shared')
    store.setDraft(OTHER_GID, '后来在账号里发出了')
    store.persist()
    // 另一个页签登录 user:7 后改写了 GID、发出了 OTHER_GID，之后登录过期收起了草稿
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = {
      ...stored.data,
      draftOwner: 'visitor',
      drafts: {},
      stashedDrafts: {
        owner: 'user:7',
        drafts: { [GID]: 'shared, extended' },
        quotes: {},
        draftConfig: null,
      },
    }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    store.claimDraftsFor('user:7')
    expect(store.drafts).toEqual({ [GID]: 'shared, extended' })
  })

  it('游客页签写不进去期间写的（存储里还没有这一条）：登录后留着并写进去', () => {
    const store = useChatStore()
    store.claimDraftsFor('visitor')
    store.persist()
    // 另一个页签登录了 user:7：本页游客时写的写不进去
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = { ...stored.data, draftOwner: 'user:7', drafts: { [OTHER_GID]: 'o7' } }
    localStorage.setItem('chatStorage', JSON.stringify(stored))
    store.setDraft('', '游客写了一半')
    store.persist()

    store.claimDraftsFor('user:7')
    expect(store.drafts).toEqual({ [OTHER_GID]: 'o7', '': '游客写了一半' })
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.drafts).toEqual({ [OTHER_GID]: 'o7', '': '游客写了一半' })
  })

  it('游客页签写不进去期间发出（清空）的会话、存储里已被别的页签写了新内容：登录后以存储为准，不回放清空', () => {
    const store = useChatStore()
    store.claimDraftsFor('visitor')
    store.setDraft('', '游客的问题')
    store.persist()
    // 另一个页签登录了 user:7：本页从首页发出（清空）写不进去
    const setStored = (data: Record<string, unknown>) => {
      const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
      stored.data = { ...stored.data, ...data }
      localStorage.setItem('chatStorage', JSON.stringify(stored))
    }
    setStored({ draftOwner: 'user:7', drafts: {} })
    store.setDraft('', '')
    store.persist()
    // 那个页签随后在首页写了 X
    setStored({ drafts: { '': 'X' } })

    store.claimDraftsFor('user:7')
    expect(store.drafts['']).toBe('X')
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.drafts['']).toBe('X')
  })

  it('游客页签登录时本页刚清掉、还没写进去的会话：从存储里照样清掉', () => {
    const store = useChatStore()
    store.claimDraftsFor('visitor')
    store.setDraft(GID, 'g0')
    store.persist()
    store.setDraft(GID, '')

    store.claimDraftsFor('user:7')
    expect(store.drafts[GID]).toBeUndefined()
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.drafts[GID]).toBeUndefined()
  })

  it('写不进去期间改过、期间也没人写过的会话：存储重新归本页的身份后照常写进去', () => {
    const store = useChatStore()
    const setStored = (data: Record<string, unknown>) => {
      const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
      stored.data = { ...stored.data, ...data }
      localStorage.setItem('chatStorage', JSON.stringify(stored))
    }
    store.claimDraftsFor('user:7')
    store.persist()
    setStored({ draftOwner: 'user:8', drafts: {} })
    store.setDraft(GID, 'a1')
    store.persist()
    // 那个页签又登录回 user:7：换号时整份换成了它自己的（没有这一条）
    setStored({ draftOwner: 'user:7', drafts: {} })
    store.setDraft(OTHER_GID, '别的会话')
    store.persist()
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.drafts).toEqual({ [GID]: 'a1', [OTHER_GID]: '别的会话' })
  })

  it('还以旧身份开着的页签：不写自己的模型选择，下一个身份不会接着用上一个人的', () => {
    const store = useChatStore()
    store.claimDraftsFor('user:7')
    store.persist()
    const stored = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    stored.data = { ...stored.data, draftOwner: 'user:8', draftConfig: null }
    localStorage.setItem('chatStorage', JSON.stringify(stored))

    store.draftConfig = { modelInfo: { model: 'm-7' } }
    store.persist()
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}').data
    expect(saved.draftConfig ?? null).toBeNull()
  })

  it('写本地存储只合并本页改过的会话：同时开着的别的标签页写的草稿不被盖掉', () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {}), makeGroup(OTHER_GID, {})]
    store.active = GID
    void store.setPrompt('本页的草稿')
    // 另一个标签页在这之后写了别的会话的草稿
    const stored = JSON.parse(localStorage.getItem('chatStorage') || 'null')?.data ?? null
    const otherTab = { drafts: { [OTHER_GID]: '另一个标签页写的' } }
    localStorage.setItem(
      'chatStorage',
      JSON.stringify({ data: { ...(stored || {}), ...otherTab }, expire: null })
    )
    store.persist()
    const saved = JSON.parse(localStorage.getItem('chatStorage') || '{}')
    const drafts = saved.data?.drafts ?? saved.drafts
    expect(drafts).toMatchObject({ [GID]: '本页的草稿', [OTHER_GID]: '另一个标签页写的' })
  })

  it('最多存 30 个会话的草稿：超出时丢掉最久没改的，正在改的那份不会被截掉', () => {
    const store = useChatStore()
    for (let index = 0; index < 31; index += 1) {
      store.setDraft(`g_draft${String(index).padStart(19, '0')}`, `草稿 ${index}`)
    }
    // 第一份又被改过：它是最近改的，应该保留
    store.setDraft(`g_draft${'0'.padStart(19, '0')}`, '草稿 0（改）')
    store.persist()
    setActivePinia(createPinia())
    const reloaded = useChatStore()
    const keys = Object.keys(reloaded.drafts)
    expect(keys).toHaveLength(30)
    expect(reloaded.drafts[`g_draft${'0'.padStart(19, '0')}`]).toBe('草稿 0（改）')
    expect(reloaded.drafts[`g_draft${'1'.padStart(19, '0')}`]).toBeUndefined()
  })
})

describe('离开会话', () => {
  it('回到首页状态：不再显示原会话的消息；显示首页草稿', async () => {
    const store = useChatStore()
    await store.setPrompt('首页草稿')
    store.groupList = [makeGroup(GID, {})]
    await store.activateWorkspaceFromRoute(GID)
    store.chatList = [{ cid: 'c1', role: 'user', content: 'hi' }] as any
    store.resetRouteConversation()
    expect(store.active).toBe('')
    expect(store.chatList).toEqual([])
    expect(store.prompt).toBe('首页草稿')
  })

  it('会话被删除：连同它的草稿一起清掉', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {}), makeGroup(OTHER_GID, {})]
    await store.activateWorkspaceFromRoute(GID)
    await store.setPrompt('写了一半')
    expect(store.removeConversationGroupFromSync(GID)).toBe(OTHER_GID)
    expect(store.drafts[GID]).toBeUndefined()
  })
})

describe('刷新合并与重新生成后的本地消息', () => {
  function deferChatLogPage() {
    let respond!: (value: unknown) => void
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(
      new Promise(resolve => {
        respond = resolve
      }) as any
    )
    return respond
  }

  const row = (cid: string, role: 'user' | 'assistant' = 'user', extra: Partial<Chat.Chat> = {}) =>
    ({ cid, role, content: cid, status: ChatLogStatus.COMPLETED, ...extra }) as Chat.Chat
  const page = (rows: Chat.Chat[], hasMore = false) =>
    ({ data: { rows, pageInfo: { hasMore, beforeCursor: hasMore ? 'cursor-new' : null } } }) as any

  function activeWith(rows: Chat.Chat[], hasMore = false) {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {}), makeGroup(OTHER_GID, {})]
    store.active = GID
    store.chatList = rows
    store.messageCacheByWorkspace[GID] = rows
    store.messagePaginationByWorkspace[GID] = {
      initialized: true,
      loading: false,
      hasMore,
      beforeCursor: hasMore ? 'cursor-old' : null,
    }
    return store
  }

  it('别处替换掉的旧回合：刷新后去掉，不会和新回合同时出现', async () => {
    const store = activeWith([row('q1'), row('a1', 'assistant'), row('q2'), row('a2', 'assistant')])
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([row('q1'), row('a1', 'assistant'), row('q2b'), row('a2b', 'assistant')])
    )
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList.map(item => item.cid)).toEqual(['q1', 'a1', 'q2b', 'a2b'])
  })

  it('请求途中本地新加的一轮保留；比这次响应更早、之前翻页加载的消息保留', async () => {
    const store = activeWith([row('old1'), row('q1'), row('a1', 'assistant')], true)
    const respond = deferChatLogPage()
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    store.addGroupChat(row('q2'))
    store.addGroupChat(row('a2', 'assistant', { loading: true, status: ChatLogStatus.GENERATING }))
    respond(page([row('q1'), row('a1', 'assistant')], true))
    await refreshing
    expect(store.chatList.map(item => item.cid)).toEqual(['old1', 'q1', 'a1', 'q2', 'a2'])
  })

  it('首页首发：新会话的第一次加载晚于 agent.start 返回时，刚插入的这一轮不被盖掉', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {})]
    const respond = deferChatLogPage()
    const loading = store.queryActiveChatLogList(GID, { force: true })
    store.addGroupChat(row('q1'))
    store.addGroupChat(row('a1', 'assistant', { loading: true, status: ChatLogStatus.GENERATING }))
    respond(page([]))
    await loading
    expect(store.chatList.map(item => item.cid)).toEqual(['q1', 'a1'])
  })

  it('最新一页往前多出本地没有的旧消息（别处替换掉几轮后）：按服务端顺序放在前面，不追加到末尾', async () => {
    const store = activeWith(
      [row('q3'), row('a3', 'assistant'), row('q4'), row('a4', 'assistant')],
      true
    )
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page(
        [
          row('q1'),
          row('a1', 'assistant'),
          row('q2'),
          row('a2', 'assistant'),
          row('q3'),
          row('a3', 'assistant'),
          row('q5'),
          row('a5', 'assistant'),
        ],
        true
      )
    )
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList.map(item => item.cid)).toEqual([
      'q1',
      'a1',
      'q2',
      'a2',
      'q3',
      'a3',
      'q5',
      'a5',
    ])
  })

  it('请求途中本地截掉的回合（本页替换被接受）不从过期的响应里加回来', async () => {
    const store = activeWith([row('q1'), row('a1', 'assistant'), row('q2'), row('a2', 'assistant')])
    const respond = deferChatLogPage()
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    store.removeMessagesFromCid('q2')
    respond(page([row('q1'), row('a1', 'assistant'), row('q2'), row('a2', 'assistant')]))
    await refreshing
    expect(store.chatList.map(item => item.cid)).toEqual(['q1', 'a1'])
  })

  it('刷新途中翻页状态被换过（搜索定位）：响应回来不把游标写回请求前的旧值', async () => {
    const store = activeWith([row('q1'), row('a1', 'assistant')], true)
    const respond = deferChatLogPage()
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    store.messagePaginationByWorkspace[GID] = {
      initialized: true,
      loading: true,
      hasMore: true,
      beforeCursor: 'cursor-around',
    }
    respond(page([row('q1'), row('a1', 'assistant')], true))
    await refreshing
    expect(store.messagePaginationByWorkspace[GID].beforeCursor).toBe('cursor-around')
  })

  it('往上翻页按响应到达时的列表合并：途中插入的一轮不丢，途中截掉的不加回', async () => {
    const store = activeWith(
      [row('q2'), row('a2', 'assistant'), row('q3'), row('a3', 'assistant')],
      true
    )
    const respond = deferChatLogPage()
    const loading = store.loadOlderChatMessages(GID)
    store.removeMessagesFromCid('q3')
    store.addGroupChat(row('q4'))
    respond(page([row('q1'), row('a1', 'assistant')]))
    await loading
    expect(store.chatList.map(item => item.cid)).toEqual(['q1', 'a1', 'q2', 'a2', 'q4'])
  })

  it('最新一页和本地接不上（别处新增了一页以上）：按这一页重建，翻页从它的游标往前，中间不缺一段', async () => {
    const store = activeWith([row('q1'), row('a1', 'assistant')], true)
    const respond = deferChatLogPage()
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    // 请求途中本页开始的一轮：接在后面
    store.addGroupChat(row('q9'))
    respond(page([row('q7'), row('a7', 'assistant'), row('q8'), row('a8', 'assistant')], true))
    await refreshing
    expect(store.chatList.map(item => item.cid)).toEqual(['q7', 'a7', 'q8', 'a8', 'q9'])
    expect(store.messagePaginationByWorkspace[GID]).toMatchObject({
      hasMore: true,
      beforeCursor: 'cursor-new',
    })
  })

  it('请求途中本地被截空（本页替换截掉了全部）：过期的响应不把删掉的回合加回来', async () => {
    const store = activeWith([row('q1'), row('a1', 'assistant')])
    const respond = deferChatLogPage()
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    store.removeMessagesFromCid('q1')
    expect(store.chatList).toEqual([])
    respond(page([row('q1'), row('a1', 'assistant')]))
    await refreshing
    expect(store.chatList).toEqual([])
  })

  it('搜索定位取来的一段和最新一页接不上：那一段留着（用户要看的），最新一页接在后面', async () => {
    const store = activeWith([], true)
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q3'), row('a3', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q3')
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([row('q8'), row('a8', 'assistant')], true)
    )
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList.map(item => item.cid)).toEqual(['q3', 'a3', 'q8', 'a8'])
    expect(store.messagePaginationByWorkspace[GID].beforeCursor).toBe('cursor-around')
  })

  it('刷新途中做了搜索定位（整表换掉）：这次响应丢掉，按定位后的列表再取一次；定位的一段一直留着', async () => {
    const latest = [row('q7'), row('a7', 'assistant'), row('q8'), row('a8', 'assistant')]
    const store = activeWith(latest, true)
    const respond = deferChatLogPage()
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q3'), row('a3', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q3')
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(page(latest, true))
    respond(page(latest, true))
    await refreshing
    await vi.waitFor(() => expect(fetchQueryChatLogListAPI).toHaveBeenCalledTimes(2))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(store.chatList.map(item => item.cid)).toEqual(['q3', 'a3', 'q7', 'a7', 'q8', 'a8'])
    // 和最新一页还没接上：仍按定位的一段对待（记着它的最后一条）
    expect(store.messagePaginationByWorkspace[GID]).toMatchObject({
      beforeCursor: 'cursor-around',
      detached: 'a3',
    })

    // 这一页和上次接上的最新部分重合、却没接上定位的一段：仍按定位的一段对待
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(page(latest, true))
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList.map(item => item.cid)).toEqual(['q3', 'a3', 'q7', 'a7', 'q8', 'a8'])
    expect(store.messagePaginationByWorkspace[GID].detached).toBe('a3')

    // 别处新增了一页以上：定位的一段不被整表换掉，最新一页接在后面
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([row('q20'), row('a20', 'assistant')], true)
    )
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList.map(item => item.cid)).toEqual([
      'q3',
      'a3',
      'q7',
      'a7',
      'q8',
      'a8',
      'q20',
      'a20',
    ])
  })

  it('定位的一段接上了最新（某次刷新的那一页含它的最后一条）：回到普通列表', async () => {
    const store = activeWith([], true)
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q3'), row('a3', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q3')
    expect(store.messagePaginationByWorkspace[GID].detached).toBe('a3')
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([row('a3', 'assistant'), row('q4'), row('a4', 'assistant')], true)
    )
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList.map(item => item.cid)).toEqual(['q3', 'a3', 'q4', 'a4'])
    expect(store.messagePaginationByWorkspace[GID].detached).toBeUndefined()
  })

  it('刷新途中做了搜索定位、又往上翻了一页：过期的刷新不清翻页的加载标记，等翻页结束再取，顺序不乱', async () => {
    const latest = [row('q7'), row('a7', 'assistant'), row('q8'), row('a8', 'assistant')]
    const store = activeWith(latest, true)
    const respondRefresh = deferChatLogPage()
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q3'), row('a3', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q3')
    const respondOlder = deferChatLogPage()
    const loadingOlder = store.loadOlderChatMessages(GID)
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(page(latest, true))

    respondRefresh(page(latest, true))
    await new Promise(resolve => setTimeout(resolve, 0))
    // 翻页还在途：过期的刷新不动它的加载标记，也还没开始再取
    expect(store.messagePaginationByWorkspace[GID].loading).toBe(true)
    expect(fetchQueryChatLogListAPI).toHaveBeenCalledTimes(2)

    respondOlder(page([row('q1'), row('a1', 'assistant')]))
    await loadingOlder
    await refreshing
    expect(fetchQueryChatLogListAPI).toHaveBeenCalledTimes(3)
    const expected = ['q1', 'a1', 'q3', 'a3', 'q7', 'a7', 'q8', 'a8']
    expect(store.chatList.map(item => item.cid)).toEqual(expected)

    // 再刷新一次：往上翻出来的那一页还在
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(page(latest, true))
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList.map(item => item.cid)).toEqual(expected)
  })

  it('定位后往上翻页很慢：过期刷新的重取一直等到翻页结束，不会中途放弃', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const latest = [row('q7'), row('a7', 'assistant'), row('q8'), row('a8', 'assistant')]
      const store = activeWith(latest, true)
      const respondRefresh = deferChatLogPage()
      const refreshing = store.queryActiveChatLogList(GID, { force: true })
      vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
        data: {
          rows: [row('q3'), row('a3', 'assistant')],
          pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
        },
      } as any)
      await store.queryChatLogAround(GID, 'q3')
      const respondOlder = deferChatLogPage()
      const loadingOlder = store.loadOlderChatMessages(GID)
      vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(page(latest, true))
      respondRefresh(page(latest, true))
      let settled = false
      void refreshing.then(() => {
        settled = true
      })
      await vi.advanceTimersByTimeAsync(5000)
      expect(settled).toBe(false)
      expect(fetchQueryChatLogListAPI).toHaveBeenCalledTimes(2)

      respondOlder(page([row('q1'), row('a1', 'assistant')]))
      await loadingOlder
      await refreshing
      expect(fetchQueryChatLogListAPI).toHaveBeenCalledTimes(3)
      expect(store.chatList.map(item => item.cid)).toEqual([
        'q1',
        'a1',
        'q3',
        'a3',
        'q7',
        'a7',
        'q8',
        'a8',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('单独删掉定位段的最后一条：定位标记挪到它前一条，之后的刷新仍不整表换掉定位段', async () => {
    const store = activeWith([], true)
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q3'), row('a3', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q3')
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([row('q7'), row('a7', 'assistant')], true)
    )
    await store.queryActiveChatLogList(GID, { force: true })
    await store.deleteChatByCid('a3')
    expect(store.messagePaginationByWorkspace[GID].detached).toBe('q3')

    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([row('q20'), row('a20', 'assistant')], true)
    )
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList.map(item => item.cid)).toEqual(['q3', 'q7', 'a7', 'q20', 'a20'])
  })

  it('在定位的一段里重新生成、刷新正在途中：回到普通列表，过期的最新一页不插进来', async () => {
    const store = activeWith([], true)
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q2'), row('a2', 'assistant'), row('q3'), row('a3', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q2')
    const respond = deferChatLogPage()
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    // 从 q3 重新生成被接受：服务端删掉了 q3 及其后的全部（含最新的 q40–a41）
    store.removeMessagesFromCid('q3')
    store.addGroupChat(row('q3n'))
    store.addGroupChat(row('a3n', 'assistant', { loading: true, status: ChatLogStatus.GENERATING }))
    expect(store.messagePaginationByWorkspace[GID].detached).toBeUndefined()
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([row('q2'), row('a2', 'assistant'), row('q3n'), row('a3n', 'assistant')])
    )
    respond(page([row('q40'), row('a40', 'assistant'), row('q41'), row('a41', 'assistant')], true))
    await refreshing
    // 过期的那次丢掉，按截断后的列表重取了一次；加载标记放下了
    expect(fetchQueryChatLogListAPI).toHaveBeenCalledTimes(2)
    expect(store.messagePaginationByWorkspace[GID].loading).toBe(false)
    expect(store.chatList.map(item => item.cid)).toEqual(['q2', 'a2', 'q3n', 'a3n'])
  })

  it('定位两次、各往上翻一页，前一次翻页先回来：被丢弃的刷新仍等后一次翻页结束再重取', async () => {
    const latest = [row('q7'), row('a7', 'assistant'), row('q8'), row('a8', 'assistant')]
    const store = activeWith(latest, true)
    const pending = () => {
      let respond: (value: unknown) => void = () => {}
      const promise = new Promise(resolve => {
        respond = resolve
      })
      return { promise, respond: (value: unknown) => respond(value) }
    }
    const refresh = pending()
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(refresh.promise as any)
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    const around = (rows: Chat.Chat[]) =>
      vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
        data: { rows, pageInfo: { hasMore: true, beforeCursor: 'cursor-around' } },
      } as any)
    around([row('q3'), row('a3', 'assistant')])
    await store.queryChatLogAround(GID, 'q3')
    const older1 = pending()
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(older1.promise as any)
    const loadingOlder1 = store.loadOlderChatMessages(GID)
    around([row('q5'), row('a5', 'assistant')])
    await store.queryChatLogAround(GID, 'q5')
    const older2 = pending()
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(older2.promise as any)
    const loadingOlder2 = store.loadOlderChatMessages(GID)
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(page(latest, true))

    older1.respond(page([row('q1'), row('a1', 'assistant')]))
    await loadingOlder1
    refresh.respond(page(latest, true))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(fetchQueryChatLogListAPI).toHaveBeenCalledTimes(3)

    older2.respond(page([row('q4'), row('a4', 'assistant')]))
    await loadingOlder2
    await refreshing
    expect(fetchQueryChatLogListAPI).toHaveBeenCalledTimes(4)
    expect(store.chatList.map(item => item.cid)).toEqual([
      'q4',
      'a4',
      'q5',
      'a5',
      'q7',
      'a7',
      'q8',
      'a8',
    ])
  })

  it('删除定位段最后一条的请求途中来了一次刷新（服务端已删掉它）：这一页从定位段一直盖到最新，回到普通列表', async () => {
    const store = activeWith([], true)
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q3'), row('a3', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q3')
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([row('q7'), row('a7', 'assistant')], true)
    )
    await store.queryActiveChatLogList(GID, { force: true })
    let finishDelete: (value: unknown) => void = () => {}
    vi.mocked(fetchDelChatLogAPI).mockReturnValueOnce(
      new Promise(resolve => {
        finishDelete = resolve
      }) as any
    )
    const deleting = store.deleteChatByCid('a3')
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([row('q3'), row('q7'), row('a7', 'assistant')], true)
    )
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList.map(item => item.cid)).toEqual(['q3', 'q7', 'a7'])
    expect(store.messagePaginationByWorkspace[GID].detached).toBeUndefined()
    finishDelete({ success: true })
    await deleting
    expect(store.messagePaginationByWorkspace[GID].detached).toBeUndefined()
  })

  it('被丢弃的刷新在等翻页时又定位、又开始新一次翻页：一直等到没有在途的翻页再重取', async () => {
    const latest = [row('q7'), row('a7', 'assistant'), row('q8'), row('a8', 'assistant')]
    const store = activeWith(latest, true)
    const pending = () => {
      let respond: (value: unknown) => void = () => {}
      const promise = new Promise(resolve => {
        respond = resolve
      })
      return { promise, respond: (value: unknown) => respond(value) }
    }
    const around = (rows: Chat.Chat[]) =>
      vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
        data: { rows, pageInfo: { hasMore: true, beforeCursor: 'cursor-around' } },
      } as any)
    const refresh = pending()
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(refresh.promise as any)
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    around([row('q3'), row('a3', 'assistant')])
    await store.queryChatLogAround(GID, 'q3')
    const older1 = pending()
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(older1.promise as any)
    const loadingOlder1 = store.loadOlderChatMessages(GID)
    // 刷新先回来、被丢弃，开始等第一次翻页
    refresh.respond(page(latest, true))
    await new Promise(resolve => setTimeout(resolve, 0))
    // 等待期间又定位、又开始新一次翻页
    around([row('q5'), row('a5', 'assistant')])
    await store.queryChatLogAround(GID, 'q5')
    const older2 = pending()
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(older2.promise as any)
    const loadingOlder2 = store.loadOlderChatMessages(GID)
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(page(latest, true))
    older1.respond(page([row('q1'), row('a1', 'assistant')]))
    await loadingOlder1
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(fetchQueryChatLogListAPI).toHaveBeenCalledTimes(3)

    older2.respond(page([row('q4'), row('a4', 'assistant')]))
    await loadingOlder2
    await refreshing
    expect(fetchQueryChatLogListAPI).toHaveBeenCalledTimes(4)
    expect(store.chatList.map(item => item.cid)).toEqual([
      'q4',
      'a4',
      'q5',
      'a5',
      'q7',
      'a7',
      'q8',
      'a8',
    ])
  })

  it('在定位段里截断时往上翻页正在途中：那一页丢掉，加载标记放下', async () => {
    const store = activeWith([], true)
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q2'), row('a2', 'assistant'), row('q3'), row('a3', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q2')
    const respondOlder = deferChatLogPage()
    const loadingOlder = store.loadOlderChatMessages(GID)
    store.removeMessagesFromCid('q3')
    expect(store.messagePaginationByWorkspace[GID].loading).toBe(false)
    respondOlder(page([row('q1'), row('a1', 'assistant')]))
    await expect(loadingOlder).resolves.toEqual({ added: false })
    expect(store.chatList.map(item => item.cid)).toEqual(['q2', 'a2'])
    expect(store.messagePaginationByWorkspace[GID].loading).toBe(false)
  })

  it('对已切走的会话截断（发送途中切走了）：只动那个会话的缓存与定位标记，不碰当前列表', async () => {
    const store = activeWith([], true)
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q2'), row('a2', 'assistant'), row('q3'), row('a3', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q2')
    store.active = OTHER_GID
    store.chatList = [row('x1')]
    store.messageCacheByWorkspace[OTHER_GID] = store.chatList
    store.removeMessagesFromCid('q3', GID)
    expect(store.messageCacheByWorkspace[GID].map(item => item.cid)).toEqual(['q2', 'a2'])
    expect(store.messagePaginationByWorkspace[GID].detached).toBeUndefined()
    expect(store.chatList.map(item => item.cid)).toEqual(['x1'])
  })

  it('首屏的一页没取到、期间插进来了新的一轮：留着这一轮，顶部给出重试；重试时先取最新一页并接上', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {})]
    let fail: (reason: unknown) => void = () => {}
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject
      }) as any
    )
    const loading = store.queryActiveChatLogList(GID, { force: true })
    store.addGroupChat(row('q9'))
    store.addGroupChat(row('a9', 'assistant', { loading: true, status: ChatLogStatus.GENERATING }))
    fail(new Error('network'))
    await loading
    expect(store.chatList.map(item => item.cid)).toEqual(['q9', 'a9'])
    expect(store.messagePaginationByWorkspace[GID]).toMatchObject({
      initialized: false,
      loading: false,
      hasMore: true,
      olderLoadFailed: true,
    })

    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([row('q1'), row('a1', 'assistant'), row('q9'), row('a9', 'assistant')], true)
    )
    await expect(store.loadOlderChatMessages(GID)).resolves.toEqual({ added: true })
    expect(store.chatList.map(item => item.cid)).toEqual(['q1', 'a1', 'q9', 'a9'])
    expect(store.messagePaginationByWorkspace[GID]).toMatchObject({
      initialized: true,
      hasMore: true,
      beforeCursor: 'cursor-new',
    })
    expect(store.messagePaginationByWorkspace[GID].olderLoadFailed).toBeUndefined()
  })

  it('刷新失败：列表不回滚到请求时的样子（途中截掉的不回来，途中开始的一轮不丢）', async () => {
    const store = activeWith([row('q1'), row('a1', 'assistant'), row('q2'), row('a2', 'assistant')])
    let fail: (reason: unknown) => void = () => {}
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject
      }) as any
    )
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    store.removeMessagesFromCid('q2')
    store.addGroupChat(row('q9'))
    store.addGroupChat(row('a9', 'assistant', { loading: true, status: ChatLogStatus.GENERATING }))
    fail(new Error('network'))
    await refreshing
    expect(store.chatList.map(item => item.cid)).toEqual(['q1', 'a1', 'q9', 'a9'])
    expect(store.messageCacheByWorkspace[GID]).toBe(store.chatList)
    expect(store.messagePaginationByWorkspace[GID].loading).toBe(false)
  })

  it('请求途中本地截掉了最新一页的全部回合、这一页又和本地接不上：更早的消息留着，不按空的一页重建', async () => {
    const store = activeWith(
      [row('q1'), row('a1', 'assistant'), row('q2'), row('a2', 'assistant')],
      true
    )
    const respond = deferChatLogPage()
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    store.removeMessagesFromCid('q2')
    respond(page([row('q2'), row('a2', 'assistant')], true))
    await refreshing
    expect(store.chatList.map(item => item.cid)).toEqual(['q1', 'a1'])
    expect(store.messagePaginationByWorkspace[GID].beforeCursor).toBe('cursor-old')
  })

  it('搜索定位的一段和最新一页接不上、请求途中开始了新一轮：新一轮排在最后（输入框按它判断「生成中」）', async () => {
    const store = activeWith([], true)
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q3'), row('a3', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q3')
    const respond = deferChatLogPage()
    const refreshing = store.queryActiveChatLogList(GID, { force: true })
    store.addGroupChat(row('q9'))
    store.addGroupChat(row('a9', 'assistant', { loading: true, status: ChatLogStatus.GENERATING }))
    respond(page([row('q8'), row('a8', 'assistant')], true))
    await refreshing
    expect(store.chatList.map(item => item.cid)).toEqual(['q3', 'a3', 'q8', 'a8', 'q9', 'a9'])
  })

  it('往上翻页途中做了搜索定位（整表换掉）：翻页的响应回来直接丢掉，不排到定位的一段前面，也不盖掉游标', async () => {
    const store = activeWith([row('q5'), row('a5', 'assistant')], true)
    const respond = deferChatLogPage()
    const loading = store.loadOlderChatMessages(GID)
    vi.mocked(fetchQueryChatLogAroundAPI).mockResolvedValueOnce({
      data: {
        rows: [row('q2'), row('a2', 'assistant')],
        pageInfo: { hasMore: true, beforeCursor: 'cursor-around' },
      },
    } as any)
    await store.queryChatLogAround(GID, 'q2')
    respond(page([row('q3'), row('a3', 'assistant'), row('q4'), row('a4', 'assistant')], true))
    await expect(loading).resolves.toEqual({ added: false })
    expect(store.chatList.map(item => item.cid)).toEqual(['q2', 'a2'])
    expect(store.messagePaginationByWorkspace[GID].beforeCursor).toBe('cursor-around')
  })

  it('本地才有的状态在刷新后保留：跟丢标记（服务端仍在生成）与「不能重试」', async () => {
    const store = activeWith([
      row('q1'),
      row('a1', 'assistant', { status: ChatLogStatus.FAILED, errorRetryable: false }),
      row('q2'),
      row('a2', 'assistant', {
        status: ChatLogStatus.GENERATING,
        recovery: 'stalled',
        recoveryMessage: '连接中断',
      }),
    ])
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([
        row('q1'),
        row('a1', 'assistant', { status: ChatLogStatus.FAILED }),
        row('q2'),
        row('a2', 'assistant', { status: ChatLogStatus.GENERATING }),
      ])
    )
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList[1].errorRetryable).toBe(false)
    expect(store.chatList[3]).toMatchObject({ recovery: 'stalled', recoveryMessage: '连接中断' })

    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce(
      page([
        row('q1'),
        row('a1', 'assistant', { status: ChatLogStatus.FAILED }),
        row('q2'),
        row('a2', 'assistant', { status: ChatLogStatus.COMPLETED }),
      ])
    )
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList[3].recovery).toBeUndefined()
  })

  it('重新生成被接受：按发送时的会话截掉这条提问及其后，往前翻页的游标不动', () => {
    const store = activeWith(
      [row('q1'), row('a1', 'assistant'), row('q2'), row('a2', 'assistant')],
      true
    )
    store.messageCacheByWorkspace[OTHER_GID] = [row('x1'), row('x2', 'assistant')]

    store.removeMessagesFromCid('x1', OTHER_GID)
    expect(store.messageCacheByWorkspace[OTHER_GID]).toEqual([])
    expect(store.chatList.map(item => item.cid)).toEqual(['q1', 'a1', 'q2', 'a2'])

    store.removeMessagesFromCid('q2')
    expect(store.chatList.map(item => item.cid)).toEqual(['q1', 'a1'])
    expect(store.messageCacheByWorkspace[GID]).toBe(store.chatList)
    expect(store.messagePaginationByWorkspace[GID]).toMatchObject({
      initialized: true,
      hasMore: true,
      beforeCursor: 'cursor-old',
    })

    // 已经截过（agent.start 又来一次）：什么都不做
    store.removeMessagesFromCid('q2')
    expect(store.chatList.map(item => item.cid)).toEqual(['q1', 'a1'])
  })

  it('结果不确定时丢掉别的会话的缓存，下次打开重新加载；当前会话的不丢', () => {
    const store = activeWith([row('q1')])
    store.messageCacheByWorkspace[OTHER_GID] = [row('x1')]
    store.messagePaginationByWorkspace[OTHER_GID] = {
      initialized: true,
      loading: false,
      hasMore: false,
      beforeCursor: null,
    }
    store.dropMessageCache(OTHER_GID)
    store.dropMessageCache(GID)
    expect(store.messageCacheByWorkspace[OTHER_GID]).toBeUndefined()
    expect(store.messagePaginationByWorkspace[OTHER_GID]).toBeUndefined()
    expect(store.messageCacheByWorkspace[GID]).toHaveLength(1)
  })
})

describe('消息加载失败', () => {
  it('首屏消息没取到、也没有缓存：记成加载失败，而不是空会话', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {})]
    vi.mocked(fetchQueryChatLogListAPI).mockRejectedValueOnce(new Error('offline'))
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList).toEqual([])
    expect(store.messagePaginationByWorkspace[GID].loadFailed).toBe(true)

    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce({
      data: { rows: [{ cid: 'c1', role: 'user', content: 'hi' }], pageInfo: { hasMore: false } },
    } as any)
    await store.queryActiveChatLogList(GID, { force: true })
    expect(store.chatList.map(item => item.cid)).toEqual(['c1'])
    expect(store.messagePaginationByWorkspace[GID].loadFailed).toBeFalsy()
  })

  it('更早的消息没取到：保留「还有更早消息」与游标，记下失败供界面重试', async () => {
    const store = useChatStore()
    store.active = GID
    store.groupList = [makeGroup(GID, {})]
    store.messageCacheByWorkspace[GID] = [{ cid: 'c2', role: 'user', content: 'x' }] as any
    store.messagePaginationByWorkspace[GID] = {
      initialized: true,
      loading: false,
      hasMore: true,
      beforeCursor: 'cursor-1',
    }
    vi.mocked(fetchQueryChatLogListAPI).mockRejectedValueOnce(new Error('offline'))
    await store.loadOlderChatMessages(GID)
    expect(store.messagePaginationByWorkspace[GID]).toMatchObject({
      hasMore: true,
      beforeCursor: 'cursor-1',
      olderLoadFailed: true,
    })
  })
})

describe('一轮结束后的侧栏更新', () => {
  it('会话已有标题：不再下载整张列表，只把它排到前面；还没有标题时照常刷新拿标题', async () => {
    const store = useChatStore()
    store.groupList = [
      { ...makeGroup(OTHER_GID, {}), title: '别的会话', updatedAt: 2000 },
      { ...makeGroup(GID, {}), title: '周报', updatedAt: 1000 },
    ] as any
    vi.mocked(fetchQueryChatGroupsAPI).mockClear()
    await store.refreshAfterTurn(GID)
    expect(fetchQueryChatGroupsAPI).not.toHaveBeenCalled()
    expect(store.groupList[0].uuid).toBe(GID)

    store.groupList = store.groupList.map(item => ({ ...item, title: '' }))
    await store.refreshAfterTurn(GID)
    expect(fetchQueryChatGroupsAPI).toHaveBeenCalledTimes(1)
  })

  it('本机时钟比服务端慢：刚结束一轮的会话仍排到最前', async () => {
    const store = useChatStore()
    const serverAhead = Date.now() + 60 * 60 * 1000
    store.groupList = [
      { ...makeGroup(OTHER_GID, {}), title: '别的会话', updatedAt: serverAhead },
      { ...makeGroup(GID, {}), title: '周报', updatedAt: 1000 },
    ] as any
    await store.refreshAfterTurn(GID)
    expect(store.groupList[0].uuid).toBe(GID)
  })

  it('恢复接上的那一轮结束：按服务端的顺序刷新，不把会话顶到最前（它可能早就结束了）', async () => {
    const store = useChatStore()
    store.groupList = [
      { ...makeGroup(OTHER_GID, {}), title: '别的会话', updatedAt: 2000 },
      { ...makeGroup(GID, {}), title: '周报', updatedAt: 1000 },
    ] as any
    vi.mocked(fetchQueryChatGroupsAPI).mockResolvedValueOnce({
      success: true,
      data: [
        { ...makeGroup(OTHER_GID, {}), title: '别的会话', updatedAt: 2000 },
        { ...makeGroup(GID, {}), title: '周报', updatedAt: 1000 },
      ],
    } as any)
    await store.refreshAfterTurn(GID, { resumed: true })
    expect(fetchQueryChatGroupsAPI).toHaveBeenCalledTimes(1)
    expect(store.groupList[0].uuid).toBe(OTHER_GID)
  })
})

describe('消息缓存的上限', () => {
  it(`只保留最近打开的 ${MESSAGE_CACHE_LIMIT} 个会话的消息缓存；当前会话不丢，重新打开的排到最新`, () => {
    const store = useChatStore()
    const ids = Array.from({ length: MESSAGE_CACHE_LIMIT + 2 }, (_, index) => `g_${index}`)
    for (const id of ids) {
      store.messageCacheByWorkspace[id] = [{ cid: `m-${id}`, role: 'user' } as any]
      store.messagePaginationByWorkspace[id] = {
        initialized: true,
        loading: false,
        hasMore: false,
        beforeCursor: null,
      }
    }
    // 依次打开，中途回到第一个：它排到最新，不被丢掉
    for (const id of ids.slice(0, 3)) {
      store.active = id
      store.rememberRecentWorkspace(id)
    }
    store.active = ids[0]
    store.rememberRecentWorkspace(ids[0])
    for (const id of ids.slice(3)) {
      store.active = id
      store.rememberRecentWorkspace(id)
    }
    expect(store.recentWorkspaceIds).toHaveLength(MESSAGE_CACHE_LIMIT)
    expect(store.messageCacheByWorkspace[ids[1]]).toBeUndefined()
    expect(store.messagePaginationByWorkspace[ids[1]]).toBeUndefined()
    expect(store.messageCacheByWorkspace[ids[2]]).toBeUndefined()
    expect(store.messageCacheByWorkspace[ids[0]]).toBeDefined()
    expect(store.messageCacheByWorkspace[ids.at(-1)!]).toBeDefined()
  })
})

function deferredValue<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('身份变化（clearChat）之后旧请求的结果', () => {
  it('在途的新建会话不被新身份复用；旧身份建好的会话不放进新列表，也不搬新身份的首页草稿', async () => {
    const store = useChatStore()
    const oldCreation = deferredValue<unknown>()
    vi.mocked(fetchCreateChatGroupAPI)
      .mockReturnValueOnce(oldCreation.promise as any)
      .mockResolvedValueOnce({ success: true, data: { uuid: OTHER_GID, title: 't' } } as any)
    const first = store.initializeWorkspace()
    store.clearChat({ keepDraft: true })
    store.setDraft('', '新身份在首页写的问题')
    const second = store.initializeWorkspace()
    expect(fetchCreateChatGroupAPI).toHaveBeenCalledTimes(2)
    await expect(second).resolves.toBe(OTHER_GID)
    oldCreation.resolve({ success: true, data: { uuid: GID, title: 't' } })
    await expect(first).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    expect(store.groupList.map(item => item.uuid)).toEqual([OTHER_GID])
    expect(store.active).toBe(OTHER_GID)
  })

  it('会话列表：旧身份的响应不写入；之后的查询照常落地，不会卡住', async () => {
    const store = useChatStore()
    const stale = deferredValue<unknown>()
    vi.mocked(fetchQueryChatGroupsAPI).mockReturnValueOnce(stale.promise as any)
    const old = store.queryMyGroup()
    store.clearChat({ keepDraft: true })
    stale.resolve({ success: true, data: [{ gid: GID, title: '旧身份的会话', channel: 'web' }] })
    await old
    expect(store.groupList).toEqual([])
    expect(store.groupPagination.initialized).toBe(false)

    vi.mocked(fetchQueryChatGroupsAPI).mockResolvedValueOnce({
      success: true,
      data: [{ gid: OTHER_GID, title: '新身份的会话', channel: 'web' }],
    } as any)
    await store.queryMyGroup()
    expect(store.groupList.map(item => item.uuid)).toEqual([OTHER_GID])
  })

  it('消息列表：旧身份的响应不写消息与分页，也不清新请求的加载标记', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {})]
    const stale = deferredValue<unknown>()
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(stale.promise as any)
    const old = store.queryActiveChatLogList(GID, { force: true })
    store.clearChat({ keepDraft: true })
    store.messagePaginationByWorkspace[GID] = {
      initialized: false,
      loading: true,
      hasMore: true,
      beforeCursor: null,
    }
    stale.resolve({ data: [{ cid: 'old-1', role: 'assistant', content: '旧' }] })
    await old
    expect(store.chatList).toEqual([])
    expect(store.messageCacheByWorkspace[GID]).toBeUndefined()
    expect(store.messagePaginationByWorkspace[GID].loading).toBe(true)
  })

  it('往上翻页：不把请求前的快照写回清空后的缓存；在途记录照常删掉，之后的翻页不被挡住', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {})]
    store.active = GID
    store.messageCacheByWorkspace[GID] = [{ cid: 'c-2', role: 'assistant' } as any]
    store.messagePaginationByWorkspace[GID] = {
      initialized: true,
      loading: false,
      hasMore: true,
      beforeCursor: 'cursor-1',
    }
    const stale = deferredValue<unknown>()
    vi.mocked(fetchQueryChatLogListAPI).mockReturnValueOnce(stale.promise as any)
    const old = store.loadOlderChatMessages(GID)
    store.clearChat({ keepDraft: true })
    stale.resolve({ data: { rows: [{ cid: 'c-1', role: 'user' }], pageInfo: { hasMore: false } } })
    await expect(old).resolves.toEqual({ added: false })
    expect(store.messageCacheByWorkspace[GID]).toBeUndefined()
    expect(store.chatList).toEqual([])
  })

  it('删除消息按发起时的会话写；期间身份换了就不写', async () => {
    const store = useChatStore()
    store.groupList = [makeGroup(GID, {}), makeGroup(OTHER_GID, {})]
    store.active = GID
    store.chatList = [{ cid: 'm-1', role: 'user' } as any, { cid: 'm-2', role: 'assistant' } as any]
    store.messageCacheByWorkspace[GID] = store.chatList
    const deletion = deferredValue<unknown>()
    vi.mocked(fetchDelChatLogAPI).mockReturnValueOnce(deletion.promise as any)
    const removing = store.deleteChatByCid('m-2')
    store.active = OTHER_GID
    store.chatList = [{ cid: 'o-1', role: 'user' } as any]
    deletion.resolve({ success: true })
    await removing
    expect(store.messageCacheByWorkspace[GID].map(item => item.cid)).toEqual(['m-1'])
    expect(store.chatList.map(item => item.cid)).toEqual(['o-1'])

    store.active = GID
    store.chatList = store.messageCacheByWorkspace[GID]
    const again = deferredValue<unknown>()
    vi.mocked(fetchDelChatLogAPI).mockReturnValueOnce(again.promise as any)
    const staleRemoval = store.deleteChatByCid('m-1')
    store.clearChat({ keepDraft: true })
    again.resolve({ success: true })
    await staleRemoval
    expect(store.messageCacheByWorkspace).toEqual({})
  })
})

describe('提交锁', () => {
  it('被占用时拿不到；只有持有者能释放；作废后原持有者失效、释放变成空操作', () => {
    const store = useChatStore()
    const first = store.acquireSubmitLock()
    expect(first).toBeTruthy()
    expect(store.acquireSubmitLock()).toBeNull()
    expect(store.isSubmitLockCurrent(first)).toBe(true)

    store.revokeSubmitLock()
    expect(store.isSubmitting).toBe(false)
    expect(store.isSubmitLockCurrent(first)).toBe(false)
    const second = store.acquireSubmitLock()
    store.releaseSubmitLock(first)
    expect(store.isSubmitting).toBe(true)
    expect(store.isSubmitLockCurrent(second)).toBe(true)
    store.releaseSubmitLock(second)
    expect(store.isSubmitting).toBe(false)
  })

  it('身份变化（clearChat）作废正在进行的提交', () => {
    const store = useChatStore()
    const lock = store.acquireSubmitLock()
    store.clearChat({ keepDraft: true })
    expect(store.isSubmitting).toBe(false)
    expect(store.isSubmitLockCurrent(lock)).toBe(false)
  })
})

describe('停止流程落定的终态与丢缓存（D-c）', () => {
  function withReply(status: number, extra: Partial<Chat.Chat> = {}) {
    const store = useChatStore()
    store.active = GID
    store.groupList = [makeGroup(GID, {}), makeGroup(OTHER_GID, {})]
    store.chatList = [
      { cid: 'u-1', role: 'user', content: '问' },
      { cid: 'a-1', role: 'assistant', content: '部分', status, ...extra },
    ] as Chat.Chat[]
    store.messageCacheByWorkspace[GID] = store.chatList
    store.messagePaginationByWorkspace[GID] = {
      initialized: true,
      loading: false,
      hasMore: false,
      beforeCursor: null,
    }
    return store
  }
  const reply = (store: ReturnType<typeof useChatStore>) =>
    store.chatList.find(item => item.cid === 'a-1')

  it('落定之后才到的「生成中」旧行不把已停止退回去；服务端也到终态时以服务端为准', async () => {
    const store = withReply(ChatLogStatus.GENERATING, { loading: true })
    expect(
      store.applySettledReplyRow(GID, {
        cid: 'a-1',
        role: 'assistant',
        content: '部分',
        status: ChatLogStatus.STOPPED,
      } as Chat.Chat)
    ).toBe(true)
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce({
      data: [
        { cid: 'u-1', role: 'user', content: '问' },
        { cid: 'a-1', role: 'assistant', content: '部分', status: ChatLogStatus.GENERATING },
      ],
    } as any)
    await store.queryActiveChatLogList(GID, { force: true })
    expect(reply(store)?.status).toBe(ChatLogStatus.STOPPED)

    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce({
      data: [
        { cid: 'u-1', role: 'user', content: '问' },
        { cid: 'a-1', role: 'assistant', content: '完整', status: ChatLogStatus.COMPLETED },
      ],
    } as any)
    await store.queryActiveChatLogList(GID, { force: true })
    expect(reply(store)).toMatchObject({ status: ChatLogStatus.COMPLETED, content: '完整' })
  })

  it('没有落定记录的终态照现有规则：服务端的行为准', async () => {
    const store = withReply(ChatLogStatus.COMPLETED)
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce({
      data: [
        { cid: 'u-1', role: 'user', content: '问' },
        { cid: 'a-1', role: 'assistant', content: '部分', status: ChatLogStatus.GENERATING },
      ],
    } as any)
    await store.queryActiveChatLogList(GID, { force: true })
    expect(reply(store)?.status).toBe(ChatLogStatus.GENERATING)
  })

  it('清空会话数据时落定记录一并清掉', async () => {
    const store = withReply(ChatLogStatus.GENERATING, { loading: true })
    store.applySettledReplyRow(GID, {
      cid: 'a-1',
      role: 'assistant',
      content: '部分',
      status: ChatLogStatus.STOPPED,
    } as Chat.Chat)
    store.clearChat({ keepDraft: true })
    const again = withReply(ChatLogStatus.STOPPED)
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce({
      data: [
        { cid: 'u-1', role: 'user', content: '问' },
        { cid: 'a-1', role: 'assistant', content: '部分', status: ChatLogStatus.GENERATING },
      ],
    } as any)
    await again.queryActiveChatLogList(GID, { force: true })
    expect(reply(again)?.status).toBe(ChatLogStatus.GENERATING)
  })

  it('按服务端终态行落定：收起加载、实时工具与跟丢标记；不是当前会话或找不到这条时不改', () => {
    const store = withReply(ChatLogStatus.GENERATING, {
      loading: true,
      recovery: 'stalled',
      recoveryMessage: '跟丢了',
      liveToolCalls: [{ id: 't' }] as any,
    })
    expect(
      store.applySettledReplyRow(OTHER_GID, {
        cid: 'a-1',
        status: ChatLogStatus.COMPLETED,
      } as Chat.Chat)
    ).toBe(false)
    expect(
      store.applySettledReplyRow(GID, { cid: 'a-x', status: ChatLogStatus.COMPLETED } as Chat.Chat)
    ).toBe(false)
    expect(
      store.applySettledReplyRow(GID, {
        cid: 'a-1',
        role: 'assistant',
        content: '完整',
        status: ChatLogStatus.COMPLETED,
      } as Chat.Chat)
    ).toBe(true)
    expect(reply(store)).toMatchObject({
      status: ChatLogStatus.COMPLETED,
      content: '完整',
      loading: false,
      liveToolCalls: [],
    })
    expect(reply(store)?.recovery).toBeUndefined()
    expect(reply(store)?.recoveryMessage).toBeUndefined()
  })

  it('丢缓存作废在途的往上翻页：成功、失败晚到都不重建缓存，也不留下卡住的加载标记', async () => {
    for (const outcome of ['resolve', 'reject'] as const) {
      setActivePinia(createPinia())
      const store = withReply(ChatLogStatus.COMPLETED)
      store.messagePaginationByWorkspace[GID] = {
        initialized: true,
        loading: false,
        hasMore: true,
        beforeCursor: 'cursor-1',
      }
      let settleOlder!: () => void
      vi.mocked(fetchQueryChatLogListAPI).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            settleOlder = () =>
              outcome === 'resolve'
                ? resolve({
                    data: { rows: [{ cid: 'old', role: 'user', content: '更早' }] },
                  } as any)
                : reject(new Error('offline'))
          })
      )
      const older = store.loadOlderChatMessages(GID)
      store.active = OTHER_GID
      store.dropMessageCache(GID)
      settleOlder()
      await older
      expect(store.messageCacheByWorkspace[GID]).toBeUndefined()
      expect(store.messagePaginationByWorkspace[GID]).toBeUndefined()
    }
  })

  it('旧刷新晚到不清掉重新打开后新刷新的加载标记，也不写入', async () => {
    for (const outcome of ['resolve', 'reject'] as const) {
      setActivePinia(createPinia())
      const store = withReply(ChatLogStatus.GENERATING)
      let settleOld!: () => void
      vi.mocked(fetchQueryChatLogListAPI).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            settleOld = () =>
              outcome === 'resolve'
                ? resolve({
                    data: [{ cid: 'a-1', role: 'assistant', content: '旧', status: 1 }],
                  } as any)
                : reject(new Error('offline'))
          })
      )
      const oldRefresh = store.queryActiveChatLogList(GID, { force: true, silentError: true })
      // 切走并丢缓存，再回来发起新的刷新（挂着不回）
      store.active = OTHER_GID
      store.dropMessageCache(GID)
      let settleNew!: (value: any) => void
      vi.mocked(fetchQueryChatLogListAPI).mockImplementationOnce(
        () => new Promise(resolve => (settleNew = resolve))
      )
      const newRefresh = store.queryActiveChatLogList(GID, { force: true, silentError: true })
      store.active = OTHER_GID
      settleOld()
      await oldRefresh
      expect(store.messagePaginationByWorkspace[GID]?.loading).toBe(true)
      // 加载标记还在：不能再发第三次
      const callsBefore = vi.mocked(fetchQueryChatLogListAPI).mock.calls.length
      store.active = GID
      await store.queryActiveChatLogList(GID, { force: true, silentError: true })
      expect(vi.mocked(fetchQueryChatLogListAPI).mock.calls.length).toBe(callsBefore)
      settleNew({
        data: [{ cid: 'a-1', role: 'assistant', content: '新', status: ChatLogStatus.COMPLETED }],
      })
      await newRefresh
      expect(store.messagePaginationByWorkspace[GID]?.loading).toBe(false)
      expect(store.messageCacheByWorkspace[GID]?.find(item => item.cid === 'a-1')?.content).toBe(
        '新'
      )
    }
  })

  it('不丢缓存、只是切走：旧刷新回来照常放下自己的加载标记，再打开可以刷新', async () => {
    for (const outcome of ['resolve', 'reject'] as const) {
      setActivePinia(createPinia())
      const store = withReply(ChatLogStatus.COMPLETED)
      let settleOld!: () => void
      vi.mocked(fetchQueryChatLogListAPI).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            settleOld = () =>
              outcome === 'resolve' ? resolve({ data: [] } as any) : reject(new Error('offline'))
          })
      )
      const refresh = store.queryActiveChatLogList(GID, { force: true, silentError: true })
      store.active = OTHER_GID
      settleOld()
      await refresh
      expect(store.messagePaginationByWorkspace[GID]?.loading).toBe(false)
      const calls = vi.mocked(fetchQueryChatLogListAPI).mock.calls.length
      await store.queryActiveChatLogList(GID, { force: true, silentError: true })
      expect(vi.mocked(fetchQueryChatLogListAPI).mock.calls.length).toBe(calls + 1)
    }
  })

  it('超出缓存上限被淘汰的会话：在途旧刷新作废；落定后服务端终态先到、旧的生成中响应后到也不退回', async () => {
    const store = withReply(ChatLogStatus.GENERATING, { loading: true })
    store.rememberRecentWorkspace(GID)
    let settleOld!: () => void
    vi.mocked(fetchQueryChatLogListAPI).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          settleOld = () =>
            resolve({
              data: [
                { cid: 'a-1', role: 'assistant', content: '旧', status: ChatLogStatus.GENERATING },
              ],
            } as any)
        })
    )
    const oldRefresh = store.queryActiveChatLogList(GID, { force: true, silentError: true })
    // 切走并打开足够多的会话，A 被挤出缓存
    store.active = OTHER_GID
    for (let index = 0; index <= MESSAGE_CACHE_LIMIT; index += 1) {
      store.rememberRecentWorkspace(`g_${String(index).padStart(24, 'x')}`)
    }
    expect(store.messagePaginationByWorkspace[GID]).toBeUndefined()
    // 重新打开 A：新的刷新带回仍在生成的这一条，随后停止落定为已停止
    store.active = GID
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValueOnce({
      data: [{ cid: 'a-1', role: 'assistant', content: '部分', status: ChatLogStatus.GENERATING }],
    } as any)
    await store.queryActiveChatLogList(GID, { force: true, silentError: true })
    store.applySettledReplyRow(GID, {
      cid: 'a-1',
      role: 'assistant',
      content: '部分',
      status: ChatLogStatus.STOPPED,
    } as Chat.Chat)
    // 服务端的终态先到（删掉落定记录）；之后的再取同样是终态
    vi.mocked(fetchQueryChatLogListAPI).mockResolvedValue({
      data: [{ cid: 'a-1', role: 'assistant', content: '部分', status: ChatLogStatus.STOPPED }],
    } as any)
    await store.queryActiveChatLogList(GID, { force: true, silentError: true })
    // 最早的生成中响应最后到：已被淘汰作废，不写入（作废后按现在的列表再取一次）
    settleOld()
    await oldRefresh
    expect(reply(store)?.status).toBe(ChatLogStatus.STOPPED)
    expect(reply(store)?.content).toBe('部分')
  })
})
