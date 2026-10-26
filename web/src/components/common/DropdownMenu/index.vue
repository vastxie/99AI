<script lang="ts" setup>
import { registerFloatingLayer } from '@/composables/useDialogA11y'
import { t } from '@/locales'
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'

// 定义位置类型，添加auto选项
type Position =
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center'
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'auto'

interface Props {
  // 菜单是否打开
  modelValue?: boolean
  // 触发方式：click 或 hover
  trigger?: 'click' | 'hover'
  // 菜单位置
  position?: Position
  // 最大高度
  maxHeight?: string
  // 最小宽度
  minWidth?: string
  // 是否禁用
  disabled?: boolean
  // 自定义菜单样式类
  menuClass?: string
  // 自定义触发器样式类
  triggerClass?: string
  // 可把浮层锚定到触发器所在容器，而不是按钮本身（如组合输入框）。
  anchorSelector?: string
  matchAnchorWidth?: boolean
  // 点击外部是否关闭
  closeOnClickOutside?: boolean
  // 按下ESC是否关闭
  closeOnEscape?: boolean
  // 是否把菜单浮层挂载到 body，避免被父容器 overflow 裁切。
  // 挂到 body 的菜单用 --z-menu-overlay（盖过弹窗、侧栏抽屉与底部面板），否则用 --z-dropdown
  teleport?: boolean
  // 悬停延迟时间（毫秒）
  hoverDelay?: number
  // 悬停离开后自动关闭的延迟时间（毫秒），0 表示不自动关闭
  hoverCloseDelay?: number
  // 浮层内容语义：普通菜单使用 menu；包含滑杆等复合控件时使用 dialog
  contentRole?: 'menu' | 'dialog'
  // dialog 模式应提供可访问名称；普通菜单可按需传入
  contentAriaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  trigger: 'click',
  position: 'bottom-left',
  maxHeight: '60vh',
  minWidth: '10rem',
  disabled: false,
  menuClass: '',
  triggerClass: '',
  anchorSelector: '',
  matchAnchorWidth: false,
  closeOnClickOutside: true,
  closeOnEscape: true,
  teleport: false,
  hoverDelay: 150,
  hoverCloseDelay: 0,
  contentRole: 'menu',
  contentAriaLabel: '',
})

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  open: []
  close: []
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const menuRef = ref<HTMLElement>()
const triggerRef = ref<HTMLElement>()
const floatingStyle = ref<CSSProperties>({})
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let menuResizeObserver: ResizeObserver | null = null
let openFocusIntent: 'keyboard' | 'pointer' | 'programmatic' = 'programmatic'
const instanceId = getCurrentInstance()?.uid ?? 0
const triggerId = `dropdown-trigger-${instanceId}`
const menuId = `dropdown-menu-${instanceId}`

// 自动检测位置的响应式变量
const autoPosition = ref<Exclude<Position, 'auto'>>('bottom-left')

// 检测位置函数
const detectPosition = () => {
  if (props.position !== 'auto' || !triggerRef.value) return

  const triggerRect = triggerRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight

  // 计算触发器相对于视口的垂直位置
  const triggerCenterY = triggerRect.top + triggerRect.height / 2

  // 只检测垂直方向：如果触发器在屏幕上半部分，向下展开；否则向上展开
  const isTopHalf = triggerCenterY < viewportHeight / 2
  const verticalDirection = isTopHalf ? 'bottom' : 'top'

  // 水平方向固定使用right对齐
  const horizontalDirection = 'right'

  // 组合最终位置
  const newPosition = `${verticalDirection}-${horizontalDirection}` as Exclude<Position, 'auto'>
  autoPosition.value = newPosition

  // 添加调试信息（开发时可用）
  if (process.env.NODE_ENV === 'development') {
  }
}

// 计算最终位置
const finalPosition = computed(() => {
  if (props.position === 'auto') {
    return autoPosition.value
  }
  return props.position || 'bottom-left'
})

// 计算位置样式类，使用finalPosition而不是props.position
const positionClasses = computed(() => {
  const position = finalPosition.value
  const classes = {
    'bottom-left': 'menu-items-bottom',
    'bottom-right': 'menu-items-bottom menu-items-right-aligned',
    'bottom-center': 'menu-items-bottom menu-items-center',
    'top-left': 'menu-items-top',
    'top-right': 'menu-items-top menu-items-right-aligned',
    'top-center': 'menu-items-top menu-items-center',
  }
  return classes[position] || classes['bottom-left']
})

// 菜单样式类 - 使用全局CSS类
const menuClasses = computed(() => {
  const baseClasses = [
    'menu-items',
    'custom-scrollbar',
    props.teleport ? '' : positionClasses.value,
    props.menuClass,
  ]
  return baseClasses.filter(Boolean).join(' ')
})

/** 出现动画的放大原点：菜单在触发器下方就从上沿长出来，在上方就从下沿长出来（浮层定位后以实际方向为准） */
const menuOrigin = computed(() => {
  const [side, align] = finalPosition.value.split('-')
  return `${side === 'top' ? 'bottom' : 'top'} ${align === 'right' ? 'right' : align === 'center' ? 'center' : 'left'}`
})

const menuStyle = computed<CSSProperties>(() => ({
  maxHeight: props.maxHeight,
  minWidth: props.minWidth,
  zIndex: props.teleport ? 'var(--z-menu-overlay)' : 'var(--z-dropdown)',
  overflowY: 'auto',
  boxSizing: 'border-box',
  padding: '0px',
  transformOrigin: menuOrigin.value,
  ...(props.teleport ? floatingStyle.value : {}),
}))

const triggerProps = computed(() => ({
  id: triggerId,
  'aria-haspopup': props.contentRole,
  'aria-expanded': isOpen.value,
  'aria-controls': menuId,
  'aria-disabled': props.disabled || undefined,
  disabled: props.disabled,
}))

function floatingAnchor() {
  return (
    (props.anchorSelector && triggerRef.value?.closest(props.anchorSelector)) || triggerRef.value
  )
}

function updateFloatingPosition() {
  if (!props.teleport || !triggerRef.value) return

  const rect = floatingAnchor()!.getBoundingClientRect()
  const position = finalPosition.value
  const gap = 8
  const viewportGap = 8
  const isTop = position.startsWith('top')
  const isRight = position.endsWith('right')
  const isCenter = position.endsWith('center')
  const menuWidth = props.matchAnchorWidth
    ? Math.min(rect.width, window.innerWidth - viewportGap * 2)
    : menuRef.value?.offsetWidth || parseFloat(props.minWidth) || 200
  const menuHeight = menuRef.value?.offsetHeight || 0
  const maxLeft = Math.max(viewportGap, window.innerWidth - viewportGap - menuWidth)

  let left = rect.left
  if (isRight) {
    left = rect.right - menuWidth
  } else if (isCenter) {
    left = rect.left + rect.width / 2 - menuWidth / 2
  }
  left = clampNumber(left, viewportGap, maxLeft)

  let anchoredAbove = isTop
  let top = isTop ? rect.top - gap - menuHeight : rect.bottom + gap
  if (!isTop && menuHeight > 0 && top + menuHeight > window.innerHeight - viewportGap) {
    anchoredAbove = true
    top = rect.top - gap - menuHeight
  }
  const maxTop = Math.max(viewportGap, window.innerHeight - viewportGap - menuHeight)
  const unclampedTop = top
  top = clampNumber(unclampedTop, viewportGap, maxTop)
  // Anchor the bottom edge directly while height animates; don't chase it with
  // rounded offsetHeight readings on every ResizeObserver delivery.
  const useBottomAnchor = anchoredAbove && top === unclampedTop

  const style: CSSProperties = {
    ...(props.matchAnchorWidth ? { width: `${menuWidth}px`, maxWidth: `${menuWidth}px` } : {}),
    position: 'fixed',
    right: 'auto',
    bottom: useBottomAnchor ? `${window.innerHeight - rect.top + gap}px` : 'auto',
    left: `${left}px`,
    top: useBottomAnchor ? 'auto' : `${top}px`,
    transformOrigin: `${top < rect.top ? 'bottom' : 'top'} ${
      isCenter ? 'center' : isRight ? 'right' : 'left'
    }`,
  }

  floatingStyle.value = style
}

// 切换菜单状态
const toggleMenu = () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

// 打开菜单
function open() {
  if (props.disabled) return
  isOpen.value = true
}

// 关闭菜单
function close() {
  isOpen.value = false
}

// 处理点击触发器
const handleTriggerClick = (event: MouseEvent) => {
  if (props.trigger === 'click') {
    if (!isOpen.value && event.detail > 0) openFocusIntent = 'pointer'
    toggleMenu()
  }
  // hover 模式下不处理点击
}

function handleTriggerKeyDown(event: KeyboardEvent) {
  if (props.trigger !== 'click' || props.disabled || isOpen.value) return
  if (event.key === 'Enter' || event.key === ' ') openFocusIntent = 'keyboard'
}

// 处理鼠标进入
const handleMouseEnter = () => {
  if (props.disabled || props.trigger !== 'hover') return

  // 清除之前的定时器
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }

  // 延迟打开菜单
  hoverTimer = setTimeout(() => {
    open()
  }, props.hoverDelay)
}

// 处理鼠标离开
const handleMouseLeave = () => {
  if (props.trigger !== 'hover') return

  // 清除打开定时器
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }

  // 如果设置了悬停关闭延迟，则延迟关闭
  if (props.hoverCloseDelay > 0) {
    hoverTimer = setTimeout(() => {
      close()
    }, props.hoverCloseDelay)
  }
  // 否则不自动关闭，只通过点击外部关闭
}

// 处理点击外部关闭菜单
function handleClickOutside(event: MouseEvent) {
  if (!props.closeOnClickOutside || !isOpen.value) return

  const target = event.target as Node
  const menuElement = menuRef.value
  const triggerElement = triggerRef.value

  if (
    menuElement &&
    triggerElement &&
    !menuElement.contains(target) &&
    !triggerElement.contains(target)
  ) {
    close()
  }
}

// ARIA 中 menuitem / menuitemradio / menuitemcheckbox 同属菜单项。
// 滑杆、输入框等复合控件必须改用 contentRole="dialog"，避免混用 menu 键盘模型。
const MENU_ITEM_SELECTOR = '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]'

// 收集当前可聚焦的菜单项（跳过 disabled 项）
function getEnabledMenuItems(): HTMLElement[] {
  const menu = menuRef.value
  if (!menu) return []
  return Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
    item =>
      !item.hasAttribute('disabled') &&
      item.getAttribute('aria-disabled') !== 'true' &&
      !item.closest('[inert], [aria-hidden="true"]')
  )
}

// 把焦点归还给触发器（优先触发器内第一个可聚焦元素）
function focusTrigger() {
  const trigger = triggerRef.value
  if (!trigger) return
  const focusable = trigger.querySelector<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )
  ;(focusable ?? trigger).focus()
}

function focusFirstDialogControl() {
  if (props.contentRole !== 'dialog') return
  const firstControl = menuRef.value?.querySelector<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  firstControl?.focus()
}

function focusFirstMenuItem() {
  if (props.contentRole !== 'menu' || openFocusIntent !== 'keyboard') return
  getEnabledMenuItems()[0]?.focus()
}

function observeMenuSize() {
  if (!props.teleport || typeof ResizeObserver === 'undefined' || !menuRef.value) return
  menuResizeObserver ??= new ResizeObserver(() => {
    if (isOpen.value) updateFloatingPosition()
  })
  menuResizeObserver.observe(menuRef.value)
  const anchor = floatingAnchor()
  if (anchor) menuResizeObserver.observe(anchor)
}

// 菜单键盘交互：Esc 关闭并归还焦点；ArrowUp/ArrowDown 循环移动；Home/End 跳首尾；
// Enter/Space 触发当前项；Tab 收起菜单并把焦点交还触发器
function handleKeyDown(event: KeyboardEvent) {
  if (!isOpen.value) return

  const active = document.activeElement as HTMLElement | null
  const inMenu = !!(active && menuRef.value?.contains(active))
  const inTrigger = !!(active && triggerRef.value?.contains(active))

  if (event.key === 'Escape') {
    if (!props.closeOnEscape) return
    const shouldRestoreFocus = !active || active === document.body || inMenu
    // 本组件监听在 document 捕获阶段，外层弹窗（useDialogA11y）监听在 document 冒泡阶段：
    // 这里必须阻断事件继续传播，否则一次 Esc 会同时关掉菜单和外层弹窗。
    // defaultPrevented 同时作为兜底，覆盖事件直接派发到 document 时两个监听同级触发的场景。
    event.preventDefault()
    event.stopPropagation()
    close()
    if (shouldRestoreFocus) focusTrigger()
    return
  }

  // dialog / popover 允许按钮、滑杆等控件按原生 Tab 与方向键语义工作；
  // DropdownMenu 只负责 Escape 与点击外部关闭，不套用 menu 的 roving-focus 规则。
  if (props.contentRole === 'dialog') return

  // 菜单虽处于打开态，但焦点不在菜单 / 触发器内时不接管键盘。
  // 业务侧可能强制把菜单常开（如朗读播放期间的「更多」菜单），此时用户的焦点在页面
  // 其他位置甚至落回 body，劫持方向键会吞掉滚动并把焦点强行拉进菜单。
  if (!inMenu && !inTrigger) return

  if (event.key === 'Tab') {
    // 焦点仍在触发器或已经进入菜单时，Tab 都应收起菜单；不 preventDefault，
    // 由浏览器（或外层弹窗的焦点陷阱）从触发器继续正常的顺序移动。
    if (inMenu) {
      close()
      focusTrigger()
    } else if (inTrigger) {
      close()
    }
    return
  }

  const isNavKey = ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
  const isActivateKey = event.key === 'Enter' || event.key === ' '
  if (!isNavKey && !isActivateKey) return

  if (isActivateKey) {
    // 原生 button / a 自带 Enter、Space 激活；只为自定义元素的 menuitem 合成点击
    const item = inMenu ? active?.closest<HTMLElement>(MENU_ITEM_SELECTOR) : null
    if (item && !['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(item.tagName)) {
      event.preventDefault()
      item.click()
    }
    return
  }

  const items = getEnabledMenuItems()
  // 菜单内没有任何可导航项时保持按键原样（不 preventDefault），避免吞掉页面滚动
  if (!items.length) return

  event.preventDefault()
  const currentItem = active?.closest<HTMLElement>(MENU_ITEM_SELECTOR)
  const currentIndex = currentItem ? items.indexOf(currentItem) : -1

  let nextIndex: number
  if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = items.length - 1
  } else if (event.key === 'ArrowDown') {
    nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
  } else {
    nextIndex =
      currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length
  }
  items[nextIndex]?.focus()
}

// 打开期间向弹窗 a11y 层登记为「外部浮层」：菜单可能 Teleport 到 body，
// 外层弹窗按 DOM 包含关系会把它误判成弹窗外，导致 Esc 一次关两层、Tab 把焦点拉走
let releaseFloatingLayer: (() => void) | null = null

function acquireFloatingLayer() {
  if (releaseFloatingLayer) return
  releaseFloatingLayer = registerFloatingLayer({
    getRoot: () => menuRef.value ?? null,
    handlesEscape: () => props.closeOnEscape,
  })
}

function releaseFloatingLayerIfNeeded() {
  releaseFloatingLayer?.()
  releaseFloatingLayer = null
}

// 监听菜单打开状态变化
watch(isOpen, (newValue, oldValue) => {
  if (newValue && !oldValue) {
    acquireFloatingLayer()
    // 菜单从关闭变为打开时，重新检测位置
    if (props.position === 'auto') {
      // 使用nextTick确保DOM更新完成
      nextTick(() => {
        detectPosition()
        updateFloatingPosition()
        observeMenuSize()
        focusFirstDialogControl()
        focusFirstMenuItem()
        openFocusIntent = 'programmatic'
      })
    } else {
      nextTick(() => {
        updateFloatingPosition()
        observeMenuSize()
        focusFirstDialogControl()
        focusFirstMenuItem()
        openFocusIntent = 'programmatic'
      })
    }
    emit('open')
  } else if (!newValue && oldValue) {
    releaseFloatingLayerIfNeeded()
    // 关闭瞬间焦点仍在菜单内（键盘选中菜单项、调用方主动 close 等）时归还触发器：
    // 菜单隐藏后浏览器会把焦点丢回 <body>，键盘用户将丢失位置。
    // 焦点已被用户移到别处（点击外部关闭）时不抢焦点。
    const active = document.activeElement
    if (active && menuRef.value?.contains(active)) focusTrigger()
    emit('close')
  }
})

// 生命周期钩子
onMounted(() => {
  if (props.closeOnClickOutside) {
    // 会话行等业务容器会 click.stop；捕获阶段仍能关闭上一个菜单。
    document.addEventListener('click', handleClickOutside, true)
  }
  // 键盘导航需要常驻监听；Escape 行为在 handleKeyDown 内按 closeOnEscape 判断。
  // 挂在 document 捕获阶段：外层弹窗的 Esc / Tab 监听在 document 冒泡阶段，
  // 只有先于它拿到事件，菜单才能在弹窗之前消费 Esc 并阻断传播。
  document.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('resize', updateFloatingPosition)
  window.addEventListener('scroll', updateFloatingPosition, true)
  if (isOpen.value) {
    acquireFloatingLayer()
    nextTick(() => {
      observeMenuSize()
      focusFirstDialogControl()
    })
  }
})

onBeforeUnmount(() => {
  releaseFloatingLayerIfNeeded()
  menuResizeObserver?.disconnect()
  menuResizeObserver = null
  document.removeEventListener('click', handleClickOutside, true)
  if (hoverTimer) clearTimeout(hoverTimer)
  document.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('resize', updateFloatingPosition)
  window.removeEventListener('scroll', updateFloatingPosition, true)
})

// 暴露方法给父组件
defineExpose({
  open,
  close,
  toggle: toggleMenu,
})
</script>

<template>
  <div class="menu relative" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <!-- 触发器 -->
    <div
      ref="triggerRef"
      :class="['cursor-pointer', triggerClass, { 'menu-trigger-disabled': disabled }]"
      @click="handleTriggerClick"
      @keydown="handleTriggerKeyDown"
    >
      <slot name="trigger" :isOpen="isOpen" :disabled="disabled" :triggerProps="triggerProps">
        <button v-bind="triggerProps" type="button" class="menu-button menu-trigger">
          <span>{{ t('common.expandMenu') }}</span>
          <svg
            class="ml-2 w-4 h-4 transition-transform duration-md motion-reduce:transition-none"
            :class="{ 'rotate-180': isOpen }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </slot>
    </div>

    <!-- 菜单内容 -->
    <Teleport :disabled="!teleport" to="body">
      <transition name="menu-pop">
        <div
          v-show="isOpen"
          :id="menuId"
          ref="menuRef"
          :class="menuClasses"
          :style="menuStyle"
          :data-position="finalPosition"
          :role="contentRole"
          :aria-label="contentAriaLabel || undefined"
          :inert="!isOpen"
        >
          <slot name="menu" :close="close" :isOpen="isOpen">
            <div>
              <div class="px-4 py-2 text-sm text-text-secondary">
                {{ t('common.addMenuContent') }}
              </div>
            </div>
          </slot>
        </div>
      </transition>
    </Teleport>
  </div>
</template>
