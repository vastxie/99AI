<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'

import {
  fetchWechatOpenWebOAuthUrlAPI,
  type WechatOpenWebOAuthUrlResult,
} from './api/wechatOpenWeb'
import { t } from '@/locales'
import { resolveCurrentOAuthRedirectPath } from '@/views/auth/oauthRedirect'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

interface WxLoginOptions {
  self_redirect: boolean
  id: string
  appid: string
  scope: 'snsapi_login'
  redirect_uri: string
  state: string
  style?: 'black' | 'white'
  fast_login?: 0 | 1
}

declare global {
  interface Window {
    WxLogin?: new (options: WxLoginOptions) => unknown
  }
}

const WX_LOGIN_SCRIPT_SRC = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js'
const CONTAINER_ID = 'wechat-open-web-login-container'

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  fallbackOfficial: []
}>()

const loading = ref(false)
const errorText = ref('')
const fallbackUrl = ref('')
let requestId = 0
let wxLoginScriptPromise: Promise<void> | undefined
let wxLoginInstance: unknown = null

function getContainer() {
  return document.getElementById(CONTAINER_ID)
}

function clearContainer() {
  const container = getContainer()
  if (container) container.innerHTML = ''
}

function loadWxLoginScript() {
  if (window.WxLogin) return Promise.resolve()
  if (wxLoginScriptPromise) return wxLoginScriptPromise

  wxLoginScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${WX_LOGIN_SCRIPT_SRC}"]`
    )
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('wxLogin script failed')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.src = WX_LOGIN_SCRIPT_SRC
    script.async = true
    script.dataset.wechatOpenWebLogin = 'true'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('wxLogin script failed')), {
      once: true,
    })
    document.head.appendChild(script)
  })

  return wxLoginScriptPromise
}

function buildWxLoginOptions(config: WechatOpenWebOAuthUrlResult): WxLoginOptions {
  const options: WxLoginOptions = {
    self_redirect: false,
    id: CONTAINER_ID,
    appid: config.appId,
    scope: config.scope,
    redirect_uri: encodeURIComponent(config.redirectUri),
    state: config.state,
    style: config.style === 'white' ? 'white' : 'black',
  }

  if (typeof config.fastLogin === 'boolean') {
    options.fast_login = config.fastLogin ? 1 : 0
  }

  return options
}

function openFallbackUrl() {
  if (fallbackUrl.value) {
    window.location.href = fallbackUrl.value
  }
}

async function initializeWxLogin() {
  const currentRequestId = ++requestId
  loading.value = true
  errorText.value = ''
  fallbackUrl.value = ''
  clearContainer()

  try {
    const res = await fetchWechatOpenWebOAuthUrlAPI({
      scene: 'oauth',
      source: 'pc_web',
      redirectPath: resolveCurrentOAuthRedirectPath(),
    })

    if (currentRequestId !== requestId || !props.active) return
    if (!res.success || !res.data?.appId || !res.data?.redirectUri || !res.data?.state) {
      throw new Error('invalid wxLogin config')
    }

    fallbackUrl.value = res.data.fallbackUrl || ''
    await nextTick()
    await loadWxLoginScript()
    if (currentRequestId !== requestId || !props.active) return

    if (!window.WxLogin) {
      throw new Error('wxLogin unavailable')
    }

    clearContainer()
    wxLoginInstance = new window.WxLogin(buildWxLoginOptions(res.data))
    loading.value = false
  } catch {
    if (currentRequestId !== requestId || !props.active) return
    loading.value = false
    errorText.value = t('common.requestError')
    if (!fallbackUrl.value) {
      emit('fallbackOfficial')
    }
  }
}

function reset() {
  requestId += 1
  loading.value = false
  errorText.value = ''
  fallbackUrl.value = ''
  if (wxLoginInstance) {
    wxLoginInstance = null
  }
  clearContainer()
}

watch(
  () => props.active,
  active => {
    if (active) {
      void initializeWxLogin()
    } else {
      reset()
    }
  },
  { immediate: true }
)

onBeforeUnmount(reset)
</script>

<template>
  <div class="qr-scan-card min-h-[360px] w-full px-4 py-5 md:h-full">
    <div class="relative flex min-h-[300px] w-[300px] max-w-full items-center justify-center">
      <div :id="CONTAINER_ID" class="min-h-[300px] w-[300px] max-w-full overflow-hidden" />

      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--app-surface)_80%,transparent)]"
      >
        <UiSpinner size="lg" tone="link" />
      </div>

      <div
        v-if="errorText"
        class="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-lg bg-app-surface px-4 text-center"
      >
        <p class="text-sm text-text-muted">{{ errorText }}</p>
        <UiButton
          variant="primary"
          v-if="fallbackUrl"
          type="button"
          class="w-full justify-center"
          @click="openFallbackUrl"
        >
          {{ t('login.scanQrCodeToLogin') }}
        </UiButton>
      </div>
    </div>
  </div>
</template>
