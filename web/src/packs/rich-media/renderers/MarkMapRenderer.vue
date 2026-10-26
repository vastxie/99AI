<script setup lang="ts">
import UiSpinner from '@/components/common/UiSpinner.vue'
import { t } from '@/locales'
import { downloadText, downloadUrl } from '@/utils/download'
import { message } from '@/utils/message'
import * as htmlToImage from 'html-to-image'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import '../markmap-theme.css'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// 导入 FreeMind 生成器
import { FreeMindGenerator } from '../freeMindGenerator'

// markmap 节点净化：唯一实现在 Message/MindMap/index.vue 的普通 <script> 块里导出，
// 这里直接复用。历史上两处各留一份逐字复制的白名单，放宽时漏改一处就会出现
// 「消息卡片正常、右侧预览面板丢内容」（或反过来），且不会被类型检查和单测发现。
import { sanitizeMarkmapTree } from '../MindMap/index.vue'

const props = defineProps<{
  content: string
}>()

const ms = message()
const svgContainer = ref<SVGElement | null>(null)
const isRendering = ref(false)
const renderError = ref('')
const transformer = new Transformer()

// 存储当前markmap实例
let markmapInstance: Markmap | undefined

// 渲染思维导图
const renderMarkmap = async () => {
  if (!svgContainer.value || !props.content) return

  isRendering.value = true
  renderError.value = ''

  try {
    // 销毁旧的实例
    destroyOldInstance()

    // 彻底清空SVG
    cleanupSvg()

    // 变换 Markdown 为思维导图数据
    const { root } = transformer.transform(props.content)

    // 净化节点内容后再渲染，避免模型输出的 HTML 直接进 innerHTML
    const safeRoot = sanitizeMarkmapTree(root)

    // 创建新实例并渲染
    markmapInstance = Markmap.create(svgContainer.value)
    markmapInstance.setData(safeRoot)
    markmapInstance.fit()

    // 添加延迟确保 DOM 完全更新
    await new Promise(resolve => {
      setTimeout(resolve, 200)
    })

    // 执行重置视图确保完整内容可见
    await resetMarkmapView()
  } catch (error) {
    displayError(error instanceof Error ? error.message : String(error))
  } finally {
    isRendering.value = false
  }
}

// 销毁旧的markmap实例
const destroyOldInstance = () => {
  if (!markmapInstance) return

  try {
    const instance = markmapInstance
    const destroy = Reflect.get(instance, 'destroy')
    if (typeof destroy === 'function') {
      destroy.call(instance)
    } else {
      // 清除所有引用
      Object.keys(instance).forEach(key => {
        Reflect.set(instance, key, null)
      })
    }
    markmapInstance = undefined
  } catch (e) {}
}

// 彻底清空SVG元素
const cleanupSvg = () => {
  if (!svgContainer.value) return

  // 移除所有子元素
  while (svgContainer.value.firstChild) {
    svgContainer.value.removeChild(svgContainer.value.firstChild)
  }

  // 重置class和移除style
  svgContainer.value.setAttribute('class', 'w-full h-full markmap-svg')
  svgContainer.value.removeAttribute('style')

  // 移除其他属性，但保留基本属性
  const attributeNames = []
  for (let i = 0; i < svgContainer.value.attributes.length; i++) {
    const attr = svgContainer.value.attributes[i]
    if (attr.name !== 'class' && attr.name !== 'ref') {
      attributeNames.push(attr.name)
    }
  }

  // 移除收集到的属性
  attributeNames.forEach(name => {
    svgContainer.value?.removeAttribute(name)
  })
}

// 显示错误信息
const displayError = (errorMessage: string) => {
  renderError.value = errorMessage
  isRendering.value = false
}

// 重置markmap视图以确保完整内容可见
const resetMarkmapView = async () => {
  if (!markmapInstance) return

  try {
    // 重置缩放和平移，确保完整内容可见
    markmapInstance.fit()

    // 给一点时间让动画完成
    await new Promise(resolve => {
      setTimeout(resolve, 300)
    })
  } catch (error) {}
}

// 等待渲染完成
const waitForRenderComplete = async (maxWaitTime = 2000) => {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    const svgElement = svgContainer.value as SVGSVGElement
    if (!svgElement || svgElement.children.length === 0) {
      await new Promise(resolve => {
        setTimeout(resolve, 100)
      })
      continue
    }

    try {
      const bbox = svgElement.getBBox()
      if (isFinite(bbox.width) && isFinite(bbox.height) && bbox.width > 0 && bbox.height > 0) {
        return true
      }
    } catch (error) {}

    await new Promise(resolve => {
      setTimeout(resolve, 100)
    })
  }

  return false
}

// 优化后的PNG导出 - 使用html-to-image
const exportAsPng = async () => {
  document.dispatchEvent(new CustomEvent('markmap-export-start', { detail: { type: 'PNG' } }))

  try {
    ms.info(t('previewer.exportingPng'))

    if (!markmapInstance || !svgContainer.value) {
      ms.error(t('previewer.mindMapNotInitialized'))
      return
    }

    // 重置视图确保完整内容可见
    await resetMarkmapView()

    // 等待渲染完成
    await waitForRenderComplete()

    // 使用html-to-image直接导出PNG，通过类型断言处理SVG
    // 背景取当前主题的表面色：节点文字跟随主题，深色主题下是浅色文字，白底会看不见
    const surface = getComputedStyle(svgContainer.value).getPropertyValue('--app-surface').trim()
    const dataUrl = await htmlToImage.toPng(svgContainer.value as unknown as HTMLElement, {
      quality: 1.0,
      pixelRatio: 2,
      backgroundColor: surface || '#ffffff',
      style: {
        transform: 'none',
      },
      // 添加一些边距
      width: svgContainer.value.clientWidth + 40,
      height: svgContainer.value.clientHeight + 40,
    })

    downloadUrl(dataUrl, 'markmap-mindmap.png')

    ms.success(t('previewer.pngDownloadStarted'))
  } catch (error) {
    ms.error(
      t('previewer.pngExportFailedWithReason', {
        reason: error instanceof Error ? error.message : String(error),
      })
    )
  } finally {
    document.dispatchEvent(new CustomEvent('markmap-export-end'))
  }
}

// 优化后的SVG导出 - 直接使用XMLSerializer
const exportAsSvg = async () => {
  document.dispatchEvent(new CustomEvent('markmap-export-start', { detail: { type: 'SVG' } }))

  try {
    ms.info(t('previewer.exportingSvg'))

    if (!markmapInstance || !svgContainer.value) {
      ms.error(t('previewer.mindMapNotInitialized'))
      return
    }

    // 重置视图确保完整内容可见
    await resetMarkmapView()

    // 等待渲染完成
    await waitForRenderComplete()

    const svgElement = svgContainer.value as SVGSVGElement

    // 克隆SVG元素
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement

    // 获取边界框并设置完整的viewBox
    try {
      const bbox = svgElement.getBBox()
      const padding = 20
      const fullWidth = bbox.width + padding * 2
      const fullHeight = bbox.height + padding * 2

      svgClone.setAttribute(
        'viewBox',
        `${bbox.x - padding} ${bbox.y - padding} ${fullWidth} ${fullHeight}`
      )
      svgClone.setAttribute('width', fullWidth.toString())
      svgClone.setAttribute('height', fullHeight.toString())
    } catch (error) {}

    // 添加必要的样式
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `
      svg { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        background-color: white;
      }
      text { font-weight: 400; }
    `
    svgClone.insertBefore(style, svgClone.firstChild)

    // 序列化SVG
    const serializer = new XMLSerializer()
    let svgString = serializer.serializeToString(svgClone)

    // 添加XML声明
    svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + svgString

    downloadText(svgString, 'markmap-mindmap.svg', 'image/svg+xml;charset=utf-8')

    ms.success(t('previewer.svgDownloadStarted'))
  } catch (error) {
    ms.error(
      t('previewer.svgExportFailedWithReason', {
        reason: error instanceof Error ? error.message : String(error),
      })
    )
  } finally {
    document.dispatchEvent(new CustomEvent('markmap-export-end'))
  }
}

// FreeMind 格式导出功能
const exportAsFreeMind = async () => {
  document.dispatchEvent(new CustomEvent('markmap-export-start', { detail: { type: 'FreeMind' } }))

  try {
    ms.info(t('previewer.savingFreeMind'))

    if (!props.content) {
      ms.error(t('previewer.mindMapEmpty'))
      return
    }

    // 使用 FreeMindGenerator 从 Markdown 生成思维导图
    const rootNode = FreeMindGenerator.generateFromMarkdown(props.content)

    // 使用 FreeMindGenerator 导出
    const freeMindGenerator = new FreeMindGenerator()
    await freeMindGenerator.exportToFreeMind(rootNode, rootNode.title)

    ms.success(t('previewer.freeMindDownloadStarted'))
  } catch (error) {
    ms.error(t('previewer.exportFailedRetry'))
  } finally {
    document.dispatchEvent(new CustomEvent('markmap-export-end'))
  }
}

// 来自父组件的导出事件处理函数
const handleExportPngFromParent = () => {
  exportAsPng()
}

const handleExportSvgFromParent = () => {
  exportAsSvg()
}

const handleExportFreeMindFromParent = () => {
  exportAsFreeMind()
}

// 组件挂载后初始化
onMounted(() => {
  renderMarkmap()

  // 监听来自父组件的导出事件
  document.addEventListener('markmap-export-png', handleExportPngFromParent)
  document.addEventListener('markmap-export-svg', handleExportSvgFromParent)
  document.addEventListener('markmap-export-freemind', handleExportFreeMindFromParent)
})

// 组件销毁前清理
onBeforeUnmount(() => {
  destroyOldInstance()

  // 清理来自父组件的导出事件监听
  document.removeEventListener('markmap-export-png', handleExportPngFromParent)
  document.removeEventListener('markmap-export-svg', handleExportSvgFromParent)
  document.removeEventListener('markmap-export-freemind', handleExportFreeMindFromParent)
})

// 监听内容变化
watch(
  () => props.content,
  () => {
    renderMarkmap()
  }
)
</script>

<template>
  <div class="h-full w-full flex items-center justify-center bg-panel-subtle">
    <div class="relative w-full h-full overflow-auto custom-scrollbar">
      <!-- 加载动画 -->
      <!-- 渲染中与失败的遮罩只在渲染器自己的范围里压住图表（z-1 / z-2）：在对话代码块里预览时，
           吸顶的代码块标题栏（z-content）与它的提示气泡盖在遮罩上面 -->
      <div
        v-if="isRendering"
        class="absolute top-10 left-1/2 transform -translate-x-1/2 z-2 flex items-center justify-center"
      >
        <UiSpinner size="lg" tone="link" />
      </div>

      <!-- Markmap SVG容器 -->
      <svg ref="svgContainer" class="w-full h-full markmap-svg"></svg>

      <div
        v-if="renderError"
        class="absolute inset-4 z-1 p-4 text-semantic-danger rounded-lg overflow-auto"
        style="background: color-mix(in srgb, var(--semantic-danger) 10%, transparent)"
      >
        <h3 class="font-bold mb-2">{{ t('previewer.mindMapRenderError') }}</h3>
        <p class="mb-2 whitespace-pre-wrap break-words">{{ renderError }}</p>
      </div>
    </div>
  </div>
</template>
