<script setup lang="ts">
import { ReceiptText } from '@lucide/vue'
import { MenuItem } from '@/components/common/DropdownMenu'
import { t } from '@/locales'
import { useCommerceStore } from './store'

/** 头像菜单里的账户数据入口。 */
const props = defineProps<{ close?: () => void }>()
const commerceStore = useCommerceStore()

function open() {
  commerceStore.openAccountData()
  props.close?.()
}
</script>

<template>
  <MenuItem @click="open">
    <template #icon>
      <ReceiptText :size="16" aria-hidden="true" />
    </template>
    <span>{{ t('commerce.accountData') }}</span>
  </MenuItem>
</template>
