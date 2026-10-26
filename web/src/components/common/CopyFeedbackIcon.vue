<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'

/**
 * 复制按钮里的图标：平时是复制图标，复制成功后换成对勾。
 * 平时只渲染一个图标；切换的一瞬间新旧两个图标在同一格里交叉淡变（样式见 styles/motion.css），
 * 外框按图标尺寸固定，切换不改变按钮大小。纯装饰，按钮自己提供无障碍名称。
 */
withDefaults(defineProps<{ copied?: boolean; size?: number }>(), {
  copied: false,
  size: 16,
})
</script>

<template>
  <span
    class="copy-feedback"
    :data-copied="copied"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <Transition name="copy-feedback">
      <Check
        v-if="copied"
        key="copied"
        class="copy-feedback__icon"
        data-icon="check"
        :size="size"
        :stroke-width="2.25"
      />
      <Copy v-else key="idle" class="copy-feedback__icon" data-icon="copy" :size="size" />
    </Transition>
  </span>
</template>
