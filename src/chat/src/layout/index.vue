<script setup lang="ts">
import type { ResData } from '@/api/types';
import { fetchLoginByCodeAPI, fetchWxLoginRedirectAPI } from '@/api/user';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { useAppStore, useAuthStore, useGlobalStoreWithOut } from '@/store';
import { NLayoutContent, useMessage } from 'naive-ui';
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppDialog from './components/AppDialog.vue';
import BadWordsDialog from './components/BadWordsDialog.vue';
import BindWxDialog from './components/BindWx.vue';
import GoodsDialog from './components/GoodsDialog.vue';
import Identity from './components/Identity.vue';
import Login from './components/Login.vue';
import NoticeDialog from './components/NoticeDialog.vue';
import PayDialog from './components/PayDialog.vue';
import PhoneIdentity from './components/PhoneIdentity.vue';
import SignInDialog from './components/SignInDialog.vue';
import UserAgreementDialog from './components/UserAgreementDialog.vue';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const useGlobalStore = useGlobalStoreWithOut();
const appStore = useAppStore();
const ms = useMessage();
const payDialog = computed(() => useGlobalStore.payDialog);
const goodsDialog = computed(() => useGlobalStore.goodsDialog);
const noticeDialog = computed(() => useGlobalStore.noticeDialog);
const bindWxDialog = computed(() => useGlobalStore.bindWxDialog);
const signInDialog = computed(() => useGlobalStore.signInDialog);
const appDialog = computed(() => useGlobalStore.appDialog);
const identityDialog = computed(() => useGlobalStore.identityDialog);
const phoneIdentityDialog = computed(() => useGlobalStore.phoneIdentityDialog);
const userAgreementDialog = computed(() => useGlobalStore.userAgreementDialog);
const badWordsDialog = computed(() => useGlobalStore.BadWordsDialog);
// const modelDialog = computed(() => useGlobalStore.modelDialog);
const { isMobile } = useBasicLayout();
const loginDialog = computed(() => authStore.loginDialog);
// const globalConfigLoading = computed(() => authStore.globalConfigLoading);
const theme = computed(() => appStore.theme);
const isLogin = computed(() => authStore.isLogin);
const wechatSilentLoginStatus = computed(
  () => Number(authStore.globalConfig?.wechatSilentLoginStatus) === 1
);
// const homePath = computed(() => authStore.globalConfig?.clientHomePath);

/* 如果在vx环境并且携带了code则静默登录 */

function handleCheckOtherLoginByToken() {
  const { token } = route.query;
  if (token) {
    authStore.setToken(token);
    const name = route.name;
    router.replace({ name, query: {} });
    ms.success('账户登录成功、开始体验吧！');
    authStore.getUserInfo();
  }
}

async function loginByWechat() {
  if (
    route.path === '/home' ||
    !wechatSilentLoginStatus.value ||
    isLogin.value
  ) {
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const codes = urlParams.getAll('code');
  const code = codes.length > 0 ? codes[codes.length - 1] : null;

  if (code) {
    const res: ResData = await fetchLoginByCodeAPI({ code: code });
    if (res.success) {
      authStore.setToken(res.data);
      authStore.getUserInfo();
      authStore.setLoginDialog(false); // 关闭登录对话框

      // // 清除URL中的所有code参数
      // const newUrl =
      //   window.location.href.split('?')[0] +
      //   window.location.search
      //     .replace(new RegExp('([&?])code=[^&]*', 'g'), '$1')
      //     .replace(/^&/, '?');
      // window.history.replaceState(null, '', newUrl);
      // 导航到 /chat 页面
      router.replace('/chat');
    }
  } else {
    const currentUrl = window.location.href.split('#')[0];
    const res: ResData = await fetchWxLoginRedirectAPI({ url: currentUrl });
    if (res.success) {
      window.location.href = res.data;
    }
  }
}

function init() {
  const ua = window.navigator.userAgent.toLowerCase();
  if (
    ua.match(/MicroMessenger/i) &&
    ua?.match(/MicroMessenger/i)?.[0] === 'micromessenger'
  )
    loginByWechat();
}

onMounted(() => {
  init();
  handleCheckOtherLoginByToken();
});

const getMobileMainClass = computed(() => {
  if (isMobile.value) return ['rounded-none', 'shadow-none'];
  return ['dark:border-neutral-800'];
});

const getMobileLayoutClass = computed(() => {
  if (isMobile.value) return ['flex-col'];
  return ['dark:border-neutral-800'];
});
</script>

<template>
  <div class="h-full dark:bg-gray-900 transition-all p-0">
    <div class="h-full overflow-hidden">
      <div
        class="z-40 transition flex h-full relative"
        :class="getMobileLayoutClass"
      >
        <NLayoutContent
          class="h-full"
          style="flex: 1"
          :class="getMobileMainClass"
        >
          <RouterView v-slot="{ Component, route }">
            <component :is="Component" :key="route.fullPath" />
          </RouterView>
        </NLayoutContent>
      </div>
      <Login :visible="loginDialog" />

      <PayDialog :visible="payDialog" />
      <GoodsDialog :visible="goodsDialog" />
      <NoticeDialog :visible="noticeDialog" />
      <BindWxDialog :visible="bindWxDialog" />
      <SignInDialog :visible="signInDialog" />
      <AppDialog :visible="appDialog" />
      <Identity :visible="identityDialog" />
      <PhoneIdentity :visible="phoneIdentityDialog" />
      <UserAgreementDialog :visible="userAgreementDialog" />
      <BadWordsDialog :visible="badWordsDialog" />
      <!-- <ModelDialog :visible="modelDialog" /> -->
    </div>
  </div>
</template>
