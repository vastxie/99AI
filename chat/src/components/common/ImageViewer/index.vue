<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-90 backdrop-blur-sm"
      @click="handleBackgroundClick"
      @wheel.prevent="handleWheel"
    >
      <!-- 工具栏 -->
      <div
        class="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 flex items-center space-x-2 bg-black bg-opacity-50 rounded-lg px-4 py-2"
      >
        <!-- 缩小 -->
        <button
          class="toolbar-btn"
          @click="zoomOut"
          :disabled="scale <= minScale"
          title="缩小 (Ctrl + -)"
        >
          <Minus size="20" />
        </button>

        <!-- 缩放比例显示 -->
        <span class="text-white text-sm min-w-[60px] text-center">
          {{ Math.round(scale * 100) }}%
        </span>

        <!-- 放大 -->
        <button
          class="toolbar-btn"
          @click="zoomIn"
          :disabled="scale >= maxScale"
          title="放大 (Ctrl + +)"
        >
          <Plus size="20" />
        </button>

        <!-- 分割线 -->
        <div class="w-px h-6 bg-gray-400"></div>

        <!-- 逆时针旋转 -->
        <button class="toolbar-btn" @click="rotateLeft" title="逆时针旋转 (Ctrl + ←)">
          <span class="text-lg">↺</span>
        </button>

        <!-- 顺时针旋转 -->
        <button class="toolbar-btn" @click="rotateRight" title="顺时针旋转 (Ctrl + →)">
          <span class="text-lg">↻</span>
        </button>

        <!-- 分割线 -->
        <div class="w-px h-6 bg-gray-400"></div>

        <!-- 重置 -->
        <button class="toolbar-btn" @click="reset" title="重置 (Ctrl + 0)">
          <Refresh size="20" />
        </button>

        <!-- 保存 -->
        <button class="toolbar-btn" @click="save" title="保存 (Ctrl + S)">
          <Download size="20" />
        </button>
      </div>

      <!-- 关闭按钮 -->
      <button
        class="absolute top-4 right-4 z-10 p-2 rounded-full bg-black bg-opacity-50 text-white hover:bg-opacity-70 transition-all duration-200"
        @click="close"
        title="关闭 (ESC)"
      >
        <Close size="24" />
      </button>

      <!-- 图片容器 -->
      <div
        ref="imageContainer"
        class="relative w-full h-full flex items-center justify-center overflow-hidden cursor-grab"
        :class="{ 'cursor-grabbing': isDragging }"
        @mousedown="startDrag"
        @mousemove="drag"
        @mouseup="stopDrag"
        @mouseleave="stopDrag"
      >
        <!-- 图片 -->
        <img
          ref="imageRef"
          :src="imageUrl"
          class="max-w-none max-h-none transition-transform duration-300 ease-out select-none"
          :style="imageStyle"
          alt="预览图片"
          @load="handleImageLoad"
          @error="handleImageError"
          @dragstart.prevent
        />

        <!-- 加载状态 -->
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
          <div class="text-white text-lg">加载中...</div>
        </div>

        <!-- 错误状态 -->
        <div v-if="error" class="absolute inset-0 flex items-center justify-center">
          <div class="text-white text-lg">图片加载失败</div>
        </div>
      </div>

      <!-- 底部提示 -->
      <div
        class="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black bg-opacity-50 px-3 py-1 rounded-full"
      >
        拖拽移动 • 滚轮缩放 • ESC 关闭
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { Close, Download, Minus, Plus, Refresh } from '@icon-park/vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

interface Props {
  visible: boolean
  imageUrl: string
  fileName?: string
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  fileName: 'image',
})

const emit = defineEmits<Emits>()

// 图片状态
const imageRef = ref<HTMLImageElement>()
const imageContainer = ref<HTMLDivElement>()
const loading = ref(true)
const error = ref(false)

// 变换状态
const scale = ref(1)
const rotation = ref(0)
const translateX = ref(0)
const translateY = ref(0)

// 缩放限制
const minScale = 0.1
const maxScale = 5

// 拖拽状态
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const dragOffset = ref({ x: 0, y: 0 })

// 图片原始尺寸
const originalSize = ref({ width: 0, height: 0 })

// 计算图片样式
const imageStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value}) rotate(${rotation.value}deg)`,
  transformOrigin: 'center center',
}))

// 处理图片加载
function handleImageLoad() {
  loading.value = false
  error.value = false

  if (imageRef.value) {
    originalSize.value = {
      width: imageRef.value.naturalWidth,
      height: imageRef.value.naturalHeight,
    }

    // 自动适配屏幕尺寸
    autoFit()
  }
}

// 处理图片加载错误
function handleImageError() {
  loading.value = false
  error.value = true
}

// 自动适配屏幕尺寸
function autoFit() {
  if (!imageRef.value || !imageContainer.value) return

  const containerRect = imageContainer.value.getBoundingClientRect()
  const imageWidth = originalSize.value.width
  const imageHeight = originalSize.value.height

  // 计算适合的缩放比例
  const scaleX = (containerRect.width * 0.9) / imageWidth
  const scaleY = (containerRect.height * 0.9) / imageHeight
  const fitScale = Math.min(scaleX, scaleY, 1) // 不超过原始尺寸

  scale.value = fitScale
}

// 放大
function zoomIn() {
  const newScale = Math.min(scale.value * 1.2, maxScale)
  scale.value = newScale
}

// 缩小
function zoomOut() {
  const newScale = Math.max(scale.value / 1.2, minScale)
  scale.value = newScale
}

// 顺时针旋转
function rotateRight() {
  rotation.value = (rotation.value + 90) % 360
}

// 逆时针旋转
function rotateLeft() {
  rotation.value = (rotation.value - 90 + 360) % 360
}

// 重置
function reset() {
  scale.value = 1
  rotation.value = 0
  translateX.value = 0
  translateY.value = 0
  autoFit()
}

// 保存图片
async function save() {
  if (!props.imageUrl) return

  try {
    console.log('全局预览器开始下载图片:', props.imageUrl)

    // 尝试直接下载（适用于同域或支持CORS的图片）
    try {
      const response = await fetch(props.imageUrl, {
        mode: 'cors',
        credentials: 'omit',
      })
      console.log('全局预览器fetch响应状态:', response.status, response.statusText)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      console.log('全局预览器blob大小:', blob.size, 'blob类型:', blob.type)

      const url = window.URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `${props.fileName}.${getFileExtension(props.imageUrl)}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      window.URL.revokeObjectURL(url)
      console.log('全局预览器图片下载完成')
      return
    } catch (fetchError) {
      console.log('全局预览器fetch下载失败，尝试canvas方法:', fetchError)

      // 如果fetch失败，尝试使用canvas方法（适用于跨域图片）
      const img = new Image()
      img.crossOrigin = 'anonymous'

      await new Promise((resolve, reject) => {
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')

            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight

            ctx?.drawImage(img, 0, 0)

            canvas.toBlob(blob => {
              if (blob) {
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${props.fileName}.${getFileExtension(props.imageUrl)}`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                window.URL.revokeObjectURL(url)
                console.log('全局预览器canvas下载完成')
                resolve(true)
              } else {
                reject(new Error('无法生成图片blob'))
              }
            }, 'image/png')
          } catch (canvasError) {
            reject(canvasError)
          }
        }

        img.onerror = () => {
          reject(new Error('图片加载失败'))
        }

        img.src = props.imageUrl
      })
    }
  } catch (error: any) {
    console.error('保存图片失败:', error)

    // 最后的备用方案：直接打开图片链接
    try {
      const a = document.createElement('a')
      a.href = props.imageUrl
      a.download = `${props.fileName}.${getFileExtension(props.imageUrl)}`
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      console.log('全局预览器已在新窗口打开图片')
    } catch (linkError) {
      console.error('全局预览器所有下载方法都失败了:', linkError)
    }
  }
}

// 获取文件扩展名
function getFileExtension(url: string): string {
  const match = url.match(/\.([^.]+)$/)
  return match ? match[1] : 'png'
}

// 处理鼠标滚轮缩放
function handleWheel(event: WheelEvent) {
  event.preventDefault()

  const delta = event.deltaY > 0 ? -1 : 1
  const zoomFactor = 1.1
  const newScale =
    delta > 0
      ? Math.min(scale.value * zoomFactor, maxScale)
      : Math.max(scale.value / zoomFactor, minScale)

  scale.value = newScale
}

// 开始拖拽
function startDrag(event: MouseEvent) {
  if (event.button !== 0) return // 只响应左键

  isDragging.value = true
  dragStart.value = { x: event.clientX, y: event.clientY }
  dragOffset.value = { x: translateX.value, y: translateY.value }
}

// 拖拽中
function drag(event: MouseEvent) {
  if (!isDragging.value) return

  const deltaX = event.clientX - dragStart.value.x
  const deltaY = event.clientY - dragStart.value.y

  translateX.value = dragOffset.value.x + deltaX
  translateY.value = dragOffset.value.y + deltaY
}

// 停止拖拽
function stopDrag() {
  isDragging.value = false
}

// 处理背景点击
function handleBackgroundClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    close()
  }
}

// 关闭预览
function close() {
  emit('update:visible', false)
  emit('close')
}

// 键盘事件处理
function handleKeyDown(event: KeyboardEvent) {
  if (!props.visible) return

  const { key, ctrlKey, metaKey } = event
  const isCtrl = ctrlKey || metaKey

  switch (key) {
    case 'Escape':
      close()
      break
    case '=':
    case '+':
      if (isCtrl) {
        event.preventDefault()
        zoomIn()
      }
      break
    case '-':
      if (isCtrl) {
        event.preventDefault()
        zoomOut()
      }
      break
    case '0':
      if (isCtrl) {
        event.preventDefault()
        reset()
      }
      break
    case 'ArrowLeft':
      if (isCtrl) {
        event.preventDefault()
        rotateLeft()
      }
      break
    case 'ArrowRight':
      if (isCtrl) {
        event.preventDefault()
        rotateRight()
      }
      break
    case 's':
      if (isCtrl) {
        event.preventDefault()
        save()
      }
      break
  }
}

// 监听visible变化，重置状态
watch(
  () => props.visible,
  newVisible => {
    if (newVisible) {
      loading.value = true
      error.value = false
      reset()
    }
  }
)

// 监听imageUrl变化
watch(
  () => props.imageUrl,
  () => {
    if (props.visible) {
      loading.value = true
      error.value = false
      reset()
    }
  }
)

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.toolbar-btn {
  @apply p-2 rounded-md text-white hover:bg-white hover:bg-opacity-20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}

.toolbar-btn:not(:disabled):hover {
  @apply bg-white bg-opacity-20;
}

.toolbar-btn:not(:disabled):active {
  @apply bg-white bg-opacity-30;
}
</style>
