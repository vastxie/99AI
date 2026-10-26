<script setup lang="ts">
import { computed, useAttrs } from 'vue'

type SpinnerSizePreset = 'sm' | 'md' | 'lg'

/** 预设尺寸（px）：sm 按钮内联 16，md 状态行 20，lg 二维码 / 面板遮罩 32 */
const SIZE_PRESETS: Record<SpinnerSizePreset, number> = { sm: 16, md: 20, lg: 32 }

const toneClasses = {
  current: '',
  link: 'ui-spinner-link',
  inverse: 'ui-spinner-inverse',
} as const

/**
 * 统一加载指示（环形）。环形与色调样式在 styles/components.css，
 * 旋转与减弱动效规则在 styles/motion.css；颜色只跟随 currentColor 或语义 token。
 */
const props = withDefaults(
  defineProps<{
    /** 预设 sm / md / lg，或像素数 */
    size?: SpinnerSizePreset | number
    /** current 继承所在文字色；link 链接 / 强调色；inverse 强调底色上的反白 */
    tone?: keyof typeof toneClasses
  }>(),
  { size: 'sm', tone: 'current' }
)

const attrs = useAttrs()

const pixelSize = computed(() =>
  typeof props.size === 'number' ? props.size : SIZE_PRESETS[props.size]
)

const style = computed(() => ({
  '--ui-spinner-size': `${pixelSize.value}px`,
  '--ui-spinner-stroke': pixelSize.value > 32 ? '3px' : '2px',
}))

/** 调用方给出 role / aria-label 时按其语义暴露；否则视为纯装饰，加载语义由容器（role="status" / aria-busy）承载 */
function hasAccessibleName() {
  return 'role' in attrs || 'aria-label' in attrs || 'aria-labelledby' in attrs
}
</script>

<template>
  <span
    class="ui-spinner"
    :class="toneClasses[tone]"
    :style="style"
    :aria-hidden="hasAccessibleName() ? undefined : 'true'"
  />
</template>
