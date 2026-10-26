import { localStore, rawStore } from '@/utils/storage'
import { normalizeAccentColor, type AccentColor } from '@/utils/accentColor'

/** 界面偏好在 localStorage 里的键；键名沿用既有值，已保存的偏好继续生效 */
const PREFERENCES_KEY = 'appSetting'
/** 语言切换与明暗模式各自另存一份，读取偏好时以它们为准 */
export const LANGUAGE_KEY = 'appLanguage'
const THEME_KEY = 'theme'

export type Theme = 'light' | 'dark' | 'auto'
export type Language = 'zh-CN' | 'en-US'
export type Env = 'web' | 'mobile'

export interface AppState {
  siderCollapsed: boolean
  theme: Theme
  accentColor: AccentColor
  language: Language
  env: Env
}

const BUILTIN_LANGUAGES: readonly Language[] = ['zh-CN', 'en-US']
const LANGUAGE_ALIASES: Readonly<Record<string, Language>> = {
  zh: 'zh-CN',
  cn: 'zh-CN',
  'zh-cn': 'zh-CN',
  en: 'en-US',
  'en-us': 'en-US',
}
const MOBILE_AGENT = /(Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone)/iu

/** 把任意输入归一为内置语言，无法识别时回到简体中文 */
export function normalizeLanguage(input: unknown): Language {
  if (typeof input !== 'string') return 'zh-CN'
  const value = input.trim()
  if ((BUILTIN_LANGUAGES as readonly string[]).includes(value)) return value as Language
  const alias = value.replace('_', '-').toLowerCase()
  // 只认别名表自己的键：constructor、__proto__ 这类原型链上的名字不能当成语言
  return Object.hasOwn(LANGUAGE_ALIASES, alias) ? LANGUAGE_ALIASES[alias] : 'zh-CN'
}

/** 后台以 JSON 字符串保存启用的语言；解析并归一为内置语言，为空或无效时视为全部启用 */
export function parseEnabledLanguages(raw: unknown): Language[] {
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = []
    }
  }
  const enabled = Array.isArray(parsed) ? [...new Set(parsed.map(normalizeLanguage))] : []
  return enabled.length > 0 ? enabled : [...BUILTIN_LANGUAGES]
}

export function detectEnvironment(): Env {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return MOBILE_AGENT.test(agent) ? 'mobile' : 'web'
}

export function createDefaultAppState(): AppState {
  return {
    siderCollapsed: false,
    theme: 'auto',
    accentColor: 'blue',
    language: 'zh-CN',
    env: detectEnvironment(),
  }
}

/** 默认值 ← 保存的偏好 ← 单独保存的语言与明暗模式；环境与强调色取值无效时回到默认 */
export function loadAppState(): AppState {
  const state: AppState = {
    ...createDefaultAppState(),
    ...localStore.get<Partial<AppState>>(PREFERENCES_KEY),
  }
  // 语言只认单独保存的那份（没有时为默认语言），与 i18n 的初始语言同源：偏好里顺带存的 language 不代表用户的选择
  state.language = normalizeLanguage(rawStore.get(LANGUAGE_KEY))
  const theme = rawStore.get(THEME_KEY)
  if (theme === 'light' || theme === 'dark' || theme === 'auto') state.theme = theme
  if (state.env !== 'web' && state.env !== 'mobile') state.env = detectEnvironment()
  state.accentColor = normalizeAccentColor(state.accentColor)
  return state
}

export function saveAppState(state: AppState) {
  localStore.set(PREFERENCES_KEY, state)
}
