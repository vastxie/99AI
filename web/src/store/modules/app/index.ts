import { defineStore } from 'pinia'
import { applyAccentColor, type AccentColor } from '@/utils/accentColor'
import { applyClientThemeMode } from '@/utils/themeMode'
import {
  detectEnvironment,
  loadAppState,
  saveAppState,
  type AppState,
  type Language,
  type Theme,
} from './preferences'

export const useAppStore = defineStore('app', {
  state: (): AppState => loadAppState(),
  actions: {
    /** 把当前偏好写回本地；修改偏好的 action 都以它收尾 */
    persist() {
      saveAppState(this.$state)
    },

    setAccentColor(color: AccentColor) {
      this.accentColor = applyAccentColor(color)
      this.persist()
    },

    setSiderCollapsed(collapsed: boolean) {
      this.siderCollapsed = collapsed
      this.persist()
    },

    setTheme(theme: Theme) {
      applyClientThemeMode(theme)
      this.theme = theme
      this.persist()
    },

    /** persist 为 false 时只改本页状态、不写本地偏好（读取站点配置时同步语言用，不改写共享的偏好） */
    setLanguage(language: Language, options: { persist?: boolean } = {}) {
      if (this.language === language) return
      this.language = language
      if (options.persist !== false) this.persist()
    },

    setEnv() {
      this.env = detectEnvironment()
    },
  },
})
