<script setup lang="ts">
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { resolvedClientThemeMode } from '@/utils/themeMode'
import { computed } from 'vue'

const authStore = useAuthStore()
const isLogin = computed(() => authStore.isLogin)
const watermark = computed(() => {
  // 已登录状态
  const userId = authStore.userInfo.id
  const nickname = authStore.userInfo.nickname

  // 游客、有昵称、没有昵称三种写法；括号随界面语言（中文全角、英文半角）
  if (!isLogin.value) return t('common.watermarkVisitor', { id: userId })
  if (nickname) return t('common.watermarkNamed', { name: nickname, id: userId })
  return t('common.watermarkId', { id: userId })
})

/** 水印图案：文字颜色取主题的 --watermark-text，切换明暗时重画 */
const backgroundImage = computed(() => {
  void resolvedClientThemeMode.value
  return createWatermark()
})

function createWatermark() {
  if (!watermark.value) return ''

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  canvas.width = 240
  canvas.height = 180

  ctx.rotate((-20 * Math.PI) / 180)
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue('--watermark-text')
    .trim()
  ctx.font = '16px Arial'
  ctx.fillText(watermark.value, -20, 100)

  return `url(${canvas.toDataURL()})`
}
</script>

<template>
  <div
    v-if="watermark"
    class="fixed inset-0 pointer-events-none select-none z-watermark"
    :style="{
      backgroundImage,
      backgroundRepeat: 'repeat',
    }"
  />
</template>
