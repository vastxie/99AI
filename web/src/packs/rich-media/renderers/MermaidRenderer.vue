<script setup lang="ts">
import { loadKatex } from '@/utils/markdown/katex'
import UiSpinner from '@/components/common/UiSpinner.vue'
import { t } from '@/locales'
import { resolvedClientThemeMode } from '@/utils/themeMode'
import { downloadText, downloadUrl } from '@/utils/download'
import { message } from '@/utils/message'

import mermaid from 'mermaid'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  content: string
}>()

const mermaidContainer = ref<HTMLDivElement | null>(null)
const containerWrapper = ref<HTMLDivElement | null>(null)
const isRendering = ref(false)
const hasError = ref(false)
const lastErrorMessage = ref('')

const isDarkMode = computed(() => resolvedClientThemeMode.value === 'dark')

// 导出相关状态
const isExporting = ref(false)
const exportType = ref('')
const showExportMenu = ref(false)

const ms = message()

// 缩放相关状态
const scale = ref(1)
const minScale = 0.1
const maxScale = 5

// 拖动相关状态
const isDragging = ref(false)
const dragStartPos = ref({ x: 0, y: 0 })
const translatePos = ref({ x: 0, y: 0 })

// 触摸相关状态
const touches = ref<Touch[]>([])
const lastTouchDistance = ref(0)
const initialTouchDistance = ref(0)
const initialScale = ref(1)
const lastTouchTime = ref(0)

// 获取完整的SVG信息
const getFullSvgInfo = () => {
  const svgElement = mermaidContainer.value?.querySelector('svg') as SVGSVGElement
  if (!svgElement) return null

  // 获取SVG的真实边界框
  const bbox = svgElement.getBBox()

  // 获取viewBox属性，如果存在的话
  const viewBox = svgElement.viewBox.baseVal

  // 计算实际的内容尺寸
  const actualWidth = Math.max(bbox.width, viewBox.width || 0)
  const actualHeight = Math.max(bbox.height, viewBox.height || 0)
  const actualX = Math.min(bbox.x, viewBox.x || 0)
  const actualY = Math.min(bbox.y, viewBox.y || 0)

  return {
    svgElement,
    bbox,
    viewBox,
    actualWidth,
    actualHeight,
    actualX,
    actualY,
  }
}

// 导出为SVG
const exportAsSvg = () => {
  if (isExporting.value) return

  isExporting.value = true
  exportType.value = 'SVG'

  try {
    const svgInfo = getFullSvgInfo()
    if (!svgInfo) {
      ms.error(t('previewer.mermaidChartUnavailable'))
      return
    }

    const { svgElement, actualWidth, actualHeight, actualX, actualY } = svgInfo

    // 克隆SVG以便操作
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement

    // 添加边距
    const padding = 20
    const fullWidth = actualWidth + padding * 2
    const fullHeight = actualHeight + padding * 2

    // 设置完整的viewBox，确保显示所有内容
    svgClone.setAttribute(
      'viewBox',
      `${actualX - padding} ${actualY - padding} ${fullWidth} ${fullHeight}`
    )
    svgClone.setAttribute('width', fullWidth.toString())
    svgClone.setAttribute('height', fullHeight.toString())

    // 添加样式确保字体渲染
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `
      svg { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      }
      text { font-weight: 400; }
    `
    svgClone.insertBefore(style, svgClone.firstChild)

    // 将SVG转换为字符串
    const serializer = new XMLSerializer()
    let svgString = serializer.serializeToString(svgClone)

    // 添加XML声明
    svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + svgString

    downloadText(svgString, 'mermaid-chart.svg', 'image/svg+xml;charset=utf-8')
    ms.success(t('previewer.svgDownloadStarted'))
  } catch (error) {
    ms.error(t('previewer.svgExportFailed'))
  } finally {
    isExporting.value = false
    exportType.value = ''
    showExportMenu.value = false
    // 通知父组件导出结束
    document.dispatchEvent(new CustomEvent('mermaid-export-end'))
  }
}

// 导出为PNG
const exportAsPng = async () => {
  if (isExporting.value) return

  isExporting.value = true
  exportType.value = 'PNG'

  try {
    const svgInfo = getFullSvgInfo()
    if (!svgInfo) {
      ms.error(t('previewer.mermaidChartUnavailable'))
      return
    }

    const { svgElement, actualWidth, actualHeight, actualX, actualY } = svgInfo

    // 创建临时容器以完整渲染SVG
    const tempContainer = document.createElement('div')
    tempContainer.style.position = 'absolute'
    tempContainer.style.left = '-9999px'
    tempContainer.style.top = '0'
    tempContainer.style.backgroundColor = '#ffffff'
    tempContainer.style.padding = '20px'

    // 克隆SVG并设置完整尺寸
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement

    // 设置高分辨率
    const exportScale = 2
    const padding = 20
    const fullWidth = (actualWidth + padding * 2) * exportScale
    const fullHeight = (actualHeight + padding * 2) * exportScale

    // 设置SVG的完整viewBox和尺寸
    svgClone.setAttribute(
      'viewBox',
      `${actualX - padding} ${actualY - padding} ${actualWidth + padding * 2} ${actualHeight + padding * 2}`
    )
    svgClone.setAttribute('width', fullWidth.toString())
    svgClone.setAttribute('height', fullHeight.toString())

    // 确保SVG样式
    svgClone.style.display = 'block'
    svgClone.style.maxWidth = 'none'
    svgClone.style.maxHeight = 'none'

    // 添加字体样式
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `
      svg { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      }
      text { font-weight: 400; }
    `
    svgClone.insertBefore(style, svgClone.firstChild)

    tempContainer.appendChild(svgClone)
    document.body.appendChild(tempContainer)

    // 使用 html2canvas 截图：只在导出时用到，按需加载，不和图表渲染一起下载
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(tempContainer, {
      // 我们已经在SVG尺寸中应用了缩放
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      // 额外的容器padding
      width: fullWidth + 40,
      height: fullHeight + 40,
    })

    // 清理临时容器
    document.body.removeChild(tempContainer)

    // 转换为PNG并下载
    downloadUrl(canvas.toDataURL('image/png'), 'mermaid-chart.png')

    ms.success(t('previewer.pngDownloadStarted'))
  } catch (error) {
    ms.error(t('previewer.pngExportFailed'))
  } finally {
    isExporting.value = false
    exportType.value = ''
    showExportMenu.value = false
    // 通知父组件导出结束
    document.dispatchEvent(new CustomEvent('mermaid-export-end'))
  }
}

// 点击外部关闭菜单
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (showExportMenu.value && !target.closest('.export-menu-container')) {
    showExportMenu.value = false
  }
}

// 初始化mermaid配置
const initializeMermaid = () => {
  mermaid.initialize({
    startOnLoad: false,
    theme: isDarkMode.value ? 'dark' : 'default',
    // mermaid 12 把默认外观改成 neo，并把流程图、类图、状态图、ER 图、需求图的默认布局改成 ELK；
    // 这里沿用 classic 与 dagre，保持原有排版和配色（思维导图、泳道图等仍用各自的默认布局）
    look: 'classic',
    securityLevel: 'strict',
    // 官方解决方案：禁止错误渲染到DOM
    suppressErrorRendering: true,
    deterministicIds: false,
    deterministicIDSeed: undefined,
    flowchart: {
      htmlLabels: false,
      useMaxWidth: false,
      layout: 'dagre',
    },
    class: { layout: 'dagre' },
    state: { layout: 'dagre' },
    er: { layout: 'dagre' },
    requirement: { layout: 'dagre' },
  })
}

// 计算两个触摸点之间的距离
const getTouchDistance = (touch1: Touch, touch2: Touch) => {
  const dx = touch1.clientX - touch2.clientX
  const dy = touch1.clientY - touch2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

// 获取多个触摸点的中心坐标

// 处理触摸开始
const handleTouchStart = (event: TouchEvent) => {
  event.preventDefault()

  const touchList = Array.from(event.touches)
  touches.value = touchList

  if (touchList.length === 1) {
    // 单指触摸 - 开始拖动
    const touch = touchList[0]
    isDragging.value = true
    dragStartPos.value = {
      x: touch.clientX - translatePos.value.x,
      y: touch.clientY - translatePos.value.y,
    }

    // 检测双击
    const currentTime = Date.now()
    if (currentTime - lastTouchTime.value < 300) {
      resetZoom()
    }
    lastTouchTime.value = currentTime
  } else if (touchList.length === 2) {
    // 双指触摸 - 开始缩放
    isDragging.value = false
    const distance = getTouchDistance(touchList[0], touchList[1])
    initialTouchDistance.value = distance
    lastTouchDistance.value = distance
    initialScale.value = scale.value
  }
}

// 处理触摸移动
const handleTouchMove = (event: TouchEvent) => {
  event.preventDefault()

  const touchList = Array.from(event.touches)

  if (touchList.length === 1 && isDragging.value) {
    // 单指拖动
    const touch = touchList[0]
    translatePos.value = {
      x: touch.clientX - dragStartPos.value.x,
      y: touch.clientY - dragStartPos.value.y,
    }
  } else if (touchList.length === 2) {
    // 双指缩放
    const distance = getTouchDistance(touchList[0], touchList[1])

    if (initialTouchDistance.value > 0) {
      const scaleFactor = distance / initialTouchDistance.value
      const newScale = Math.max(minScale, Math.min(maxScale, initialScale.value * scaleFactor))
      scale.value = newScale
    }

    lastTouchDistance.value = distance
  }
}

// 处理触摸结束
const handleTouchEnd = (event: TouchEvent) => {
  const touchList = Array.from(event.touches)

  if (touchList.length === 0) {
    // 所有触摸点都离开
    isDragging.value = false
    initialTouchDistance.value = 0
    lastTouchDistance.value = 0
  } else if (touchList.length === 1 && touches.value.length === 2) {
    // 从双指变为单指，重新开始拖动
    const touch = touchList[0]
    isDragging.value = true
    dragStartPos.value = {
      x: touch.clientX - translatePos.value.x,
      y: touch.clientY - translatePos.value.y,
    }
    initialTouchDistance.value = 0
  }

  touches.value = touchList
}

// 处理触控板手势（wheel事件）
const handleWheel = (event: WheelEvent) => {
  event.preventDefault()

  if (event.ctrlKey || event.metaKey) {
    // 触控板双指缩放手势（Ctrl/Cmd + 滚轮）
    // 调整缩放敏感度，让缩放更平滑
    // 调整敏感度
    const scaleFactor = 0.005
    const zoomDelta = -event.deltaY * scaleFactor
    const newScale = Math.max(minScale, Math.min(maxScale, scale.value * (1 + zoomDelta)))
    scale.value = newScale
  } else {
    // 触控板双指拖动手势（普通滚轮/双指滑动）
    // 调整拖动敏感度，让拖动更平滑
    // 可以调整拖动敏感度
    const dragSensitivity = 1.0
    translatePos.value = {
      x: translatePos.value.x - event.deltaX * dragSensitivity,
      y: translatePos.value.y - event.deltaY * dragSensitivity,
    }
  }
}

// 处理鼠标按下开始拖动
const handleMouseDown = (event: MouseEvent) => {
  // 只响应左键
  if (event.button !== 0) return

  event.preventDefault()
  isDragging.value = true
  dragStartPos.value = {
    x: event.clientX - translatePos.value.x,
    y: event.clientY - translatePos.value.y,
  }

  // 添加全局鼠标事件监听
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

// 处理鼠标移动拖动
const handleMouseMove = (event: MouseEvent) => {
  if (!isDragging.value) return

  event.preventDefault()
  translatePos.value = {
    x: event.clientX - dragStartPos.value.x,
    y: event.clientY - dragStartPos.value.y,
  }
}

// 处理鼠标松开结束拖动
const handleMouseUp = (event: MouseEvent) => {
  if (!isDragging.value) return

  event.preventDefault()
  isDragging.value = false

  // 移除全局鼠标事件监听
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
}

// 重置缩放和位置
const resetZoom = () => {
  scale.value = 1
  translatePos.value = { x: 0, y: 0 }
}

// 来自父组件的导出事件处理函数
const handleExportPngFromParent = () => {
  // 通知父组件开始导出
  document.dispatchEvent(new CustomEvent('mermaid-export-start', { detail: { type: 'PNG' } }))
  exportAsPng()
  // 导出结束会在exportAsPng内部处理
}

const handleExportSvgFromParent = () => {
  // 通知父组件开始导出
  document.dispatchEvent(new CustomEvent('mermaid-export-start', { detail: { type: 'SVG' } }))
  exportAsSvg()
  // 导出结束会在exportAsSvg内部处理
}

// 计算变换样式
const transformStyle = computed(() => {
  return `translate(${translatePos.value.x}px, ${translatePos.value.y}px) scale(${scale.value})`
})

// 渲染mermaid图表
const renderMermaid = async () => {
  if (!mermaidContainer.value || !props.content) return

  // 如果已经有错误且内容没有变化，不重复渲染
  if (hasError.value && props.content === lastErrorMessage.value) {
    return
  }

  isRendering.value = true
  hasError.value = false

  // 清空容器内容
  mermaidContainer.value.innerHTML = ''

  try {
    // 检查内容是否有效
    if (
      props.content.includes('#mermaid-') ||
      props.content.includes('font-family:') ||
      props.content.includes('@keyframes') ||
      props.content.includes('svg') ||
      props.content.includes('.label')
    ) {
      displayError(t('previewer.invalidMermaidContent'))
      return
    }

    // 生成唯一ID
    const uniqueId = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    // 清理可能的mermaid缓存
    if (typeof (mermaid as any).clear === 'function') {
      try {
        ;(mermaid as any).clear()
      } catch (clearError) {
        // 静默处理缓存清理错误
      }
    }

    try {
      // 渲染图表
      // 图里有公式（$$…$$）时 Mermaid 用 KaTeX 排版：先按需加载 KaTeX 与它的样式
      if (props.content.includes('$$')) await loadKatex().catch(() => undefined)
      const { svg } = await mermaid.render(uniqueId, props.content)
      mermaidContainer.value.innerHTML = svg
      // 渲染成功，清除错误状态
      hasError.value = false
      lastErrorMessage.value = ''
    } catch (renderError) {
      displayError(renderError instanceof Error ? renderError.message : String(renderError))
    }
  } catch (error) {
    displayError(error instanceof Error ? error.message : String(error))
  } finally {
    isRendering.value = false
  }
}

// 显示错误信息
const displayError = (errorMessage: string) => {
  if (!mermaidContainer.value) return

  const wrapper = document.createElement('div')
  wrapper.className = 'p-4 text-semantic-danger rounded-lg'
  wrapper.style.background = 'color-mix(in srgb, var(--semantic-danger) 10%, transparent)'

  const title = document.createElement('h3')
  title.className = 'font-bold mb-2'
  title.textContent = t('previewer.mermaidRenderError')

  const description = document.createElement('p')
  description.className = 'mb-2'
  description.textContent = errorMessage

  wrapper.append(title, description)
  mermaidContainer.value.replaceChildren(wrapper)
  isRendering.value = false
}

// 组件挂载后初始化
onMounted(() => {
  initializeMermaid()
  renderMermaid()

  // 添加事件监听
  if (containerWrapper.value) {
    // 触控板手势支持
    containerWrapper.value.addEventListener('wheel', handleWheel, { passive: false })

    // 移动端触摸事件
    containerWrapper.value.addEventListener('touchstart', handleTouchStart, { passive: false })
    containerWrapper.value.addEventListener('touchmove', handleTouchMove, { passive: false })
    containerWrapper.value.addEventListener('touchend', handleTouchEnd, { passive: false })
  }

  // 监听来自父组件的导出事件
  document.addEventListener('mermaid-export-png', handleExportPngFromParent)
  document.addEventListener('mermaid-export-svg', handleExportSvgFromParent)
})

// 组件卸载时清理事件监听
onUnmounted(() => {
  if (containerWrapper.value) {
    // 清理触控板事件
    containerWrapper.value.removeEventListener('wheel', handleWheel)

    // 清理移动端触摸事件
    containerWrapper.value.removeEventListener('touchstart', handleTouchStart)
    containerWrapper.value.removeEventListener('touchmove', handleTouchMove)
    containerWrapper.value.removeEventListener('touchend', handleTouchEnd)
  }

  // 清理可能残留的拖动事件监听
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)

  // 清理点击外部监听
  document.removeEventListener('click', handleClickOutside)

  // 清理来自父组件的导出事件监听
  document.removeEventListener('mermaid-export-png', handleExportPngFromParent)
  document.removeEventListener('mermaid-export-svg', handleExportSvgFromParent)
})

// 监听内容变化
watch(
  () => props.content,
  (newContent, oldContent) => {
    // 只有内容真正发生变化时才重新渲染
    if (newContent !== oldContent) {
      // 重置缩放和位置
      scale.value = 1
      translatePos.value = { x: 0, y: 0 }
      renderMermaid()
    }
  }
)

// 监听暗黑模式变化
watch(isDarkMode, () => {
  // 主题变化时重新初始化和渲染
  initializeMermaid()
  // 重置错误状态，允许重新渲染
  hasError.value = false
  lastErrorMessage.value = ''
  renderMermaid()
})
</script>

<template>
  <div class="h-full w-full flex items-center justify-center bg-panel-subtle">
    <div
      ref="containerWrapper"
      class="relative w-full h-full overflow-hidden touch-none"
      :class="{
        'cursor-grab': !isDragging,
        'cursor-grabbing': isDragging,
      }"
    >
      <!-- 加载动画 -->
      <!-- 渲染中与失败的遮罩只在渲染器自己的范围里压住图表（z-1 / z-2）：在对话代码块里预览时，
           吸顶的代码块标题栏（z-content）与它的提示气泡盖在遮罩上面 -->
      <div
        v-if="isRendering"
        class="absolute top-10 left-1/2 transform -translate-x-1/2 z-1 flex items-center justify-center"
      >
        <UiSpinner size="lg" tone="link" />
      </div>

      <!-- Mermaid内容容器 -->
      <!-- 支持：触控板双指缩放、双指拖动、鼠标拖拽、移动端双指缩放、双击重置 -->
      <div
        ref="mermaidContainer"
        class="flex justify-center items-center min-w-[100px] min-h-[100px] p-4 w-full mermaid-content transition-transform duration-md ease-out motion-reduce:transition-none select-none"
        :class="{ '!transition-none': isDragging }"
        :style="{ transform: transformStyle }"
        @mousedown="handleMouseDown"
        @dblclick="resetZoom"
      ></div>
    </div>
  </div>
</template>

<style scoped>
/* Mermaid SVG 样式 */
.mermaid-content :deep(svg) {
  @apply max-w-full h-auto mx-auto;
}
</style>
