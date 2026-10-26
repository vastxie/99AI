<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'

import { fetchUpdateInfoAPI } from '@/api'
import type { ResData } from '@/api/types'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { message as showMessage, notifyError } from '@/utils/message'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const authStore = useAuthStore()
const userInfo = computed(() => authStore.userInfo)
const customInstruction = ref('')
const instructionLength = computed(() => customInstruction.value.length)
const maxLength = 500
const saving = ref(false)
const instructionFieldId = 'personal-custom-instruction'
const instructionHelperId = 'personal-custom-instruction-helper'
const instructionErrorId = 'personal-custom-instruction-error'
const instructionTooLong = computed(() => instructionLength.value > maxLength)
const instructionDescriptionIds = computed(() =>
  instructionTooLong.value ? `${instructionHelperId} ${instructionErrorId}` : instructionHelperId
)

/**
 * 原值加载成功前不能编辑、保存或清空（否则会把空值存回去）；失败给出重试。
 * 每次打开记一个序号：关闭、重开或卸载后，旧请求的结果不再落地；用户动过内容（改回原值也算）就不再被覆盖
 */
const loadState = ref<'idle' | 'loading' | 'loaded' | 'error'>('idle')
const isLoaded = computed(() => loadState.value === 'loaded')
let openSeq = 0
let edited = false

async function refreshPersonalSettings() {
  const seq = ++openSeq
  edited = false
  loadState.value = 'loading'
  try {
    await authStore.getUserInfo()
    if (seq !== openSeq) return
    if (!edited) customInstruction.value = userInfo.value?.customInstruction || ''
    loadState.value = 'loaded'
  } catch {
    if (seq === openSeq) loadState.value = 'error'
  }
}

function markEdited() {
  edited = true
}

watch(
  () => props.visible,
  async newVal => {
    if (newVal && authStore.isLogin) {
      await refreshPersonalSettings()
    } else if (!newVal) {
      // 关闭：在途的加载作废
      openSeq += 1
      loadState.value = 'idle'
    }
  }
)

onMounted(async () => {
  if (props.visible && authStore.isLogin) {
    await refreshPersonalSettings()
  }
})

onBeforeUnmount(() => {
  openSeq += 1
})

async function handleSaveInstruction() {
  if (!isLoaded.value) return
  if (instructionTooLong.value) {
    showMessage().warning(t('settings.instructionLimitExceeded', { maxLength }))
    return
  }

  saving.value = true
  try {
    const res = (await fetchUpdateInfoAPI({
      customInstruction: customInstruction.value.trim(),
    })) as ResData

    if (res.success) {
      await authStore.getUserInfo()
      showMessage().success(t('settings.customInstructionSaved'))
    } else {
      showMessage().error(res.message || t('settings.saveFailed'))
    }
  } catch (error) {
    notifyError(error, t('settings.saveFailed'))
  } finally {
    saving.value = false
  }
}

function handleClearInstruction() {
  if (!isLoaded.value) return
  markEdited()
  customInstruction.value = ''
}
</script>

<template>
  <div>
    <div class="settings-card mb-4 p-4">
      <div class="settings-section-title mb-4 border-b border-app-divider pb-2">
        {{ t('common.personalSettings') }}
      </div>

      <div class="space-y-4">
        <div class="ds-form-field">
          <label class="settings-field-title ds-form-label" :for="instructionFieldId">
            {{ t('settings.customInstructionLabel') }}
          </label>
          <div class="relative">
            <textarea
              :id="instructionFieldId"
              v-model="customInstruction"
              :maxlength="maxLength"
              :placeholder="t('settings.customInstructionPlaceholder')"
              class="input input-md settings-input ds-form-control w-full resize-none"
              :class="{ 'ds-form-control-error': instructionTooLong }"
              rows="4"
              :aria-invalid="instructionTooLong ? 'true' : undefined"
              :aria-describedby="instructionDescriptionIds"
              :aria-busy="saving || loadState === 'loading' || undefined"
              :readonly="!isLoaded"
              @input="markEdited"
            ></textarea>
            <div class="type-caption absolute bottom-2 right-2 text-text-muted">
              {{ instructionLength }}/{{ maxLength }}
            </div>
          </div>
          <div :id="instructionHelperId" class="settings-field-description ds-form-helper">
            {{ loadState === 'loading' ? t('common.loading') : t('settings.aiWillAdjust') }}
          </div>
          <div v-if="loadState === 'error'" class="ds-form-helper ds-form-error" role="alert">
            {{ t('settings.customInstructionLoadFailed') }}
            <UiButton
              variant="secondary"
              type="button"
              class="ml-2"
              @click="refreshPersonalSettings"
            >
              {{ t('common.retry') }}
            </UiButton>
          </div>
          <div
            v-if="instructionTooLong"
            :id="instructionErrorId"
            class="ds-form-helper ds-form-error"
            role="alert"
          >
            {{ t('settings.instructionLimitExceeded', { maxLength }) }}
          </div>
        </div>

        <div class="ds-form-actions" aria-live="polite">
          <UiButton
            variant="primary"
            type="button"
            @click="handleSaveInstruction"
            :disabled="saving || instructionTooLong || !isLoaded"
            :aria-busy="saving || undefined"
          >
            <UiSpinner v-if="saving" size="sm" class="mr-2" />
            {{ saving ? t('settings.savingInstruction') : t('settings.saveInstruction') }}
          </UiButton>
          <UiButton
            variant="secondary"
            type="button"
            @click="handleClearInstruction"
            :disabled="saving || !isLoaded"
          >
            {{ t('settings.clear') }}
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>
