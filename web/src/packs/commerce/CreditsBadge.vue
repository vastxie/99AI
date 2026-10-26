<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber, tp } from '@/locales'
import { useCommerceBilling } from './billing'

/** 移动端设置首页用户名下方的积分标签（settings.mobile.badge 挂载点） */
const billing = useCommerceBilling()
const creditsText = computed(() => {
  const credits = Number(billing.value.credits ?? 0)
  const count = Number.isFinite(credits) ? credits : 0
  return tp('member.creditsAmount', count, { amount: formatNumber(count) })
})
</script>

<template>
  <div
    class="type-caption mt-1 inline-flex rounded-full border border-[color:var(--dialog-tag-border)] bg-[var(--dialog-tag-bg)] px-2 py-0.5 text-[color:var(--dialog-tag-text)]"
  >
    {{ creditsText }}
  </div>
</template>
