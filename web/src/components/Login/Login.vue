<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'

import { fetchAuthProvidersAPI, fetchOAuthUrlAPI, type AuthProviderEntry } from '@/api/user'
import logo from '@/assets/logo.png'
import { getLoginMethodUi } from '@/auth/loginMethodUi'
import { useDialogA11y } from '@/composables/useDialogA11y'
import { t } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { message } from '@/utils/message'
import { saveOAuthRedirectPath } from '@/views/auth/oauthRedirect'
import { KeyRound, Lock, MessageCircle, X } from '@lucide/vue'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  ref,
  shallowRef,
  watch,
  type Component,
} from 'vue'
import CaptchaForm from './CaptchaForm.vue'
import PasswordForm from './PasswordForm.vue'
import QrLoginPanel from './QrLoginPanel.vue'

/**
 * 登录框（内核）：账号密码 / 注册由内核自带，其余登录方式全部来自 /auth/providers，
 * 按类型走通用表单 / 通用二维码面板 / OAuth 跳转；渠道包只登记图标或自定义面板。
 */
interface Props {
  visible: boolean
}

type LoginMode = 'password' | 'register' | 'captcha'

const props = defineProps<Props>()
const authStore = useAuthStore()
const appStore = useAppStore()
const ms = message()

// Esc 与遮罩点击 / 关闭按钮同走 setLoginDialog(false)，不涉及任何鉴权逻辑
const { setDialogRef, dialogAttrs } = useDialogA11y(() => props.visible, {
  onClose: () => authStore.setLoginDialog(false),
})

const logoPath = computed(() => authStore.globalConfig.clientLogoPath || logo)
const siteName = computed(() => authStore.globalConfig?.siteName || '99Agent')

const providers = ref<AuthProviderEntry[]>([])
const mode = ref<LoginMode>('password')
const formPaneRef = ref<HTMLElement | null>(null)

/**
 * 切换验证码登录 / 密码登录：整个表单连同被点的切换键一起换掉，焦点移到新表单的第一个输入框，
 * 不掉回页面开头
 */
async function switchMode(next: LoginMode) {
  mode.value = next
  await nextTick()
  formPaneRef.value?.querySelector<HTMLInputElement>('input')?.focus()
}
const isEnabled = (entry: AuthProviderEntry) => entry.enabled !== false

const passwordEntry = computed(() =>
  providers.value.find(entry => entry.type === 'password' && isEnabled(entry))
)
const registerEnabled = computed(() => passwordEntry.value?.registerEnabled === true)
const captchaProviders = computed(() =>
  providers.value.filter(entry => entry.type === 'captcha' && isEnabled(entry))
)
const hasCaptchaLogin = computed(() => captchaProviders.value.length > 0)
/** OAuth 跳转按钮：只取标记为 login 场景的条目（微信内授权等场景由各包自行处理） */
const oauthButtons = computed(() =>
  providers.value.filter(
    entry => entry.type === 'oauth' && entry.scene === 'login' && isEnabled(entry)
  )
)
/** 带自定义面板的方式（如微信开放平台内嵌扫码），只在普通网页环境展示 */
const panelProvider = computed(() =>
  appStore.env === 'web'
    ? providers.value.find(
        entry =>
          entry.type === 'oauth' && isEnabled(entry) && getLoginMethodUi(entry.provider)?.panel
      )
    : undefined
)
const qrProvider = computed(() =>
  providers.value.find(entry => entry.type === 'qr' && isEnabled(entry))
)
const panelFallback = ref(false)
const showCustomPanel = computed(() => Boolean(panelProvider.value) && !panelFallback.value)
const showQrPanel = computed(
  () => Boolean(qrProvider.value) && (!panelProvider.value || panelFallback.value)
)
const showRightPanel = computed(() => showCustomPanel.value || showQrPanel.value)
const showQuickActions = computed(() => hasCaptchaLogin.value || oauthButtons.value.length > 0)

const CustomPanel = shallowRef<Component | null>(null)
watch(
  panelProvider,
  entry => {
    const loader = entry ? getLoginMethodUi(entry.provider)?.panel : undefined
    CustomPanel.value = loader ? defineAsyncComponent(loader) : null
  },
  { immediate: true }
)

const oauthLoading = ref('')

async function loadAuthProviders() {
  try {
    const res = await fetchAuthProvidersAPI()
    providers.value = res.success && Array.isArray(res.data) ? res.data : []
  } catch {
    providers.value = []
  }
}

function setDefaultMode() {
  if (authStore.authDialogMode === 'register') {
    mode.value = registerEnabled.value ? 'register' : hasCaptchaLogin.value ? 'captcha' : 'password'
    return
  }
  mode.value = hasCaptchaLogin.value ? 'captcha' : 'password'
}

function normalizeOAuthUrl(data: unknown) {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>
    if (typeof payload.url === 'string') return payload.url
    if (typeof payload.authUrl === 'string') return payload.authUrl
  }
  return ''
}

async function startOAuthLogin(entry: AuthProviderEntry) {
  if (oauthLoading.value) return
  oauthLoading.value = entry.provider
  try {
    const redirectPath = saveOAuthRedirectPath()
    const res = await fetchOAuthUrlAPI<string | { url?: string; authUrl?: string }>(
      entry.provider,
      {
        scene: 'login',
        redirectPath,
      }
    )
    const authUrl = normalizeOAuthUrl(res.data)
    if (res.success && authUrl) {
      window.location.href = authUrl
      return
    }
    ms.error(res.message || t('common.requestError'))
  } catch (error: any) {
    ms.error(error?.message || t('common.requestError'))
  } finally {
    oauthLoading.value = ''
  }
}

function iconOf(entry: AuthProviderEntry): Component {
  return getLoginMethodUi(entry.provider)?.icon || KeyRound
}

function onLoginSuccess() {
  authStore.setLoginDialog(false)
}

let loginDialogSyncId = 0

watch(
  () => props.visible,
  async visible => {
    const syncId = ++loginDialogSyncId
    if (!visible) {
      panelFallback.value = false
      return
    }
    appStore.setEnv()
    panelFallback.value = false
    await loadAuthProviders()
    if (syncId !== loginDialogSyncId || !props.visible) return
    setDefaultMode()
  }
)

watch(
  () => authStore.authDialogMode,
  () => {
    if (props.visible) setDefaultMode()
  }
)
</script>

<template>
  <transition name="modal-fade">
    <div
      v-if="visible"
      class="auth-dialog-backdrop fixed inset-0 z-dialog flex flex-col max-md:bg-app-surface md:items-center md:justify-center md:p-4"
      @click.self="authStore.setLoginDialog(false)"
    >
      <div
        :ref="setDialogRef"
        class="auth-dialog-surface dialog-surface relative flex min-h-full w-full flex-col overflow-y-auto px-6 py-12 text-text-primary md:min-h-0 md:max-h-[92vh] md:px-10 md:py-12"
        :class="
          showCustomPanel
            ? 'md:max-w-[820px]'
            : showRightPanel
              ? 'md:max-w-[720px]'
              : 'md:max-w-[430px]'
        "
        v-bind="dialogAttrs"
        aria-labelledby="login-dialog-title"
      >
        <UiTooltip
          class="absolute right-4 top-4 z-1 md:right-5 md:top-5"
          :text="t('common.close')"
          placement="bottom"
        >
          <UiButton icon :aria-label="t('common.close')" @click="authStore.setLoginDialog(false)">
            <X :size="20" />
          </UiButton>
        </UiTooltip>
        <div class="flex flex-1 items-center justify-center">
          <div class="w-full" :class="showRightPanel ? 'max-w-[620px]' : 'max-w-[350px]'">
            <div class="mb-6 flex items-center justify-center gap-3 md:mb-7">
              <!-- 旁边就是站点名，图标不再重复朗读 -->
              <img :src="logoPath" alt="" class="h-7 w-7 rounded-lg" />
              <span
                id="login-dialog-title"
                class="text-xl font-semibold text-text-primary md:text-2xl"
                >{{ siteName }}</span
              >
            </div>
            <div
              class="flex flex-col md:flex-row md:items-start md:justify-center"
              :class="showRightPanel ? 'gap-8 md:gap-10' : ''"
            >
              <!-- 左侧：表单 -->
              <div
                ref="formPaneRef"
                class="flex min-w-0 flex-1 flex-col"
                :class="showRightPanel ? 'md:w-[360px] md:flex-none' : 'w-full'"
              >
                <CaptchaForm
                  v-if="mode === 'captcha'"
                  :captcha-providers="captchaProviders"
                  @login-success="onLoginSuccess"
                />
                <PasswordForm
                  v-else
                  :mode="mode === 'register' ? 'register' : 'login'"
                  :register-enabled="registerEnabled"
                  :captcha-providers="captchaProviders"
                  @change-mode="next => (mode = next === 'register' ? 'register' : 'password')"
                  @login-success="onLoginSuccess"
                />
                <!-- 切换登录方式 -->
                <div v-if="showQuickActions" class="mt-6 flex items-center gap-3">
                  <div class="h-px flex-1 bg-app-border"></div>
                  <div class="flex items-center justify-center gap-2">
                    <UiTooltip
                      v-if="hasCaptchaLogin && mode !== 'captcha'"
                      :text="t('login.captchaLogin')"
                      placement="bottom"
                    >
                      <UiButton
                        pill
                        icon
                        :aria-label="t('login.captchaLogin')"
                        @click="switchMode('captcha')"
                      >
                        <MessageCircle :size="18" />
                      </UiButton>
                    </UiTooltip>
                    <UiTooltip
                      v-if="mode === 'captcha'"
                      :text="t('login.passwordLogin')"
                      placement="bottom"
                    >
                      <UiButton
                        pill
                        icon
                        :aria-label="t('login.passwordLogin')"
                        @click="switchMode('password')"
                      >
                        <Lock :size="18" />
                      </UiButton>
                    </UiTooltip>
                    <UiTooltip
                      v-for="entry in oauthButtons"
                      :key="entry.provider"
                      :text="entry.displayName"
                      placement="bottom"
                    >
                      <UiButton
                        pill
                        icon
                        class="disabled:cursor-wait"
                        :disabled="Boolean(oauthLoading)"
                        :aria-label="t('login.loginWith', { name: entry.displayName })"
                        @click="startOAuthLogin(entry)"
                      >
                        <component :is="iconOf(entry)" :size="18" />
                      </UiButton>
                    </UiTooltip>
                  </div>
                  <div class="h-px flex-1 bg-app-border"></div>
                </div>
              </div>
              <!-- 右侧：自定义面板或通用扫码 -->
              <div
                v-if="showRightPanel"
                class="flex w-full justify-center md:flex-shrink-0"
                :class="showCustomPanel ? 'md:w-[310px]' : 'md:w-[210px]'"
              >
                <component
                  :is="CustomPanel"
                  v-if="showCustomPanel && CustomPanel"
                  :active="visible && showCustomPanel"
                  @fallback-official="panelFallback = true"
                />
                <QrLoginPanel
                  v-else-if="showQrPanel && qrProvider"
                  :provider="qrProvider.provider"
                  :display-name="qrProvider.displayName"
                  :active="visible && showQrPanel"
                  @login-success="onLoginSuccess"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>
