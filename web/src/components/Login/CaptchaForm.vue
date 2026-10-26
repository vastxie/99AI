<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'
import UiField from '@/components/common/UiField.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'

import { fetchCaptchaLoginAPI, fetchCaptchaSendCodeAPI, type AuthProviderEntry } from '@/api/user'
import { useCountdown } from '@/composables/useCountdown'
import { t } from '@/locales'
import { isIdentityChanged } from '@/services/identity'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message, reasonOf } from '@/utils/message'
import { computed, ref } from 'vue'
import { contactNamesOf } from './contactNames'

/**
 * 验证码登录表单：联系方式属于哪个渠道由服务端判断，这里只收集联系方式与验证码。
 * 发码与登录失败的原因显示在表单里（请求层不再另弹 toast）。
 */
interface Props {
  captchaProviders: AuthProviderEntry[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  loginSuccess: []
}>()

const authStore = useAuthStore()
const globalStore = useGlobalStoreWithOut()
const ms = message()
const globalConfig = computed(() => authStore.globalConfig)

const form = ref({ contact: '', code: '' })
const loading = ref(false)
const formError = ref('')
/** 发码请求进行中：防止连点重复发送（服务端另有频率限制） */
const sending = ref(false)
const { remaining: countdown, start: startCountdown } = useCountdown()

const contactNames = computed(() => contactNamesOf(props.captchaProviders))
const contactPlaceholder = computed(() =>
  t('login.enterContactOf', { contacts: contactNames.value.join(' / ') })
)

async function sendCode() {
  const contact = form.value.contact.trim()
  if (!contact || sending.value || countdown.value > 0) return
  sending.value = true
  formError.value = ''
  try {
    const res = await fetchCaptchaSendCodeAPI({ contact, scene: 'login' }, { silentError: true })
    if (res.success) {
      ms.success(res.data || t('common.verificationCodeSentSuccess'))
      startCountdown()
    } else {
      formError.value = res.message || t('common.requestError')
    }
  } catch (error) {
    formError.value = reasonOf(error, t('common.requestError'))
  } finally {
    sending.value = false
  }
}

async function submit() {
  const contact = form.value.contact.trim()
  const code = form.value.code.trim()
  if (!contact || !code || loading.value) return
  loading.value = true
  formError.value = ''
  // 发起登录前记下身份：期间别的入口已经登录、退出或过期，就丢弃这次结果，不提示、不关闭
  const login = authStore.beginLogin()
  try {
    const res = await fetchCaptchaLoginAPI({ contact, code }, { silentError: true })
    if (!res.success) {
      formError.value = res.message || t('common.requestError')
      return
    }
    if (!login.commit(res.data)) return
    ms.success(t('login.loginSuccess'))
    // 资料随后再取，取不到由请求层按登录过期处理
    void authStore.getUserInfo().catch(() => undefined)
    emit('loginSuccess')
  } catch (error) {
    if (!isIdentityChanged(error)) formError.value = reasonOf(error, t('common.requestError'))
  } finally {
    loading.value = false
  }
}

function openAgreement() {
  globalStore.updateUserAgreementDialog(true)
}
</script>

<template>
  <form class="flex flex-col gap-6" novalidate @submit.prevent="submit">
    <div class="space-y-5">
      <UiField :label="t('login.contactLabel')" hide-label v-slot="{ control }">
        <input
          v-model="form.contact"
          v-bind="control"
          type="text"
          :placeholder="contactPlaceholder"
          autocomplete="username"
          class="input input-lg h-12 w-full"
        />
      </UiField>
      <UiField :label="t('login.codeLabel')" hide-label v-slot="{ control }">
        <div class="input input-lg flex h-12 w-full items-center overflow-hidden !px-0">
          <input
            v-model="form.code"
            v-bind="control"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            :placeholder="t('login.enterCode')"
            class="flex-1 bg-transparent px-4 text-base outline-none"
          />
          <div class="h-5 w-px flex-shrink-0 bg-app-border"></div>
          <button
            type="button"
            class="fg-link flex-shrink-0 px-4 text-sm font-medium disabled:cursor-not-allowed"
            :disabled="loading || sending || countdown > 0 || !form.contact.trim()"
            :aria-busy="sending || undefined"
            @click="sendCode"
          >
            {{ countdown > 0 ? `${countdown}s` : t('login.sendVerificationCode') }}
          </button>
        </div>
      </UiField>
      <div v-if="Number(globalConfig.isAutoOpenAgreement) === 1">
        <p class="text-xs leading-relaxed text-text-muted">
          {{ t('login.loginMeansAgree') }}
          <a href="#" class="fg-link" @click.prevent="openAgreement">{{
            t('common.bookTitle', { title: globalConfig.agreementTitle })
          }}</a>
        </p>
        <p class="mt-1 text-xs text-text-muted">{{ t('login.autoRegisterTip') }}</p>
      </div>
    </div>
    <p v-if="formError" class="ds-form-helper ds-form-error" role="alert">{{ formError }}</p>
    <UiButton
      variant="primary"
      prominent
      type="submit"
      class="w-full disabled:cursor-not-allowed"
      :disabled="loading || !form.contact.trim() || !form.code.trim()"
      :aria-busy="loading || undefined"
    >
      <UiSpinner v-if="loading" size="sm" tone="inverse" class="mr-2" />
      {{ t('login.captchaLogin') }}
    </UiButton>
  </form>
</template>
