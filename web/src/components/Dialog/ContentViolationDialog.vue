<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'
import UiDialog from '@/components/common/UiDialog.vue'

import { useGlobalStoreWithOut } from '@/store/modules/global'
import { t } from '@/locales'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const useGlobalStore = useGlobalStoreWithOut()

const INITIAL_COUNTDOWN = 15
const dialogTitleId = 'bad-words-dialog-title'
const dialogDescriptionId = 'bad-words-dialog-description'

// 倒计时 15 秒
const countdown = ref(INITIAL_COUNTDOWN)
// 倒计时结束标志
const isCountdownFinished = ref(false)
const countdownTimer = ref<ReturnType<typeof setInterval> | null>(null)

const acknowledgeButtonText = computed(() =>
  isCountdownFinished.value
    ? t('contentViolation.understood')
    : t('contentViolation.waitSeconds', { seconds: countdown.value })
)

function clearCountdownTimer() {
  if (countdownTimer.value) {
    clearInterval(countdownTimer.value)
    countdownTimer.value = null
  }
}

function startCountdown() {
  clearCountdownTimer()
  countdown.value = INITIAL_COUNTDOWN
  isCountdownFinished.value = false

  countdownTimer.value = setInterval(() => {
    if (countdown.value <= 1) {
      countdown.value = 0
      // 倒计时结束
      isCountdownFinished.value = true
      clearCountdownTimer()
      return
    }

    countdown.value -= 1
  }, 1000)
}

function handleAgree() {
  if (isCountdownFinished.value) {
    useGlobalStore.updateContentViolationDialog(false)
    countdown.value = INITIAL_COUNTDOWN
    isCountdownFinished.value = false
    clearCountdownTimer()
  }
}

// 监听 props.visible 的变化，当其变为 true 时重新启动倒计时
watch(
  () => props.visible,
  newVal => {
    if (newVal) {
      startCountdown()
      return
    }

    clearCountdownTimer()
    countdown.value = INITIAL_COUNTDOWN
    isCountdownFinished.value = false
  },
  { immediate: true }
)

onBeforeUnmount(clearCountdownTimer)
</script>

<template>
  <!-- 强制阅读弹窗：Esc 与遮罩点击都不关闭（不绕过倒计时确认），只接入焦点陷阱与焦点返回 -->
  <UiDialog
    :open="props.visible"
    layer="critical"
    overlay-class="px-2"
    :close-on-backdrop="false"
    :close-on-esc="false"
    class="w-full max-w-3xl max-h-[80vh] p-4"
    :aria-labelledby="dialogTitleId"
    :aria-describedby="dialogDescriptionId"
  >
    <!-- 显示用户协议标题 -->
    <div class="flex justify-between items-center mb-3">
      <span :id="dialogTitleId" class="type-dialog-title">
        {{ t('contentViolation.title') }}
      </span>
    </div>

    <div :id="dialogDescriptionId" class="flex-1 overflow-y-auto custom-scrollbar">
      <p class="text-text-secondary">{{ t('contentViolation.description') }}</p>
      <p class="text-text-secondary">
        {{ t('contentViolation.riskNotice') }}
      </p>
    </div>

    <!-- 倒计时和同意按钮 -->
    <div class="flex justify-end mt-3">
      <UiButton
        variant="primary"
        type="button"
        :disabled="!isCountdownFinished"
        @click="handleAgree"
        class="w-[156px] justify-center whitespace-nowrap tabular-nums"
        aria-live="polite"
      >
        <span>{{ acknowledgeButtonText }}</span>
      </UiButton>
    </div>
  </UiDialog>
</template>
