<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { computed, ref } from 'vue'
import UiSpinner from '@/components/common/UiSpinner.vue'
import type { QrScanPhase } from '@/composables/useQrScanFlow'
import { t } from '@/locales'

/**
 * 二维码卡片：取码中转圈，过期或失败时二维码模糊并盖一个刷新键；下方的状态文字对读屏播报。
 * 状态与动作来自 useQrScanFlow。刷新键点下去就换成转圈：焦点先落到卡片上，不掉回页面开头。
 */
const props = defineProps<{
  qrUrl: string
  phase: QrScanPhase
  /** 失败原因（服务端给的） */
  message?: string
  /** 二维码图片的替代文字，也是等待扫码时的提示 */
  hint: string
  /** 扫码确认后收尾时的说明（正在登录、正在绑定） */
  confirmingText?: string
  /** 完成后的说明（绑定成功）；不给就保持等待扫码的提示 */
  doneText?: string
  frameClass?: string
}>()

const emit = defineEmits<{ refresh: [] }>()
const rootRef = ref<HTMLElement | null>(null)

function refresh() {
  rootRef.value?.focus()
  emit('refresh')
}

const isStale = computed(() => props.phase === 'expired' || props.phase === 'failed')
const statusText = computed(() => {
  switch (props.phase) {
    case 'loading':
      return t('login.qrLoading')
    case 'scanned':
      return t('login.qrScanned')
    case 'confirming':
      return props.confirmingText || t('settings.qrBinding')
    case 'done':
      return props.doneText || props.hint
    case 'expired':
      return t('login.qrExpiredRefresh')
    case 'failed':
      return props.message || t('login.qrFailedRefresh')
    default:
      return props.hint
  }
})
</script>

<template>
  <div ref="rootRef" class="qr-scan-card" tabindex="-1">
    <div
      class="qr-scan-frame relative mb-3 flex h-[168px] w-[168px] items-center justify-center"
      :class="frameClass"
    >
      <img
        v-if="qrUrl"
        class="qr-scan-image h-[156px] w-[156px] select-none rounded-[inherit] object-cover"
        :class="{ 'blur-sm opacity-60': isStale }"
        :src="qrUrl"
        :alt="hint"
        referrerpolicy="no-referrer"
      />
      <div v-else class="qr-scan-placeholder h-[156px] w-[156px] rounded-[inherit]" />
      <UiSpinner
        v-if="phase === 'loading'"
        size="lg"
        tone="link"
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      />
      <button
        v-if="isStale"
        type="button"
        class="qr-scan-overlay absolute inset-0 flex cursor-pointer items-center justify-center rounded-[inherit]"
        :aria-label="t('login.qrRefresh')"
        @click="refresh"
      >
        <RefreshCw :size="24" class="text-text-muted" aria-hidden="true" />
      </button>
    </div>
    <p class="type-control min-h-5 text-center text-text-muted" role="status" aria-live="polite">
      {{ statusText }}
    </p>
  </div>
</template>
