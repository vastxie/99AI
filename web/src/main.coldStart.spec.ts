import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 冷启动：导入真实的 main.ts（store 初始化、i18n 安装、强调色、明暗模式、路由安装与挂载都是真的），
 * 只把请求、实时连接、访客凭证申请换成桩，根组件换成渲染一段文案的桩组件。
 * 存储可能整个不可用（隐私模式、被浏览器或策略禁止站点保存数据），取 window.localStorage / sessionStorage 即抛错。
 * 第三方开发工具（@vue/devtools-kit）只在开发入口出现、生产构建里被摇掉，测试环境用的是它的空实现，
 * 所以这里证明的是本仓库代码与生产依赖的启动链路；浏览器里的生产构建另行验收。
 */

const mocks = vi.hoisted(() => ({
  queryConfig: vi.fn(),
  getInfo: vi.fn(),
}))

vi.mock('@/api/config', () => ({ fetchQueryConfigAPI: mocks.queryConfig }))
vi.mock('@/api', () => ({ fetchGetInfo: mocks.getInfo }))
vi.mock('@/services/socket-io', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn(), connectAsync: vi.fn() },
}))
vi.mock('@/services/visitorSession', () => ({
  ensureVisitorToken: vi.fn(async () => 'visitor-token'),
  recoverVisitorIdentity: vi.fn(),
}))
vi.mock('./App.vue', async () => {
  const { defineComponent, h } = await import('vue')
  const { useI18n } = await import('vue-i18n')
  return {
    default: defineComponent({
      setup() {
        const { t } = useI18n()
        return () => h('main', { id: 'cold-start' }, t('common.confirm'))
      },
    }),
  }
})

const realLocal = window.localStorage
const realSession = window.sessionStorage

function disableStorages() {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
    })
  }
}

function restoreStorages() {
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => realLocal })
  Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => realSession })
}

beforeEach(() => {
  vi.resetModules()
  document.body.innerHTML = '<div id="app"></div>'
  document.documentElement.className = ''
  document.documentElement.lang = ''
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
  mocks.queryConfig.mockResolvedValue({
    data: { defaultLanguage: 'en-US', enabledLanguages: '["zh-CN","en-US"]' },
  })
  mocks.getInfo.mockResolvedValue({ data: {} })
})

afterEach(async () => {
  // 每个场景卸载应用（容器上的 __vue_app__），再恢复两个存储属性
  ;(
    document.querySelector('#app') as { __vue_app__?: { unmount(): void } } | null
  )?.__vue_app__?.unmount()
  restoreStorages()
  realLocal.clear()
  realSession.clear()
  vi.restoreAllMocks()
})

async function boot() {
  await import('@/main')
  await vi.waitFor(() => expect(document.querySelector('#cold-start')).not.toBeNull(), {
    timeout: 10_000,
  })
  // 初次导航完成（失败时 isReady 会拒绝）
  const { default: router } = await import('@/utils/router')
  await router.isReady()
  const { useAppStore } = await import('@/store/modules/app')
  const { default: i18n } = await import('@/locales')
  return { app: useAppStore(), i18n }
}

describe('冷启动', () => {
  it('两种存储都被禁用时照常挂载：等站点配置返回后挂载，后台默认语言、跟随系统的明暗模式', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let respond!: (value: unknown) => void
    mocks.queryConfig.mockReturnValue(new Promise(resolve => (respond = resolve)))
    disableStorages()
    await import('@/main')
    // main.ts 先等站点配置再挂载：确认请求已经发出、返回之前还没有挂载
    await vi.waitFor(() => expect(mocks.queryConfig).toHaveBeenCalled())
    expect(document.querySelector('#cold-start')).toBeNull()
    respond({ data: { defaultLanguage: 'en-US', enabledLanguages: '["zh-CN","en-US"]' } })
    const { app, i18n } = await boot()
    expect(i18n.global.locale.value).toBe('en-US')
    expect(document.documentElement.lang).toBe('en-US')
    expect(app.language).toBe('en-US')
    expect(document.querySelector('#cold-start')?.textContent).toBe(i18n.global.t('common.confirm'))
    // auto：系统为浅色时不加 .dark
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('站点配置取不到时照常挂载，按默认的简体中文', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.queryConfig.mockRejectedValue(new Error('offline'))
    disableStorages()
    const { app, i18n } = await boot()
    expect(i18n.global.locale.value).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(app.language).toBe('zh-CN')
  })

  it('两种存储都被禁用、系统为深色：明暗模式按跟随系统初始化为深色', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
    disableStorages()
    const { app } = await boot()
    expect(app.theme).toBe('auto')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('没有选过语言、偏好里顺带存了英文，站点配置取不到：文案、<html lang> 与 app store 都按默认的简体中文', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    // 上次按后台默认显示英文时改过侧栏或主题，整份偏好（含 language）被保存；appLanguage 从未写过
    realLocal.setItem(
      'appSetting',
      JSON.stringify({ data: { siderCollapsed: true, language: 'en-US' }, expire: null })
    )
    mocks.queryConfig.mockRejectedValue(new Error('offline'))
    const { app, i18n } = await boot()
    expect(i18n.global.locale.value).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(app.language).toBe('zh-CN')
    expect(app.siderCollapsed).toBe(true)
    expect(document.querySelector('#cold-start')?.textContent).toBe(
      i18n.global.t('common.confirm', {}, { locale: 'zh-CN' })
    )
  })

  it.each([
    ['被其他页签改成中文', (data: Map<string, string>) => data.set('appLanguage', 'zh-CN'), false],
    ['变得不可用', () => undefined, true],
  ] as const)(
    'i18n 读到英文之后存储%s、站点配置取不到：app store 与界面一致为英文',
    async (_title, change, unavailable) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      mocks.queryConfig.mockRejectedValue(new Error('offline'))
      // 第一次读语言（i18n 模块初始化）拿到英文，随后存储变化，app store 初始化时读到的已不是英文
      const data = new Map([['appLanguage', 'en-US']])
      let languageReads = 0
      let broken = false
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => {
          if (broken) throw new DOMException('The operation is insecure.', 'SecurityError')
          return {
            getItem: (key: string) => {
              const value = data.get(key) ?? null
              if (key === 'appLanguage' && ++languageReads === 1) {
                change(data)
                broken = unavailable
              }
              return value
            },
            setItem: (key: string, value: string) => data.set(key, value),
            removeItem: (key: string) => data.delete(key),
          }
        },
      })
      const { app, i18n } = await boot()
      expect(i18n.global.locale.value).toBe('en-US')
      expect(document.documentElement.lang).toBe('en-US')
      expect(app.language).toBe('en-US')
    }
  )

  it('存储可用时按保存的原始字符串恢复语言与明暗模式', async () => {
    realLocal.setItem('appLanguage', 'zh-CN')
    realLocal.setItem('theme', 'dark')
    const { app, i18n } = await boot()
    expect(i18n.global.locale.value).toBe('zh-CN')
    expect(app.language).toBe('zh-CN')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
