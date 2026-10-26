import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyClientThemeMode, initClientThemeMode } from './themeMode'

function mockSystemDark(dark: boolean) {
  window.matchMedia = vi.fn(() => ({
    matches: dark,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function setThemeColorMeta() {
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff" />'
  return document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
})

afterEach(() => {
  document.head.innerHTML = ''
})

describe('明暗模式', () => {
  it('切换时地址栏 / 状态栏底色（theme-color）跟随页面画布', () => {
    const meta = setThemeColorMeta()
    mockSystemDark(false)
    document.documentElement.style.setProperty('--app-canvas', '#151517')
    applyClientThemeMode('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(meta.getAttribute('content')).toBe('#151517')
  })

  it('index.html 的首帧脚本与这里的规则一致：本地选了暗色、或跟随系统且系统是暗色，首帧就加上 .dark', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    expect(script).toBeTruthy()
    const run = () => new Function(script!)()
    // 首帧脚本写死的暗色画布色要与主题里的 --app-canvas 一致
    const darkTheme = readFileSync(resolve(process.cwd(), 'src/styles/themes/dark.css'), 'utf8')
    expect(script).toContain(darkTheme.match(/--app-canvas:\s*(#[0-9a-f]+);/i)?.[1])

    for (const [stored, systemDark, expected] of [
      ['dark', false, true],
      ['light', true, false],
      ['auto', true, true],
      [null, false, false],
    ] as const) {
      document.documentElement.className = ''
      const meta = setThemeColorMeta()
      localStorage.clear()
      if (stored) localStorage.setItem('theme', stored)
      mockSystemDark(systemDark)
      run()
      expect(document.documentElement.classList.contains('dark')).toBe(expected)
      expect(meta.getAttribute('content')).toBe(expected ? '#151517' : '#ffffff')
    }

    // 读本地存储抛错（隐私模式禁用存储）：按跟随系统处理，与 initClientThemeMode 一致
    document.documentElement.className = ''
    setThemeColorMeta()
    mockSystemDark(true)
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    run()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(initClientThemeMode().resolvedMode).toBe('dark')
    getItem.mockRestore()
  })
})
