<script setup lang="ts">
import logo from '@/assets/logo.png';
import { t } from '@/locales';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import {
  Announcement,
  Calendar,
  Commodity,
  DeleteThemes,
  Logout,
  SunOne,
  User,
} from '@icon-park/vue-next';
import type { NumberAnimationInst } from 'naive-ui';
import { NLayoutSider, useDialog } from 'naive-ui';
import type { CSSProperties } from 'vue';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import List from './List.vue';
import Plugin from './Plugin.vue';

import { useBasicLayout } from '@/hooks/useBasicLayout';
import {
  useAppStore,
  useAuthStore,
  useChatStore,
  useGlobalStoreWithOut,
} from '@/store';
const useGlobalStore = useGlobalStoreWithOut();

const router = useRouter();
const appStore = useAppStore();
const chatStore = useChatStore();
const authStore = useAuthStore();
const model3AnimationInstRef = ref<NumberAnimationInst | null>(null);
const model4AnimationInstRef = ref<NumberAnimationInst | null>(null);
const modelMjAnimationInstRef = ref<NumberAnimationInst | null>(null);

const signInStatus = computed(
  () => Number(authStore.globalConfig?.signInStatus) === 1
);
const darkMode = computed(() => appStore.theme === 'dark');
const userBalance = computed(() => authStore.userBalance);
const usingPlugin = computed(() => chatStore.currentPlugin);
const dialog = useDialog();
const oldUse3Token = ref(0);
const newUse3Token = ref(0);
const oldUse4Token = ref(0);
const newUse4Token = ref(0);
const oldUseMjToken = ref(0);
const newUseMjToken = ref(0);
const { isMobile } = useBasicLayout();
const isLogin = computed(() => authStore.isLogin);
const logoPath = computed(() => authStore.globalConfig.clientLogoPath || logo);
const homePage = computed(() => authStore.globalConfig.clientHomePath || '/');
const siteName = authStore.globalConfig?.siteName || 'AIWeb';
const model3Name = computed(
  () => authStore.globalConfig.model3Name || t('chat.ordinaryPoints')
);
const model4Name =
  computed(() => authStore.globalConfig.model4Name) || t('chat.advancedPoints');
const drawMjName =
  computed(() => authStore.globalConfig.drawMjName) || t('chat.drawingPoints');
const pluginFirst = computed(
  () => Number(authStore.globalConfig.pluginFirst) === 1
);
const isHidePlugin = computed(
  () => Number(authStore.globalConfig.isHidePlugin) === 1
);

// const addLoading = ref(false);
const avatar = computed(() => authStore.userInfo.avatar);

const collapsed = computed(() => appStore.siderCollapsed);

const activeSideOption = ref(
  !pluginFirst.value || isHidePlugin.value ? 'chat' : 'plugin'
);

const globaelConfig = computed(() => authStore.globalConfig);

const isSetBeian = computed(
  () => globaelConfig.value?.companyName && globaelConfig.value?.filingNumber
);

const activeGroupInfo = computed(() => {
  const info = chatStore.groupList.find(
    (item: any) => item.uuid === chatStore.active
  );
  return info;
});

const configObj = computed(() => {
  try {
    return JSON.parse(activeGroupInfo.value?.config || '{}');
  } catch (e) {
    return {}; // 解析失败时返回一个空对象
  }
});

const activeModelDeductType = computed(() => chatStore?.activeModelDeductType);

const displayInfo = computed(() => {
  const deductType =
    usingPlugin?.value?.deductType ||
    configObj.value.deductType ||
    activeModelDeductType.value;

  let remainingPoints;
  let buttonText;

  switch (deductType) {
    case 1:
      remainingPoints = userBalance.value.sumModel3Count || 0;
      buttonText = model3Name.value;
      break;
    case 2:
      remainingPoints = userBalance.value.sumModel4Count || 0;
      buttonText = model4Name.value;
      break;
    case 3:
      remainingPoints = userBalance.value.sumDrawMjCount || 0;
      buttonText = drawMjName.value;
      break;
    default:
      remainingPoints = 0;
      buttonText = t('chat.points');
  }

  // 如果 remainingPoints 大于 99999，设置为 "不限" 并将 buttonText 设置为 "次数"
  if (remainingPoints > 99999) {
    remainingPoints = '不限';
    buttonText = '次数';
  }

  return { remainingPoints, buttonText };
});

async function goToUserCenter() {
  // 假设需要检查登录状态或等待某些数据加载
  await checkLogin();
  router.replace({ path: 'user-center' });
}

async function checkLogin() {
  // 检查登录状态的逻辑
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      if (!authStore.isLogin) {
        router.replace({ path: 'login' });
      }
      resolve();
    }, 100);
  });
}

function checkMode() {
  const mode = darkMode.value ? 'light' : 'dark';
  appStore.setTheme(mode);
}

/* 删除全部非置顶聊天 */
async function handleDelGroup() {
  dialog.warning({
    title: t('chat.clearConversation'),
    content: t('chat.clearAllNonFavoriteConversations'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      await chatStore.delAllGroup();
      await chatStore.addNewChatGroup();
    },
  });
}

function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value);
}

function toggleLogin() {
  if (isLogin.value) authStore.logOut();
  else authStore.setLoginDialog(true);
}

function handleSignIn() {
  if (!isLogin.value) {
    authStore.setLoginDialog(true);
    return;
  }
  useGlobalStore.updateSignInDialog(true);
}

function logOut() {
  authStore.logOut();
  router.replace('/');
}

const getMobileClass = computed<CSSProperties>(() => {
  if (isMobile.value) {
    return {
      position: 'fixed',
      zIndex: 50,
    };
  }
  return {};
});

const mobileSafeArea = computed(() => {
  if (isMobile.value) {
    return {
      paddingBottom: 'env(safe-area-inset-bottom)',
    };
  }
  return {};
});

watch(
  isMobile,
  (val) => {
    appStore.setSiderCollapsed(val);
  },
  {
    immediate: true,
    flush: 'post',
  }
);

watch(
  () => authStore.userBalance.useModel3Token,
  (newVal, oldVal) => {
    oldUse3Token.value = oldVal || 0;
    newUse3Token.value = newVal || 0;
    model3AnimationInstRef.value?.play();
  },
  {
    immediate: true,
    flush: 'post',
  }
);
watch(
  () => authStore.userBalance.useModel4Token,
  (newVal, oldVal) => {
    oldUse4Token.value = oldVal || 0;
    newUse4Token.value = newVal || 0;
    model4AnimationInstRef.value?.play();
  },
  {
    immediate: true,
    flush: 'post',
  }
);

watch(
  () => authStore.userBalance.useDrawMjToken,
  (newVal, oldVal) => {
    oldUseMjToken.value = oldVal || 0;
    newUseMjToken.value = newVal || 0;
    modelMjAnimationInstRef.value?.play();
  },
  {
    immediate: true,
    flush: 'post',
  }
);
</script>

<template>
  <div>
    <NLayoutSider
      :collapsed="collapsed"
      :collapsed-width="0"
      :width="260"
      collapse-mode="transform"
      position="absolute"
      bordered
      :style="getMobileClass"
      @update-collapsed="handleUpdateCollapsed"
    >
      <div
        class="flex flex-col h-full bg-opacity dark:bg-gray-900 select-none"
        :style="mobileSafeArea"
      >
        <main class="flex flex-col h-full flex-1">
          <div
            v-if="!isHidePlugin"
            class="flex bg-opacity w-full justify-between items-center px-4 dark:bg-gray-900 h-14"
          >
            <div
              class="w-full flex justify-center space-x-2 font-medium rounded-full bg-gray-100 dark:bg-gray-800 shadow-sm"
            >
              <button
                v-if="pluginFirst"
                @click="activeSideOption = 'plugin'"
                :class="{
                  'bg-white dark:bg-gray-700 text-primary-600 dark:text-gray-100 ':
                    activeSideOption === 'plugin',
                  'dark:text-gray-400': activeSideOption !== 'plugin',
                }"
                class="block w-full rounded-full focus:outline-none py-1"
              >
                插件
              </button>
              <button
                @click="activeSideOption = 'chat'"
                :class="{
                  'bg-white dark:bg-gray-700 text-primary-600 dark:text-gray-100 ':
                    activeSideOption === 'chat',
                  'dark:text-gray-400': activeSideOption !== 'chat',
                }"
                class="block w-full rounded-full focus:outline-none py-1"
              >
                对话
              </button>
              <button
                v-if="!pluginFirst"
                @click="activeSideOption = 'plugin'"
                :class="{
                  'bg-white dark:bg-gray-700 text-primary-600 dark:text-gray-100 ':
                    activeSideOption === 'plugin',
                  'dark:text-gray-400': activeSideOption !== 'plugin',
                }"
                class="block w-full rounded-full focus:outline-none py-1"
              >
                插件
              </button>
            </div>
          </div>
          <div
            v-else
            class="flex bg-opacity w-full justify-between items-center px-4 dark:bg-gray-900 h-14"
          >
            <button
              class="w-full py-1 text-primary-600 dark:text-gray-100 text-lg font-bold flex justify-between"
            >
              <!-- 左边的图标 -->
              <img :src="logoPath" alt="Logo" class="h-7 w-7" />
              <!-- 中间的文字 -->
              <span class="mx-auto">{{ siteName }}</span>
              <!-- 右边占位，使得文字在中间 -->
              <span class="h-7 w-7"></span>
            </button>
          </div>

          <div class="flex-1 min-h-0 overflow-hidden">
            <List v-if="activeSideOption === 'chat'" />
            <Plugin v-if="activeSideOption === 'plugin'" />
          </div>
          <div
            class="p-4 pb-1 pt-1 border-t-gray-100 dark:border-t-gray-800 flex items-center justify-between text-left w-full"
          >
            <Menu
              v-if="isLogin"
              as="div"
              class="relative inline-block text-left"
            >
              <div>
                <MenuButton
                  class="inline-flex w-full justify-center gap-x-1.5 rounded-md pr-3 py-2 text-sm font-semibold dark:text-gray-400 text-gray-700"
                >
                  <div
                    class="w-8 h-8 mb-2 rounded-full bg-primary-600 flex items-center justify-center overflow-hidden shadow-sm border border-gray-300"
                  >
                    <img
                      v-if="avatar"
                      :src="avatar"
                      class="w-full h-full object-cover"
                    />
                    <User
                      v-if="!avatar"
                      theme="outline"
                      size="20"
                      class="text-white"
                    />
                  </div>
                </MenuButton>
              </div>

              <transition
                enter-active-class="transition ease-out duration-100"
                enter-from-class="transform opacity-0 scale-95"
                enter-to-class="transform opacity-100 scale-100"
                leave-active-class="transition ease-in duration-75"
                leave-from-class="transform opacity-100 scale-100"
                leave-to-class="transform opacity-0 scale-95"
              >
                <MenuItems
                  class="absolute w-[228px] left-0 bottom-full mb-2 origin-bottom-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800 dark:text-gray-400 text-gray-900 z-50"
                >
                  <div class="py-1">
                    <MenuItem v-slot="{ active }">
                      <a
                        href="#"
                        :class="[
                          active ? 'bg-gray-100  dark:bg-gray-700' : '',
                          'group flex items-center justify-start px-2 py-2 text-sm whitespace-nowrap',
                        ]"
                        class="border-b border-b-gray-100 dark:border-b-gray-800"
                        @click="handleDelGroup"
                        ><DeleteThemes theme="outline" size="16" class="mr-2" />
                        {{ t('chat.clear') }}
                      </a>
                    </MenuItem>
                    <MenuItem v-slot="{ active }">
                      <a
                        href="#"
                        :class="[
                          active ? 'bg-gray-100  dark:bg-gray-700' : '',
                          'group flex items-center justify-start px-2 py-2 text-sm whitespace-nowrap',
                        ]"
                        @click="useGlobalStore.updateNoticeDialog(true)"
                        ><Announcement theme="outline" size="16" class="mr-2" />
                        {{ t('chat.announcement') }}
                      </a>
                    </MenuItem>
                    <MenuItem v-slot="{ active }">
                      <a
                        href="#"
                        :class="[
                          active ? 'bg-gray-100  dark:bg-gray-700' : '',
                          'group flex items-center justify-start px-2 py-2 text-sm whitespace-nowrap',
                        ]"
                        @click="useGlobalStore.updateGoodsDialog(true)"
                        ><commodity theme="outline" size="16" class="mr-2" />

                        {{ t('chat.pointsMall') }}
                      </a>
                    </MenuItem>
                    <MenuItem v-slot="{ active }">
                      <a
                        href="#"
                        :class="[
                          active ? 'bg-gray-100  dark:bg-gray-700' : '',
                          'group flex items-center justify-start px-2 py-2 text-sm whitespace-nowrap',
                        ]"
                        @click="checkMode"
                        ><SunOne theme="outline" size="16" class="mr-2" />

                        {{ t('chat.toggleTheme') }}
                      </a>
                    </MenuItem>
                    <MenuItem v-if="signInStatus" v-slot="{ active }">
                      <a
                        href="#"
                        :class="[
                          active ? 'bg-gray-100  dark:bg-gray-700' : '',
                          'group flex items-center justify-start px-2 py-2 text-sm whitespace-nowrap',
                        ]"
                        @click="handleSignIn"
                        ><Calendar theme="outline" size="16" class="mr-2" />
                        {{ t('chat.signInReward') }}
                      </a>
                    </MenuItem>
                    <MenuItem v-slot="{ active }">
                      <a
                        href="#"
                        :class="[
                          active ? 'bg-gray-100  dark:bg-gray-700' : '',
                          'group flex items-center justify-start px-2 py-2 text-sm whitespace-nowrap',
                        ]"
                        @click="goToUserCenter()"
                        ><User theme="outline" size="16" class="mr-2" />
                        个人中心
                      </a>
                    </MenuItem>
                    <MenuItem v-slot="{ active }">
                      <a
                        href="#"
                        :class="[
                          active ? 'bg-gray-100  dark:bg-gray-700' : '',
                          'group flex items-center justify-start px-2 py-2 text-sm whitespace-nowrap',
                        ]"
                        @click="logOut()"
                        ><Logout theme="outline" size="16" class="mr-2" />
                        退出登录
                      </a>
                    </MenuItem>
                  </div>
                </MenuItems>
              </transition>
            </Menu>

            <div
              v-if="!isLogin"
              @click="toggleLogin"
              class="flex flex-1 items-center justify-center cursor-pointer"
            >
              <button
                type="button"
                class="inline-flex mb-2 justify-center items-center rounded-md bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-500 shadow-sm ring-1 ring-inset ring-gray-200 dark:ring-gray-800 hover:bg-opacity dark:hover:bg-gray-800 w-full"
              >
                <span>登录 / 注册</span>
              </button>
            </div>

            <div
              v-if="isLogin"
              @click="useGlobalStore.updateGoodsDialog(true)"
              class="flex flex-1 items-center justify-center cursor-pointer"
            >
              <button
                type="button"
                class="inline-flex mb-2 justify-center items-center rounded-md bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-500 shadow-sm ring-1 ring-inset ring-gray-200 dark:ring-gray-800 hover:bg-opacity dark:hover:bg-gray-800 w-full"
              >
                <span>{{
                  t('chat.remaining') +
                  `${displayInfo.remainingPoints}${displayInfo.buttonText}`
                }}</span>
              </button>
            </div>
          </div>
          <div
            v-if="isSetBeian && isMobile"
            class="w-full flex justify-center items-center pb-3 text-xs text-gray-500"
          >
            版权所有 © {{ globaelConfig?.companyName }}
            <a
              class="ml-2 transition-all text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
              href="https://beian.miit.gov.cn"
              target="_blank"
              >{{ globaelConfig?.filingNumber }}</a
            >
          </div>
        </main>
      </div>
    </NLayoutSider>
    <template v-if="isMobile">
      <div
        v-show="!collapsed"
        class="fixed inset-0 z-40 bg-black/40"
        @click="handleUpdateCollapsed"
      />
    </template>
  </div>
</template>
