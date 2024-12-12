<script setup lang="ts">
import useSettingsStore from '@/store/modules/settings'

defineOptions({
  name: 'Logo',
})

withDefaults(
  defineProps<{
    showLogo?: boolean
    showTitle?: boolean
  }>(),
  {
    showLogo: true,
    showTitle: true,
  },
)

const { pkg } = __SYSTEM_INFO__

const settingsStore = useSettingsStore()

const title = ref(import.meta.env.VITE_APP_TITLE)

// 校验 title 是否包含 "AIWeb"
const encodedKeyword = 'QUlXZWI=' // "AIWeb" 的 Base64 编码
const decodedKeyword = atob(encodedKeyword)

if (!title.value.includes(decodedKeyword)) {
  document.body.innerHTML = '<h1></h1>'
  throw new Error('')
}

const to = computed(() => settingsStore.settings.home.enable ? settingsStore.settings.home.fullPath : '')
</script>

<template>
  <RouterLink :to="to" class="h-[var(--g-sidebar-logo-height)] w-inherit flex-center gap-2 px-3 text-inherit no-underline" :class="{ 'cursor-pointer': settingsStore.settings.home.enable }" :title="title">
    <!-- <img v-if="showLogo" :src="logo" class="logo h-[30px] w-[30px] object-contain"> -->
    <span v-if="showTitle" class="block truncate font-bold">{{ title }}-{{ pkg.version }}</span>
  </RouterLink>
</template>
