<script setup lang="ts">
import logo from '@/assets/logo.png'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppStore, useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { ExpandRight, User, VipOne } from '@icon-park/vue-next'
import type { CSSProperties } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import List from './List.vue'

const useGlobalStore = useGlobalStoreWithOut()

const appStore = useAppStore()
const chatStore = useChatStore()
const authStore = useAuthStore()

const model3AnimationRef = ref<number | null>(null)
const model4AnimationRef = ref<number | null>(null)
const modelMjAnimationRef = ref<number | null>(null)

const userBalance = computed(() => authStore.userBalance)
const usingPlugin = computed(() => chatStore.currentPlugin)

const oldUse3Token = ref(0)
const newUse3Token = ref(0)
const oldUse4Token = ref(0)
const newUse4Token = ref(0)
const oldUseMjToken = ref(0)
const newUseMjToken = ref(0)
const { isMobile } = useBasicLayout()
const isLogin = computed(() => authStore.isLogin)
const logoPath = computed(() => authStore.globalConfig.clientLogoPath || logo)
const siteName = authStore.globalConfig?.siteName || 'AIWeb'
const model3Name = computed(() => authStore.globalConfig.model3Name || t('chat.ordinaryPoints'))
const model4Name = computed(() => authStore.globalConfig.model4Name) || t('chat.advancedPoints')
const drawMjName = computed(() => authStore.globalConfig.drawMjName) || t('chat.drawingPoints')

// const addLoading = ref(false);
const avatar = computed(() => authStore.userInfo.avatar)

const collapsed = computed(() => appStore.siderCollapsed)

const activeGroupInfo = computed(() => {
  const info = chatStore.groupList.find((item: any) => item.uuid === chatStore.active)
  return info
})

const configObj = computed(() => {
  try {
    return JSON.parse(activeGroupInfo.value?.config || '{}')
  } catch (e) {
    return {} // 解析失败时返回一个空对象
  }
})

const activeModelDeductType = computed(() => chatStore?.activeModelDeductType)

const displayInfo = computed(() => {
  const deductType =
    usingPlugin?.value?.deductType || configObj.value.deductType || activeModelDeductType.value

  let remainingPoints
  let buttonText

  switch (deductType) {
    case 1:
      remainingPoints = userBalance.value.sumModel3Count || 0
      buttonText = model3Name.value
      break
    case 2:
      remainingPoints = userBalance.value.sumModel4Count || 0
      buttonText = model4Name.value
      break
    case 3:
      remainingPoints = userBalance.value.sumDrawMjCount || 0
      buttonText = drawMjName.value
      break
    default:
      remainingPoints = 0
      buttonText = t('chat.points')
  }

  // 如果 remainingPoints 大于 99999，设置为 "不限" 并将 buttonText 设置为 "次数"
  if (remainingPoints > 99999) {
    remainingPoints = '不限'
    buttonText = '次数'
  }

  return { remainingPoints, buttonText }
})

function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value)
}

function toggleLogin() {
  if (isLogin.value) authStore.logOut()
  else authStore.setLoginDialog(true)
}

const getMobileClass = computed<CSSProperties>(() => {
  if (isMobile.value) {
    return {
      position: 'fixed',
      zIndex: 50,
    }
  }
  return {}
})

const mobileSafeArea = computed(() => {
  if (isMobile.value) {
    return {
      paddingBottom: 'env(safe-area-inset-bottom)',
    }
  }
  return {}
})

watch(
  isMobile,
  val => {
    appStore.setSiderCollapsed(val)
  },
  {
    immediate: true,
    flush: 'post',
  }
)

// 添加原生数字动画方法
function animateNumber(
  startValue: number,
  endValue: number,
  duration: number = 1000,
  callback: (value: number) => void
) {
  const startTime = performance.now()
  const difference = endValue - startValue

  const animateStep = (currentTime: number) => {
    const elapsedTime = currentTime - startTime

    if (elapsedTime < duration) {
      const value = startValue + difference * (elapsedTime / duration)
      callback(Math.round(value))
      requestAnimationFrame(animateStep)
    } else {
      callback(endValue)
    }
  }

  requestAnimationFrame(animateStep)
}

// 更新watch函数使用新的动画方法
watch(
  () => authStore.userBalance.useModel3Token,
  (newVal, oldVal) => {
    oldUse3Token.value = oldVal || 0
    newUse3Token.value = newVal || 0
    model3AnimationRef.value = newVal
    // 执行数字动画
    const displayElement = document.getElementById('model3-count')
    if (displayElement) {
      animateNumber(oldVal || 0, newVal || 0, 1000, value => {
        displayElement.textContent = value.toString()
      })
    }
  },
  {
    immediate: true,
    flush: 'post',
  }
)

watch(
  () => authStore.userBalance.useModel4Token,
  (newVal, oldVal) => {
    oldUse4Token.value = oldVal || 0
    newUse4Token.value = newVal || 0
    model4AnimationRef.value = newVal
  },
  {
    immediate: true,
    flush: 'post',
  }
)

watch(
  () => authStore.userBalance.useDrawMjToken,
  (newVal, oldVal) => {
    oldUseMjToken.value = oldVal || 0
    newUseMjToken.value = newVal || 0
    modelMjAnimationRef.value = newVal
  },
  {
    immediate: true,
    flush: 'post',
  }
)

onMounted(() => {
  chatStore.queryPlugins()
  chatStore.queryMyGroup()
})

function openSettings(tab?: number) {
  if (isMobile.value) {
    useGlobalStore.updateMobileSettingsDialog(true, tab)
    appStore.setSiderCollapsed(true)
  } else {
    useGlobalStore.updateSettingsDialog(true, tab)
  }
}
</script>

<template>
  <div>
    <div
      class="fixed top-0 left-0 z-40 h-full transition-all duration-500 ease-in-out"
      :class="[
        isMobile ? 'w-[260px]' : 'w-[260px]',
        collapsed ? '-translate-x-full' : 'translate-x-0',
      ]"
      :style="getMobileClass"
    >
      <div
        class="flex flex-col h-full bg-opacity dark:bg-gray-900 select-none"
        :style="mobileSafeArea"
      >
        <main class="flex flex-col h-full flex-1">
          <div
            class="flex bg-opacity w-full justify-between items-center px-4 dark:bg-gray-900 pt-3"
          >
            <div
              class="w-full py-1 text-primary-600 dark:text-gray-100 text-lg font-bold flex justify-between items-center"
            >
              <!-- 左边的图标 -->
              <img :src="logoPath" alt="Logo" class="h-7 w-7 rounded-lg" />
              <!-- 中间的文字 -->
              <span class="mx-auto">{{ siteName }}</span>
              <!-- 右边占位，使得文字在中间 -->
              <!-- <span class="h-7 w-7"></span> -->

              <div class="relative group">
                <button
                  type="button"
                  class="btn-icon btn-icon-collapse btn-md"
                  @click="handleUpdateCollapsed"
                  aria-label="折叠侧边栏"
                >
                  <ExpandRight size="22" />
                </button>
                <!-- 悬停提示 - 展开侧边栏 -->
                <div v-if="!isMobile" class="tooltip tooltip-right">折叠侧栏</div>
              </div>
            </div>
          </div>

          <div class="flex-1 min-h-0 overflow-hidden">
            <List />
          </div>
          <div
            class="p-4 pb-1 py-2 border-t-gray-100 dark:border-t-gray-800 flex items-center justify-between text-left w-full"
          >
            <!-- 登录用户 - 直接点击打开设置对话框 -->
            <div
              v-if="isLogin"
              @click="openSettings(undefined)"
              class="flex items-center justify-center cursor-pointer group relative mr-3 mb-2"
              role="button"
              aria-label="打开设置中心"
              tabindex="0"
            >
              <div class="avatar avatar-lg avatar-bordered avatar-primary">
                <img
                  v-if="avatar"
                  :src="avatar"
                  class="w-full h-full object-cover"
                  alt="用户头像"
                />
                <User
                  v-if="!avatar"
                  theme="outline"
                  size="20"
                  class="text-white"
                  aria-hidden="true"
                />
              </div>
              <div v-if="!isMobile" class="tooltip tooltip-top">设置</div>
            </div>

            <!-- 未登录用户 -->
            <div
              v-if="!isLogin"
              @click="toggleLogin"
              class="flex flex-1 items-center justify-center cursor-pointer"
            >
              <button type="button" class="btn btn-pill mb-2 w-full" aria-label="登录或注册账号">
                <span>登录 / 注册</span>
              </button>
            </div>

            <!-- 显示积分/VIP中心 -->
            <div
              v-if="isLogin"
              @click="openSettings(DIALOG_TABS.MEMBER)"
              class="flex flex-1 items-center justify-center cursor-pointer"
            >
              <button
                type="button"
                class="btn btn-pill mb-2 w-full h-9"
                :class="{ 'text-amber-500': Number(displayInfo.remainingPoints) < 10 }"
                :aria-label="
                  Number(displayInfo.remainingPoints) < 10
                    ? '打开VIP中心'
                    : `您有${displayInfo.remainingPoints}${displayInfo.buttonText}`
                "
              >
                <!-- 当积分小于10时显示钻石图标 -->
                <VipOne
                  v-if="
                    Number(displayInfo.remainingPoints) < 10 ||
                    displayInfo.remainingPoints === '不限'
                  "
                  theme="filled"
                  size="18"
                  class="mr-3 text-yellow-400 dark:text-yellow-600"
                />

                <span>{{
                  Number(displayInfo.remainingPoints) < 10
                    ? t('chat.vipCenter')
                    : `${displayInfo.remainingPoints}${displayInfo.buttonText}`
                }}</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>

    <!-- 移动端遮罩 -->
    <template v-if="isMobile">
      <div
        v-show="!collapsed"
        class="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ease-in-out"
        @click="handleUpdateCollapsed"
      />
    </template>
  </div>
</template>
