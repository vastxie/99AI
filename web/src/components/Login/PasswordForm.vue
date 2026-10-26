<script lang="ts" setup>
import { ArrowLeft } from '@lucide/vue'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { fetchLoginAPI } from '@/api'
import {
  fetchCaptchaSendCodeAPI,
  fetchCaptchaVerifyResetAPI,
  fetchRegisterAPI,
  fetchResetPasswordAPI,
  type AuthProviderEntry,
} from '@/api/user'
import UiButton from '@/components/common/UiButton.vue'
import UiField from '@/components/common/UiField.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'
import { useCountdown } from '@/composables/useCountdown'
import {
  LOGIN_NAME_MIN_LENGTH,
  passwordProblem,
  passwordRuleHint,
  USERNAME_PATTERN,
  usernameRuleHint,
} from '@/constants/accountRules'
import { t } from '@/locales'
import { isIdentityChanged } from '@/services/identity'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { focusFirstInvalidField } from '@/utils/focus'
import { message, reasonOf } from '@/utils/message'
import { contactNamesOf } from './contactNames'

/**
 * 内核自带的账号密码表单：登录 / 自助注册 / 找回密码。
 * 找回密码依赖任一装载的验证码渠道（邮箱、手机号……），没有时隐藏入口。
 *
 * 字段不合规在字段下方就地提示，焦点移到第一个出错的字段；服务端拒绝（密码错误、验证码失效……）
 * 显示在表单里，请求层不再另弹 toast。切换步骤后焦点落到新步骤的第一个输入框。
 */
interface Props {
  mode: 'login' | 'register'
  registerEnabled: boolean
  captchaProviders: AuthProviderEntry[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  changeMode: [mode: 'login' | 'register']
  loginSuccess: []
}>()

const authStore = useAuthStore()
const globalStore = useGlobalStoreWithOut()
const ms = message()
const globalConfig = computed(() => authStore.globalConfig)

const step = ref<'form' | 'forgot' | 'verify' | 'reset'>('form')
const loading = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const loginForm = ref({ username: '', password: '' })
const registerForm = ref({ username: '', nickname: '', password: '', confirmPassword: '' })
const forgotForm = ref({
  contact: '',
  code: '',
  resetToken: '',
  newPassword: '',
  confirmPassword: '',
})
/** 字段下方的就地错误（按字段名）与服务端拒绝的原因 */
const errors = reactive<Record<string, string>>({})
const formError = ref('')
/** 找回密码的发码请求进行中：防止连点重复发送（服务端另有频率限制） */
const sendingForgotCode = ref(false)
const { remaining: forgotCountdown, start: startCountdown } = useCountdown()
/** 最近一次发码成功的联系方式：倒计时内对它只进入下一步、不重发 */
const codeSentTo = ref('')

const canResetPassword = computed(() => props.captchaProviders.length > 0)
const contactNames = computed(() => contactNamesOf(props.captchaProviders))
const usernamePlaceholder = computed(() =>
  contactNames.value.length
    ? t('login.enterAccountOrContact', { contacts: contactNames.value.join(' / ') })
    : t('login.enterAccount')
)
const contactPlaceholder = computed(() =>
  t('login.enterContactOf', { contacts: contactNames.value.join(' / ') })
)
const showAgreement = computed(() => Number(globalConfig.value.isAutoOpenAgreement) === 1)

function clearErrors() {
  for (const key of Object.keys(errors)) delete errors[key]
  formError.value = ''
}

/** 校验没过：等错误渲染出来，焦点移到第一个出错的字段 */
async function focusInvalid() {
  await nextTick()
  focusFirstInvalidField(rootRef.value)
}

watch([() => props.mode, step], async ([mode], [previousMode]) => {
  if (mode !== previousMode) step.value = 'form'
  clearErrors()
  await nextTick()
  rootRef.value?.querySelector<HTMLInputElement>('input')?.focus()
})

function openAgreement() {
  globalStore.updateUserAgreementDialog(true)
}

/**
 * 登录 / 注册接口成功即提示（资料随后再取，取不到由请求层按登录过期处理）。
 * login 在发起请求前开始：期间别的入口已经登录、退出或过期，就丢弃这次结果，不提示、不关闭
 */
function finishLogin(
  login: ReturnType<typeof authStore.beginLogin>,
  token: string,
  successText: string
) {
  if (!login.commit(token)) return
  ms.success(successText)
  void authStore.getUserInfo().catch(() => undefined)
  emit('loginSuccess')
}

async function submitLogin() {
  if (loading.value) return
  clearErrors()
  const username = loginForm.value.username.trim()
  const password = loginForm.value.password
  if (username.length < LOGIN_NAME_MIN_LENGTH) {
    errors.username = t('login.accountTooShort', { min: LOGIN_NAME_MIN_LENGTH })
  }
  const passwordIssue = passwordProblem(password)
  if (passwordIssue) errors.password = passwordIssue
  if (errors.username || errors.password) return focusInvalid()
  loading.value = true
  const login = authStore.beginLogin()
  try {
    const res: any = await fetchLoginAPI({ username, password }, { silentError: true })
    if (res.success) finishLogin(login, res.data, t('login.loginSuccess'))
    else formError.value = res.message || t('common.requestError')
  } catch (error) {
    // 期间身份换了：这次登录已作废，不显示错误
    if (!isIdentityChanged(error)) formError.value = reasonOf(error, t('common.requestError'))
  } finally {
    loading.value = false
  }
}

async function submitRegister() {
  if (loading.value) return
  clearErrors()
  const username = registerForm.value.username.trim()
  const { password, confirmPassword } = registerForm.value
  if (!USERNAME_PATTERN.test(username)) errors.username = usernameRuleHint()
  const passwordIssue = passwordProblem(password)
  if (passwordIssue) errors.password = passwordIssue
  else if (password !== confirmPassword) errors.confirmPassword = t('login.passwordMismatch')
  if (errors.username || errors.password || errors.confirmPassword) return focusInvalid()
  loading.value = true
  const login = authStore.beginLogin()
  try {
    const res = await fetchRegisterAPI(
      { username, password, nickname: registerForm.value.nickname.trim() || undefined },
      { silentError: true }
    )
    if (res.success) finishLogin(login, res.data, t('login.registerSuccess'))
    else formError.value = res.message || t('common.requestError')
  } catch (error) {
    if (!isIdentityChanged(error)) formError.value = reasonOf(error, t('common.requestError'))
  } finally {
    loading.value = false
  }
}

async function sendForgotCode() {
  const contact = forgotForm.value.contact.trim()
  if (!contact) {
    errors.contact = t('login.pleaseEnterContact')
    return focusInvalid()
  }
  if (sendingForgotCode.value) return
  if (forgotCountdown.value > 0 && contact === codeSentTo.value) return
  sendingForgotCode.value = true
  formError.value = ''
  try {
    const res = await fetchCaptchaSendCodeAPI({ contact, scene: 'reset' }, { silentError: true })
    if (res.success) {
      ms.success(res.data || t('common.verificationCodeSentSuccess'))
      codeSentTo.value = contact
      forgotForm.value.code = ''
      startCountdown()
      step.value = 'verify'
    } else {
      formError.value = res.message || t('common.requestError')
    }
  } catch (error) {
    formError.value = reasonOf(error, t('common.requestError'))
  } finally {
    sendingForgotCode.value = false
  }
}

/**
 * 找回密码第一步的「下一步」：从验证页返回后联系方式没改、码还在有效期内，直接回到填码；
 * 改了联系方式才重新发码
 */
function continueForgot() {
  clearErrors()
  const contact = forgotForm.value.contact.trim()
  if (contact && forgotCountdown.value > 0 && contact === codeSentTo.value) {
    step.value = 'verify'
    return
  }
  void sendForgotCode()
}

async function verifyForgotCode() {
  if (loading.value) return
  clearErrors()
  const code = forgotForm.value.code.trim()
  if (!code) {
    errors.code = t('login.enterCode')
    return focusInvalid()
  }
  loading.value = true
  try {
    const res = await fetchCaptchaVerifyResetAPI(
      { contact: forgotForm.value.contact.trim(), code },
      { silentError: true }
    )
    if (res.success && res.data?.resetToken) {
      forgotForm.value.resetToken = res.data.resetToken
      step.value = 'reset'
    } else {
      formError.value = res.message || t('login.verifyFailed')
    }
  } catch (error) {
    formError.value = reasonOf(error, t('login.verifyFailed'))
  } finally {
    loading.value = false
  }
}

async function resetPassword() {
  if (loading.value) return
  clearErrors()
  const { newPassword, confirmPassword } = forgotForm.value
  const passwordIssue = passwordProblem(newPassword)
  if (passwordIssue) errors.newPassword = passwordIssue
  else if (newPassword !== confirmPassword) errors.confirmPassword = t('login.passwordMismatch')
  if (errors.newPassword || errors.confirmPassword) return focusInvalid()
  loading.value = true
  try {
    const res = await fetchResetPasswordAPI(
      {
        contact: forgotForm.value.contact.trim(),
        resetToken: forgotForm.value.resetToken,
        password: newPassword,
      },
      { silentError: true }
    )
    if (res.success) {
      ms.success(t('login.resetSuccess'))
      forgotForm.value = {
        contact: '',
        code: '',
        resetToken: '',
        newPassword: '',
        confirmPassword: '',
      }
      step.value = 'form'
    } else {
      formError.value = res.message || t('login.resetFailed')
    }
  } catch (error) {
    formError.value = reasonOf(error, t('login.resetFailed'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div ref="rootRef" class="flex w-full flex-col">
    <!-- 登录 -->
    <form
      v-if="mode === 'login' && step === 'form'"
      class="flex flex-col gap-6"
      novalidate
      @submit.prevent="submitLogin"
    >
      <div class="space-y-5">
        <UiField
          :label="t('login.accountLabel')"
          hide-label
          :error="errors.username"
          v-slot="{ control }"
        >
          <input
            v-model="loginForm.username"
            v-bind="control"
            type="text"
            :placeholder="usernamePlaceholder"
            autocomplete="username"
            class="input input-lg h-12 w-full"
          />
        </UiField>
        <UiField
          :label="t('login.passwordLabel')"
          hide-label
          :error="errors.password"
          v-slot="{ control }"
        >
          <input
            v-model="loginForm.password"
            v-bind="control"
            type="password"
            :placeholder="t('login.enterYourPassword')"
            autocomplete="current-password"
            class="input input-lg h-12 w-full"
          />
        </UiField>
        <div>
          <p v-if="showAgreement" class="text-xs leading-relaxed text-text-muted">
            {{ t('login.loginMeansAgree') }}
            <a href="#" class="fg-link" @click.prevent="openAgreement">{{
              t('common.bookTitle', { title: globalConfig.agreementTitle })
            }}</a>
          </p>
          <div class="mt-1 flex items-center justify-between text-xs text-text-muted">
            <button
              v-if="canResetPassword"
              type="button"
              class="fg-link-muted"
              @click="step = 'forgot'"
            >
              {{ t('login.forgotPasswordLink') }}
            </button>
            <span v-else></span>
            <button
              v-if="registerEnabled"
              type="button"
              class="fg-link-muted"
              @click="emit('changeMode', 'register')"
            >
              {{ t('login.noAccount') }}
            </button>
          </div>
        </div>
      </div>
      <p v-if="formError" class="ds-form-helper ds-form-error" role="alert">{{ formError }}</p>
      <UiButton
        variant="primary"
        prominent
        type="submit"
        class="w-full disabled:cursor-not-allowed"
        :disabled="loading || !loginForm.username.trim() || !loginForm.password"
        :aria-busy="loading || undefined"
      >
        <UiSpinner v-if="loading" size="sm" tone="inverse" class="mr-2" />
        {{ t('login.loginAccount') }}
      </UiButton>
    </form>

    <!-- 注册 -->
    <form
      v-else-if="mode === 'register'"
      class="flex flex-col gap-6"
      novalidate
      @submit.prevent="submitRegister"
    >
      <div class="space-y-5">
        <UiField
          :label="t('login.usernameLabel')"
          hide-label
          :hint="usernameRuleHint()"
          :error="errors.username"
          v-slot="{ control }"
        >
          <input
            v-model="registerForm.username"
            v-bind="control"
            type="text"
            :placeholder="t('login.enterUsername')"
            autocomplete="username"
            class="input input-lg h-12 w-full"
          />
        </UiField>
        <UiField :label="t('login.nicknameLabel')" hide-label v-slot="{ control }">
          <input
            v-model="registerForm.nickname"
            v-bind="control"
            type="text"
            :placeholder="t('login.enterNickname')"
            autocomplete="nickname"
            class="input input-lg h-12 w-full"
          />
        </UiField>
        <UiField
          :label="t('login.passwordLabel')"
          hide-label
          :hint="passwordRuleHint()"
          :error="errors.password"
          v-slot="{ control }"
        >
          <input
            v-model="registerForm.password"
            v-bind="control"
            type="password"
            :placeholder="t('login.enterPassword')"
            autocomplete="new-password"
            class="input input-lg h-12 w-full"
          />
        </UiField>
        <UiField
          :label="t('login.confirmPasswordLabel')"
          hide-label
          :error="errors.confirmPassword"
          v-slot="{ control }"
        >
          <input
            v-model="registerForm.confirmPassword"
            v-bind="control"
            type="password"
            :placeholder="t('login.confirmPassword')"
            autocomplete="new-password"
            class="input input-lg h-12 w-full"
          />
        </UiField>
        <div>
          <p v-if="showAgreement" class="text-xs leading-relaxed text-text-muted">
            {{ t('login.loginMeansAgree') }}
            <a href="#" class="fg-link" @click.prevent="openAgreement">{{
              t('common.bookTitle', { title: globalConfig.agreementTitle })
            }}</a>
          </p>
          <button
            type="button"
            class="mt-1 block text-xs fg-link-muted"
            @click="emit('changeMode', 'login')"
          >
            {{ t('login.haveAccount') }}
          </button>
        </div>
      </div>
      <p v-if="formError" class="ds-form-helper ds-form-error" role="alert">{{ formError }}</p>
      <UiButton
        variant="primary"
        prominent
        type="submit"
        class="w-full disabled:cursor-not-allowed"
        :disabled="
          loading ||
          !registerForm.username.trim() ||
          !registerForm.password ||
          !registerForm.confirmPassword
        "
        :aria-busy="loading || undefined"
      >
        <UiSpinner v-if="loading" size="sm" tone="inverse" class="mr-2" />
        {{ t('login.registerAccount') }}
      </UiButton>
    </form>

    <!-- 找回密码：三步都用原生表单提交，回车只提交一次，输入法用回车上屏时不会误触发 -->
    <!-- 找回密码：输入联系方式 -->
    <form
      v-else-if="step === 'forgot'"
      class="flex flex-col gap-6"
      novalidate
      @submit.prevent="continueForgot"
    >
      <div>
        <div class="mb-4">
          <button
            type="button"
            class="mb-4 flex items-center text-sm fg-quiet"
            @click="step = 'form'"
          >
            <ArrowLeft :size="16" class="mr-1" />
            {{ t('common.back') }}
          </button>
          <h3 class="type-dialog-title mb-2">{{ t('login.forgotPassword') }}</h3>
          <p class="text-sm text-text-muted">{{ t('login.forgotPasswordTip') }}</p>
        </div>
        <UiField
          :label="t('login.contactLabel')"
          hide-label
          :error="errors.contact"
          v-slot="{ control }"
        >
          <input
            v-model="forgotForm.contact"
            v-bind="control"
            type="text"
            :placeholder="contactPlaceholder"
            autocomplete="username"
            class="input input-lg h-12 w-full"
          />
        </UiField>
      </div>
      <p v-if="formError" class="ds-form-helper ds-form-error" role="alert">{{ formError }}</p>
      <UiButton
        variant="primary"
        prominent
        type="submit"
        class="w-full disabled:cursor-not-allowed"
        :disabled="!forgotForm.contact.trim() || sendingForgotCode"
        :aria-busy="sendingForgotCode || undefined"
      >
        {{ t('login.nextStep') }}
      </UiButton>
    </form>

    <!-- 找回密码：验证码 -->
    <form
      v-else-if="step === 'verify'"
      class="flex flex-col gap-6"
      novalidate
      @submit.prevent="verifyForgotCode"
    >
      <div>
        <div class="mb-4">
          <button
            type="button"
            class="mb-4 flex items-center text-sm fg-quiet"
            @click="step = 'forgot'"
          >
            <ArrowLeft :size="16" class="mr-1" />
            {{ t('common.back') }}
          </button>
          <h3 class="type-dialog-title mb-2">{{ t('login.verifyIdentity') }}</h3>
          <p class="text-sm text-text-muted">
            {{ t('login.codeSentTo', { contact: forgotForm.contact }) }}
          </p>
        </div>
        <UiField :label="t('login.codeLabel')" hide-label :error="errors.code" v-slot="{ control }">
          <div class="flex gap-2">
            <input
              v-model="forgotForm.code"
              v-bind="control"
              type="text"
              inputmode="numeric"
              :placeholder="t('login.enterCode')"
              autocomplete="one-time-code"
              class="input input-lg h-12 flex-1"
            />
            <UiButton
              variant="secondary"
              prominent
              type="button"
              class="px-4"
              :disabled="forgotCountdown > 0 || sendingForgotCode"
              @click="sendForgotCode"
            >
              {{ forgotCountdown > 0 ? `${forgotCountdown}s` : t('login.resend') }}
            </UiButton>
          </div>
        </UiField>
      </div>
      <p v-if="formError" class="ds-form-helper ds-form-error" role="alert">{{ formError }}</p>
      <UiButton
        variant="primary"
        prominent
        type="submit"
        class="w-full disabled:cursor-not-allowed"
        :disabled="loading || !forgotForm.code.trim()"
        :aria-busy="loading || undefined"
      >
        <UiSpinner v-if="loading" size="sm" tone="inverse" class="mr-2" />
        {{ t('login.verify') }}
      </UiButton>
    </form>

    <!-- 找回密码：设置新密码 -->
    <form
      v-else-if="step === 'reset'"
      class="flex flex-col gap-6"
      novalidate
      @submit.prevent="resetPassword"
    >
      <div>
        <button
          type="button"
          class="mb-4 flex items-center text-xs fg-quiet"
          @click="step = 'verify'"
        >
          <ArrowLeft :size="16" class="mr-1" />
          {{ t('common.back') }}
        </button>
        <h3 class="type-dialog-title mb-4">{{ t('login.resetPassword') }}</h3>
        <div class="space-y-5">
          <UiField
            :label="t('login.newPasswordLabel')"
            hide-label
            :hint="passwordRuleHint()"
            :error="errors.newPassword"
            v-slot="{ control }"
          >
            <input
              v-model="forgotForm.newPassword"
              v-bind="control"
              type="password"
              :placeholder="t('login.enterNewPassword')"
              autocomplete="new-password"
              class="input input-lg h-12 w-full"
            />
          </UiField>
          <UiField
            :label="t('login.confirmNewPasswordLabel')"
            hide-label
            :error="errors.confirmPassword"
            v-slot="{ control }"
          >
            <input
              v-model="forgotForm.confirmPassword"
              v-bind="control"
              type="password"
              :placeholder="t('login.confirmNewPassword')"
              autocomplete="new-password"
              class="input input-lg h-12 w-full"
            />
          </UiField>
        </div>
      </div>
      <p v-if="formError" class="ds-form-helper ds-form-error" role="alert">{{ formError }}</p>
      <UiButton
        variant="primary"
        prominent
        type="submit"
        class="w-full disabled:cursor-not-allowed"
        :disabled="loading || !forgotForm.newPassword || !forgotForm.confirmPassword"
        :aria-busy="loading || undefined"
      >
        <UiSpinner v-if="loading" size="sm" tone="inverse" class="mr-2" />
        {{ t('login.resetPassword') }}
      </UiButton>
    </form>
  </div>
</template>
