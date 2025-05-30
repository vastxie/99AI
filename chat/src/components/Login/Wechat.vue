<script setup lang="ts">
import type { ResData } from '@/api/types'
import { fetchGetQRCodeAPI, fetchGetQRSceneStrAPI, fetchLoginBySceneStrAPI } from '@/api/user'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { message } from '@/utils/message'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const timer = ref()
const countdownTimer = ref()
const timerStartTime = ref(0)
const wxLoginUrl = ref('')
const sceneStr = ref('')
const activeCount = ref(false)
const loading = ref(true) // 控制加载状态
const ms = message()
const authStore = useAuthStore()
const { isMobile } = useBasicLayout()

const agreedToUserAgreement = ref(true) // 读取初始状态并转换为布尔类型
const useGlobalStore = useGlobalStoreWithOut()

// 点击"用户协议及隐私政策"时，自动同意
function handleClick() {
  agreedToUserAgreement.value = true // 设置为同意
  useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.AGREEMENT)
}
const globalConfig = computed(() => authStore.globalConfig)

function loadImage(src: string) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function getSeneStr() {
  const params = {}
  const res: ResData = await fetchGetQRSceneStrAPI(params)
  if (res.success) {
    sceneStr.value = res.data
    getQrCodeUrl()
  }
}

async function loginBySnece() {
  if (!sceneStr.value) return
  const res: ResData = await fetchLoginBySceneStrAPI({
    sceneStr: sceneStr.value,
  })
  if (res.data) {
    clearInterval(timer.value)
    ms.success(t('login.loginSuccess'))
    authStore.setToken(res.data)
    authStore.getUserInfo()
    authStore.setLoginDialog(false)
  }
}

async function getQrCodeUrl() {
  loading.value = true // 开始加载
  const res: ResData = await fetchGetQRCodeAPI({ sceneStr: sceneStr.value })
  if (res.success) {
    activeCount.value = true
    await loadImage(res.data)
    wxLoginUrl.value = res.data
    loading.value = false // 加载完成
    timerStartTime.value = Date.now()
    timer.value = setInterval(() => {
      if (Date.now() - timerStartTime.value > 60000) {
        clearInterval(timer.value)
        return
      }
      loginBySnece()
    }, 1000)
  }
}

function handleTimeDown() {
  // clearInterval(timer.value);
  getSeneStr()
  // 重新获取二维码无需依赖 countdownRef
}

onMounted(() => {
  handleTimeDown()
  if (countdownTimer.value !== null) {
    clearInterval(countdownTimer.value)
  }
  countdownTimer.value = setInterval(handleTimeDown, 60000)
  // getSeneStr();
})

onBeforeUnmount(() => {
  // 清除用于检测的timer
  if (timer.value !== null) {
    clearInterval(timer.value)
  }
  // 组件卸载时，也清除handleTimeDown的countdownTimer
  if (countdownTimer.value !== null) {
    clearInterval(countdownTimer.value)
  }
})
</script>

<template>
  <div class="w-full h-full flex flex-col justify-between" :class="isMobile ? 'px-5 ' : 'px-10 '">
    <div class="flex flex-col items-center flex-1">
      <div class="relative w-[200px] h-[200px] mb-6 mt-auto">
        <img
          v-if="wxLoginUrl && (agreedToUserAgreement || globalConfig.isAutoOpenAgreement !== '1')"
          class="w-full h-full select-none shadow-sm rounded-lg object-cover border border-gray-100 dark:border-gray-700"
          :src="wxLoginUrl"
          alt="微信登录二维码"
        />

        <div
          v-else
          class="w-full h-full rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
        ></div>

        <div
          v-if="loading"
          class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
        >
          <div
            class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400"
          ></div>
        </div>
      </div>

      <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">请使用微信扫描二维码登录</p>

      <div v-if="globalConfig.isAutoOpenAgreement === '1'" class="flex items-center mt-2">
        <input
          v-model="agreedToUserAgreement"
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-700 dark:bg-gray-800"
        />
        <p class="ml-2 text-sm text-gray-600 dark:text-gray-400">
          扫码登录即代表同意
          <a
            href="#"
            class="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
            @click="handleClick"
            >《用户协议及隐私协议》</a
          >
        </p>
      </div>
    </div>

    <!-- 添加空白div保持与Email组件对齐 -->
    <div class="h-6"></div>
  </div>
</template>
