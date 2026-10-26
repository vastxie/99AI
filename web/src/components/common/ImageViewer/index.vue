<template>
  <Teleport to="body">
    <Transition name="image-viewer">
      <div
        v-if="visible"
        :ref="setDialogRef"
        v-bind="dialogAttrs"
        :aria-label="t('common.previewImage')"
        class="image-viewer fixed inset-0 z-viewer text-text-primary"
        :class="isMobile ? 'image-viewer-mobile' : 'image-viewer-desktop'"
        :style="mobileViewerStyle"
        @wheel.passive="handleViewerWheel"
      >
        <template v-if="isMobile">
          <Transition name="mobile-chrome">
            <div v-if="mobileChromeVisible" class="mobile-viewer-topbar">
              <button
                :class="mobileActionButtonClass"
                type="button"
                :aria-label="t('common.saveImage')"
                @click="save"
              >
                <Download :size="21" />
              </button>
              <button
                :class="mobileActionButtonClass"
                type="button"
                :aria-label="t('common.closePreview')"
                @click="close"
              >
                <X :size="23" />
              </button>
            </div>
          </Transition>

          <div
            ref="imageContainer"
            class="mobile-image-stage"
            :class="mobileImageIsLong ? 'items-start justify-start' : 'items-center justify-center'"
            @click.self="handleMobileStageClick"
            @touchstart="handleMobileTouchStart"
            @touchmove="handleMobileTouchMove"
            @touchend="handleMobileTouchEnd"
            @touchcancel="handleMobileTouchCancel"
          >
            <img
              ref="imageRef"
              :src="imageUrl"
              class="mobile-preview-image"
              :class="{
                'mobile-preview-image-touching': mobileTouching,
                'mobile-preview-image-zoomed': mobileScale > 1,
              }"
              :style="mobileImageStyle"
              :alt="t('common.previewImage')"
              @load="handleImageLoad"
              @error="handleImageError"
              @dragstart.prevent
              @click.stop="handleMobileImageClick"
            />
          </div>
        </template>

        <template v-else>
          <div class="desktop-viewer-topbar">
            <button
              :class="desktopCloseButtonClass"
              type="button"
              :aria-label="t('common.closePreview')"
              @click="close"
            >
              <X :size="22" />
            </button>
          </div>

          <div ref="imageContainer" class="desktop-image-stage" @click.self="handleMaskClick">
            <img
              ref="imageRef"
              :src="imageUrl"
              class="desktop-preview-image"
              :class="{ 'cursor-grabbing': isDragging }"
              :style="imageStyle"
              :alt="t('common.previewImage')"
              @load="handleImageLoad"
              @error="handleImageError"
              @dragstart.prevent
              @mousedown="startDrag"
              @mousemove="drag"
              @mouseup="stopDrag"
              @mouseleave="stopDrag"
            />
          </div>

          <div class="desktop-viewer-toolbar viewer-toolbar-surface">
            <UiTooltip :text="t('common.zoomOutShortcut')">
              <button
                :class="desktopToolbarButtonClass"
                type="button"
                :aria-label="t('common.zoomOut')"
                @click="zoomOut"
                :disabled="scale <= minScale"
              >
                <ZoomOut :size="20" />
              </button>
            </UiTooltip>

            <UiTooltip :text="t('common.zoomInShortcut')">
              <button
                :class="desktopToolbarButtonClass"
                type="button"
                :aria-label="t('common.zoomIn')"
                @click="zoomIn"
                :disabled="scale >= maxScale"
              >
                <ZoomIn :size="20" />
              </button>
            </UiTooltip>

            <div class="viewer-toolbar-divider bg-app-border"></div>

            <UiTooltip :text="t('common.rotateLeftShortcut')">
              <button
                :class="desktopToolbarButtonClass"
                type="button"
                :aria-label="t('common.rotateLeft')"
                @click="rotateLeft"
              >
                <RotateCcw :size="20" />
              </button>
            </UiTooltip>

            <UiTooltip :text="t('common.rotateRightShortcut')">
              <button
                :class="desktopToolbarButtonClass"
                type="button"
                :aria-label="t('common.rotateRight')"
                @click="rotateRight"
              >
                <RotateCw :size="20" />
              </button>
            </UiTooltip>

            <div class="viewer-toolbar-divider bg-app-border"></div>

            <UiTooltip :text="t('common.resetShortcut')">
              <button
                :class="desktopToolbarButtonClass"
                type="button"
                :aria-label="t('common.reset')"
                @click="reset"
              >
                <RefreshCw :size="20" />
              </button>
            </UiTooltip>

            <UiTooltip :text="t('common.saveShortcut')">
              <button
                :class="desktopToolbarButtonClass"
                type="button"
                :aria-label="t('common.saveImage')"
                @click="save"
              >
                <Download :size="20" />
              </button>
            </UiTooltip>
          </div>
        </template>

        <div v-if="loading" class="viewer-state">
          <div class="viewer-state-text">{{ t('common.loading') }}</div>
        </div>

        <div v-if="error" class="viewer-state">
          <div class="viewer-state-text">{{ t('common.imageLoadFailed') }}</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { Download, RefreshCw, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from '@lucide/vue'

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import { useDialogA11y } from '@/composables/useDialogA11y'
import { useViewport } from '@/hooks/useViewport'
import { downloadBlob, downloadUrl } from '@/utils/download'
import { t } from '@/locales'

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

// 移动端检测
const { isMobile } = useViewport()

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
const viewportSize = ref({ width: window.innerWidth, height: window.innerHeight })
const mobileChromeVisible = ref(true)
const mobileScale = ref(1)
const mobileTranslateX = ref(0)
const mobileTranslateY = ref(0)
const mobileTouching = ref(false)
let previousBodyOverflow = ''
let previousHtmlOverflow = ''
let mobileTouchMode: 'idle' | 'tap' | 'pan' | 'pinch' | 'swipe' = 'idle'
let mobileTouchStartX = 0
let mobileTouchStartY = 0
let mobileTouchStartTime = 0
let mobilePanStartX = 0
let mobilePanStartY = 0
let mobilePanOffsetX = 0
let mobilePanOffsetY = 0
let mobileLastDeltaX = 0
let mobileLastDeltaY = 0
let mobilePinchStartDistance = 0
let mobilePinchStartScale = 1
let mobileTapTimer: ReturnType<typeof setTimeout> | null = null
let suppressNextMobileClick = false

const MOBILE_MIN_SCALE = 1
const MOBILE_MAX_SCALE = 4
const MOBILE_DOUBLE_TAP_DELAY = 260
const MOBILE_SWIPE_CLOSE_DISTANCE = 96
const DESKTOP_WHEEL_ZOOM_SENSITIVITY = 0.0038
const DESKTOP_WHEEL_MAX_DELTA = 90
const DESKTOP_WHEEL_MAX_SCALE_STEP = 0.32
const desktopToolbarButtonClass =
  'viewer-icon-button fg-quiet hover:bg-btn-ghost-hover active:bg-btn-ghost-active'
const desktopCloseButtonClass = 'viewer-icon-button desktop-close-button viewer-floating-action'
const mobileActionButtonClass = 'viewer-icon-button mobile-viewer-action viewer-floating-action'

// 计算图片样式
const imageStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value}) rotate(${rotation.value}deg)`,
  transformOrigin: 'center center',
}))

const mobileImageStyle = computed(() => ({
  transform: `translate3d(${mobileTranslateX.value}px, ${mobileTranslateY.value}px, 0) scale(${mobileScale.value})`,
  transformOrigin: 'center center',
}))

const mobileViewerStyle = computed(() => {
  if (!isMobile.value || mobileTouchMode !== 'swipe') return {}
  const progress = clamp(mobileTranslateY.value / MOBILE_SWIPE_CLOSE_DISTANCE, 0, 1)
  const overlayWeight = Math.round(100 - progress * 45)
  return {
    backgroundColor: `color-mix(in srgb, var(--app-overlay) ${overlayWeight}%, transparent)`,
  }
})

const mobileImageIsLong = computed(() => {
  if (!isMobile.value || !originalSize.value.width || !originalSize.value.height) return false
  const displayHeight =
    (viewportSize.value.width * originalSize.value.height) / originalSize.value.width
  return displayHeight > viewportSize.value.height + 16
})

function updateViewportSize() {
  viewportSize.value = {
    width: window.innerWidth,
    height: window.innerHeight,
  }
  if (props.visible && !isMobile.value) {
    autoFit()
  }
}

function getMobileDisplayImageHeight() {
  if (!originalSize.value.width || !originalSize.value.height) return viewportSize.value.height
  return (viewportSize.value.width * originalSize.value.height) / originalSize.value.width
}

function getTouchDistance(touches: TouchList) {
  if (touches.length < 2) return 0
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resetMobileTransform() {
  mobileScale.value = 1
  mobileTranslateX.value = 0
  mobileTranslateY.value = 0
  mobileTouchMode = 'idle'
}

function clampMobileTranslate() {
  if (mobileScale.value <= 1) {
    mobileTranslateX.value = 0
    mobileTranslateY.value = 0
    return
  }

  const maxX = (viewportSize.value.width * (mobileScale.value - 1)) / 2
  const displayHeight = getMobileDisplayImageHeight()
  const maxY = Math.max(0, (displayHeight * mobileScale.value - viewportSize.value.height) / 2)

  mobileTranslateX.value = clamp(mobileTranslateX.value, -maxX, maxX)
  mobileTranslateY.value = clamp(mobileTranslateY.value, -maxY, maxY)
}

function clearMobileTapTimer() {
  if (!mobileTapTimer) return
  clearTimeout(mobileTapTimer)
  mobileTapTimer = null
}

function toggleMobileZoom() {
  clearMobileTapTimer()
  if (mobileScale.value > 1) {
    resetMobileTransform()
    return
  }

  mobileScale.value = 2
  mobileTranslateX.value = 0
  mobileTranslateY.value = 0
}

function scheduleMobileTapAction() {
  suppressNextMobileClick = true

  if (mobileTapTimer) {
    toggleMobileZoom()
    return
  }

  mobileTapTimer = setTimeout(() => {
    mobileTapTimer = null
    toggleMobileChrome()
  }, MOBILE_DOUBLE_TAP_DELAY)
}

function lockPageScroll() {
  previousBodyOverflow = document.body.style.overflow
  previousHtmlOverflow = document.documentElement.style.overflow
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
}

function unlockPageScroll() {
  document.body.style.overflow = previousBodyOverflow
  document.documentElement.style.overflow = previousHtmlOverflow
}

// 处理图片加载
function handleImageLoad() {
  loading.value = false
  error.value = false

  if (imageRef.value) {
    originalSize.value = {
      width: imageRef.value.naturalWidth,
      height: imageRef.value.naturalHeight,
    }

    if (isMobile.value && imageContainer.value) {
      imageContainer.value.scrollTop = 0
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
  if (isMobile.value) {
    scale.value = 1
    return
  }

  // 获取视口尺寸（减去工具栏和边距）
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const availableWidth = viewportWidth - 96
  const availableHeight = viewportHeight - 144

  const imageWidth = originalSize.value.width
  const imageHeight = originalSize.value.height
  if (!imageWidth || !imageHeight) return

  // 计算适合的缩放比例，确保图片完全在可视区域内
  const scaleX = availableWidth / imageWidth
  const scaleY = availableHeight / imageHeight
  const fitScale = Math.min(scaleX, scaleY, 1)

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
  rotation.value += 90
}

// 逆时针旋转
function rotateLeft() {
  rotation.value -= 90
}

// 重置
function reset() {
  scale.value = 1
  rotation.value = 0
  translateX.value = 0
  translateY.value = 0
  mobileChromeVisible.value = true
  resetMobileTransform()
  if (imageContainer.value) {
    imageContainer.value.scrollTop = 0
  }
  autoFit()
}

// 保存图片：先取原图下载；跨域取不到时经 canvas 转成 PNG；都不行就在新标签页打开，让用户手动保存
async function save() {
  if (!props.imageUrl) return
  try {
    const response = await fetch(props.imageUrl, { mode: 'cors', credentials: 'omit' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    downloadBlob(await response.blob(), `${props.fileName}.${getFileExtension(props.imageUrl)}`)
  } catch {
    try {
      downloadBlob(await renderImageAsPng(props.imageUrl), `${props.fileName}.png`)
    } catch {
      downloadUrl(props.imageUrl)
    }
  }
}

function renderImageAsPng(src: string) {
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d')?.drawImage(img, 0, 0)
        canvas.toBlob(blob => {
          if (blob) resolve(blob)
          else reject(new Error(t('common.imageBlobFailed')))
        }, 'image/png')
      } catch (error) {
        reject(error)
      }
    }
    img.onerror = () => reject(new Error(t('common.imageLoadFailed')))
    img.src = src
  })
}

// 获取文件扩展名（忽略查询串与锚点）
function getFileExtension(url: string): string {
  const match = url.split(/[?#]/u)[0].match(/\.([a-z0-9]{1,5})$/iu)
  return match ? match[1] : 'png'
}

function normalizeWheelDelta(event: WheelEvent) {
  const modeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
  return clamp(event.deltaY * modeScale, -DESKTOP_WHEEL_MAX_DELTA, DESKTOP_WHEEL_MAX_DELTA)
}

// 处理鼠标滚轮缩放
function handleWheel(event: WheelEvent) {
  if (!imageContainer.value) return

  const wheelDelta = normalizeWheelDelta(event)
  if (Math.abs(wheelDelta) < 0.01) return

  const currentScale = scale.value
  const scaleStep = clamp(
    -wheelDelta * DESKTOP_WHEEL_ZOOM_SENSITIVITY * Math.max(currentScale, 0.72),
    -DESKTOP_WHEEL_MAX_SCALE_STEP,
    DESKTOP_WHEEL_MAX_SCALE_STEP
  )
  const newScale = clamp(currentScale + scaleStep, minScale, maxScale)
  if (Math.abs(newScale - currentScale) < 0.0001) return

  const rect = imageContainer.value.getBoundingClientRect()
  const anchorX = event.clientX - rect.left - rect.width / 2
  const anchorY = event.clientY - rect.top - rect.height / 2
  const scaleRatio = newScale / currentScale

  translateX.value = anchorX - (anchorX - translateX.value) * scaleRatio
  translateY.value = anchorY - (anchorY - translateY.value) * scaleRatio

  scale.value = newScale
}

function handleViewerWheel(event: WheelEvent) {
  if (isMobile.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest?.('.desktop-viewer-toolbar, .desktop-viewer-topbar')) return
  handleWheel(event)
}

// 开始拖拽
function startDrag(event: MouseEvent) {
  if (isMobile.value) return
  // 只响应左键
  if (event.button !== 0) return

  isDragging.value = true
  dragStart.value = { x: event.clientX, y: event.clientY }
  dragOffset.value = { x: translateX.value, y: translateY.value }
}

// 拖拽中
function drag(event: MouseEvent) {
  if (isMobile.value) return
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

// 关闭预览
function close() {
  emit('update:visible', false)
  emit('close')
}

// 处理遮罩点击
function handleMaskClick() {
  if (isMobile.value) return
  close()
}

function toggleMobileChrome() {
  if (!isMobile.value) return
  mobileChromeVisible.value = !mobileChromeVisible.value
}

function handleMobileStageClick() {
  if (suppressNextMobileClick) {
    suppressNextMobileClick = false
    return
  }
  toggleMobileChrome()
}

function handleMobileImageClick() {
  if (suppressNextMobileClick) {
    suppressNextMobileClick = false
    return
  }
  toggleMobileChrome()
}

function handleMobileTouchStart(event: TouchEvent) {
  if (!isMobile.value) return
  mobileTouching.value = true

  if (event.touches.length >= 2) {
    event.preventDefault()
    clearMobileTapTimer()
    mobileTouchMode = 'pinch'
    mobilePinchStartDistance = getTouchDistance(event.touches)
    mobilePinchStartScale = mobileScale.value
    return
  }

  const touch = event.touches[0]
  mobileTouchMode = 'tap'
  mobileTouchStartX = touch.clientX
  mobileTouchStartY = touch.clientY
  mobileTouchStartTime = Date.now()
  mobilePanStartX = touch.clientX
  mobilePanStartY = touch.clientY
  mobilePanOffsetX = mobileTranslateX.value
  mobilePanOffsetY = mobileTranslateY.value
  mobileLastDeltaX = 0
  mobileLastDeltaY = 0
}

function handleMobileTouchMove(event: TouchEvent) {
  if (!isMobile.value) return

  if (event.touches.length >= 2) {
    event.preventDefault()
    mobileTouchMode = 'pinch'
    const distance = getTouchDistance(event.touches)
    if (mobilePinchStartDistance <= 0) {
      mobilePinchStartDistance = distance
      mobilePinchStartScale = mobileScale.value
      return
    }

    mobileScale.value = clamp(
      mobilePinchStartScale * (distance / mobilePinchStartDistance),
      MOBILE_MIN_SCALE,
      MOBILE_MAX_SCALE
    )
    clampMobileTranslate()
    return
  }

  if (event.touches.length !== 1) return

  const touch = event.touches[0]
  const deltaX = touch.clientX - mobileTouchStartX
  const deltaY = touch.clientY - mobileTouchStartY
  mobileLastDeltaX = deltaX
  mobileLastDeltaY = deltaY

  if (mobileScale.value > 1) {
    event.preventDefault()
    mobileTouchMode = 'pan'
    mobileTranslateX.value = mobilePanOffsetX + touch.clientX - mobilePanStartX
    mobileTranslateY.value = mobilePanOffsetY + touch.clientY - mobilePanStartY
    clampMobileTranslate()
    return
  }

  const isAtScrollableTop = !imageContainer.value || imageContainer.value.scrollTop <= 0
  const canSwipeClose = !mobileImageIsLong.value || isAtScrollableTop
  const isVerticalPull = deltaY > 14 && Math.abs(deltaY) > Math.abs(deltaX) * 1.25

  if (canSwipeClose && isVerticalPull) {
    event.preventDefault()
    mobileTouchMode = 'swipe'
    mobileTranslateY.value = Math.min(deltaY * 0.42, 120)
  }
}

function handleMobileTouchEnd() {
  if (!isMobile.value) return
  const elapsed = Date.now() - mobileTouchStartTime
  const moved = Math.hypot(mobileLastDeltaX, mobileLastDeltaY)
  mobileTouching.value = false

  if (mobileTouchMode === 'pinch') {
    if (mobileScale.value <= 1.02) {
      resetMobileTransform()
    } else {
      clampMobileTranslate()
    }
    mobileTouchMode = 'idle'
    suppressNextMobileClick = true
    return
  }

  if (mobileTouchMode === 'pan') {
    clampMobileTranslate()
    mobileTouchMode = 'idle'
    suppressNextMobileClick = true
    return
  }

  if (mobileTouchMode === 'swipe') {
    const shouldClose = mobileTranslateY.value >= MOBILE_SWIPE_CLOSE_DISTANCE
    resetMobileTransform()
    mobileTouchMode = 'idle'
    suppressNextMobileClick = true
    if (shouldClose) close()
    return
  }

  if (mobileTouchMode === 'tap' && elapsed < 260 && moved < 10) {
    scheduleMobileTapAction()
  }

  mobileTouchMode = 'idle'
}

function handleMobileTouchCancel() {
  mobileTouching.value = false
  mobileTouchMode = 'idle'
  if (mobileScale.value <= 1) {
    resetMobileTransform()
  } else {
    clampMobileTranslate()
  }
}

// 弹层语义、焦点移入与陷阱、关闭后焦点归还、Esc 关闭（按弹窗栈只关最上层）统一由 useDialogA11y 承担
const { setDialogRef, dialogAttrs } = useDialogA11y(() => props.visible, { onClose: close })

// 键盘快捷键：缩放、旋转、复位、保存
function handleKeyDown(event: KeyboardEvent) {
  if (!props.visible) return

  const { key, ctrlKey, metaKey } = event
  const isCtrl = ctrlKey || metaKey

  switch (key) {
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
      lockPageScroll()
      loading.value = true
      error.value = false
      reset()
    } else {
      unlockPageScroll()
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
  window.addEventListener('resize', updateViewportSize)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', updateViewportSize)
  clearMobileTapTimer()
  if (props.visible) {
    unlockPageScroll()
  }
})
</script>

<style scoped>
.image-viewer {
  --viewer-overlay-bg: color-mix(in srgb, var(--app-overlay) 92%, transparent);
  --viewer-mobile-bg: color-mix(in srgb, var(--app-overlay) 92%, var(--app-canvas) 8%);
  --viewer-floating-bg: color-mix(in srgb, var(--app-surface) 78%, transparent);
  --viewer-floating-bg-hover: color-mix(in srgb, var(--app-surface-sunken) 88%, transparent);
  --viewer-floating-bg-active: color-mix(in srgb, var(--app-border) 42%, var(--app-surface) 58%);
  --viewer-floating-border: color-mix(in srgb, var(--app-border) 82%, transparent);
  --viewer-floating-text: var(--control-fg-quiet);
  --viewer-state-bg: color-mix(in srgb, var(--app-surface) 86%, transparent);
  --viewer-state-border: color-mix(in srgb, var(--app-border) 86%, transparent);
  --viewer-state-text: var(--text-secondary);
  touch-action: manipulation;
}

.image-viewer-desktop {
  background: var(--viewer-overlay-bg);
  backdrop-filter: blur(4px);
}

.image-viewer-mobile {
  background: var(--viewer-mobile-bg);
}

.viewer-floating-action {
  border-color: var(--viewer-floating-border);
  background: var(--viewer-floating-bg);
  color: var(--viewer-floating-text);
  box-shadow: var(--component-shadow-sm);
  backdrop-filter: blur(16px);
}

.viewer-floating-action:hover:not(:disabled),
.viewer-floating-action:focus-visible:not(:disabled) {
  border-color: var(--app-border-strong);
  background: var(--viewer-floating-bg-hover);
  color: var(--control-fg-hover);
}

.viewer-floating-action:active {
  background: var(--viewer-floating-bg-active);
}

/* 查看器内部层级（根节点 z-viewer 已建立层叠上下文）：图片 < 操作条(交互层) < 状态提示 */
.desktop-viewer-topbar {
  position: fixed;
  inset: 0 0 auto;
  z-index: var(--z-button);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 1rem 1.25rem;
  pointer-events: none;
}

.desktop-image-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 4.5rem 3rem 6.5rem;
}

.desktop-preview-image {
  max-width: none;
  max-height: none;
  user-select: none;
  border-radius: var(--radius-xl);
  cursor: grab;
  transition: transform var(--motion-duration-xs) ease;
}

.desktop-preview-image.cursor-grabbing {
  transition: none;
}

.desktop-viewer-toolbar {
  position: fixed;
  left: 50%;
  bottom: max(1.25rem, var(--safe-bottom));
  z-index: var(--z-button);
  display: flex;
  align-items: center;
  gap: 0.375rem;
  transform: translateX(-50%);
  /* 外圈圆角 = 里面图标按钮的圆角 + 工具条内边距（0.375rem），两层同心 */
  border-radius: calc(var(--radius-control) + 0.375rem);
  padding: 0.375rem;
}

.viewer-toolbar-surface {
  border: 1px solid color-mix(in srgb, var(--app-border) 80%, transparent);
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  color: var(--text-secondary);
  box-shadow: var(--component-shadow-md);
  backdrop-filter: blur(14px);
}

.viewer-toolbar-divider {
  width: 1px;
  height: 1.375rem;
  margin: 0 0.125rem;
}

.mobile-viewer-topbar {
  position: fixed;
  inset: 0 0 auto;
  z-index: var(--z-button);
  display: flex;
  justify-content: flex-end;
  gap: 0.375rem;
  padding: max(0.875rem, var(--safe-top)) 0.875rem 0;
  pointer-events: none;
}

.mobile-viewer-topbar .viewer-icon-button {
  width: 2.5rem;
  height: 2.5rem;
}

.mobile-image-stage {
  display: flex;
  width: 100vw;
  height: 100svh;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.mobile-preview-image {
  width: 100vw;
  height: auto;
  max-width: none;
  user-select: none;
  transition: transform var(--motion-duration-md) var(--motion-easing);
  will-change: transform;
}

.mobile-preview-image-touching {
  transition: none;
}

.mobile-preview-image-zoomed {
  touch-action: none;
}

.viewer-state {
  position: fixed;
  inset: 0;
  /* 状态提示浮在操作条之上（同为查看器内部层级） */
  z-index: var(--z-floating-button);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.viewer-state-text {
  border: 1px solid var(--viewer-state-border);
  border-radius: var(--radius-full);
  background: var(--viewer-state-bg);
  padding: 0.5rem 0.875rem;
  color: var(--viewer-state-text);
  font-size: var(--type-body-sm-size);
  line-height: 1.25rem;
  backdrop-filter: blur(12px);
}

.image-viewer-enter-active,
.image-viewer-leave-active {
  transition: opacity var(--motion-duration-md) ease;
}

.image-viewer-enter-from,
.image-viewer-leave-to {
  opacity: 0;
}

.image-viewer-enter-active .desktop-preview-image,
.image-viewer-enter-active .desktop-viewer-toolbar,
.image-viewer-enter-active .desktop-viewer-topbar {
  transition:
    opacity var(--motion-duration-md) ease,
    transform var(--motion-duration-md) var(--motion-easing);
}

.image-viewer-enter-from .desktop-preview-image {
  opacity: 0;
  transform: scale(0.985);
}

.image-viewer-enter-from .desktop-viewer-toolbar {
  opacity: 0;
  transform: translate(-50%, 0.5rem);
}

.image-viewer-enter-from .desktop-viewer-topbar {
  opacity: 0;
  transform: translateY(-0.5rem);
}

.mobile-chrome-enter-active,
.mobile-chrome-leave-active {
  transition:
    opacity var(--motion-duration-sm) ease,
    transform var(--motion-duration-sm) ease;
}

.mobile-chrome-enter-from,
.mobile-chrome-leave-to {
  opacity: 0;
  transform: translateY(-0.375rem);
}

@media (prefers-reduced-motion: reduce) {
  .desktop-preview-image,
  .mobile-preview-image,
  .viewer-icon-button,
  .image-viewer-enter-active,
  .image-viewer-leave-active,
  .image-viewer-enter-active .desktop-preview-image,
  .image-viewer-enter-active .desktop-viewer-toolbar,
  .image-viewer-enter-active .desktop-viewer-topbar,
  .mobile-chrome-enter-active,
  .mobile-chrome-leave-active {
    transition: none;
  }
}
</style>
