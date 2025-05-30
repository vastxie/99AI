import { useAppStore } from '@/store'
import { computed } from 'vue'

// 定义本地化配置
const locales = {
  'en-US': {
    locale: 'en-US',
    name: 'English',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: 'h:mm:ss A',
  },
  'zh-CN': {
    locale: 'zh-CN',
    name: '简体中文',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm:ss',
  },
  'zh-TW': {
    locale: 'zh-TW',
    name: '繁體中文',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm:ss',
  },
}

export function useLanguage() {
  const appStore = useAppStore()

  // 计算当前语言配置
  const currentLocale = computed(() => {
    const lang = appStore.language
    return locales[lang] || locales['zh-CN']
  })

  // 监听 appStore.language 的变化，并据此更新 Vue I18n 的语言环境
  // watch(() => appStore.language, (newLocale) => {
  //   setLocale(newLocale);
  // }, { immediate: true });

  return { currentLocale }
}
