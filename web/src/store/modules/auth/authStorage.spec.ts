import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 存储不可用或写不进时 auth store 的两件事：登录令牌没能保存时提示一次；读取站点配置时界面语言以本页已确定的为准。
 * 每个用例用 freshPage() 清空模块状态，模拟一次新的页面加载。
 */

const deps = vi.hoisted(() => ({ warning: vi.fn(), queryConfig: vi.fn() }))

vi.mock('@/api', () => ({ fetchGetInfo: vi.fn() }))
vi.mock('@/api/config', () => ({ fetchQueryConfigAPI: deps.queryConfig }))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() },
}))
vi.mock('@/services/visitorSession', () => ({ ensureVisitorToken: vi.fn(async () => 'visitor') }))
vi.mock('@/utils/fileAccessCookie', () => ({
  refreshFileAccessCookie: vi.fn(),
  registerFileAccessCredential: vi.fn(),
}))
vi.mock('@/utils/message', () => ({
  message: () => ({ warning: deps.warning, error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))

const realStorage = window.localStorage

/** 换一个假的 localStorage：data 是内容，读写删是否抛错分别可控 */
function fakeStorage(
  data: Map<string, string>,
  fail: { get?: boolean; set?: boolean; remove?: boolean } = {}
) {
  const thrower = () => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => ({
      getItem: (key: string) => (fail.get ? thrower() : (data.get(key) ?? null)),
      setItem: (key: string, value: string) => (fail.set ? thrower() : data.set(key, value)),
      removeItem: (key: string) => (fail.remove ? thrower() : data.delete(key)),
    }),
  })
}

function disableStorage() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    },
  })
}

function restoreStorage() {
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => realStorage })
}

/** 一次新的页面加载：模块状态（提示标记、身份、本页语言）都从头开始 */
async function freshPage() {
  vi.resetModules()
  const [{ useAuthStore }, identity, locales, appModule] = await Promise.all([
    import('./index'),
    import('@/services/identity'),
    import('@/locales'),
    import('@/store/modules/app'),
  ])
  setActivePinia(createPinia())
  return {
    store: useAuthStore(),
    identity,
    i18n: locales.default,
    setLocale: locales.setLocale,
    app: appModule.useAppStore(),
  }
}

function serveConfig(defaultLanguage: string, enabled: string[]) {
  deps.queryConfig.mockResolvedValue({
    data: { defaultLanguage, enabledLanguages: JSON.stringify(enabled) },
  })
}

afterEach(() => {
  restoreStorage()
  realStorage.clear()
  deps.warning.mockReset()
  deps.queryConfig.mockReset()
  vi.restoreAllMocks()
})

/** i18n、<html lang> 与 app store 三处一致 */
function expectLanguage(page: Awaited<ReturnType<typeof freshPage>>, language: string) {
  expect(page.i18n.global.locale.value).toBe(language)
  expect(document.documentElement.lang).toBe(language)
  expect(page.app.language).toBe(language)
}

describe('登录令牌没能保存时的提示', () => {
  it('提示一次：同一次页面加载里再次登录不重复提示，本次会话照常', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { store, identity } = await freshPage()
    fakeStorage(new Map(), { set: true })
    store.setToken('token-a')
    expect(identity.isUserTokenPersisted()).toBe(false)
    expect(deps.warning).toHaveBeenCalledTimes(1)
    expect(String(deps.warning.mock.calls[0][0])).toContain('刷新页面后可能需要重新登录')
    store.setToken('token-b')
    expect(deps.warning).toHaveBeenCalledTimes(1)
    expect(identity.currentUserToken()).toBe('token-b')
  })

  it('写得进时不提示', async () => {
    const { store, identity } = await freshPage()
    store.setToken('token-a')
    expect(identity.isUserTokenPersisted()).toBe(true)
    expect(deps.warning).not.toHaveBeenCalled()
  })

  it('同一令牌写失败但回读仍在（写、删都失败）：不提示', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { store, identity } = await freshPage()
    const data = new Map<string, string>()
    fakeStorage(data)
    store.setToken('token-a')
    fakeStorage(data, { set: true, remove: true })
    store.setToken('token-a')
    expect(identity.isUserTokenPersisted()).toBe(true)
    expect(deps.warning).not.toHaveBeenCalled()
  })

  it('同一令牌写失败且记录已丢（腾出旧值后写不进、也放不回去）：提示', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { store, identity } = await freshPage()
    const data = new Map<string, string>()
    fakeStorage(data)
    store.setToken('token-a')
    fakeStorage(data, { set: true })
    store.setToken('token-a')
    expect(identity.isUserTokenPersisted()).toBe(false)
    expect(deps.warning).toHaveBeenCalledTimes(1)
  })

  it('失败 → 成功 → 失败只提示一次；清掉令牌不复位提示', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { store, identity } = await freshPage()
    const data = new Map<string, string>()
    fakeStorage(data, { set: true })
    store.setToken('token-a')
    fakeStorage(data)
    store.setToken('token-b')
    expect(identity.isUserTokenPersisted()).toBe(true)
    fakeStorage(data, { set: true })
    store.setToken('token-c')
    identity.clearUserToken()
    expect(identity.isUserTokenPersisted()).toBe(true)
    store.setToken('token-d')
    expect(deps.warning).toHaveBeenCalledTimes(1)
  })

  it('旧代次的登录提交被拒绝：不写令牌、不提示', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { store, identity } = await freshPage()
    const login = store.beginLogin()
    identity.setVisitorToken('visitor-1')
    identity.markVisitorTokenUsed('visitor-1')
    identity.setVisitorToken('visitor-2')
    fakeStorage(new Map(), { set: true })
    expect(login.commit('token-a')).toBe(false)
    expect(identity.currentUserToken()).toBeUndefined()
    expect(deps.warning).not.toHaveBeenCalled()
  })

  it('访客凭证写不进存储：不提示（刷新后本来就会重新申请）', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { identity } = await freshPage()
    fakeStorage(new Map(), { set: true })
    identity.setVisitorToken('visitor-1')
    expect(deps.warning).not.toHaveBeenCalled()
  })
})

describe('读取站点配置时的界面语言', () => {
  it('存储完全禁用：首次按后台默认；本页切换后再读配置保持；被停用后回到默认', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    disableStorage()
    const page = await freshPage()
    serveConfig('zh-CN', ['zh-CN', 'en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'zh-CN')

    await page.setLocale('en-US')
    page.app.setLanguage('en-US')
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'en-US')

    serveConfig('zh-CN', ['zh-CN'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'zh-CN')
  })

  it('旧值 en-US、本页切中文但写不进，后台随后只允许英文：回到英文，保存的英文不删', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const data = new Map([['appLanguage', 'en-US']])
    fakeStorage(data)
    const page = await freshPage()
    serveConfig('en-US', ['zh-CN', 'en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'en-US')

    fakeStorage(data, { set: true })
    await page.setLocale('zh-CN')
    page.app.setLanguage('zh-CN')
    expect(data.get('appLanguage')).toBe('en-US')
    serveConfig('en-US', ['en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'en-US')
    expect(data.get('appLanguage')).toBe('en-US')
  })

  it('旧值是别名 en、本页切中文但写不进：再读配置仍是中文', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const data = new Map([['appLanguage', 'en']])
    fakeStorage(data)
    const page = await freshPage()
    serveConfig('zh-CN', ['zh-CN', 'en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'en-US')

    fakeStorage(data, { set: true })
    await page.setLocale('zh-CN')
    page.app.setLanguage('zh-CN')
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'zh-CN')
  })

  it('首次从存储恢复的语言也登记为本页语言：之后存储读不到仍保持', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const data = new Map([['appLanguage', 'en-US']])
    fakeStorage(data)
    const page = await freshPage()
    serveConfig('zh-CN', ['zh-CN', 'en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'en-US')

    disableStorage()
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'en-US')
  })

  it('再读配置不重写共享的语言偏好：别的页签刚改的选择保留，本页仍按本页的语言', async () => {
    const data = new Map([['appLanguage', 'zh-CN']])
    fakeStorage(data)
    const page = await freshPage()
    serveConfig('zh-CN', ['zh-CN', 'en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'zh-CN')
    // 别的页签切到了英文
    data.set('appLanguage', 'en-US')
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'zh-CN')
    expect(data.get('appLanguage')).toBe('en-US')
  })

  it('保存的是别名：按别名对应的语言显示，存储不改写', async () => {
    const data = new Map([['appLanguage', 'en']])
    fakeStorage(data)
    const page = await freshPage()
    serveConfig('zh-CN', ['zh-CN', 'en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'en-US')
    expect(data.get('appLanguage')).toBe('en')
  })

  it('保存的语言被停用：回到后台默认，保存值留着，重新启用后照常生效', async () => {
    const data = new Map([['appLanguage', 'en-US']])
    fakeStorage(data)
    const page = await freshPage()
    serveConfig('zh-CN', ['zh-CN'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'zh-CN')
    expect(data.get('appLanguage')).toBe('en-US')

    const next = await freshPage()
    serveConfig('zh-CN', ['zh-CN', 'en-US'])
    await next.store.getGlobalConfig('https://example.invalid')
    expectLanguage(next, 'en-US')
  })

  it('本页语言被停用、别的页签保存了仍有效的语言：改用保存的语言，保存值不动', async () => {
    const data = new Map([['appLanguage', 'zh-CN']])
    fakeStorage(data)
    const page = await freshPage()
    serveConfig('zh-CN', ['zh-CN', 'en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'zh-CN')
    // 别的页签切到了英文，随后后台停用中文
    data.set('appLanguage', 'en-US')
    serveConfig('zh-CN', ['en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'en-US')
    expect(data.get('appLanguage')).toBe('en-US')
  })

  it('本页语言与保存的语言都被停用：回到后台默认，保存值不动', async () => {
    const data = new Map([['appLanguage', 'zh-CN']])
    fakeStorage(data)
    const page = await freshPage()
    serveConfig('zh-CN', ['zh-CN', 'en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'zh-CN')
    serveConfig('en-US', ['en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'en-US')
    expect(data.get('appLanguage')).toBe('zh-CN')
  })

  it('首次打开、没有保存过：按后台默认，不写存储（用户没有选择过）', async () => {
    const data = new Map<string, string>()
    fakeStorage(data)
    const page = await freshPage()
    serveConfig('en-US', ['zh-CN', 'en-US'])
    await page.store.getGlobalConfig('https://example.invalid')
    expectLanguage(page, 'en-US')
    expect(data.has('appLanguage')).toBe(false)
  })

  /** 读取配置的这一次读到 before 之后，别的页签立刻把语言改成 after */
  function storageChangedRightAfterRead(data: Map<string, string>, after: string) {
    let reads = 0
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => ({
        getItem: (key: string) => {
          const value = data.get(key) ?? null
          if (key === 'appLanguage' && ++reads === 1) data.set('appLanguage', after)
          return value
        },
        setItem: (key: string, value: string) => data.set(key, value),
        removeItem: (key: string) => data.delete(key),
      }),
    })
  }

  it.each([
    ['读到停用的 zh-CN 之后，别的页签保存了 en-US', 'zh-CN', 'en-US', ['en-US']],
    ['读到别名 en 之后，别的页签保存了 zh-CN', 'en', 'zh-CN', ['zh-CN', 'en-US']],
    ['读到空值之后，别的页签保存了 zh-CN', null, 'zh-CN', ['zh-CN', 'en-US']],
  ] as const)('%s：保存值保持别的页签的选择', async (_title, before, after, enabled) => {
    const data = new Map<string, string>(before === null ? [] : [['appLanguage', before]])
    fakeStorage(data)
    const page = await freshPage()
    serveConfig('en-US', [...enabled])
    storageChangedRightAfterRead(data, after)
    await page.store.getGlobalConfig('https://example.invalid')
    expect(data.get('appLanguage')).toBe(after)
  })

  it('读取配置从不写、不删共享的语言偏好与 appSetting（各种情形）', async () => {
    const writes: string[] = []
    const data = new Map<string, string>()
    const install = () =>
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => ({
          getItem: (key: string) => data.get(key) ?? null,
          setItem: (key: string, value: string) => {
            writes.push(`set:${key}`)
            data.set(key, value)
          },
          removeItem: (key: string) => {
            writes.push(`remove:${key}`)
            data.delete(key)
          },
        }),
      })
    install()
    for (const [saved, defaultLanguage, enabled] of [
      [null, 'en-US', ['zh-CN', 'en-US']],
      ['en', 'zh-CN', ['zh-CN', 'en-US']],
      ['en-US', 'zh-CN', ['zh-CN']],
      ['zh-CN', 'en-US', ['en-US']],
    ] as const) {
      data.clear()
      if (saved !== null) data.set('appLanguage', saved)
      const page = await freshPage()
      install()
      serveConfig(defaultLanguage, [...enabled])
      await page.store.getGlobalConfig('https://example.invalid')
      // 再读一次（本页已有语言）同样不写
      await page.store.getGlobalConfig('https://example.invalid')
    }
    expect(writes).toEqual([])
  })
})
