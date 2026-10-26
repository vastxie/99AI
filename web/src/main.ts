import { useAuthStore } from '@/store/modules/auth'
import { useAppStore } from '@/store/modules/app'
import { normalizeLanguage } from '@/store/modules/app/preferences'
import { applyAccentColor } from '@/utils/accentColor'
// 全局样式由 index.css 统一引入并分层；KaTeX 的样式随公式按需加载（utils/markdown/katex）
import '@/styles/index.css'
import { refreshFileAccessCookie } from '@/utils/fileAccessCookie'
import router from '@/utils/router'
import { initClientThemeMode } from '@/utils/themeMode'
import { packRoutes } from '@/packs'
import { createApp } from 'vue'
import App from './App.vue'
import i18n, { installI18n } from './locales'
import { setupImageViewer } from './plugins/imageViewer'
import { installStores } from './store'
import { initializeStores } from './store/initStores'

/**
 * 启动顺序有依赖：store 先于强调色、i18n 与 store 事件监听；扩展包路由要在安装路由前登记；
 * 站点配置加载失败时仍然挂载，用默认配置运行。
 */
async function startClient() {
  const app = createApp(App)

  // 按已有登录态同步文件访问 cookie（媒体标签直链鉴权）
  refreshFileAccessCookie()

  installStores(app)
  applyAccentColor(useAppStore().accentColor)
  installI18n(app)
  setupImageViewer(app)
  initializeStores()
  const auth = useAuthStore()

  for (const route of packRoutes()) router.addRoute(route)
  app.use(router)

  // 应用本地保存的明暗模式（auto 跟随系统）
  initClientThemeMode()

  try {
    await auth.getGlobalConfig(window.location.origin)
  } catch {
    // 站点配置取不到时继续启动：app store 的语言对齐界面（i18n 启动时读到的语言），不写存储。
    // 两者各自读过一次存储，中间可能被其他页签改过
    useAppStore().setLanguage(normalizeLanguage(i18n.global.locale.value), { persist: false })
  }

  app.mount('#app')
}

void startClient()
