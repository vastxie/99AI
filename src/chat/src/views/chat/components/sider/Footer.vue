<script setup lang='ts'>
import { ExitOutline } from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import { computed } from 'vue'
import { HoverButton, UserAvatar } from '@/components/common'
import { useAuthStore } from '@/store'
const authStore = useAuthStore()
const isLogin = computed(() => !!authStore.token)
</script>

<template>
  <footer class="flex items-center justify-between min-w-0 p-4 overflow-hidden border-t dark:border-neutral-800">
    <div class="flex-1 flex-shrink-0 overflow-hidden">
      <UserAvatar />
    </div>
    <HoverButton v-if="isLogin" tooltip="退出账户登录">
      <NIcon size="18" color="#0e7a0d" @click="authStore.logOut()">
        <ExitOutline />
      </NIcon>
    </HoverButton>
  </footer>
</template>
