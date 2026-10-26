<script setup lang="ts">
// 默认 favicon 只有几 KB，会被内联进入口脚本；强制单独输出文件，不占首屏体积
import favicon from '@/assets/favicon.ico?no-inline'

import GlobalImageViewer from '@/components/common/ImageViewer/GlobalImageViewer.vue'
import Watermark from '@/components/common/Watermark/index.vue'
// 导入微信登录相关功能
import { runAppReadyHooks } from '@/packs'
import { socketService } from '@/services/socket-io'
import { ensureVisitorToken } from '@/services/visitorSession'
import { useAuthStore } from '@/store/modules/auth'
import { useModelCatalogStore } from '@/store/modules/modelCatalog'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { t } from '@/locales'
import { message } from '@/utils/message'
import { computed, defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue'

// 用户协议弹窗（MarkdownDialog）含 Markdown 渲染链（markdown-it + DOMPurify），异步组件化移出入口 chunk；
// 仅经 :visible prop 控制、无模板 ref 依赖。
// chunk 拉取失败（弱网 / 资源缺失）时给用户可见提示，弹窗保持未打开状态不阻塞应用
const MarkdownDialog = defineAsyncComponent(() =>
  import('@/components/common/MarkdownDialog.vue').catch((error: unknown) => {
    message()?.error(t('common.genericErrorRetry'))
    throw error
  })
)

const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const modelCatalogStore = useModelCatalogStore()

// 打开用户协议时刷新全局配置，保证协议标题 / 正文为最新
watch(
  () => useGlobalStore.userAgreementDialog,
  visible => {
    if (visible) {
      authStore.getGlobalConfig().catch(() => {
        // Handle error silently
      })
    }
  }
)

// 获取配置
const faviconPath = computed(() => authStore.globalConfig?.clientFaviconPath || favicon)
const showWatermark = computed(() => Number(authStore.globalConfig?.showWatermark) === 1)

function setDocumentTitle() {
  document.title = authStore.globalConfig?.siteTitle || authStore.globalConfig?.siteName || 'AI'
}

function setDocumentMeta() {
  const description = authStore.globalConfig?.siteDescription
  const keywords = authStore.globalConfig?.siteKeywords

  if (description) {
    let metaDescription = document.querySelector('meta[name="description"]')
    if (!metaDescription) {
      metaDescription = document.createElement('meta')
      metaDescription.setAttribute('name', 'description')
      document.head.appendChild(metaDescription)
    }
    metaDescription.setAttribute('content', description)
  }

  if (keywords) {
    let metaKeywords = document.querySelector('meta[name="keywords"]')
    if (!metaKeywords) {
      metaKeywords = document.createElement('meta')
      metaKeywords.setAttribute('name', 'keywords')
      document.head.appendChild(metaKeywords)
    }
    metaKeywords.setAttribute('content', keywords)
  }
}

// 添加全屏快捷键支持 (F11 或 Ctrl/Cmd + Shift + F)
const handleKeyPress = (event: KeyboardEvent) => {
  // F11 键
  if (event.key === 'F11') {
    event.preventDefault()
    toggleFullscreen()
    return
  }

  // Ctrl/Cmd + Shift + F 组合键
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    toggleFullscreen()
  }
}

// 切换全屏状态
const toggleFullscreen = () => {
  if (document.fullscreenElement) {
    // 退出全屏
    if (document.exitFullscreen) {
      document.exitFullscreen()
    }
  } else {
    // 进入全屏
    document.documentElement.requestFullscreen().catch(err => {})
  }
}

onMounted(async () => {
  // 设置网站标题
  setDocumentTitle()

  // 设置网站 SEO meta 信息
  setDocumentMeta()

  /* 动态设置网站ico svg格式 */
  const link = document.createElement('link')
  link.rel = 'shortcut icon'
  link.href = faviconPath.value
  // 设置正确的图像类型
  link.type = 'image/png'

  // 移除已存在的favicon链接，防止冲突
  const existingFavicons = document.querySelectorAll('link[rel="shortcut icon"], link[rel="icon"]')
  existingFavicons.forEach(node => node.parentNode?.removeChild(node))

  // 添加新的favicon链接
  document.head.appendChild(link)

  // 监听键盘事件
  window.addEventListener('keydown', handleKeyPress)

  // 检查当前路由是否是 OAuth 回调页面
  const currentPath = window.location.pathname
  const isOAuthCallbackRoute = currentPath.includes('/auth/callback/')

  // 启动数据取不到（服务器连不上）时照样往下：实时连接照样开始，连不上由连接状态提示
  try {
    if (!authStore.token && !isOAuthCallbackRoute) {
      await ensureVisitorToken()
    }

    // 扩展包的启动钩子（如某登录渠道的静默登录、支付回跳页接管）：可能换掉登录态，连接要等它
    await runAppReadyHooks({ isOAuthCallbackRoute })
  } catch {
    // 各自的请求层已经提示过
  }

  // 身份就绪就开始实时连接；模型列表（整个应用都要用）同时去取，两者不互相等
  socketService.connect()
  await Promise.all([
    modelCatalogStore.queryModels(),
    modelCatalogStore.getBaseModelConfig(),
  ]).catch(() => undefined)
})

// 组件卸载时移除监听器
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyPress)
  socketService.destroy()
})
</script>

<template>
  <!-- 水印组件（如果启用） -->
  <Watermark v-if="showWatermark"></Watermark>

  <!-- 主要内容使用router-view -->
  <router-view />

  <!-- 共享内容对话框 -->

  <!-- 全局图片预览器 -->
  <GlobalImageViewer />

  <!-- 用户协议弹窗 -->
  <MarkdownDialog
    :visible="useGlobalStore.userAgreementDialog"
    :title="authStore.globalConfig?.agreementTitle || t('common.userAgreement')"
    :content="authStore.globalConfig?.agreementInfo || ''"
    :confirm-text="t('common.close')"
    @update:visible="useGlobalStore.updateUserAgreementDialog($event)"
  />
</template>
