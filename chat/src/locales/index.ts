import type { Language } from '@/store/modules/app/helper'
import type { App } from 'vue'
import { createI18n } from 'vue-i18n'
import enUS from './en-US.json'
import zhCN from './zh-CN.json'
// import zhTW from './zh-TW.json';

// const defaultLocale = savedLocale || appStore.language || 'zh-CN';
// const defaultLocale = 'en-US'
const defaultLocale = 'zh-CN'

const i18n = createI18n({
  legacy: false, // 设置为false启用Composition API模式
  globalInjection: true, // 启用全局注入
  locale: defaultLocale,
  fallbackLocale: 'en-US',
  allowComposition: true,
  messages: {
    'en-US': enUS,
    'zh-CN': zhCN,
    // 'zh-TW': zhTW,
  },
})

// 导出t函数以便在组件外部使用
export function t(key: string) {
  return i18n.global.t(key)
}

export function setLocale(locale: Language) {
  // 由于i18n.global.locale.value只接受特定字符串类型，需要进行类型断言
  i18n.global.locale.value = locale as 'zh-CN' | 'en-US'
  // 将新的语言设置保存到 localStorage
  localStorage.setItem('appLanguage', locale)
}

// 使用加密和指定过期时间（或永久保存）保存语言设置
// export function setLocale(locale: Language) {
//   console.log(`正在切换语言至: ${locale}`);
//   i18n.global.locale = locale;
//   // 使用自定义 localStorage 工具保存语言设置
//   ls.set('appLanguage', locale);
//   console.log(`当前语言已切换至: ${i18n.global.locale}`);
// }

export function setupI18n(app: App) {
  app.use(i18n)
}

export default i18n
