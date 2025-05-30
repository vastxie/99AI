<script setup lang="ts">
import { useAuthStore } from '@/store'
import { computed } from 'vue'

const authStore = useAuthStore()
const isLogin = computed(() => authStore.isLogin)
const watermark = computed(() => {
  // 已登录状态
  const userId = authStore.userInfo.id
  const nickname = authStore.userInfo.nickname

  // 未登录状态
  if (!isLogin.value) {
    return `游客(${userId})`
  }
  // 如果有用户名，格式：username # 用户ID
  if (nickname) {
    return `${nickname}(${userId})`
  }

  // 如果没有用户名，格式：# 用户ID
  return `(${userId})`
})

function createWatermark() {
  if (!watermark.value) return ''

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  canvas.width = 240
  canvas.height = 180

  ctx.rotate((-20 * Math.PI) / 180)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
  ctx.font = '16px Arial'
  ctx.fillText(watermark.value, -20, 100)

  return `url(${canvas.toDataURL()})`
}
</script>

<template>
  <div
    v-if="watermark"
    class="fixed inset-0 pointer-events-none select-none z-50"
    :style="{
      backgroundImage: createWatermark(),
      backgroundRepeat: 'repeat',
    }"
  />
</template>
