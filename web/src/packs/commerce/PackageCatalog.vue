<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import UiButton from '@/components/common/UiButton.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'
import PanelSwitcher from '@/components/common/PanelSwitcher.vue'
import type { ResData } from '@/api/types'
import { t } from '@/locales'
import { fetchGetPackagePlansAPI } from './api/package'
import { useCommerceBilling } from './billing'
import { useCommerceStore } from './store'
import PackagePlanCard from './PackagePlanCard.vue'
import { isLowerMembershipVariant, type PackagePlan, type PackageVariant } from './packagePlans'

const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ purchase: [plan: PackagePlan, variant: PackageVariant] }>()
const store = useCommerceStore()
const billing = useCommerceBilling()
const plans = ref<PackagePlan[]>([])
const loading = ref(true)
const failed = ref(false)
let requestId = 0
const currentWeight = computed(() =>
  billing.value.isMember ? Number(billing.value.packageWeight || 0) : 0
)
const memberships = computed(() => plans.value.filter(plan => plan.planType === 'membership'))
const credits = computed(() => plans.value.filter(plan => plan.planType === 'credit_pack'))

async function load() {
  const id = ++requestId
  loading.value = true
  failed.value = false
  try {
    const [response] = await Promise.all([
      fetchGetPackagePlansAPI<ResData<{ rows: PackagePlan[] }>>({ status: 1 }),
      store.refreshBilling(),
    ])
    if (id !== requestId) return
    if (!response.success) throw new Error('Package catalog unavailable')
    plans.value = response.data?.rows || []
  } catch {
    if (id === requestId) failed.value = true
  } finally {
    if (id === requestId) loading.value = false
  }
}

function purchase(plan: PackagePlan, variant: PackageVariant) {
  if (!props.active || isLowerMembershipVariant(plan, variant, currentWeight.value)) return
  emit('purchase', plan, variant)
}
onMounted(load)
onBeforeUnmount(() => {
  requestId++
})
</script>

<template>
  <section class="space-y-6">
    <div
      v-if="loading"
      class="ds-state-card ds-state-loading min-h-48"
      role="status"
      aria-busy="true"
    >
      <UiSpinner :size="14" class="mt-1" />
      <span>{{ t('common.loading') }}</span>
    </div>
    <div v-else-if="failed" class="ds-state-card min-h-48" role="alert">
      <span>{{ t('common.genericErrorRetry') }}</span>
      <UiButton variant="secondary" @click="load">{{ t('common.refresh') }}</UiButton>
    </div>
    <PanelSwitcher v-else :page="store.purchaseTab === 'membership' ? 1 : 2" :active="active">
      <template #first>
        <div
          id="purchase-panel-membership"
          role="tabpanel"
          aria-labelledby="purchase-tab-membership"
        >
          <div
            v-if="memberships.length"
            class="grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-5"
          >
            <PackagePlanCard
              v-for="plan in memberships"
              :key="plan.planKey"
              :plan="plan"
              :current-weight="currentWeight"
              @purchase="purchase"
            />
          </div>
          <p v-else class="py-16 text-center text-text-muted">{{ t('member.noRecords') }}</p>
        </div>
      </template>
      <template #second>
        <div id="purchase-panel-credits" role="tabpanel" aria-labelledby="purchase-tab-credits">
          <div
            v-if="credits.length"
            class="grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-5"
          >
            <PackagePlanCard
              v-for="plan in credits"
              :key="plan.planKey"
              :plan="plan"
              :current-weight="currentWeight"
              @purchase="purchase"
            />
          </div>
          <p v-else class="py-16 text-center text-text-muted">{{ t('member.noRecords') }}</p>
        </div>
      </template>
    </PanelSwitcher>
  </section>
</template>
