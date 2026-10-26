<script setup lang="ts">
  /**
   * UnoCSS 图标，name 为图标类名（如 i-lucide:users），图标以遮罩画出、颜色取 currentColor。
   * size：数字或纯数字字符串按 px，也可以传带单位的长度，缺省与文字同高（1em）；
   * color：直接指定颜色（如品牌色）。尺寸与对齐的基础样式见 styles/base.scss。
   */
  const props = defineProps<{
    name: string;
    size?: number | string;
    color?: string;
  }>();

  const iconStyle = computed(() => {
    const style: Record<string, string> = {};
    const { size, color } = props;
    if (typeof size === 'number' || (typeof size === 'string' && /^\d+(?:\.\d+)?$/u.test(size))) {
      style.fontSize = `${size}px`;
    } else if (size) {
      style.fontSize = size;
    }
    if (color) style.color = color;
    return style;
  });
</script>

<template>
  <i class="app-icon" :class="name" :style="iconStyle" aria-hidden="true" />
</template>
