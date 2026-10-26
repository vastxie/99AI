<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { canAnimate, cancelAnimations, readDuration, readEasing } from '@/utils/motion'

/**
 * 两页面板：两页常驻（各自的滚动与输入状态都保留），叠在同一格里，只有当前页可见、可交互。
 * 外框高度跟随当前页内容的自然高度；换页与高度变化用 Web Animations 播放，
 * 首次显示、重新打开后的第一帧内直接到位，不从旧高度或零高度动起来。
 * active 为 false 时（父级弹层正在收起）保持当前外观不动。
 */
const props = withDefaults(defineProps<{ page: 1 | 2; active?: boolean }>(), { active: true })

/** 换页时两页相对错开的距离 */
const SLIDE_OFFSET = 6

const frame = ref<HTMLElement>()
const firstPage = ref<HTMLElement>()
const secondPage = ref<HTMLElement>()
const firstContent = ref<HTMLElement>()
const secondContent = ref<HTMLElement>()
const height = ref<number>()
/** 为 true 时高度变化直接到位（刚显示、刚重新打开） */
let settling = true
let settleFrame: number | undefined
let observer: ResizeObserver | undefined

function pageElement(page: 1 | 2) {
  return page === 1 ? firstPage.value : secondPage.value
}

function contentElement(page: 1 | 2) {
  return page === 1 ? firstContent.value : secondContent.value
}

/** 动画时长与缓动取设计变量，和其它过渡保持一致 */
function timing(): KeyframeAnimationOptions {
  return {
    duration: readDuration(frame.value, '--motion-duration-lg', 250),
    easing: readEasing(frame.value, '--motion-easing', 'ease-out'),
  }
}

/**
 * 上一段动画还没播完就要开始新的一段：先读下此刻画面上的值再取消它，新的一段从这里接着播，
 * 来回快点不会先跳回某个端点
 */
function interrupt(element: HTMLElement | undefined) {
  if (!element?.getAnimations?.().length) return undefined
  const { height, opacity, transform } = getComputedStyle(element)
  cancelAnimations(element)
  return { height, opacity, transform }
}

/** 把外框高度对齐到当前页内容；内容暂时量不到（祖先隐藏、尚未布局）时保持原高度 */
function syncHeight() {
  if (!props.active) return
  const next = contentElement(props.page)?.offsetHeight ?? 0
  if (next <= 0) return
  const previous = height.value
  height.value = next
  if (previous === undefined || previous === next) return
  const now = interrupt(frame.value)
  if (settling || !canAnimate(frame.value)) return
  frame.value.animate(
    [{ height: now?.height ?? `${previous}px` }, { height: `${next}px` }],
    timing()
  )
}

/** 离开的一页向反方向淡出，进来的一页从前进方向淡入 */
function slideBetween(from: 1 | 2, to: 1 | 2) {
  const leaving = pageElement(from)
  const entering = pageElement(to)
  const leavingNow = interrupt(leaving)
  const enteringNow = interrupt(entering)
  if (settling || !leaving || !canAnimate(entering)) return
  const direction = to > from ? 1 : -1
  const options = timing()
  leaving.animate(
    [
      {
        opacity: leavingNow?.opacity ?? 1,
        visibility: 'visible',
        transform: leavingNow?.transform ?? 'none',
      },
      {
        opacity: 0,
        visibility: 'visible',
        transform: `translateX(${-direction * SLIDE_OFFSET}px)`,
      },
    ],
    options
  )
  entering.animate(
    [
      {
        opacity: enteringNow?.opacity ?? 0,
        transform: enteringNow?.transform ?? `translateX(${direction * SLIDE_OFFSET}px)`,
      },
      { opacity: 1, transform: 'none' },
    ],
    options
  )
}

/** 进入「直接到位」状态，到下一帧再量一次（这时布局已稳定），之后的变化才播放动画 */
function beginSettling() {
  settling = true
  if (settleFrame !== undefined) cancelAnimationFrame(settleFrame)
  settleFrame = requestAnimationFrame(() => {
    settleFrame = undefined
    if (!props.active) return
    syncHeight()
    settling = false
  })
}

function stopSettling() {
  if (settleFrame !== undefined) cancelAnimationFrame(settleFrame)
  settleFrame = undefined
}

watch(
  [() => props.page, () => props.active],
  ([page, active], [previousPage, wasActive]) => {
    if (!active) {
      stopSettling()
      return
    }
    if (!wasActive) beginSettling()
    syncHeight()
    if (wasActive && page !== previousPage) slideBetween(previousPage, page)
  },
  { flush: 'post' }
)

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(syncHeight)
    if (firstContent.value) observer.observe(firstContent.value)
    if (secondContent.value) observer.observe(secondContent.value)
  }
  if (props.active) beginSettling()
  syncHeight()
})

onBeforeUnmount(() => {
  stopSettling()
  observer?.disconnect()
})
</script>

<template>
  <div
    ref="frame"
    class="panel-switcher"
    :data-current-page="page"
    :style="{ height: height === undefined ? undefined : `${height}px` }"
  >
    <div
      ref="firstPage"
      class="panel-switcher__page"
      data-page="1"
      :data-current="page === 1"
      :inert="!active || page !== 1"
      :aria-hidden="!active || page !== 1"
    >
      <div ref="firstContent" class="panel-switcher__content"><slot name="first" /></div>
    </div>
    <div
      ref="secondPage"
      class="panel-switcher__page"
      data-page="2"
      :data-current="page === 2"
      :inert="!active || page !== 2"
      :aria-hidden="!active || page !== 2"
    >
      <div ref="secondContent" class="panel-switcher__content"><slot name="second" /></div>
    </div>
  </div>
</template>
