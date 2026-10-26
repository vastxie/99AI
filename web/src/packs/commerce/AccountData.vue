<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { CalendarCheck, RefreshCw } from '@lucide/vue'
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import { formatDate, formatNumber, t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useCommerceBilling } from './billing'
import { useCommerceStore } from './store'
import AccountDetails from './AccountDetails.vue'

const props = defineProps<{ visible: boolean }>()
const store = useCommerceStore()
const auth = useAuthStore()
const billing = useCommerceBilling()
const active = ref(true)
const busy = ref(false)
const failed = ref(false)
const detailsRevision = ref(0)
const root = ref<HTMLElement | null>(null)
const visible = computed(() => props.visible && active.value)
let requestId = 0
const membership = computed(() => {
  if (!billing.value.isMember) return t('member.nonMember')
  if (billing.value.packageName) return billing.value.packageName
  return t(
    Number(billing.value.packageWeight || 0) >= 2
      ? 'member.professionalMember'
      : 'member.activeMember'
  )
})
const credits = computed(() =>
  billing.value.sumCredits > 999999
    ? t('member.unlimitedQuota')
    : formatNumber(billing.value.sumCredits)
)
/**
 * 到期日：服务端给的是 'YYYY-MM-DD'（没有时区）。new Date() 会按 UTC 零点解析、再按本地时区显示，
 * 在西半球会早一天：按年、月、日拼成本地日期再格式化；带时间的完整时间戳照常解析
 */
function parseExpiry(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  return dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value)
}
const expiry = computed(() => {
  if (!billing.value.isMember || !billing.value.expirationTime) return ''
  const date = parseExpiry(String(billing.value.expirationTime))
  return Number.isNaN(date.getTime()) ? '' : formatDate(date)
})
async function refresh() {
  const id = ++requestId
  busy.value = true
  failed.value = false
  detailsRevision.value++
  try {
    await store.refreshBilling()
  } catch {
    if (id === requestId) failed.value = true
  } finally {
    if (id === requestId) busy.value = false
  }
}
watch(
  visible,
  value => {
    if (value) void refresh()
    else {
      requestId++
      busy.value = false
    }
  },
  { immediate: true }
)
onActivated(() => {
  active.value = true
})
onDeactivated(() => {
  active.value = false
})
onBeforeUnmount(() => {
  requestId++
})
watch(
  () => [visible.value, store.accountReturnFocus],
  async () => {
    if (!visible.value || !store.accountReturnFocus) return
    await nextTick()
    if (!visible.value || !store.accountReturnFocus) return
    const button = root.value?.querySelector<HTMLElement>(
      `[data-purchase-entry="${store.accountReturnFocus}"]`
    )
    if (button) {
      store.accountReturnFocus = null
      button.focus()
    }
  },
  { immediate: true, flush: 'post' }
)
</script>

<template>
  <div ref="root" class="space-y-6" data-account-data>
    <section
      class="space-y-4 border-b border-app-divider pb-6"
      :aria-label="t('commerce.accountOverview')"
    >
      <dl class="grid grid-cols-2 gap-4">
        <div class="min-w-0">
          <dt class="type-caption text-text-muted">{{ t('member.memberStatus') }}</dt>
          <dd class="type-section-title mt-1 break-words text-text-primary">{{ membership }}</dd>
          <dd v-if="expiry" class="type-caption mt-1 text-text-muted">
            {{ t('member.expiresOnDate', { date: expiry }) }}
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="type-caption text-text-muted">{{ t('commerce.availableCredits') }}</dt>
          <dd class="type-section-title mt-1 text-text-primary">{{ credits }}</dd>
        </div>
      </dl>
      <div class="flex flex-wrap items-center gap-2">
        <UiButton
          variant="primary"
          data-purchase-entry="membership"
          @click="store.openPackagePurchase('membership', true)"
          >{{ t('commerce.browsePlans') }}</UiButton
        >
        <UiButton
          variant="secondary"
          data-purchase-entry="credits"
          @click="store.openPackagePurchase('credits', true)"
          >{{ t('commerce.buyCredits') }}</UiButton
        >
        <UiTooltip
          v-if="Number(auth.globalConfig?.signInStatus) === 1"
          :text="t('member.dailySignIn')"
        >
          <UiButton
            icon
            :aria-label="t('member.dailySignIn')"
            @click="store.updateSignInDialog(true)"
          >
            <CalendarCheck :size="18" />
          </UiButton>
        </UiTooltip>
        <UiTooltip :text="t('common.refresh')">
          <UiButton icon :aria-label="t('common.refresh')" :disabled="busy" @click="refresh">
            <RefreshCw :size="18" />
          </UiButton>
        </UiTooltip>
      </div>
      <p v-if="failed" role="alert" class="type-caption text-semantic-danger">
        {{ t('common.genericErrorRetry') }}
      </p>
    </section>
    <AccountDetails :visible="visible" :revision="detailsRevision" />
  </div>
</template>
