<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Coins, Crown, X } from '@lucide/vue'
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import UiSegmentedControl from './components/UiSegmentedControl.vue'
import { useDialogA11y } from '@/composables/useDialogA11y'
import { useAuthStore } from '@/store/modules/auth'
import { t } from '@/locales'
import { useCommerceStore } from './store'
import PackageCatalog from './PackageCatalog.vue'
import MemberPayment from './MemberPayment.vue'
import type { PackagePlan, PackageVariant } from './packagePlans'

const store = useCommerceStore()
const auth = useAuthStore()
const visible = computed(() => store.purchaseDialog)
const paying = ref(false)
const paymentRoot = ref<HTMLElement | null>(null)
const catalogRoot = ref<HTMLElement | null>(null)
let checkoutTrigger: HTMLElement | null = null
const tabs = computed(() => [
  {
    value: 'membership' as const,
    label: t('commerce.membershipPlans'),
    id: 'purchase-tab-membership',
    controls: 'purchase-panel-membership',
  },
  {
    value: 'credits' as const,
    label: t('commerce.creditPacks'),
    id: 'purchase-tab-credits',
    controls: 'purchase-panel-credits',
  },
])

function close() {
  const fromAccount = store.purchaseFromAccount
  store.closePackagePurchase()
  if (fromAccount) {
    store.accountReturnFocus = fromAccount
    store.openAccountData()
  }
}
const { setDialogRef, dialogAttrs } = useDialogA11y(visible, { onClose: close })

async function purchase(plan: PackagePlan, variant: PackageVariant) {
  checkoutTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  store.updateOrderInfo({
    pkgInfo: {
      ...variant,
      planKey: plan.planKey,
      planName: plan.planName,
      planDescription: plan.planDescription,
      planType: plan.planType,
      featureText: plan.featureText,
      features: plan.features,
      name: `${plan.planName} ${variant.variantName}`.trim() || variant.name,
    },
  })
  paying.value = true
  await nextTick()
  paymentRoot.value?.focus()
}
async function backToCatalog() {
  paying.value = false
  await nextTick()
  if (checkoutTrigger?.isConnected) checkoutTrigger.focus()
  else catalogRoot.value?.focus()
}
async function paymentSuccess() {
  // 到账结果仍留在支付页；摘要拉取失败不得把成功状态变成错误/重复购买入口。
  try {
    await store.refreshBilling()
  } catch {
    /* 账户数据页可手动重试刷新。 */
  }
}
watch(visible, value => {
  if (value) paying.value = false
})
watch(
  () => [auth.isLogin, auth.userInfo?.role, auth.token, auth.userInfo?.id],
  (current, previous) => {
    const identityChanged = current[2] !== previous[2] || current[3] !== previous[3]
    if (visible.value && (!auth.isLogin || auth.userInfo?.role === 'visitor' || identityChanged)) {
      store.closePackagePurchase()
      store.purchaseFromAccount = null
      store.accountReturnFocus = null
      store.updateOrderInfo({ pkgInfo: {} })
    }
  },
  { flush: 'sync' }
)
</script>

<template>
  <Transition name="modal-fade" appear>
    <div
      v-if="visible"
      class="fixed inset-0 z-dialog-elevated h-[100dvh] [--dialog-enter-scale:1] [--dialog-enter-y:0px]"
    >
      <div
        :ref="setDialogRef"
        v-bind="dialogAttrs"
        aria-labelledby="package-purchase-title"
        class="dialog-surface dialog-shell-fullscreen workspace-modal-shell overflow-hidden"
      >
        <header
          class="grid h-16 shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-b border-app-divider px-4 md:px-6"
        >
          <h2 id="package-purchase-title" class="sr-only">
            {{ t('commerce.purchaseTitle') }}
          </h2>
          <div aria-hidden="true"></div>
          <div class="flex min-w-0 justify-center">
            <UiSegmentedControl
              v-show="!paying"
              v-model="store.purchaseTab"
              :options="tabs"
              :label="t('commerce.purchaseTitle')"
              kind="tabs"
              class="ui-segmented-soft w-full max-w-sm"
            >
              <template #option="{ option }">
                <component
                  :is="option.value === 'membership' ? Crown : Coins"
                  :size="16"
                  class="block shrink-0 max-md:hidden"
                  aria-hidden="true"
                />
                <span class="truncate">{{ option.label }}</span>
              </template>
            </UiSegmentedControl>
          </div>
          <UiTooltip class="justify-self-end" :text="t('common.close')" placement="bottom">
            <UiButton icon :aria-label="t('common.close')" @click="close">
              <X :size="20" />
            </UiButton>
          </UiTooltip>
        </header>
        <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div
            class="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8 pb-[max(1.5rem,var(--safe-bottom))]"
          >
            <div v-show="!paying" ref="catalogRoot" tabindex="-1">
              <PackageCatalog :active="visible && !paying" @purchase="purchase" />
            </div>
            <div v-if="paying" ref="paymentRoot" tabindex="-1" class="mx-auto max-w-2xl">
              <MemberPayment
                :visible="visible"
                @back-to-main="backToCatalog"
                @payment-success="paymentSuccess"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
