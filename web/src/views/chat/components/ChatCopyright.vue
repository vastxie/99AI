<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/store/modules/auth'

const { t } = useI18n()
const authStore = useAuthStore()
const globalConfig = computed(() => authStore.globalConfig)
</script>

<template>
  <!-- 仅桌面端空状态展示；绝对定位在主画布内，避免覆盖侧栏底部账号入口 -->
  <div
    class="chat-copyright-surface absolute bottom-0 left-0 z-content flex h-14 w-full items-center justify-center"
  >
    <div class="text-sm text-text-muted max-h-6 flex justify-center items-center">
      {{ t('chat.aiGeneratedDisclaimer') }}
      <span v-if="globalConfig?.companyName"> © {{ globalConfig?.companyName }}</span>
      <span v-if="globalConfig?.filingNumber" class="ml-2">
        <a
          class="fg-quiet transition-colors duration-sm"
          href="https://beian.miit.gov.cn"
          target="_blank"
        >
          {{ globalConfig?.filingNumber }}
        </a>
      </span>
      <span v-if="globalConfig?.publicSecurityFilingNumber" class="ml-2">
        <img
          src="/images/gongan-icon.png"
          :alt="t('common.publicSecurityIcon')"
          class="inline-block w-4 h-4 mr-1"
        />
        <a
          class="fg-quiet transition-colors duration-sm"
          href="http://www.beian.gov.cn/portal/registerSystemInfo"
          target="_blank"
        >
          {{ globalConfig?.publicSecurityFilingNumber }}
        </a>
      </span>
    </div>
  </div>
</template>
