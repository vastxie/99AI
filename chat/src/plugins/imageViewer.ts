import GlobalImageViewer from '@/components/common/ImageViewer/GlobalImageViewer.vue'
import ImageViewerPlugin from '@/components/common/ImageViewer/useImageViewer'
import { App } from 'vue'

export function setupImageViewer(app: App) {
  // 安装图片预览器插件
  app.use(ImageViewerPlugin)

  // 注册全局图片预览器组件
  app.component('GlobalImageViewer', GlobalImageViewer)
}
