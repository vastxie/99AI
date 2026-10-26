import { readonly, ref } from 'vue'
import { rawStore } from '@/utils/storage'

/**
 * 明暗模式负责表面灰阶与语义 token；独立的 accentColor 工具应用浏览器本地强调色。
 * 这里只解析本地模式、切换 <html class="dark"> 并跟随系统变化；
 * 实际生效的明暗结果通过 resolvedClientThemeMode 暴露给需要区分明暗的组件。
 */
export type ClientThemeMode = 'light' | 'dark' | 'auto'
export type ResolvedClientThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'theme'
let systemThemeCleanup: (() => void) | null = null
const resolvedMode = ref<ResolvedClientThemeMode>('light')

/** 当前实际生效的明暗模式（auto 已按系统解析）。 */
export const resolvedClientThemeMode = readonly(resolvedMode)

export function normalizeClientThemeMode(mode?: string | null): ClientThemeMode {
  return mode === 'light' || mode === 'dark' ? mode : 'auto'
}

export function getResolvedClientThemeMode(mode?: string | null): ResolvedClientThemeMode {
  const normalized = normalizeClientThemeMode(mode)
  if (normalized !== 'auto') return normalized
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function writeMode(mode: ResolvedClientThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  resolvedMode.value = mode
  // 浏览器地址栏、手机状态栏的底色跟随页面画布
  const canvas = getComputedStyle(document.documentElement).getPropertyValue('--app-canvas').trim()
  if (canvas) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', canvas)
}

export function applyClientThemeMode(mode?: string | null, options: { persist?: boolean } = {}) {
  if (typeof document === 'undefined') {
    return { mode: normalizeClientThemeMode(mode), resolvedMode: 'light' as const }
  }
  const normalizedMode = normalizeClientThemeMode(mode)
  const resolved = getResolvedClientThemeMode(normalizedMode)
  // 持久化尽力而为：存储不可用时只影响下次打开
  if (options.persist !== false) rawStore.set(THEME_STORAGE_KEY, normalizedMode)
  writeMode(resolved)

  if (systemThemeCleanup) {
    systemThemeCleanup()
    systemThemeCleanup = null
  }
  if (normalizedMode === 'auto' && typeof window !== 'undefined' && window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => writeMode(getResolvedClientThemeMode('auto'))
    media.addEventListener?.('change', handleChange)
    systemThemeCleanup = () => media.removeEventListener?.('change', handleChange)
  }
  return { mode: normalizedMode, resolvedMode: resolved }
}

export function initClientThemeMode() {
  return applyClientThemeMode(rawStore.get(THEME_STORAGE_KEY), { persist: false })
}
