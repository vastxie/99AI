<script lang="ts" setup>
interface Props {
  // 是否激活状态
  active?: boolean
  // 是否禁用
  disabled?: boolean
  // 是否显示分割线
  divider?: boolean
  // 图标（支持URL或组件）
  icon?: string
  // 菜单项标题
  title?: string
  // 菜单项描述
  description?: string
  // 自定义样式类
  className?: string
  // 是否显示右箭头
  showArrow?: boolean
  // 菜单项尺寸
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  active: false,
  disabled: false,
  divider: false,
  icon: '',
  title: '',
  description: '',
  className: '',
  showArrow: false,
  size: 'md',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

function handleClick(event: MouseEvent) {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<template>
  <!-- 分割线 -->
  <div v-if="divider" class="menu-divider" role="separator" />

  <!-- 菜单项 -->
  <div
    v-else
    :class="[
      'menu-item',
      `menu-item-${size}`,
      {
        'menu-item-active': active,
        'menu-item-disabled': disabled,
      },
      className,
    ]"
    @click="handleClick"
    role="menuitem"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled"
  >
    <!-- 图标区域 -->
    <div v-if="icon || $slots.icon" class="menu-item-icon">
      <slot name="icon">
        <img
          v-if="icon"
          :src="icon"
          :alt="`${title}图标`"
          class="w-full h-full object-cover rounded-full"
        />
      </slot>
    </div>

    <!-- 内容区域 -->
    <div class="menu-item-content">
      <slot>
        <div v-if="title" class="menu-item-title">
          {{ title }}
        </div>
        <div v-if="description" class="menu-item-description">
          {{ description }}
        </div>
      </slot>
    </div>

    <!-- 右侧内容 -->
    <div v-if="$slots.suffix || showArrow || active" class="flex-shrink-0">
      <slot name="suffix">
        <!-- 激活状态的勾选图标 -->
        <svg
          v-if="active"
          class="w-4 h-4 text-primary-600 dark:text-primary-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fill-rule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clip-rule="evenodd"
          />
        </svg>
        <!-- 右箭头 -->
        <svg
          v-else-if="showArrow"
          class="w-4 h-4 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </slot>
    </div>
  </div>
</template>
