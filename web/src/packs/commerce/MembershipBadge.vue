<script setup lang="ts">
import { computed } from 'vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { useCommerceBilling } from './billing'
import { useCommerceStore } from './store'

/** 侧栏用户名下方的会员标识 / 升级入口（sider.user 挂载点） */
const authStore = useAuthStore()
const appStore = useAppStore()
const commerceStore = useCommerceStore()
const { isMobile } = useViewport()
const billing = useCommerceBilling()

const isActiveMember = computed(() => Boolean(billing.value.isMember))

const membershipButtonText = computed(() => {
  if (!isActiveMember.value) return t('member.upgradeMember')

  const packageName = String(billing.value.packageName || '').trim()
  if (packageName) return packageName

  const packageWeight = Number(billing.value.packageWeight || 0)
  if (packageWeight >= 2) return t('member.professionalMember')
  if (packageWeight >= 1) return t('member.advancedMember')
  return t('member.activeMember')
})

function openMemberCenter() {
  if (!authStore.isLogin || authStore.userInfo?.role === 'visitor') {
    authStore.setLoginDialog(true)
    return
  }
  commerceStore.openPackagePurchase('membership')
  if (isMobile.value) appStore.setSiderCollapsed(true)
}
</script>

<template>
  <button
    v-if="!isActiveMember"
    type="button"
    class="fg-link-muted flex min-w-0 items-center text-xs leading-4 font-normal transition-colors"
    :aria-label="t('member.upgradeMember')"
    @click.stop="openMemberCenter"
  >
    <span class="min-w-0 truncate">{{ membershipButtonText }}</span>
  </button>
  <div v-else class="flex min-w-0 items-center text-xs leading-4 font-normal text-text-muted">
    <span class="min-w-0 truncate">{{ membershipButtonText }}</span>
  </div>
</template>
