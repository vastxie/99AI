<script lang="ts" setup>
import defaultAvatar from '@/assets/avatar.png';
import { t } from '@/locales';
import { useAuthStore, useGlobalStoreWithOut } from '@/store';
import { NAvatar, NButton } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
const authStore = useAuthStore();
const router = useRouter();

const { userBalance } = authStore;
const useGlobalStore = useGlobalStoreWithOut();
const email = computed(() => authStore.userInfo.email || '');
const isBindWx = computed(() => authStore.userInfo.isBindWx);
const avatar = ref(authStore.userInfo.avatar ?? defaultAvatar);
const username = ref(
  authStore.userInfo.username ?? t('usercenter.notLoggedIn')
);
const sign = ref(authStore.userInfo.sign ?? t('usercenter.defaultSignature'));
const wechatRegisterStatus = computed(
  () => Number(authStore.globalConfig.wechatRegisterStatus) === 1
);

function logOut() {
  authStore.logOut();
  router.replace('/');
}
const isLogin = computed(() => authStore.isLogin);
onMounted(() => {
  if (!isLogin.value) authStore.setLoginDialog(true);
});
</script>

<template>
  <div class="flex flex-col justify-center items-center">
    <div
      class="text-2xl text-primary self-start mb-3 flex justify-between w-full"
    >
      <span></span>
      <NButton v-if="isLogin" tertiary type="error" @click="logOut">
        {{ t('usercenter.logOut') }}
      </NButton>
      <NButton
        v-if="!isLogin"
        tertiary
        type="success"
        @click="authStore.setLoginDialog(true)"
      >
        {{ t('usercenter.clickToLogin') }}
      </NButton>
    </div>
    <NAvatar :size="148" :src="avatar" :fallback-src="defaultAvatar" />
    <b class="mt-3 text-lg text-[#555]">{{ username }}</b>
    <span class="text-[#95aac9] mt-2"> {{ email }}</span>
    <!-- <div class="text-[#555] mt-3 px-4">
      {{ sign }}
    </div> -->

    <div class="self-start">
      <div class="flex pl-3 pt-3 text-base font-bold text-primary">
        <span>{{ t('usercenter.myUsageRecord') }}</span>
      </div>
      <div
        v-if="userBalance.expirationTime"
        class="flex pl-3 pt-3 text-base font-bold text-primary"
      >
        <span>{{ t('usercenter.membershipExpiration') }}</span>
        <span>{{ userBalance.expirationTime }}</span>
      </div>

      <div class="flex items-center space-x-4 pl-3 mt-3">
        <span class="flex-shrink-0 w-24 text-primary">{{
          t('usercenter.basicModelCredits')
        }}</span>
        <div class="w-[200px]">
          {{ userBalance.sumModel3Count || '0' }} {{ t('usercenter.points') }}
        </div>
      </div>
      <div class="flex items-center space-x-4 pl-3 mt-3">
        <span class="flex-shrink-0 w-24 text-primary">{{
          t('usercenter.advancedModelCredits')
        }}</span>
        <div class="w-[200px]">
          {{ userBalance.sumModel4Count || '0' }} {{ t('usercenter.points') }}
        </div>
      </div>
      <div class="flex items-center space-x-4 pl-3 mt-3">
        <span class="flex-shrink-0 w-24 text-primary">
          {{ t('usercenter.drawingUsageCredits') }}</span
        >
        <div class="w-[200px]">
          {{ userBalance.sumDrawMjCount || '0' }} {{ t('usercenter.points') }}
        </div>
      </div>

      <div
        v-if="wechatRegisterStatus"
        class="flex items-center space-x-4 pl-3 mt-3"
      >
        <span class="flex-shrink-0 w-24 text-primary">{{
          t('usercenter.bindWeChat')
        }}</span>
        <div class="w-[200px]">
          <NButton
            v-if="!isBindWx"
            text
            @click="useGlobalStore.updateBindwxDialog(true)"
          >
            {{ t('usercenter.clickToBindWeChat') }}
          </NButton>
          <span v-else>{{ t('usercenter.weChatBound') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
