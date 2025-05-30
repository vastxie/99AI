<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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
  // 触发器内容插槽名称
  trigger?: string
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
  // 点击外部是否关闭
  closeOnClickOutside?: boolean
  // 按下ESC是否关闭
  closeOnEscape?: boolean
  // z-index值
  zIndex?: number
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  position: 'bottom-left',
  maxHeight: '60vh',
  minWidth: '200px',
  disabled: false,
  menuClass: '',
  triggerClass: '',
  closeOnClickOutside: true,
  closeOnEscape: true,
  zIndex: 50,
})

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
    console.log('Auto position detection:', {
      triggerRect,
      viewportHeight,
      triggerCenterY,
      isTopHalf,
      verticalDirection,
      horizontalDirection,
      finalPosition: newPosition,
    })
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
  const baseClasses = ['menu-items', 'custom-scrollbar', positionClasses.value, props.menuClass]
  return baseClasses.filter(Boolean).join(' ')
})

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

// 处理ESC键关闭
function handleKeyDown(event: KeyboardEvent) {
  if (props.closeOnEscape && event.key === 'Escape' && isOpen.value) {
    close()
  }
}

// 监听菜单打开状态变化
watch(isOpen, (newValue, oldValue) => {
  if (newValue && !oldValue) {
    // 菜单从关闭变为打开时，重新检测位置
    if (props.position === 'auto') {
      // 使用nextTick确保DOM更新完成
      nextTick(() => {
        detectPosition()
      })
    }
    emit('open')
  } else if (!newValue && oldValue) {
    emit('close')
  }
})

// 生命周期钩子
onMounted(() => {
  if (props.closeOnClickOutside) {
    document.addEventListener('click', handleClickOutside)
  }
  if (props.closeOnEscape) {
    window.addEventListener('keydown', handleKeyDown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('keydown', handleKeyDown)
})

// 暴露方法给父组件
defineExpose({
  open,
  close,
  toggle: toggleMenu,
})
</script>

<template>
  <div class="menu relative">
    <!-- 触发器 -->
    <div
      ref="triggerRef"
      :class="['cursor-pointer', triggerClass, { 'opacity-50 cursor-not-allowed': disabled }]"
      @click="toggleMenu"
      role="button"
      :aria-expanded="isOpen"
      :aria-haspopup="true"
      :disabled="disabled"
    >
      <slot name="trigger" :isOpen="isOpen" :disabled="disabled">
        <button
          type="button"
          class="menu-button flex items-center px-3 py-2 text-sm font-medium rounded-lg bg-transparent hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-600 dark:text-gray-400"
          :disabled="disabled"
        >
          <span>点击展开菜单</span>
          <svg
            class="ml-2 w-4 h-4 transition-transform duration-200"
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
    <transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-show="isOpen"
        ref="menuRef"
        :class="menuClasses"
        :style="{
          maxHeight: maxHeight,
          minWidth: minWidth,
          zIndex: zIndex,
          overflowY: 'auto',
        }"
        role="menu"
        :aria-hidden="!isOpen"
      >
        <slot name="menu" :close="close" :isOpen="isOpen">
          <div>
            <div class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">请添加菜单内容</div>
          </div>
        </slot>
      </div>
    </transition>
  </div>
</template>
