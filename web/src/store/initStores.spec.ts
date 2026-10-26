import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { eventBus } from '@/core/events/eventBus'
import { clearUserToken, setUserToken } from '@/services/identity'
import { initializeStores } from './initStores'
import { useAuthStore } from './modules/auth'
import { useChatStore } from './modules/chat'
import { useGlobalStore } from './modules/global'

const GID = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'
const deps = vi.hoisted(() => ({
  ensureVisitorToken: vi.fn(async () => 'visitor-token'),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getInfo: vi.fn(async () => ({ data: { userInfo: { id: '', role: 'visitor' } } })),
  warning: vi.fn(),
}))
vi.mock('@/services/visitorSession', () => ({ ensureVisitorToken: deps.ensureVisitorToken }))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: deps.connect, disconnect: deps.disconnect },
}))
vi.mock('@/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api')>()),
  fetchGetInfo: deps.getInfo,
}))
vi.mock('@/utils/message', () => ({
  message: () => ({ warning: deps.warning, error: vi.fn(), success: vi.fn(), info: vi.fn() }),
  notifyError: vi.fn(),
}))

beforeEach(() => {
  clearUserToken()
  localStorage.clear()
  setActivePinia(createPinia())
  useAuthStore().loadInit = true
  vi.useFakeTimers()
  Object.values(deps).forEach(fn => fn.mockClear())
})

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

afterEach(() => {
  eventBus.all.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function prepare() {
  initializeStores()
  const chatStore = useChatStore()
  const globalStore = useGlobalStore()
  chatStore.groupList = [{ uuid: GID, title: '', config: '{}' }]
  chatStore.active = GID
  void chatStore.setPrompt('没发出去的问题')
  const closePreviews = vi.spyOn(globalStore, 'closeAllPreviewers')
  return { chatStore, closePreviews }
}

describe('登录状态变化时的收尾', () => {
  it.each(['auth:tokenExpired', 'auth:loginSuccess'] as const)(
    '%s：会话数据按新身份清空，各会话草稿保留，关掉所有预览',
    event => {
      const { chatStore, closePreviews } = prepare()
      eventBus.emit(event, event === 'auth:loginSuccess' ? { token: 't' } : undefined)
      expect(chatStore.groupList).toEqual([])
      expect(chatStore.active).toBe('')
      expect(chatStore.drafts[GID]).toBe('没发出去的问题')
      expect(closePreviews).toHaveBeenCalled()
    }
  )

  it('刚登录成功后的那次认领可以接管本地存储；之后只是再取用户信息时不接管', async () => {
    initializeStores()
    const chatStore = useChatStore()
    const authStore = useAuthStore()
    const claim = vi.spyOn(chatStore, 'claimDraftsFor')
    eventBus.emit('auth:loginSuccess', { token: 't' })
    authStore.userInfo = { ...authStore.userInfo, id: 7, role: 'user' } as typeof authStore.userInfo
    authStore.userInfoResolved = true
    await nextTick()
    expect(claim).toHaveBeenLastCalledWith('user:7', { takeOver: true })

    authStore.userInfoResolved = false
    await nextTick()
    authStore.userInfoResolved = true
    await nextTick()
    expect(claim).toHaveBeenLastCalledWith('user:7', { takeOver: false })
  })

  it('登录前发出的游客身份请求晚到：不用掉「刚登录」的标记，真正登录的那次认领照样接管', async () => {
    initializeStores()
    const chatStore = useChatStore()
    const authStore = useAuthStore()
    const claim = vi.spyOn(chatStore, 'claimDraftsFor')
    eventBus.emit('auth:loginSuccess', { token: 't' })
    authStore.userInfo = { ...authStore.userInfo, role: 'visitor' } as typeof authStore.userInfo
    authStore.userInfoResolved = true
    await nextTick()
    expect(claim).toHaveBeenLastCalledWith('visitor', { takeOver: false })

    authStore.userInfoResolved = false
    await nextTick()
    authStore.userInfo = { ...authStore.userInfo, id: 7, role: 'user' } as typeof authStore.userInfo
    authStore.userInfoResolved = true
    await nextTick()
    expect(claim).toHaveBeenLastCalledWith('user:7', { takeOver: true })
  })

  it('主动退出：连同草稿一起清掉，随后整页刷新', () => {
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload } as unknown as Location)
    const { chatStore } = prepare()
    eventBus.emit('auth:logout')
    expect(chatStore.drafts).toEqual({})
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('登录过期：清会话（保留草稿）后按访客身份恢复一次——确保访客凭证、以它重连、取一次资料', async () => {
    setUserToken('user-token')
    const { chatStore } = prepare()
    clearUserToken()
    eventBus.emit('auth:tokenExpired')
    expect(chatStore.drafts[GID]).toBe('没发出去的问题')
    await flush()
    // getUserInfo 未登录时自己也会确保一次访客凭证（真实实现里第二次直接返回现有的）
    expect(deps.ensureVisitorToken).toHaveBeenCalled()
    expect(deps.connect).toHaveBeenCalledTimes(1)
    expect(deps.getInfo).toHaveBeenCalledTimes(1)

    // 同一个身份代次再触发一次：只重连，不再取资料
    eventBus.emit('auth:tokenExpired')
    await flush()
    expect(deps.getInfo).toHaveBeenCalledTimes(1)
  })

  it('恢复途中身份又变了（重新登录）：退出，不重连、不取资料', async () => {
    let finishEnsure: (token: string) => void = () => undefined
    deps.ensureVisitorToken.mockImplementationOnce(
      () => new Promise<string>(resolve => (finishEnsure = resolve))
    )
    initializeStores()
    eventBus.emit('auth:tokenExpired')
    await flush()
    setUserToken('user-token-again')
    finishEnsure('visitor-token')
    await flush()
    expect(deps.connect).not.toHaveBeenCalled()
    expect(deps.getInfo).not.toHaveBeenCalled()
  })

  it('访客身份被换掉（auth:visitorChanged）：同样清会话并按新访客恢复', async () => {
    const { chatStore } = prepare()
    eventBus.emit('auth:visitorChanged')
    expect(chatStore.groupList).toEqual([])
    expect(chatStore.drafts[GID]).toBe('没发出去的问题')
    await flush()
    expect(deps.connect).toHaveBeenCalledTimes(1)
    expect(deps.getInfo).toHaveBeenCalledTimes(1)
  })

  it('自动更换访客凭证太频繁而暂停：提示一次', () => {
    initializeStores()
    eventBus.emit('auth:visitorRecoveryPaused')
    expect(deps.warning).toHaveBeenCalledWith(expect.stringContaining('访客身份暂时无法建立'))
  })
})
