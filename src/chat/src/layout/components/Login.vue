<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { useAuthStore } from '@/store';
import { Close } from '@icon-park/vue-next';
import { NButton, NResult, TabsInst } from 'naive-ui';
import { computed, nextTick, ref } from 'vue';
import Email from './Login/Email.vue';
import Wechat from './Login/Wechat.vue';

defineProps<Props>();
let timer: any;
const authStore = useAuthStore();
const activeCount = ref(false);
const wxLoginUrl = ref('');
const sceneStr = ref('');
const tabsRef = ref<TabsInst | null>(null);
const showWxLogin = ref(true);
const tabName = ref('email');
const { isMobile } = useBasicLayout();

const emailLoginStatus = computed(
  () => Number(authStore.globalConfig.emailLoginStatus) === 1
);
const wechatRegisterStatus = computed(
  () => Number(authStore.globalConfig.wechatRegisterStatus) === 1
);
const phoneLoginStatus = computed(
  () => Number(authStore.globalConfig.phoneLoginStatus) === 1
);

/* 没有打开任何登录 */
const disabledReg = computed(() => {
  return (
    !wechatRegisterStatus.value &&
    !phoneLoginStatus.value &&
    !emailLoginStatus.value
  );
});

interface Props {
  visible: boolean;
}

function openDialog() {
  /* 没打开微信的话使用邮箱或者手机号 */
  if (!wechatRegisterStatus.value) {
    showWxLogin.value = false;
    if (phoneLoginStatus.value) {
      changeLoginType('phone');
    }
    if (emailLoginStatus.value) {
      changeLoginType('email');
    }
  }
}

function handleCloseDialog() {
  clearInterval(timer);
  wxLoginUrl.value = '';
  sceneStr.value = '';
  activeCount.value = false;
}

/* 切换登录类型 */
function changeLoginType(type: string) {
  if (type === 'wechat') {
    showWxLogin.value = true;
  } else {
    showWxLogin.value = false;
    tabName.value = type;
    nextTick(() => {
      tabsRef.value?.syncBarPosition();
    });
  }
}
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50 py-6"
  >
    <div
      class="bg-white p-6 rounded-lg shadow-lg w-full max-h-[70vh] flex flex-col dark:bg-gray-900 dark:text-gray-400 relative"
      :class="{ 'max-w-[95vw]': isMobile, 'max-w-xl': !isMobile }"
    >
      <Close
        size="18"
        class="absolute top-3 right-3 cursor-pointer z-30"
        @click="authStore.setLoginDialog(false)"
      />
      <div
        v-if="disabledReg"
        class="flex items-center justify-center h-[600px]"
      >
        <NResult
          size="small"
          status="403"
          title="网站已经关闭注册通道"
          description="请联系管理员开通吧"
        >
          <template #footer>
            <NButton size="small" @click="authStore.setLoginDialog(false)">
              知道了
            </NButton>
          </template>
        </NResult>
      </div>
      <div v-else class="flex-1 flex flex-col items-center">
        <Wechat
          v-if="wechatRegisterStatus && showWxLogin"
          @changeLoginType="changeLoginType"
        />
        <Email v-else @changeLoginType="changeLoginType" />
      </div>
    </div>
  </div>
</template>
