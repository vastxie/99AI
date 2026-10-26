<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'

import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import WechatIcon from './WechatIcon.vue'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useWeixinBotBindStatus } from './useWeixinBotBindStatus'

/** 账号页「账户安全」里的微信 Bot 绑定行：站点未开启微信 Bot 时不渲染 */
interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'open'): void
}>()

const authStore = useAuthStore()
const enabled = computed(() => Number(authStore.globalConfig?.weixinBotStatus) === 1)
const { bound, query, subscribe, unsubscribe } = useWeixinBotBindStatus()

watch(
  () => props.visible,
  visible => {
    if (visible && enabled.value && authStore.isLogin) void query()
  },
  { immediate: true }
)
onMounted(subscribe)
onBeforeUnmount(unsubscribe)
</script>

<template>
  <div v-if="enabled" class="flex items-center justify-between">
    <div class="flex items-center">
      <div>
        <div class="settings-field-title flex items-center">
          {{ t('settings.weixinConversation') }}
          <WechatIcon :size="16" class="text-text-muted ml-1" />
        </div>
        <div class="settings-field-description">
          {{ bound ? t('settings.weixinBotBoundStatus') : t('settings.notBound') }}
        </div>
      </div>
    </div>
    <UiButton variant="secondary" class="min-w-[4.25rem]" @click="emit('open')">
      {{ bound ? t('settings.manage') : t('common.bind') }}
    </UiButton>
  </div>
</template>
