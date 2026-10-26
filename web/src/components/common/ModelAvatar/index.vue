<script lang="ts" setup>
import { t } from '@/locales'
import { isString } from '@/utils/is'
import { computed, ref, watchEffect } from 'vue'
import { getFallbackAvatar } from './fallbackAvatar'
import { getBuiltinModelAvatar, isSvgUrl, sanitizeSvg, shouldRenderSvg } from './modelIconRegistry'

interface Props {
  model?: string
  modelAvatar?: string
  modelName?: string
  size?: 'sm' | 'md' | 'lg'
}

const props = defineProps<Props>()

const remoteSvgContent = ref('')
const isLoadingSvg = ref(false)

const fetchSvgContent = async (content: string) => {
  if (!shouldRenderSvg(content)) {
    return
  }

  if (!isSvgUrl(content)) {
    remoteSvgContent.value = sanitizeSvg(content)
    return
  }

  try {
    isLoadingSvg.value = true
    const response = await fetch(content)

    if (!response.ok) throw new Error('Failed to fetch SVG')

    const svgText = await response.text()
    remoteSvgContent.value = sanitizeSvg(svgText)
  } catch (error) {
    remoteSvgContent.value = ''
  } finally {
    isLoadingSvg.value = false
  }
}

watchEffect(() => {
  const avatarUrl = props.modelAvatar

  if (avatarUrl && shouldRenderSvg(avatarUrl)) {
    fetchSvgContent(avatarUrl)
  } else {
    remoteSvgContent.value = ''
  }
})

const shouldUseSvgRender = computed(() => {
  const avatarUrl = props.modelAvatar

  return Boolean(avatarUrl && shouldRenderSvg(avatarUrl) && remoteSvgContent.value)
})

const builtinModelAvatar = computed(() => {
  return props.modelAvatar ? null : getBuiltinModelAvatar(props.model)
})

const builtinSvgContent = computed(() => {
  if (!builtinModelAvatar.value) return ''

  return sanitizeSvg(builtinModelAvatar.value.svg)
})

const builtinAvatarStyle = computed(() => ({
  minWidth: minWidthStyle.value,
}))

const sizeClasses = computed(() => {
  const sizeMap = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  }

  return sizeMap[props.size || 'md']
})

const iconSizeClasses = computed(() => {
  const iconSizeMap = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  return iconSizeMap[props.size || 'md']
})

const minWidthStyle = computed(() => {
  const size = props.size || 'md'

  if (size === 'sm') return '24px'
  if (size === 'lg') return '40px'

  return '32px'
})

const fallbackAvatar = computed(() => getFallbackAvatar(props.modelName, props.model))

const fallbackAvatarStyle = computed(() => ({
  minWidth: minWidthStyle.value,
  background: fallbackAvatar.value.background,
  color: fallbackAvatar.value.color,
  borderColor: fallbackAvatar.value.borderColor,
}))
</script>

<template>
  <!-- 优先级 1: 如果有 modelAvatar（包括远程 SVG），优先显示 -->
  <div
    v-if="shouldUseSvgRender"
    :class="[
      'model-avatar-shell inline-flex items-center justify-center rounded-full border-solid',
      sizeClasses,
    ]"
  >
    <div v-if="!isLoadingSvg" :class="iconSizeClasses" v-html="remoteSvgContent" />
    <!-- 加载中状态 -->
    <div v-else :class="[iconSizeClasses, 'model-avatar-loading animate-pulse rounded-full']"></div>
  </div>
  <!-- 优先级 2: 普通图片 URL（非 SVG） -->
  <img
    v-else-if="isString(modelAvatar) && modelAvatar.length > 0 && !isSvgUrl(modelAvatar)"
    :class="[
      'model-avatar-shell inline-flex items-center justify-center rounded-full border-solid object-cover',
      sizeClasses,
    ]"
    :src="modelAvatar"
    :alt="modelName || t('common.modelAvatar')"
  />
  <!-- 优先级 3: 内置 SVG 图标（仅当没有 modelAvatar 时） -->
  <div
    v-else-if="!modelAvatar && builtinSvgContent"
    :class="[
      'model-avatar-shell inline-flex items-center justify-center rounded-full border-solid flex-shrink-0',
      sizeClasses,
    ]"
    :style="builtinAvatarStyle"
    role="img"
    :aria-label="modelName || model || t('common.modelAvatar')"
  >
    <div :class="iconSizeClasses" v-html="builtinSvgContent" />
  </div>
  <!-- 优先级 4: 文字头像作为最终 fallback -->
  <div
    v-else
    :class="[
      'model-avatar-fallback select-none inline-flex items-center justify-center rounded-full border-solid font-semibold overflow-hidden flex-shrink-0',
      sizeClasses,
      size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-base',
    ]"
    :style="fallbackAvatarStyle"
  >
    {{ fallbackAvatar.label }}
  </div>
</template>
