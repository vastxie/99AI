<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { fetchCaptchaBindAPI, fetchCaptchaSendBindCodeAPI } from '@/api/user'
import UiButton from '@/components/common/UiButton.vue'
import UiField from '@/components/common/UiField.vue'
import { useCountdown } from '@/composables/useCountdown'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { focusFirstInvalidField } from '@/utils/focus'
import { message, reasonOf } from '@/utils/message'
import SettingsSubViewHeader from '../SettingsSubViewHeader.vue'

/**
 * 通用的「验证码绑定联系方式」视图：邮箱 / 手机号等验证码渠道共用。
 * 字段缺失与服务端拒绝的原因都显示在表单里（请求层不再另弹 toast）。
 */
interface Props {
  provider: string
  displayName: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  back: []
  done: []
}>()

const authStore = useAuthStore()
const globalStore = useGlobalStoreWithOut()
const ms = message()
const globalConfig = computed(() => authStore.globalConfig)
const needAgreement = computed(() => Number(globalConfig.value.isAutoOpenAgreement) === 1)

const formRef = ref<HTMLElement | null>(null)
const form = ref({ contact: '', code: '' })
const errors = ref({ contact: '', code: '', form: '' })
const sending = ref(false)
const submitting = ref(false)
const { remaining: countdown, start: startCountdown } = useCountdown()

function openAgreement() {
  globalStore.updateUserAgreementDialog(true)
}

async function sendCode() {
  errors.value = { contact: '', code: '', form: '' }
  const contact = form.value.contact.trim()
  if (!contact) {
    errors.value.contact = t('settings.enterContactFor', { name: props.displayName })
    await nextTick()
    focusFirstInvalidField(formRef.value)
    return
  }
  if (countdown.value > 0 || sending.value) return
  sending.value = true
  try {
    const res = await fetchCaptchaSendBindCodeAPI({ contact }, { silentError: true })
    if (res.success) {
      ms.success(res.data || t('common.verificationCodeSentSuccess'))
      startCountdown()
    } else {
      errors.value.form = res.message || t('settings.sendCodeFailed')
    }
  } catch (error) {
    errors.value.form = reasonOf(error, t('settings.sendCodeFailedRetry'))
  } finally {
    sending.value = false
  }
}

async function submit() {
  if (submitting.value) return
  errors.value = { contact: '', code: '', form: '' }
  const contact = form.value.contact.trim()
  const code = form.value.code.trim()
  if (!contact) errors.value.contact = t('settings.enterContactFor', { name: props.displayName })
  if (!code) errors.value.code = t('settings.enterVerificationCode')
  if (errors.value.contact || errors.value.code) {
    await nextTick()
    focusFirstInvalidField(formRef.value)
    return
  }
  submitting.value = true
  try {
    const res = await fetchCaptchaBindAPI({ contact, code }, { silentError: true })
    if (res.success) {
      ms.success(t('settings.bindSuccess'))
      emit('done')
    } else {
      errors.value.form = res.message || t('settings.bindFailed')
    }
  } catch (error) {
    errors.value.form = reasonOf(error, t('settings.bindFailed'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-2">
    <div class="settings-card mb-4 p-4">
      <SettingsSubViewHeader
        :title="t('settings.bindMethod', { name: displayName })"
        @back="emit('back')"
      />
      <form ref="formRef" class="space-y-4" novalidate @submit.prevent="submit">
        <UiField :label="displayName" :error="errors.contact" v-slot="{ control }">
          <input
            v-model="form.contact"
            v-bind="control"
            class="input input-md w-full"
            :placeholder="t('settings.enterContactFor', { name: displayName })"
          />
        </UiField>
        <UiField :label="t('settings.verificationCode')" :error="errors.code" v-slot="{ control }">
          <div class="input input-md flex w-full items-center overflow-hidden !px-0">
            <input
              v-model="form.code"
              v-bind="control"
              inputmode="numeric"
              autocomplete="one-time-code"
              class="type-control min-w-0 flex-1 bg-transparent px-3 text-text-secondary outline-none placeholder:text-text-muted"
              :placeholder="t('settings.enterVerificationCode')"
            />
            <div class="h-5 w-px flex-shrink-0 bg-app-border"></div>
            <button
              type="button"
              class="settings-inline-action flex-shrink-0 whitespace-nowrap px-3 disabled:cursor-not-allowed"
              :disabled="sending || countdown > 0"
              :aria-busy="sending || undefined"
              @click="sendCode"
            >
              {{
                countdown > 0
                  ? t('settings.getAgainAfterSeconds', { seconds: countdown })
                  : t('settings.getVerificationCode')
              }}
            </button>
          </div>
        </UiField>
        <!-- 与登录一致：继续即同意，不放默认勾选的复选框 -->
        <p v-if="needAgreement" class="type-caption text-text-muted">
          {{ t('login.continueMeansAgree') }}
          <a href="#" class="fg-link" @click.prevent="openAgreement">{{
            t('common.bookTitle', { title: globalConfig.agreementTitle })
          }}</a>
        </p>
        <p v-if="errors.form" class="ds-form-helper ds-form-error" role="alert">
          {{ errors.form }}
        </p>
        <UiButton
          variant="primary"
          type="submit"
          class="w-full"
          :disabled="submitting"
          :aria-busy="submitting || undefined"
        >
          {{ t('common.submitAuth') }}
        </UiButton>
      </form>
    </div>
  </div>
</template>
