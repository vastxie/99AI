<script lang="ts" setup>
import { t } from '@/locales'

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
  // 危险操作
  danger?: boolean
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
  danger: false,
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
  <button
    v-else
    type="button"
    :class="[
      'menu-item',
      'ds-focus-ring',
      {
        'menu-item-active': active,
        'menu-item-disabled': disabled,
        'menu-item-danger': danger,
      },
      className,
    ]"
    :disabled="disabled"
    @click="handleClick"
    role="menuitem"
    :aria-disabled="disabled"
    :aria-current="active ? 'true' : undefined"
  >
    <!-- 图标区域 -->
    <div v-if="icon || $slots.icon" class="menu-item-icon" aria-hidden="true">
      <slot name="icon">
        <img
          v-if="icon"
          :src="icon"
          :alt="t('common.menuItemIconAlt', { title })"
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
          class="menu-item-accessory w-4 h-4 text-inherit"
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
          class="menu-item-accessory w-4 h-4 text-inherit"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </slot>
    </div>
  </button>
</template>
