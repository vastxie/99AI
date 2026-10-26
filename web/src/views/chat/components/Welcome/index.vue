<script lang="ts" setup>
import { useViewport } from '@/hooks/useViewport'
import { useAuthStore } from '@/store/modules/auth'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { isMobile } = useViewport()
const { t } = useI18n()

const authStore = useAuthStore()
// 获取用户昵称
const nickname = computed(() => (authStore.userInfo as any)?.nickname || '')
// 根据时间获取问候语：简化为早/午/下午/晚 4 档，凌晨归入晚上
const greeting = computed(() => {
  const hour = new Date().getHours()
  let greetKey = 'chat.evening'

  if (hour >= 5 && hour < 11) greetKey = 'chat.morning'
  else if (hour >= 11 && hour < 13) greetKey = 'chat.noon'
  else if (hour >= 13 && hour < 18) greetKey = 'chat.afternoon'

  const greetText = t(greetKey)

  // 移动端短标题：宽度有限，品牌欢迎语不展示（logo 在文字左侧补位品牌）
  if (isMobile.value) {
    return nickname.value
      ? t('chat.greetingWithName', { greeting: greetText, name: nickname.value })
      : greetText
  }

  const site = authStore.globalConfig?.siteName || ''
  // 没配站点名：只问候，不留「欢迎使用」半句
  if (!site) {
    return nickname.value
      ? t('chat.greetingWithName', { greeting: greetText, name: nickname.value })
      : greetText
  }

  // 桌面端：品牌欢迎语并入标题；有昵称时一并问候
  if (nickname.value) {
    return t('chat.greetingWithNameWelcome', { greeting: greetText, name: nickname.value, site })
  }

  return t('chat.greetingWelcome', { greeting: greetText, site })
})
</script>

<template>
  <div class="chat-welcome flex select-none flex-col items-center text-center">
    <div class="flex items-center justify-center">
      <h1 class="chat-welcome-title">
        {{ greeting }}
      </h1>
    </div>
  </div>
</template>
