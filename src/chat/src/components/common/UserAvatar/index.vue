<script setup lang='ts'>
import { computed, defineAsyncComponent, ref } from 'vue'
import { NAvatar, NButton } from 'naive-ui'
import { useAuthStore } from '@/store'
import defaultAvatar from '@/assets/avatar.png'
import { isString } from '@/utils/is'
const authStore = useAuthStore()

const Setting = defineAsyncComponent(() => import('@/components/common/Setting/index.vue'))
const userInfo = computed(() => authStore.userInfo)
const loginComplete = computed(() => authStore.token)
const show = ref(false)

function openDialog() {
  if (!loginComplete.value)
    authStore.setLoginDialog(true)
  else
    show.value = true
}
</script>

<template>
  <div class="flex items-center overflow-hidden">
    <div class="w-10 h-10 overflow-hidden rounded-full shrink-0">
      <template v-if="isString(userInfo.avatar) && userInfo.avatar.length > 0">
        <NAvatar
          class="cursor-pointer"
          size="large"
          round
          :src="userInfo.avatar"
          :fallback-src="defaultAvatar"
          @click="openDialog"
        />
      </template>
      <template v-else>
        <NAvatar size="large" round :src="defaultAvatar" @click="openDialog" />
      </template>
    </div>
    <div class="flex-1 min-w-0 ml-2">
      <h2 v-if="loginComplete" class="overflow-hidden font-bold text-md text-ellipsis whitespace-nowrap cursor-pointer" @click="show = true">
        {{ userInfo.username ?? '未登录' }}
      </h2>
      <NButton v-if="!loginComplete" text @click="authStore.setLoginDialog(true)">
        登录/注册
      </NButton>
      <!-- <p class="overflow-hidden text-xs text-gray-500 text-ellipsis whitespace-nowrap">
        <span> 点击购买卡密</span>
      </p> -->
    </div>
    <Setting v-if="show" v-model:visible="show" />
  </div>
</template>
