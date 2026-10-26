<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'

import { fetchOAuthUrlAPI, fetchUnbindAuthIdentityAPI, type AuthIdentityView } from '@/api/user'
import { getLoginMethodUi } from '@/auth/loginMethodUi'
import { t } from '@/locales'
import { message } from '@/utils/message'
import { saveOAuthRedirectPath } from '@/views/auth/oauthRedirect'
import { KeyRound } from '@lucide/vue'
import type { Component } from 'vue'
import type { IdentityRow } from './useAuthIdentities'

/** 账号页「账户安全」里的登录方式行：绑定 / 解绑；验证码与扫码类交给父组件切换绑定视图 */
interface Props {
  rows: IdentityRow[]
}

defineProps<Props>()
const emit = defineEmits<{
  bind: [row: IdentityRow]
  changed: []
}>()

const ms = message()

function iconOf(row: IdentityRow): Component {
  return getLoginMethodUi(row.provider)?.icon || KeyRound
}

function descriptionOf(row: IdentityRow) {
  const identity: AuthIdentityView | undefined = row.identity
  if (!identity) return t('settings.notBound')
  return identity.email || identity.phone || identity.nickname || t('settings.bound')
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

async function startBind(row: IdentityRow) {
  if (row.kind !== 'oauth') {
    emit('bind', row)
    return
  }
  try {
    const redirectPath = saveOAuthRedirectPath()
    const res = await fetchOAuthUrlAPI<string | { url?: string; authUrl?: string }>(row.provider, {
      scene: 'bind',
      redirectPath,
    })
    const authUrl = normalizeOAuthUrl(res.data)
    if (res.success && authUrl) {
      window.location.href = authUrl
      return
    }
    ms.error(res.message || t('common.operationFailed'))
  } catch (error: any) {
    ms.error(error?.message || t('common.operationFailed'))
  }
}

async function unbind(row: IdentityRow) {
  if (!row.identity?.id) return
  try {
    const res = await fetchUnbindAuthIdentityAPI<string>(row.identity.id)
    if (res.success) {
      ms.success(String(res.data || t('settings.unbind')))
      emit('changed')
    } else {
      ms.error(res.message || t('settings.unbindFailed'))
    }
  } catch (error: any) {
    ms.error(error?.message || t('settings.unbindFailed'))
  }
}
</script>

<template>
  <div
    v-for="row in rows"
    :key="row.provider"
    class="flex items-center justify-between"
    :data-account-entry="`identity:${row.provider}`"
  >
    <div class="flex items-center">
      <div>
        <div class="settings-field-title flex items-center">
          {{ row.displayName }}
          <component :is="iconOf(row)" :size="16" class="ml-1 text-text-muted" />
        </div>
        <div class="settings-field-description">{{ descriptionOf(row) }}</div>
      </div>
    </div>
    <UiButton variant="secondary" v-if="row.bound" class="min-w-[4.25rem]" @click="unbind(row)">
      {{ t('settings.unbind') }}
    </UiButton>
    <UiButton
      variant="secondary"
      v-else-if="row.canBind"
      class="min-w-[4.25rem]"
      @click="startBind(row)"
    >
      {{ t('common.bind') }}
    </UiButton>
  </div>
</template>
