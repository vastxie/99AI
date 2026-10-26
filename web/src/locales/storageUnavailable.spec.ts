import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 存储被禁用（隐私模式、浏览器或策略禁止站点保存数据）时，取 window.localStorage 即抛 SecurityError。
 * 启动链路上的语言、偏好与明暗模式都不能因此抛错：几乎所有模块都导入语言模块，导入即抛会让整个应用打不开。
 */

const realStorage = window.localStorage

function disableStorage() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    },
  })
}

afterEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => realStorage })
  realStorage.clear()
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('存储被禁用时的启动链路', () => {
  it('导入语言模块不抛错、按默认的简体中文；切换语言照常生效', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    disableStorage()
    vi.resetModules()
    const { default: i18n, setLocale } = await import('@/locales')
    expect(i18n.global.locale.value).toBe('zh-CN')
    await expect(setLocale('en-US')).resolves.toBe(true)
    expect(i18n.global.locale.value).toBe('en-US')
  })

  it('存储可用时按保存的原始字符串恢复界面语言', async () => {
    realStorage.setItem('appLanguage', 'en-US')
    vi.resetModules()
    const { default: i18n } = await import('@/locales')
    expect(i18n.global.locale.value).toBe('en-US')
    // 写回去的仍是原始字符串，不是 JSON 记录
    const { setLocale } = await import('@/locales')
    await setLocale('zh-CN')
    expect(realStorage.getItem('appLanguage')).toBe('zh-CN')
  })

  it('偏好读取回到默认值；有保存的原始字符串时照常读出', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { loadAppState } = await import('@/store/modules/app/preferences')
    realStorage.setItem('appLanguage', 'en-US')
    realStorage.setItem('theme', 'dark')
    expect(loadAppState()).toMatchObject({ language: 'en-US', theme: 'dark' })

    disableStorage()
    expect(loadAppState()).toMatchObject({ language: 'zh-CN', theme: 'auto' })
  })

  it('明暗模式的初始化与切换不抛错，按跟随系统处理', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
    const { applyClientThemeMode, initClientThemeMode } = await import('@/utils/themeMode')
    disableStorage()
    expect(initClientThemeMode()).toEqual({ mode: 'auto', resolvedMode: 'light' })
    expect(() => applyClientThemeMode('dark')).not.toThrow()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
