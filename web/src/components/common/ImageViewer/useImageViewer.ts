import { App, ref } from 'vue'
import ImageViewer from './index.vue'

// 全局状态
const isVisible = ref(false)
const currentImageUrl = ref('')
const currentFileName = ref('image')

// 图片预览器实例
export interface ImageViewerOptions {
  imageUrl: string
  fileName?: string
}

// 打开图片预览器
export function openImageViewer(options: ImageViewerOptions) {
  currentImageUrl.value = options.imageUrl
  currentFileName.value = options.fileName || 'image'
  isVisible.value = true
}

// 关闭图片预览器
export function closeImageViewer() {
  isVisible.value = false
  currentImageUrl.value = ''
  currentFileName.value = 'image'
}

// 图片预览器状态
export function useImageViewer() {
  return {
    isVisible,
    currentImageUrl,
    currentFileName,
    openImageViewer,
    closeImageViewer,
  }
}

// 全局安装插件
export default {
  install(app: App) {
    // 注册全局组件
    app.component('ImageViewer', ImageViewer)

    // 注册全局方法
    app.config.globalProperties.$imageViewer = {
      open: openImageViewer,
      close: closeImageViewer,
    }

    // 提供全局状态
    app.provide('imageViewer', useImageViewer())
  },
}
