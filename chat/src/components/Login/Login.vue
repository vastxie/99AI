<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStore } from '@/store'
import { Close } from '@icon-park/vue-next'
import { computed, onMounted, ref } from 'vue'
import Email from './Email.vue'
import Wechat from './Wechat.vue'

defineProps<Props>()
const authStore = useAuthStore()
const { isMobile } = useBasicLayout()

// 当前登录类型：wechat(微信登录), password(密码登录), captcha(验证码登录)
const loginType = ref('wechat')

const emailLoginStatus = computed(() => Number(authStore.globalConfig.emailLoginStatus) === 1)
const wechatRegisterStatus = computed(
  () => Number(authStore.globalConfig.wechatRegisterStatus) === 1
)
const phoneLoginStatus = computed(() => Number(authStore.globalConfig.phoneLoginStatus) === 1)

// 自动选择合适的登录方式
onMounted(() => {
  setDefaultLoginType()
})

// 根据可用的登录方式设置默认登录类型
function setDefaultLoginType() {
  if (wechatRegisterStatus.value) {
    loginType.value = 'wechat'
  } else if (emailLoginStatus.value || phoneLoginStatus.value) {
    loginType.value = 'captcha'
  } else {
    loginType.value = 'password'
  }
}

interface Props {
  visible: boolean
}

/* 切换登录类型 */
function changeLoginType(type: string) {
  loginType.value = type
}
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50"
  >
    <div
      class="bg-white py-12 rounded-xl shadow-lg w-full h-[32rem] flex flex-col dark:bg-gray-900 dark:text-gray-300 relative"
      :class="{ 'w-[98vw] px-4': isMobile, 'max-w-xl px-8': !isMobile }"
    >
      <button
        @click="authStore.setLoginDialog(false)"
        class="btn-icon btn-sm absolute top-4 right-4 z-30 text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <Close theme="outline" size="18" />
      </button>

      <div class="flex-1 flex flex-col items-center justify-center">
        <!-- 登录类型切换栏 -->
        <div
          class="w-full flex justify-center mb-10"
          :class="{ 'px-5': isMobile, 'px-10': !isMobile }"
        >
          <div class="tab-group tab-group-default dark:bg-gray-800">
            <button
              v-if="wechatRegisterStatus"
              @click="changeLoginType('wechat')"
              class="tab tab-lg"
              :class="{ 'tab-active': loginType === 'wechat', 'px-0': isMobile }"
            >
              微信登录
            </button>
            <button
              v-if="emailLoginStatus || phoneLoginStatus"
              @click="changeLoginType('captcha')"
              class="tab tab-lg"
              :class="{ 'tab-active': loginType === 'captcha', 'px-0': isMobile }"
            >
              验证码登录
            </button>
            <button
              @click="changeLoginType('password')"
              class="tab tab-lg"
              :class="{ 'tab-active': loginType === 'password', 'px-0': isMobile }"
            >
              密码登录
            </button>
          </div>
        </div>

        <!-- 登录组件区域 -->
        <div class="w-full flex-1 flex flex-col overflow-hidden">
          <Wechat v-if="loginType === 'wechat'" @changeLoginType="changeLoginType" />
          <Email
            v-else
            :login-mode="loginType === 'password' ? 'password' : 'captcha'"
            @changeLoginType="changeLoginType"
          />
        </div>
      </div>
    </div>
  </div>
</template>
