<script setup lang="ts">
import { fetchOAuthCallbackAPI } from '@/api/user'
import UiButton from '@/components/common/UiButton.vue'
import { t } from '@/locales'
import { IdentityChangedError, isIdentityChanged } from '@/services/identity'
import { useAuthStore } from '@/store/modules/auth'
import { consumeOAuthRedirectPath, normalizeOAuthRedirectPath } from './oauthRedirect'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const errorText = ref('')
/** 失败时回到发起登录 / 绑定前的页面（原会话、设置页），没有记录时回首页 */
const returnPath = ref('/')
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

function normalizeToken(data: unknown) {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>
    if (typeof payload.token === 'string') return payload.token
    if (typeof payload.accessToken === 'string') return payload.accessToken
  }
  return ''
}

function isBindResult(data: unknown) {
  return Boolean(
    data && typeof data === 'object' && (data as Record<string, unknown>).bound === true
  )
}

function removeCallbackQuery() {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
}

function resolveCallbackRedirectPath(data: unknown) {
  if (data && typeof data === 'object') {
    const redirectPath = (data as Record<string, unknown>).redirectPath
    if (typeof redirectPath === 'string' && redirectPath.trim()) {
      return normalizeOAuthRedirectPath(redirectPath)
    }
  }
  return consumeOAuthRedirectPath()
}

onMounted(async () => {
  // 发起回调请求之前记下身份：期间别的入口已经登录、退出或过期，这次登录 / 绑定的结果作废
  const login = authStore.beginLogin()
  try {
    const provider = firstQueryValue(route.params.provider)
    const code = firstQueryValue(route.query.code)
    const state = firstQueryValue(route.query.state)
    removeCallbackQuery()

    // 在第三方授权页点了取消、或回调参数不全：没有完成授权
    if (!provider || !code || !state) {
      throw new Error(t('login.oauthCancelled'))
    }

    const res = await fetchOAuthCallbackAPI<unknown>(provider, { code, state })
    if (!res.success) {
      throw new Error(res.message || t('login.oauthFailed'))
    }

    const token = normalizeToken(res.data)
    if (token) {
      if (!login.commit(token)) throw new IdentityChangedError()
      await authStore.getUserInfo()
      authStore.setLoginDialog(false)
      await router.replace(resolveCallbackRedirectPath(res.data))
      return
    }

    if (isBindResult(res.data) && authStore.isLogin) {
      if (!login.isCurrent()) throw new IdentityChangedError()
      await authStore.getUserInfo()
      authStore.setLoginDialog(false)
      await router.replace(resolveCallbackRedirectPath(res.data))
      return
    }

    if (!token) {
      throw new Error(t('login.oauthFailed'))
    }
  } catch (error: any) {
    returnPath.value = consumeOAuthRedirectPath()
    // 身份已变化：停在明确的结束状态，给出返回 / 重新登录，不自动跳转、不报成功
    errorText.value = isIdentityChanged(error)
      ? t('login.identityChanged')
      : error?.message || t('login.oauthFailed')
  }
})

// 回调参数已从地址栏清掉，刷新救不回来：失败时给出返回原页面和重新登录两个出口。
// 绑定第三方账号失败时用户仍是登录状态，只给返回
const backLabel = computed(() =>
  returnPath.value === '/' ? t('login.backToHome') : t('common.back')
)

function goBack() {
  void router.replace(returnPath.value)
}

function openLoginAgain() {
  const target = router.resolve(returnPath.value)
  void router.replace({ path: target.path, query: target.query, hash: '#login' })
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-app-surface px-6 text-text-primary">
    <div v-if="!errorText" class="text-center text-sm text-text-muted" role="status">
      {{ t('common.loading') }}
    </div>
    <div v-else class="flex max-w-sm flex-col items-center gap-5 text-center" role="alert">
      <p class="text-sm text-text-secondary">{{ errorText }}</p>
      <div class="flex gap-3">
        <UiButton :variant="authStore.isLogin ? 'primary' : 'secondary'" @click="goBack">
          {{ backLabel }}
        </UiButton>
        <UiButton v-if="!authStore.isLogin" variant="primary" @click="openLoginAgain">
          {{ t('login.loginAgain') }}
        </UiButton>
      </div>
    </div>
  </main>
</template>
