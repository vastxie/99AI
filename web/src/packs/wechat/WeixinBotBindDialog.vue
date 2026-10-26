<script setup lang="ts">
import { X } from '@lucide/vue'
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QrScanCard from '@/components/common/QrScanCard.vue'
import UiButton from '@/components/common/UiButton.vue'
import UiDialog from '@/components/common/UiDialog.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import { message } from '@/utils/message'
import { useWeixinBotScan } from './useWeixinBotScan'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'success'): void
}>()

const ms = message()
const { t } = useI18n()
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
let closeTimer: number | null = null

const scan = useWeixinBotScan({
  active: () => visible.value,
  onBound() {
    ms.success(t('settings.weixinBotBindSuccess'))
    // 留一秒让用户看到「绑定成功」再关
    closeTimer = window.setTimeout(() => {
      closeTimer = null
      visible.value = false
      emit('success')
    }, 1000)
  },
})

/** 绑定成功、还在等自动关闭时被关掉：照样通知成功，不留定时器去关掉下一次打开的弹窗 */
function settlePendingClose() {
  if (closeTimer === null) return
  window.clearTimeout(closeTimer)
  closeTimer = null
  emit('success')
}

watch(visible, open => {
  if (!open) settlePendingClose()
})

onBeforeUnmount(() => {
  if (closeTimer) window.clearTimeout(closeTimer)
})

function handleClose() {
  visible.value = false
}
</script>

<template>
  <Teleport to="body">
    <UiDialog
      :open="visible"
      class="relative w-[320px] max-w-[90vw] p-5"
      aria-labelledby="weixin-bot-bind-dialog-title"
      @close="handleClose"
    >
      <UiTooltip class="absolute right-3 top-3" :text="t('common.close')" placement="bottom">
        <UiButton icon :aria-label="t('common.close')" @click="handleClose">
          <X :size="20" />
        </UiButton>
      </UiTooltip>

      <div class="flex flex-col items-center pt-2">
        <h3 id="weixin-bot-bind-dialog-title" class="type-dialog-title mb-4">
          {{ t('settings.weixinBot') }}
        </h3>

        <QrScanCard
          class="weixin-bot-qr-card min-h-[232px] px-5 py-4"
          frame-class="weixin-bot-qr-frame"
          :qr-url="scan.qrUrl.value"
          :phase="scan.phase.value"
          :message="scan.message.value"
          :hint="t('settings.scanQrCodeWithWechat')"
          :confirming-text="t('settings.binding')"
          :done-text="t('settings.bindSuccess')"
          @refresh="scan.refresh"
        />
      </div>
    </UiDialog>
  </Teleport>
</template>

<style scoped>
:deep(.weixin-bot-qr-card) {
  border: 0;
  background: transparent;
}

:deep(.weixin-bot-qr-frame) {
  border: 0;
  background: var(--dialog-qr-paper-bg);
}
</style>
