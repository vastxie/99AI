import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventBus } from '@/core/events/eventBus'
import { clearUserToken, setUserToken } from '@/services/identity'
import { useAuthStore } from './index'

const deps = vi.hoisted(() => ({
  getInfo: vi.fn(),
  queryConfig: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  ensureVisitorToken: vi.fn(async () => 'visitor-token'),
}))

vi.mock('@/api', () => ({ fetchGetInfo: deps.getInfo }))
vi.mock('@/api/config', () => ({ fetchQueryConfigAPI: deps.queryConfig }))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: deps.connect, disconnect: deps.disconnect },
}))
vi.mock('@/services/visitorSession', () => ({ ensureVisitorToken: deps.ensureVisitorToken }))
vi.mock('@/utils/fileAccessCookie', () => ({
  refreshFileAccessCookie: vi.fn(),
  registerFileAccessCredential: vi.fn(),
}))

const TOKEN_KEY = 'SECRET_TOKEN'
const events: string[] = []
const record = (type: unknown) => events.push(String(type))

// getGlobalConfig 按需 import 语言包与 store：先加载好，整套测试并行、机器繁忙时用例不被模块转换拖过超时
beforeAll(async () => {
  await Promise.all([
    import('@/locales'),
    import('@/store/modules/app/preferences'),
    import('@/store'),
  ])
}, 30_000)

beforeEach(() => {
  // 令牌在身份模块里（模块级），新建 Pinia 不会清它
  clearUserToken()
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  events.length = 0
  eventBus.on('*', record)
})

afterEach(() => {
  eventBus.off('*', record)
})

function signedIn() {
  const store = useAuthStore()
  store.loadInit = true
  store.setToken('user-token')
  events.length = 0
  return store
}

describe('登录态', () => {
  it('换上新令牌：写进本地、重置用户信息、通知一次登录成功并用新令牌重连 socket；同一令牌不重复通知', () => {
    const store = useAuthStore()
    store.userInfo = { ...store.userInfo, id: 7, role: 'user' }
    store.setToken('user-token')
    expect(store.isLogin).toBe(true)
    expect(localStorage.getItem(TOKEN_KEY)).toContain('user-token')
    expect(store.userInfo.id).not.toBe(7)
    expect(events).toEqual(['auth:loginSuccess'])
    expect(deps.disconnect).toHaveBeenCalled()
    expect(deps.connect).toHaveBeenCalled()

    // 重设同一令牌：同一身份，不重建连接（在途的发送与回执不受影响）
    deps.disconnect.mockClear()
    deps.connect.mockClear()
    store.setToken('user-token')
    expect(events).toEqual(['auth:loginSuccess'])
    expect(deps.disconnect).not.toHaveBeenCalled()
    expect(deps.connect).not.toHaveBeenCalled()
  })

  it('令牌失效：清掉令牌、回到访客身份并通知过期（草稿由会话 store 保留）', async () => {
    const store = signedIn()
    store.removeToken()
    expect(store.isLogin).toBe(false)
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(store.userInfo.role).toBe('visitor')
    expect(events).toEqual(['auth:tokenExpired'])
    // 断开旧连接；访客凭证、实时连接与资料由 store/initStores.ts 按新身份统一恢复
    expect(deps.disconnect).toHaveBeenCalled()
    await Promise.resolve()
    expect(deps.ensureVisitorToken).not.toHaveBeenCalled()
  })

  it('主动退出：通知退出（会话 store 连同草稿清掉并刷新页面）', () => {
    const store = signedIn()
    store.logOut()
    expect(store.isLogin).toBe(false)
    expect(events).toEqual(['auth:logout'])
  })
})

describe('用户信息', () => {
  it('取到用户信息与账户摘要；无论成败都标记已解析', async () => {
    const store = signedIn()
    deps.getInfo.mockResolvedValueOnce({
      data: {
        userInfo: { id: 3, role: 'user', username: 'u', nickname: 'n' },
        billing: { credits: 5 },
      },
    })
    await store.getUserInfo()
    expect(store.userInfo.id).toBe(3)
    expect(store.billing).toEqual({ credits: 5 })
    expect(store.userInfoResolved).toBe(true)
    expect(store.userInfoLoadFailed).toBe(false)
  })

  it('已登录却取不到用户信息：记成加载失败，界面据此提示而不是当成访客', async () => {
    const store = signedIn()
    deps.getInfo.mockRejectedValueOnce(new Error('offline'))
    await expect(store.getUserInfo()).rejects.toThrow('offline')
    expect(store.userInfoLoadFailed).toBe(true)
    expect(store.userInfoResolved).toBe(true)
  })

  it('访客先建立访客会话再取信息；站点配置还没加载时先加载', async () => {
    const store = useAuthStore()
    deps.queryConfig.mockResolvedValueOnce({
      data: { enabledLanguages: 'zh-CN', defaultLanguage: 'zh-CN' },
    })
    deps.getInfo.mockResolvedValueOnce({ data: { userInfo: { id: '', role: 'visitor' } } })
    await store.getUserInfo()
    expect(deps.queryConfig).toHaveBeenCalledTimes(1)
    expect(deps.ensureVisitorToken).toHaveBeenCalledTimes(1)
    expect(store.userInfoLoadFailed).toBe(false)
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const info = (id: number | string, billing: unknown = null) => ({
  data: { userInfo: { id, role: id ? 'user' : 'visitor', username: 'u', nickname: 'n' }, billing },
})

describe('身份变化与资料、账单', () => {
  it('登录 B 之后，A 的资料请求才回来：抛 IDENTITY_CHANGED，资料、账单、已解析标记都不动', async () => {
    const store = signedIn()
    const late = deferred<unknown>()
    deps.getInfo.mockReturnValueOnce(late.promise)
    const loading = store.getUserInfo()
    store.setToken('user-b-token')
    late.resolve(info(1, { credits: 99 }))
    await expect(loading).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' })
    expect(store.userInfo.id).toBe('')
    expect(store.billing).toBeNull()
    expect(store.userInfoResolved).toBe(false)
    expect(store.userInfoLoadFailed).toBe(false)
  })

  it('同一身份两次调用，先发的后回来：返回最新那次的结果，自己不写状态', async () => {
    const store = signedIn()
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    deps.getInfo.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const older = store.getUserInfo()
    const newer = store.getUserInfo()
    second.resolve(info(2, { credits: 2 }))
    await expect(newer).resolves.toMatchObject({ userInfo: { id: 2 } })
    first.resolve(info(1, { credits: 1 }))
    await expect(older).resolves.toMatchObject({ userInfo: { id: 2 } })
    expect(store.userInfo.id).toBe(2)
    expect(store.billing).toEqual({ credits: 2 })
  })

  it('账单：最新发起的查询获胜；查询发起后有事件写入就不覆盖；换身份后旧查询作废、账单清空', async () => {
    const store = signedIn()
    const older = store.beginBillingQuery()
    const newer = store.beginBillingQuery()
    expect(store.applyBillingQuery(newer, { credits: 2 })).toBe(true)
    expect(store.applyBillingQuery(older, { credits: 1 })).toBe(false)
    expect(store.billing).toEqual({ credits: 2 })

    const query = store.beginBillingQuery()
    store.setBilling({ credits: 3 })
    expect(store.applyBillingQuery(query, { credits: 0 })).toBe(false)
    expect(store.billing).toEqual({ credits: 3 })

    const beforeSwitch = store.beginBillingQuery()
    store.setToken('user-b-token')
    expect(store.billing).toBeNull()
    expect(store.applyBillingQuery(beforeSwitch, { credits: 9 })).toBe(false)
    expect(store.billing).toBeNull()
  })

  it('refreshBilling 晚于账单事件返回：不覆盖事件写入的新值', async () => {
    const store = signedIn()
    const late = deferred<unknown>()
    deps.getInfo.mockReturnValueOnce(late.promise)
    const refreshing = store.refreshBilling()
    store.setBilling({ credits: 5 })
    late.resolve(info(3, { credits: 1 }))
    await refreshing
    expect(store.billing).toEqual({ credits: 5 })
  })

  it('commitLogin：发起登录后身份没变才写入；变了不写、返回 false', () => {
    const store = useAuthStore()
    const login = store.beginLogin()
    setUserToken('someone-else')
    expect(login.commit('my-token')).toBe(false)
    expect(store.token).toBe('someone-else')

    const again = store.beginLogin()
    expect(again.commit('my-token')).toBe(true)
    expect(store.token).toBe('my-token')
  })
})
