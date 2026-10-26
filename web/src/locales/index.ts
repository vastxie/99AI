import type { App } from 'vue'
import { createI18n } from 'vue-i18n'
import { packLocaleEntries } from '@/packs'
import { LANGUAGE_KEY, normalizeLanguage, type Language } from '@/store/modules/app/preferences'
import { rawStore } from '@/utils/storage'
import enUS from './en-US.json'
import zhCN from './zh-CN.json'

// 内置简体中文（默认）与 English（兜底）两套语言包；启动时按上次选择的语言显示
const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  allowComposition: true,
  // 存储被禁用时读为空（按默认语言），不能在导入时抛错：几乎所有模块都导入本模块
  locale: normalizeLanguage(rawStore.get(LANGUAGE_KEY)),
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

/** 组件之外使用的翻译函数 */
export function t(key: string, params?: Record<string, any>) {
  return params ? i18n.global.t(key, params) : i18n.global.t(key)
}

/**
 * 带数量的翻译：按 count 选择单复数形式（文案用「单数 | 复数」写法，中文只写一种），
 * count 同时作为 {count} 插值，其余插值放在 params
 */
export function tp(key: string, count: number, params?: Record<string, any>) {
  return i18n.global.t(key, { count, ...params }, count)
}

/*
 * 数字与日期按界面语言书写，不按浏览器语言（界面是英文、浏览器是中文时不出现中文日期）
 */
export function formatNumber(value: number): string {
  return value.toLocaleString(i18n.global.locale.value)
}

export function formatDate(value: Date): string {
  return value.toLocaleDateString(i18n.global.locale.value)
}

/** 年月（签到日历的月份标题）：中文「2026年9月」、英文「September 2026」 */
export function formatYearMonth(value: Date): string {
  return value.toLocaleDateString(i18n.global.locale.value, { year: 'numeric', month: 'long' })
}

export function formatDateTime(value: Date): string {
  return value.toLocaleString(i18n.global.locale.value)
}

/** 页面语言跟随界面语言：读屏按它选择发音，浏览器按它断词与翻译提示 */
function syncDocumentLanguage(language: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

/** 本页经 setLocale 选定的语言：存储不可用时，再次读取站点配置靠它保留本页的选择 */
let chosenLanguage: Language | null = null

/** 本页选定的语言；没有调用过 setLocale 时为 null */
export function currentLocaleChoice(): Language | null {
  return chosenLanguage
}

/** 切换界面语言并记住这次选择；未知取值归一为默认语言。保留异步签名，调用方可以 await */
export async function setLocale(
  language: Language,
  options: { persist?: boolean } = {}
): Promise<boolean> {
  const next = normalizeLanguage(language)
  i18n.global.locale.value = next
  chosenLanguage = next
  // 默认写存储（用户切换语言）；写不进只影响下次打开时的默认语言，本次照常切换
  if (options.persist !== false) rawStore.set(LANGUAGE_KEY, next)
  syncDocumentLanguage(next)
  return true
}

/**
 * 安装 i18n，并把各扩展包的语言片段合并进内置语言包（键路径由包自行约定）。
 * 合并放在安装时而不是模块顶层：包模块也会导入本模块，放在顶层会形成初始化环。
 */
export function installI18n(app: App) {
  for (const [locale, messages] of packLocaleEntries()) {
    i18n.global.mergeLocaleMessage(locale as any, messages as any)
  }
  syncDocumentLanguage(i18n.global.locale.value)
  app.use(i18n)
}

export default i18n
