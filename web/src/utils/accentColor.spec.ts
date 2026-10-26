import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/store/modules/app'
import { createDefaultAppState, loadAppState, saveAppState } from '@/store/modules/app/preferences'
import {
  computedStyle,
  contrastRatio,
  installStylesheet,
  mountProbe,
  readStyle,
  relativeLuminance,
  resolveColor,
  rootVar,
  withDarkTheme,
} from '@/styles/stylesheet.testkit'
import {
  accentColorOptions,
  accentColors,
  applyAccentColor,
  normalizeAccentColor,
} from './accentColor'

let removeStyles: () => void

beforeAll(() => {
  // 真实 token / 明暗主题 / 气泡样式进 happy-dom，用计算样式读取级联结果
  removeStyles = installStylesheet(
    [
      'src/styles/tokens.css',
      'src/styles/themes/light.css',
      'src/styles/themes/dark.css',
      'src/styles/message.css',
    ]
      .map(readStyle)
      .join('\n')
  )
})

afterAll(() => {
  removeStyles()
})

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('style')
  document.documentElement.classList.remove('dark')
  document.body.innerHTML = ''
  setActivePinia(createPinia())
})

describe('browser-local accent preference', () => {
  it.each(accentColorOptions)('%s 用户气泡在明暗主题均有至少 4.5:1 的正文对比度', color => {
    applyAccentColor(color)
    const bubble = mountProbe('message-user-bubble')
    const textLuminance: number[] = []
    for (const theme of ['light', 'dark'] as const) {
      const check = () => {
        // 气泡底色由当前强调色的 400 档混入应用表面，而不是主题各自维护的第二套色
        const bubbleColor = rootVar('--chat-user-bubble')
        expect(bubbleColor, theme).toContain(`rgb(${accentColors[color].dark.join(' ')})`)
        expect(bubbleColor, theme).toContain(rootVar('--app-surface'))
        const background = resolveColor(bubbleColor)
        const text = resolveColor(rootVar('--chat-user-text'))
        // 气泡正文消费同一个文字 token
        expect(computedStyle(bubble).color, theme).toBe(rootVar('--chat-user-text'))
        expect(contrastRatio(text, background), `${color}-${theme}`).toBeGreaterThanOrEqual(4.5)
        textLuminance.push(relativeLuminance(text))
      }
      if (theme === 'dark') withDarkTheme(check)
      else check()
    }
    // 浅色用深字、深色用浅字，而不是同一档文字硬扛两种底色
    expect(textLuminance[0]).toBeLessThan(textLuminance[1])
  })

  it('all primary button colors and hover states meet 4.5:1 text contrast', () => {
    const luminance = (rgb: readonly number[]) =>
      rgb
        .map(channel => {
          const c = channel / 255
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
    const contrast = (a: readonly number[], b: readonly number[]) => {
      const x = luminance(a),
        y = luminance(b)
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    for (const color of accentColorOptions) {
      applyAccentColor(color)
      for (const [shade, foreground] of [
        [600, [255, 255, 255]],
        [700, [255, 255, 255]],
        [400, [23, 23, 23]],
        [300, [23, 23, 23]],
      ] as const) {
        const rgb = document.documentElement.style
          .getPropertyValue(`--primary-${shade}`)
          .split(' ')
          .map(Number)
        expect(contrast(rgb, foreground), `${color}-${shade}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
  it('tokens.css 里主色阶的首帧取值与默认强调色（蓝）启动后写入的色阶一致：首帧与启动后不换色', () => {
    const staticScale = Object.fromEntries(
      [...readStyle('src/styles/tokens.css').matchAll(/--primary-(\d+):\s*([\d ]+);/g)].map(
        ([, shade, rgb]) => [shade, rgb.trim()]
      )
    )
    applyAccentColor('blue')
    const root = document.documentElement
    expect(Object.keys(staticScale)).toHaveLength(11)
    for (const [shade, rgb] of Object.entries(staticScale)) {
      expect(root.style.getPropertyValue(`--primary-${shade}`), shade).toBe(rgb)
    }
  })

  it.each([undefined, null, 'unknown', '__proto__', 'constructor', 'red; color: black', {}])(
    'falls back to blue for invalid input %s',
    value => {
      expect(normalizeAccentColor(value)).toBe('blue')
    }
  )

  it('keeps a neutral surface and dark mode while applying fixed color channels', () => {
    const root = document.documentElement
    root.classList.add('dark')
    root.style.setProperty('--app-surface', '#202020')
    for (const color of accentColorOptions) {
      expect(applyAccentColor(color)).toBe(color)
      expect(root.dataset.accent).toBe(color)
      expect(root.style.getPropertyValue('--primary-600')).toBe(accentColors[color].light.join(' '))
      expect(root.style.getPropertyValue('--primary-400')).toBe(accentColors[color].dark.join(' '))
      expect(root.classList.contains('dark')).toBe(true)
      expect(root.style.getPropertyValue('--app-surface')).toBe('#202020')
    }
  })

  it('rehydrates the saved accent in a fresh store without an account API', () => {
    expect(loadAppState().accentColor).toBe('blue')
    const store = useAppStore()
    store.setAccentColor('violet')
    expect(loadAppState().accentColor).toBe('violet')
    setActivePinia(createPinia())
    expect(useAppStore().accentColor).toBe('violet')
    saveAppState({ ...createDefaultAppState(), accentColor: 'invalid' as 'blue' })
    expect(loadAppState().accentColor).toBe('blue')
  })
})
