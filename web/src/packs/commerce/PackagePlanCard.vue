<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check } from '@lucide/vue'
import UiButton from '@/components/common/UiButton.vue'
import UiSegmentedControl from './components/UiSegmentedControl.vue'
import { formatNumber, t } from '@/locales'
import {
  billingCycleText,
  isLowerMembershipVariant,
  moneyText,
  type PackagePlan,
  type PackageVariant,
} from './packagePlans'

const props = defineProps<{ plan: PackagePlan; currentWeight: number }>()
const emit = defineEmits<{ purchase: [plan: PackagePlan, variant: PackageVariant] }>()
const selectedId = ref<number>()
const variant = computed(
  () =>
    props.plan.variants.find(item => item.id === selectedId.value) ||
    props.plan.variants.find(item => item.id === props.plan.defaultVariantId) ||
    props.plan.variants[0]
)
const unavailable = computed(
  () => !variant.value || isLowerMembershipVariant(props.plan, variant.value, props.currentWeight)
)
const variantOptions = computed(() =>
  props.plan.variants.map(option => ({
    value: option.id,
    label: option.variantName || billingCycleText(option),
  }))
)
function hideLeavingDetails(element: Element) {
  element.setAttribute('aria-hidden', 'true')
}
</script>

<template>
  <article
    v-if="variant"
    class="flex min-w-0 flex-col gap-5 rounded-[var(--radius-card)] border border-app-border bg-app-surface p-6"
    :data-plan-key="plan.planKey"
  >
    <div>
      <div
        class="flex min-h-9 items-center justify-between gap-3 [@media(pointer:coarse)]:min-h-[calc(var(--control-touch-size)+0.5rem)]"
      >
        <h3 class="type-section-title min-w-0 break-words text-text-primary">
          {{ plan.planName }}
        </h3>
        <UiSegmentedControl
          v-if="plan.variants.length > 1"
          :model-value="variant.id"
          :options="variantOptions"
          :label="plan.planName"
          class="ui-segmented-soft max-w-[60%] shrink-0"
          compact
          @update:model-value="selectedId = $event"
        />
      </div>
      <p v-if="plan.planDescription" class="type-caption mt-2 text-text-muted">
        {{ plan.planDescription }}
      </p>
    </div>
    <div class="relative grid" aria-live="polite" aria-atomic="true">
      <!-- 换规格：新内容升起淡入，旧内容浮在原位淡出（不占布局、不可交互、读屏跳过） -->
      <Transition
        enter-active-class="text-rise-enter"
        leave-active-class="text-fade-leave absolute inset-x-0 top-0 pointer-events-none"
        @before-leave="hideLeavingDetails"
      >
        <div :key="variant.id" class="w-full space-y-5" data-package-details>
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span class="text-3xl font-semibold tracking-tight text-text-primary"
              >¥{{ moneyText(variant.price) }}</span
            >
            <span class="type-control text-text-muted">
              {{ variant.billingCycle === 'one_time' ? '' : '/ ' }}{{ billingCycleText(variant) }}
            </span>
            <span v-if="variant.badgeText" class="type-caption text-text-link">{{
              variant.badgeText
            }}</span>
          </div>
          <div class="flex items-center justify-between gap-3 border-t border-app-divider pt-4">
            <span class="type-control text-text-muted">{{ t('member.credits') }}</span>
            <span class="type-control font-medium text-text-primary">{{
              formatNumber(Number(variant.credits) || 0)
            }}</span>
          </div>
        </div>
      </Transition>
    </div>
    <ul v-if="plan.features.length" class="space-y-3">
      <li
        v-for="(feature, index) in plan.features"
        :key="index"
        class="type-control flex gap-2 text-text-secondary"
      >
        <Check :size="16" class="mt-0.5 shrink-0 text-text-link" aria-hidden="true" />
        <span>{{ feature }}</span>
      </li>
    </ul>
    <div class="mt-auto pt-1">
      <UiButton
        variant="primary"
        class="w-full"
        :disabled="unavailable"
        @click="emit('purchase', plan, variant)"
      >
        {{ unavailable ? t('commerce.lowerTierUnavailable') : t('member.purchasePackage') }}
      </UiButton>
    </div>
  </article>
</template>
