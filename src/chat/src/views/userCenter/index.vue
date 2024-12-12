<script setup lang="ts">
import { fetchSyncVisitorDataAPI, fetchVisitorCountAPI } from '@/api/balance';
import { fetchUpdateInfoAPI } from '@/api/index';
import type { ResData } from '@/api/types';
import defaultAvatar from '@/assets/avatar.png';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useAuthStore, useGlobalStoreWithOut } from '@/store';
import {
  NAvatar,
  NButton,
  NCard,
  NGi,
  NGrid,
  NInput,
  NLayout,
  NLayoutSider,
  NSkeleton,
  NSpace,
  NTabPane,
  NTabs,
  useMessage,
} from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Detail from './components/detail.vue';
import Password from './components/password.vue';
import Wallet from './components/wallet.vue';

const useGlobalStore = useGlobalStoreWithOut();
const authStore = useAuthStore();
const router = useRouter();
const visitorCount = ref(0);

const userBalance = computed(() => authStore.userBalance);
const isUseWxLogin = computed(() => authStore.globalConfig?.isUseWxLogin);
const wechatRegisterStatus = computed(
  () => Number(authStore.globalConfig.wechatRegisterStatus) === 1
);
const model3Name = computed(
  () => authStore.globalConfig.model3Name || t('goods.basicModelQuota')
);
const model4Name =
  computed(() => authStore.globalConfig.model4Name) ||
  t('goods.advancedModelQuota');
const drawMjName =
  computed(() => authStore.globalConfig.drawMjName) || t('goods.drawingQuota');
const isHideModel3Point = computed(
  () => Number(authStore.globalConfig.isHideModel3Point) === 1
);
const isHideModel4Point = computed(
  () => Number(authStore.globalConfig.isHideModel4Point) === 1
);
const isHideDrawMjPoint = computed(
  () => Number(authStore.globalConfig.isHideDrawMjPoint) === 1
);

const loading = ref(true);
const isLogin = computed(() => authStore.isLogin);
const ms = useMessage();

const email = computed(() => authStore.userInfo.email || '');
const isBindWx = computed(() => authStore.userInfo.isBindWx);
const avatar = ref(authStore.userInfo.avatar ?? defaultAvatar);
const username = ref(authStore.userInfo.username ?? '未登录');
const sign = ref(authStore.userInfo.sign ?? t('usercenter.defaultSignature'));

const btnDisabled = ref(false);

const { isSmallLg, isMobile } = useBasicLayout();

async function getVisitorCount() {
  const res: ResData = await fetchVisitorCountAPI();
  visitorCount.value = res.data || 0;
}

async function syncVisitorData() {
  const res: ResData = await fetchSyncVisitorDataAPI();
  if (res.success) {
    ms.success(t('usercenter.syncComplete'));
  }
  getVisitorCount();
}

async function updateUserInfo(options: {
  avatar?: string;
  username?: string;
  sign?: string;
}) {
  try {
    btnDisabled.value = true;
    const res: ResData = await fetchUpdateInfoAPI(options);
    btnDisabled.value = false;
    if (!res.success) return ms.error(res.message);
    ms.success(t('common.updateUserSuccess'));
    authStore.getUserInfo();
  } catch (error) {
    btnDisabled.value = false;
  }
}

function checkRoute() {
  if (isLogin.value) return;
  router.replace('/');
  authStore.setLoginDialog(true);
}

onMounted(() => {
  checkRoute();
  getVisitorCount();
});

function logOut() {
  authStore.logOut();
  router.replace('/');
}

setTimeout(() => {
  loading.value = false;
}, 500);
</script>

<template>
  <NLayout has-sider class="flex h-full">
    <NLayoutSider
      v-if="!isSmallLg"
      content-style="padding: 24px;"
      bordered
      width="380"
    >
      <div class="flex flex-col justify-center items-center">
        <div
          class="text-2xl text-primary self-start mb-14 flex justify-between w-full"
        >
          <span>{{ t('usercenter.personalCenter') }}</span>
          <NButton tertiary type="error" @click="logOut">
            {{ t('usercenter.logOut') }}
          </NButton>
        </div>
        <NAvatar :size="148" :src="avatar" :fallback-src="defaultAvatar" />
        <b class="mt-3 text-lg text-[#555]">{{ username }}</b>
        <!-- <span class="text-[#95aac9] mt-2"> {{ email }}</span> -->
        <!-- <div class="text-[#555] mt-3 px-4">
          {{ sign }}
        </div> -->

        <div class="self-start mt-16">
          <div class="text-xl text-primary">
            {{ t('usercenter.myUsageRecord') }}
          </div>
          <div class="flex items-center space-x-4 pl-3 mt-3">
            <span class="flex-shrink-0 w-[150px] text-keft text-primary">{{
              model3Name
            }}</span>
            <div class="w-[230px]">
              {{ userBalance.useModel3Count || '0' }}
              {{ t('usercenter.points') }}
            </div>
          </div>
          <div class="flex items-center space-x-4 pl-3 mt-3">
            <span class="flex-shrink-0 w-[150px] text-keft text-primary">{{
              model4Name
            }}</span>
            <div class="w-[230px]">
              {{ userBalance.useModel4Count || '0' }}
              {{ t('usercenter.points') }}
            </div>
          </div>

          <!-- <div class="flex items-center space-x-4 pl-3 mt-3">
            <span class="flex-shrink-0 w-[150px] text-keft text-primary">{{
              t('usercenter.basicModelUsage')
            }}</span>
            <div class="w-[230px]">
              {{ userBalance.useModel3Token || '0' }} Token
            </div>
          </div> -->
          <!-- <div class="flex items-center space-x-4 pl-3 mt-3">
            <span class="flex-shrink-0 w-[150px] text-keft text-primary">{{
              t('usercenter.advancedModelUsage')
            }}</span>
            <div class="w-[230px]">
              {{ userBalance.useModel4Token || '0' }} Token
            </div>
          </div> -->
          <!-- <div class="flex items-center space-x-4 pl-3 mt-3">
            <span class="flex-shrink-0 w-[150px] text-keft text-primary">{{
              t('usercenter.drawingUsageCredits')
            }}</span>
            <div class="w-[230px]">
              {{ userBalance.useDrawMjToken || '0' }}
              {{ t('usercenter.points') }}
            </div>
          </div> -->

          <div
            v-if="isUseWxLogin && wechatRegisterStatus"
            class="flex items-center space-x-4 pl-3 mt-3"
          >
            <span class="flex-shrink-0 w-[150px] text-keft text-primary">{{
              t('usercenter.bindWeChat')
            }}</span>
            <div class="w-[230px]">
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

          <div
            v-if="visitorCount > 0"
            class="flex items-center space-x-4 pl-3 mt-3"
          >
            <span class="flex-shrink-0 w-[150px] text-keft text-primary">{{
              t('usercenter.clickToBindWeChat')
            }}</span>
            <div class="w-[230px]">
              <NButton text @click="syncVisitorData">
                {{ t('usercenter.syncVisitorData') }}
              </NButton>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="userBalance.expirationTime"
        class="flex text-[red] pt-8 text-base font-bold"
      >
        <span>{{ t('usercenter.membershipExpiration') }}</span>
        <span>{{ userBalance.expirationTime }}</span>
      </div>
    </NLayoutSider>

    <div
      class="flex flex-col"
      :class="[isMobile ? 'w-full' : 'flex-1']"
      :style="{ padding: isMobile ? '10px' : '0 28px 0 28px' }"
    >
      <NTabs type="line" animated class="mt-5 flex-1">
        <NTabPane
          v-if="isSmallLg"
          name="detail"
          :tab="t('usercenter.myDetails')"
        >
          <Detail />
        </NTabPane>
        <NTabPane name="account" :tab="t('usercenter.myWallet')">
          <Wallet />
        </NTabPane>
        <NTabPane name="baseInfo" :tab="t('usercenter.basicInfo')">
          <NCard>
            <template #header>
              <NSkeleton v-if="loading || !isLogin" size="medium" width="20%" />
              <template v-else>
                <div>{{ t('usercenter.userBasicSettings') }}</div>
              </template>
            </template>
            <NSpace v-if="loading || !isLogin" vertical>
              <NSkeleton height="40px" size="medium" />
              <NSkeleton height="40px" size="medium" />
              <NSkeleton height="80px" size="medium" />
            </NSpace>
            <template v-else>
              <NGrid x-gap="12" :cols="1">
                <NGi>
                  <div class="flex items-center space-x-4">
                    <span class="flex-shrink-0 w-[60px]">{{
                      $t('setting.avatarLink')
                    }}</span>
                    <div class="flex-1">
                      <NInput
                        v-model:value="avatar"
                        :placeholder="t('usercenter.avatarPlaceholder')"
                      />
                    </div>
                    <NButton
                      size="tiny"
                      text
                      type="primary"
                      @click="updateUserInfo({ avatar })"
                    >
                      {{ $t('common.update') }}
                    </NButton>
                  </div>
                  <div class="flex items-center space-x-4 mt-5">
                    <span class="flex-shrink-0 w-[60px]">{{
                      $t('setting.name')
                    }}</span>
                    <div class="flex-1">
                      <NInput
                        v-model:value="username"
                        :placeholder="t('usercenter.usernamePlaceholder')"
                        maxlength="12"
                        show-count
                        clearable
                      />
                    </div>
                    <NButton
                      size="tiny"
                      text
                      type="primary"
                      @click="updateUserInfo({ username })"
                    >
                      {{ $t('common.update') }}
                    </NButton>
                  </div>
                  <!-- <div class="flex space-x-4 mt-5">
                    <span class="flex-shrink-0 w-[60px]">{{
                      $t('setting.sign')
                    }}</span>
                    <div class="flex-1">
                      <NInput
                        v-model:value="sign"
                        :placeholder="t('usercenter.signaturePlaceholder')"
                        maxlength="128"
                        show-count
                        clearable
                        type="textarea"
                      />
                    </div>
                    <NButton
                      size="tiny"
                      text
                      type="primary"
                      @click="updateUserInfo({ sign })"
                    >
                      {{ $t('common.update') }}
                    </NButton>
                  </div> -->
                </NGi>
              </NGrid>
            </template>
          </NCard>
        </NTabPane>

        <NTabPane name="password" :tab="t('usercenter.passwordManagement')">
          <Password />
        </NTabPane>
      </NTabs>
    </div>
  </NLayout>
</template>
