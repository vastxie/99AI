<script setup lang="ts">
import { fetchWechatOpenWebOAuthCallbackAPI } from './api/wechatOpenWeb'
import UiButton from '@/components/common/UiButton.vue'
import { t } from '@/locales'
import { IdentityChangedError, isIdentityChanged } from '@/services/identity'
import { useAuthStore } from '@/store/modules/auth'
import { normalizeOAuthRedirectPath } from '@/views/auth/oauthRedirect'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const errorText = ref('')
/** 回调期间身份已变化：停在结束状态，等用户自己返回（不自动跳转、不弹登录框） */
const identityChanged = ref(false)
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

function removeCallbackQuery() {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
}

async function redirectToLoginEntry() {
  authStore.setLoginDialog(true)
  window.setTimeout(() => {
    void router.replace('/')
  }, 1200)
}

onMounted(async () => {
  // 发起回调请求之前记下身份：期间别的入口已经登录、退出或过期，这次登录作废
  const login = authStore.beginLogin()
  const code = firstQueryValue(route.query.code)
  const state = firstQueryValue(route.query.state)
  removeCallbackQuery()

  try {
    if (!code || !state) {
      throw new Error(t('common.requestError'))
    }

    const res = await fetchWechatOpenWebOAuthCallbackAPI({ code, state })
    if (!res.success || !res.data?.token) {
      throw new Error(t('common.requestError'))
    }

    if (!login.commit(res.data.token)) throw new IdentityChangedError()
    await authStore.getUserInfo()
    authStore.setLoginDialog(false)
    await router.replace(normalizeOAuthRedirectPath(res.data.redirectPath))
  } catch (error) {
    if (isIdentityChanged(error)) {
      identityChanged.value = true
      errorText.value = t('login.identityChanged')
      return
    }
    errorText.value = t('common.requestError')
    await redirectToLoginEntry()
  }
})
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-app-surface px-6 text-text-primary">
    <div class="text-center text-sm text-text-muted">
      <span v-if="!errorText">{{ t('common.loading') }}</span>
      <span v-else>{{ errorText }}</span>
      <div v-if="identityChanged" class="mt-4">
        <UiButton variant="secondary" @click="router.replace('/')">
          {{ t('login.backToHome') }}
        </UiButton>
      </div>
    </div>
  </main>
</template>
