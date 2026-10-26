<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import UiButton from '@/components/common/UiButton.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'
import type { ResData } from '@/api/types'
import { fetchGetRechargeLogAPI } from './api/balance'
import { formatDateTime, formatNumber, t, tp } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'

interface AccountLog {
  id: number
  rechargeType: number
  credits: number
  extent?: string
  tokenUsed?: number | null
  createdAt: string
}
const props = defineProps<{ visible: boolean; revision?: number }>()
const auth = useAuthStore()
const typeKeys: Record<number, string> = {
  1: 'regGift',
  2: 'inviteGift',
  3: 'referGift',
  4: 'packageGift',
  5: 'adminGift',
  6: 'scanPay',
  7: 'refund',
  8: 'signInReward',
  9: 'adminRecharge',
  10: 'chatDeduct',
  11: 'toolDeduct',
}
const logs = ref<AccountLog[]>([])
const loading = ref(false)
const failed = ref(false)
const page = ref(1)
const size = 10
const total = ref(0)
const pages = computed(() => Math.max(1, Math.ceil(total.value / size)))
let requestId = 0

async function load() {
  const id = ++requestId
  const token = auth.token
  const userId = auth.userInfo?.id
  const isCurrent = () => id === requestId && token === auth.token && userId === auth.userInfo?.id
  if (!props.visible || !auth.isLogin || auth.userInfo?.role === 'visitor') return
  loading.value = true
  failed.value = false
  try {
    const response = await fetchGetRechargeLogAPI<ResData<{ rows: AccountLog[]; count: number }>>({
      page: page.value,
      size,
    })
    if (!isCurrent()) return
    if (!response.success) throw new Error('Account details unavailable')
    logs.value = response.data?.rows || []
    total.value = response.data?.count || 0
  } catch {
    if (isCurrent()) {
      failed.value = true
      logs.value = []
    }
  } finally {
    if (isCurrent()) loading.value = false
  }
}
/** 变更积分带方向：消费类（10 起）一律记为支出；其余按记录本身的正负（管理员扣减是负数） */
function signedCredits(log: AccountLog) {
  return log.rechargeType >= 10 ? -Math.abs(log.credits) : log.credits
}
function formatCredit(log: AccountLog) {
  const amount = signedCredits(log)
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : ''
  const magnitude = Math.abs(amount)
  return `${sign}${tp('member.creditsAmount', magnitude, { amount: formatNumber(magnitude) })}`
}
function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : formatDateTime(date)
}
function changePage(value: number) {
  if (loading.value || value < 1 || value > pages.value) return
  page.value = value
  void load()
}
watch(
  () => [
    props.visible,
    props.revision,
    auth.isLogin,
    auth.token,
    auth.userInfo?.id,
    auth.userInfo?.role,
  ],
  () => {
    requestId++
    loading.value = false
    page.value = 1
    logs.value = []
    total.value = 0
    if (!props.visible) return
    void load()
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  requestId++
})
</script>

<template>
  <section :aria-label="t('member.accountDetails')" :aria-busy="loading" class="pb-2">
    <h3 class="settings-section-title mb-3">{{ t('member.accountDetails') }}</h3>
    <div v-if="loading" class="ds-state-card ds-state-loading min-h-40" role="status">
      <UiSpinner :size="14" class="mt-1" />
      <span>{{ t('common.loading') }}</span>
    </div>
    <div v-else-if="failed" class="ds-state-card min-h-40" role="alert">
      <span>{{ t('common.genericErrorRetry') }}</span>
      <UiButton variant="secondary" @click="load">{{ t('common.refresh') }}</UiButton>
    </div>
    <p v-else-if="!logs.length" class="py-10 text-center text-text-muted">
      {{ t('member.noRecords') }}
    </p>
    <ul v-else class="divide-y divide-app-divider">
      <li
        v-for="log in logs"
        :key="log.id"
        class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3"
      >
        <div class="min-w-0">
          <div class="type-control text-text-primary">
            {{ t(`member.${typeKeys[log.rechargeType] || 'unknown'}`) }}
          </div>
          <div class="type-caption mt-1 flex flex-wrap gap-x-3 gap-y-1 text-text-muted">
            <time :datetime="log.createdAt">{{ formatTime(log.createdAt) }}</time>
            <span v-if="log.tokenUsed != null">{{
              t('member.tokensUsed', { count: formatNumber(log.tokenUsed) })
            }}</span>
            <span v-else-if="log.extent" class="break-words">{{ log.extent }}</span>
          </div>
        </div>
        <span
          class="type-control whitespace-nowrap tabular-nums"
          :class="signedCredits(log) < 0 ? 'text-text-secondary' : 'text-text-link'"
        >
          {{ formatCredit(log) }}
        </span>
      </li>
    </ul>
    <nav
      v-if="total > size"
      class="mt-4 flex items-center justify-between gap-3 border-t border-app-divider pt-4"
      :aria-label="t('member.accountDetails')"
    >
      <UiButton
        variant="secondary"
        :disabled="loading || page === 1"
        @click="changePage(page - 1)"
        >{{ t('member.prevPage') }}</UiButton
      >
      <span class="type-caption text-text-muted" aria-live="polite">{{ page }} / {{ pages }}</span>
      <UiButton
        variant="secondary"
        :disabled="loading || page >= pages"
        @click="changePage(page + 1)"
        >{{ t('member.nextPage') }}</UiButton
      >
    </nav>
  </section>
</template>
