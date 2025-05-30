import { useTheme } from '@/hooks/useTheme'
import { useAuthStoreWithout } from '@/store/modules/auth'
import '@/styles/github-markdown.less'
import '@/styles/global.less'
// import '@/styles/highlight.less' // 移除旧的highlight样式
import '@/styles/index.css'
import { print99aiInfo, printAppInfo } from '@/utils/logger'
import { message } from '@/utils/message'
import router from '@/utils/router'
import 'katex/dist/katex.min.css'
import { createApp } from 'vue'
import App from './App.vue'
import { setupI18n } from './locales'
import { setupImageViewer } from './plugins/imageViewer'
import { setupStore } from './store'

// 禁用生产环境中的 console.log
if (process.env.NODE_ENV === 'production') {
  console.log = () => {}
  console.warn = () => {}
  console.error = () => {}
}

// 检测系统主题并设置应用主题
function detectSystemTheme() {
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)')
  const storedTheme = localStorage.getItem('theme')
  const theme = storedTheme || (prefersDarkScheme.matches ? 'dark' : 'light')
  localStorage.setItem('theme', theme)
  document.documentElement.classList.toggle('dark', theme === 'dark')

  // 设置 data-theme 方式的主题系统
  document.documentElement.dataset.theme = theme
}

const authStore = useAuthStoreWithout()

async function bootstrap() {
  const app = createApp(App)

  // 设置样式和资源
  setupStore(app)
  setupI18n(app)
  setupImageViewer(app)

  // 安装Vue Router
  app.use(router)

  // 检测系统主题并设置应用主题
  detectSystemTheme()

  // 初始化主题
  const { init } = useTheme()
  init()

  // 初始化消息组件
  const msgInstance = message()

  // 在开发环境下打印控制台信息
  print99aiInfo()
  printAppInfo('99AI', '5.0.1')

  const domain = `${window.location.protocol}//${window.location.hostname}${
    window.location.port ? `:${window.location.port}` : ''
  }`
  await authStore.getGlobalConfig(domain)

  // 延迟加载插件
  const VueViewer = (await import('v-viewer')).default
  app.use(VueViewer)
  const { MotionPlugin } = await import('@vueuse/motion')
  app.use(MotionPlugin)

  // 在卸载应用前清理资源
  app.config.globalProperties.$onAppUnmount = () => {
    if (msgInstance && typeof msgInstance.destroy === 'function') {
      msgInstance.destroy()
    }
  }

  app.mount('#app')
}

bootstrap()
