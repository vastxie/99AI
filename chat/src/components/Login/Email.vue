<script lang="ts" setup>
import { fetchLoginAPI, fetchSendCode } from '@/api'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { message } from '@/utils/message'
import { computed, ref } from 'vue'
import SliderCaptcha from './SliderCaptcha.vue'

interface Props {
  loginMode: 'password' | 'captcha'
}

const props = defineProps<Props>()
const formRef = ref<HTMLFormElement | null>(null)
const ms = message()
const loading = ref(false)
const authStore = useAuthStore()
const lastSendPhoneCodeTime = ref(0)
const { isMobile } = useBasicLayout()
const isShow = ref(false)
const useGlobalStore = useGlobalStoreWithOut()
const globalConfig = computed(() => authStore.globalConfig)

// 验证码登录表单
const captchaForm = ref({
  contact: '',
  captchaId: null,
  code: '',
})

// 密码登录表单
const passwordForm = ref({
  username: '',
  password: '',
})

// 验证表单
const validateForm = () => {
  let hasError = false

  // 密码登录表单验证
  if (props.loginMode === 'password') {
    // 验证用户名
    if (!passwordForm.value.username.trim()) {
      hasError = true
    } else if (passwordForm.value.username.length < 2 || passwordForm.value.username.length > 30) {
      hasError = true
    }

    // 验证密码
    if (!passwordForm.value.password.trim()) {
      hasError = true
    } else if (passwordForm.value.password.length < 6 || passwordForm.value.password.length > 30) {
      hasError = true
    }
  }

  // 验证码登录表单验证
  else if (props.loginMode === 'captcha') {
    // 验证联系方式
    if (!captchaForm.value.contact.trim()) {
      hasError = true
    }

    // 验证验证码
    if (!captchaForm.value.captchaId) {
      hasError = true
    }
  }

  return !hasError
}

// 只验证联系方式，用于发送验证码前的验证
const validateContactOnly = () => {
  return captchaForm.value.contact.trim() !== ''
}

const phoneLoginStatus = computed(() => Number(authStore.globalConfig.phoneLoginStatus) === 1)
const emailLoginStatus = computed(() => Number(authStore.globalConfig.emailLoginStatus) === 1)

// 使用 ref 来管理全局参数的状态
const agreedToUserAgreement = ref(true) // 读取初始状态并转换为布尔类型

// 点击"用户协议及隐私政策"时，自动同意
function handleClick() {
  agreedToUserAgreement.value = true // 设置为同意
  useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.AGREEMENT)
}

const loginTypeText = computed(() => {
  if (emailLoginStatus.value && phoneLoginStatus.value) {
    return t('login.emailPhone')
  } else if (emailLoginStatus.value) {
    return t('login.email')
  } else if (phoneLoginStatus.value) {
    return t('login.phone')
  }
  return ''
})

const loginEnterType = computed(() => {
  if (emailLoginStatus.value && phoneLoginStatus.value) {
    return t('login.enterEmailOrPhone')
  } else if (emailLoginStatus.value) {
    return t('login.enterEmail')
  } else if (phoneLoginStatus.value) {
    return t('login.enterPhone')
  }
  return ''
})

//  定时器改变倒计时时间方法
function changeLastSendPhoneCodeTime() {
  if (lastSendPhoneCodeTime.value > 0) {
    setTimeout(() => {
      lastSendPhoneCodeTime.value--
      changeLastSendPhoneCodeTime()
    }, 1000)
  }
}

/* 发送验证码 */
async function handleSendCaptcha() {
  isShow.value = false
  if (validateContactOnly()) {
    // 只验证联系方式
    try {
      const { contact } = captchaForm.value

      // 只传递联系方式(邮箱或手机号)
      const params: any = { contact }
      let res: any
      res = await fetchSendCode(params)
      const { success } = res
      if (success) {
        ms.success(res.data)
        // 记录重新发送倒计时
        lastSendPhoneCodeTime.value = 60
        changeLastSendPhoneCodeTime()
      }
    } catch (error) {}
  }
}

/* 登录处理 */
function handlerSubmit(event: Event) {
  event.preventDefault()

  if (agreedToUserAgreement.value === false && globalConfig.value.isAutoOpenAgreement === '1') {
    return ms.error(`请阅读并同意《${globalConfig.value.agreementTitle}》`)
  }

  if (validateForm()) {
    loginAction()
  }
}

async function loginAction() {
  try {
    loading.value = true

    // 根据登录模式构建参数
    const params: any =
      props.loginMode === 'password'
        ? {
            username: passwordForm.value.username,
            password: passwordForm.value.password,
          }
        : {
            username: captchaForm.value.contact,
            captchaId: captchaForm.value.captchaId,
          }

    const res: any = await fetchLoginAPI(params)
    loading.value = false

    const { success } = res

    if (!success) return

    ms.success(t('login.loginSuccess'))
    authStore.setToken(res.data)
    authStore.getUserInfo()
    authStore.setLoginDialog(false)
  } catch (error: any) {
    loading.value = false
    ms.error(error.message)
  }
}
</script>

<template>
  <div class="w-full h-full flex flex-col justify-between" :class="isMobile ? 'px-5 ' : 'px-10 '">
    <!-- 密码登录表单 -->
    <form
      v-if="loginMode === 'password'"
      ref="formRef"
      class="flex flex-col flex-1 justify-between"
      @submit="handlerSubmit"
    >
      <div>
        <!-- 用户名输入框 -->
        <div class="flex flex-col gap-2">
          <label
            for="username"
            class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
            >{{ loginTypeText }}</label
          >
          <div>
            <input
              id="username"
              type="text"
              v-model="passwordForm.username"
              :placeholder="loginEnterType"
              class="input input-lg w-full"
            />
          </div>
        </div>

        <!-- 密码输入框 -->
        <div class="mt-6 relative">
          <div class="flex flex-col gap-2">
            <label
              for="password"
              class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
              >{{ t('login.password') }}</label
            >
            <div>
              <input
                id="password"
                type="password"
                v-model="passwordForm.password"
                :placeholder="t('login.enterYourPassword')"
                class="input input-lg w-full"
              />
            </div>
          </div>
        </div>

        <!-- 用户协议 -->
        <div class="mt-5" v-if="globalConfig.isAutoOpenAgreement === '1'">
          <div class="flex items-center">
            <input
              id="agreement-password"
              v-model="agreedToUserAgreement"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-700 dark:bg-gray-800"
            />
            <p class="ml-2 text-sm text-gray-600 dark:text-gray-400">
              登录即代表同意
              <a
                href="#"
                class="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                @click="handleClick"
                >《{{ globalConfig.agreementTitle }}》</a
              >
            </p>
          </div>
        </div>
      </div>

      <!-- 登录按钮 -->
      <div>
        <button
          type="submit"
          class="btn btn-primary btn-lg w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="loading || !passwordForm.username.trim() || !passwordForm.password"
        >
          <span v-if="loading" class="inline-block mr-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          </span>
          {{ t('login.loginAccount') }}
        </button>
      </div>
    </form>

    <!-- 验证码登录表单 -->
    <form
      v-if="loginMode === 'captcha'"
      ref="formRef"
      class="flex flex-col flex-1 justify-between"
      @submit="handlerSubmit"
    >
      <div>
        <!-- 联系方式输入框 -->
        <div class="flex flex-col gap-2">
          <label
            for="contact"
            class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
            >{{ loginTypeText }}</label
          >
          <div>
            <input
              id="contact"
              type="text"
              v-model="captchaForm.contact"
              :placeholder="t('login.enterContact') + loginTypeText"
              class="input input-lg w-full"
            />
          </div>
        </div>

        <!-- 验证码输入框 -->
        <div class="mt-6">
          <div class="flex flex-col gap-2">
            <label
              for="captchaId"
              class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
              >验证码</label
            >
            <div class="relative px-1">
              <div class="flex relative">
                <input
                  id="captchaId"
                  type="text"
                  v-model="captchaForm.captchaId"
                  :placeholder="t('login.enterCode')"
                  class="input input-lg w-full pr-32"
                />
                <button
                  type="button"
                  class="btn-captcha px-4"
                  :disabled="loading || lastSendPhoneCodeTime > 0 || !captchaForm.contact.trim()"
                  @click="isShow = true"
                >
                  <span v-if="loading && lastSendPhoneCodeTime === 0" class="inline-block mr-1">
                    <div class="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                  </span>
                  {{
                    lastSendPhoneCodeTime > 0
                      ? `${lastSendPhoneCodeTime}秒`
                      : t('login.sendVerificationCode')
                  }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 验证码组件 -->
        <div class="rounded-lg">
          <SliderCaptcha
            :show="isShow"
            @success="handleSendCaptcha()"
            @close="isShow = false"
            class="z-[10000]"
          />
        </div>

        <!-- 用户协议 -->
        <div class="mt-5" v-if="globalConfig.isAutoOpenAgreement === '1'">
          <div class="flex items-center">
            <input
              id="agreement-captcha"
              v-model="agreedToUserAgreement"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-700 dark:bg-gray-800"
            />
            <p class="ml-2 text-sm text-gray-600 dark:text-gray-400">
              登录即代表同意
              <a
                href="#"
                class="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                @click="handleClick"
                >《{{ globalConfig.agreementTitle }}》</a
              >
            </p>
          </div>
        </div>
      </div>

      <!-- 登录按钮 -->
      <div>
        <button
          type="submit"
          class="btn btn-primary btn-lg w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="loading || !captchaForm.contact.trim() || !captchaForm.captchaId"
        >
          <span v-if="loading" class="inline-block mr-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          </span>
          验证码登录
        </button>
      </div>
    </form>
  </div>
</template>
