<script lang="ts" setup>
import { fetchQueryOneCatAPI } from '@/api/appStore'
import logo from '@/assets/logo.png'
import { useAuthStore, useChatStore } from '@/store'
import { computed, ref, watch } from 'vue'

const appDetail: any = ref({ name: '', des: '', coverImg: '' })
const authStore = useAuthStore()
const logoPath = computed(() => authStore.globalConfig.clientLogoPath || logo)
// 获取用户昵称
const nickname = computed(() => (authStore.userInfo as any)?.nickname || '')
// 根据时间获取问候语
const greeting = computed(() => {
  const hour = new Date().getHours()
  let greet = ''

  if (hour < 6) greet = '凌晨好'
  else if (hour < 9) greet = '早上好'
  else if (hour < 12) greet = '上午好'
  else if (hour < 14) greet = '中午好'
  else if (hour < 18) greet = '下午好'
  else greet = '晚上好'

  if (nickname.value) {
    return `${greet}，${nickname.value}，欢迎使用${authStore.globalConfig?.siteName}`
  } else {
    return `${greet}，欢迎使用${authStore.globalConfig?.siteName}`
  }
})

const homeWelcomeContent =
  authStore.globalConfig?.homeWelcomeContent ||
  '我可以帮你写代码、读文件、写作各种创意内容，请把你的任务交给我吧~'
const chatStore = useChatStore()
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const activeAppId = computed(() => activeGroupInfo?.value?.appId || 0)

const queryAppInfo = async (appId: number) => {
  try {
    const res: any = await fetchQueryOneCatAPI({ id: appId })
    if (res.data) {
      appDetail.value = res.data
    } else {
      appDetail.value = { name: '', des: '', coverImg: '' }
    }
  } catch (error) {}
}

function bgRandomColor() {
  const hues = [
    'bg-blue-300',
    'bg-red-300',
    'bg-green-300',
    'bg-yellow-300',
    'bg-purple-300',
    'bg-pink-300',
  ]
  return hues[Math.floor(Math.random() * hues.length)]
}

watch(
  () => activeAppId.value,
  newVal => {
    if (newVal) {
      queryAppInfo(newVal)
    }
  },
  { immediate: true }
)
</script>

<template>
  <div v-if="activeAppId" class="flex flex-col justify-center items-center select-none">
    <div class="flex items-center mb-2">
      <img v-if="appDetail?.coverImg" :src="appDetail?.coverImg" alt="Logo" class="h-7 w-7 mr-2" />
      <div
        v-else
        :class="[
          'flex-shrink-0 dark:ring-gray-400 rounded-full w-7 h-7 flex items-center justify-center mr-2',
          bgRandomColor(),
        ]"
      >
        <span class="text-white text-sm md:text-lg">{{ appDetail.name.slice(0, 1) }}</span>
      </div>
      <h1 class="text-3xl font-bold text-primary-500">{{ appDetail?.name }}</h1>
    </div>
    <h2 class="mb-2 rounded px-4 py-2 text-center text-base text-gray-600">
      {{ appDetail?.des }}
    </h2>
  </div>

  <!-- 当 appDetail 不存在时显示的内容 -->
  <div v-else class="flex flex-col items-center justify-center select-none">
    <div class="flex items-center">
      <img :src="logoPath" alt="Logo" class="h-7 w-7 mr-2" />
      <h1 class="text-3xl font-bold text-primary-500">{{ greeting }}</h1>
    </div>
    <h2 class="rounded my-3 text-center text-base text-gray-600 dark:text-gray-400">
      {{ homeWelcomeContent }}
    </h2>
  </div>
</template>
