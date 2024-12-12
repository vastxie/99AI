<script setup lang="ts">
import { fetchSendSms } from '@/api';
import { fetchVerifyPhoneIdentityAPI } from '@/api/user';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { useAuthStore, useGlobalStoreWithOut } from '@/store';
import { Close } from '@icon-park/vue-next';
import { FormInst, NForm, useMessage } from 'naive-ui';
import { computed, ref } from 'vue';
import Vcode from './Login/SliderCaptcha.vue';

defineProps<Props>();

const Nmessage = useMessage();
const { isMobile } = useBasicLayout();
const isShow = ref(false);
const useGlobalStore = useGlobalStoreWithOut();
const loading = ref(false);
const formRef = ref<FormInst | null>(null);
const lastSendPhoneCodeTime = ref(0);
const authStore = useAuthStore();
const globalConfig = computed(() => authStore.globalConfig);

const identityForm = ref({
  username: '',
  password: '',
  confirmPassword: '',
  phone: '',
  code: '',
});

const rules = {
  phone: [
    { required: true, message: '请输入手机号' },
    {
      pattern: /^1[3456789]\d{9}$/,
      message: '手机号格式错误',
    },
  ],
  code: [{ required: true, message: '请输入验证码' }],
  username: [{ required: true, message: '请输入用户名' }],
  password: [{ required: true, message: '请输入密码' }],
  confirmPassword: [
    { required: true, message: '请再次输入密码' },
    {
      validator(rule: any, value: string) {
        if (value !== identityForm.value.password) {
          return new Error('两次输入的密码不一致');
        }
        return true;
      },
      trigger: 'blur',
    },
  ],
};

// 使用 ref 来管理全局参数的状态
const agreedToUserAgreement = ref(true); // 读取初始状态并转换为布尔类型

// 点击“用户协议及隐私政策”时，自动同意
function handleClick() {
  agreedToUserAgreement.value = true; // 设置为同意
  useGlobalStore.updateUserAgreementDialog(true);
}

function handlerSubmit() {
  if (
    agreedToUserAgreement.value === false &&
    globalConfig.value.isAutoOpenAgreement === '1'
  ) {
    return Nmessage.error(
      `请阅读并同意《${globalConfig.value.agreementTitle}》`
    );
  }
  isShow.value = false;
  fetchVerifyPhoneIdentityAPI(identityForm.value).then((res: any) => {
    if (res.code === 200) {
      Nmessage.success('认证成功');
      useGlobalStore.updatePhoneDialog(false);
    } else {
      Nmessage.error(res.error);
    }
  });
}

/* 发送验证码 */
async function handleSendCaptcha() {
  isShow.value = false;
  formRef.value?.validate(async (errors: any) => {
    if (!errors) {
      try {
        const { phone } = identityForm.value;

        // const isEmail = /\S+@\S+\.\S+/.test(contact);
        // const isPhone = /^\d{10,}$/.test(contact);
        const params: any = { phone };
        let res: any;
        res = await fetchSendSms(params);
        const { success, message } = res;
        if (success) {
          Nmessage.success(res.data);
          // isSendCaptcha.value = true;
          // 记录重新发送倒计时
          lastSendPhoneCodeTime.value = 60;
          changeLastSendPhoneCodeTime();
        } else {
          // isSendCaptcha.value = false;
          Nmessage.error(message);
        }
      } catch (error) {}
    }
  });
}

//  定时器改变倒计时时间方法
function changeLastSendPhoneCodeTime() {
  if (lastSendPhoneCodeTime.value > 0) {
    setTimeout(() => {
      lastSendPhoneCodeTime.value--;
      changeLastSendPhoneCodeTime();
    }, 1000);
  }
}

interface Props {
  visible: boolean;
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
        @click="useGlobalStore.updatePhoneDialog(false)"
      />

      <div class="flex-1 flex flex-col items-center">
        <div
          class="flex w-full flex-col h-full justify-center"
          :class="isMobile ? 'px-5 py-5' : 'px-10 py-5'"
        >
          <NForm
            ref="formRef"
            :model="identityForm"
            :rules="rules"
            label-placement="left"
            label-width="auto"
            require-mark-placement="right-hanging"
          >
            <div class="sm:mx-auto sm:w-full sm:max-w-sm">
              <h2
                class="mb-8 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900 dark:text-gray-300"
              >
                手机号绑定
              </h2>
            </div>

            <div class="mt-4 flex">
              <input
                id="userPhone"
                type="text"
                v-model="identityForm.phone"
                placeholder="请输入手机号"
                class="flex-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm dark:text-gray-300 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-300 sm:text-sm sm:leading-6 dark:bg-gray-800 dark:focus:ring-gray-400"
              />
            </div>

            <div class="mt-4 relative">
              <input
                id="username"
                type="text"
                v-model="identityForm.code"
                placeholder="请输入验证码"
                class="block w-full rounded-md border-0 py-2 px-2 text-gray-900 shadow-sm dark:text-gray-300 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-300 sm:text-sm sm:leading-6 dark:bg-gray-800 dark:focus:ring-gray-400 pl-3 pr-12"
              />
              <button
                block
                class="absolute right-0 top-1/2 transform -translate-y-1/2 flex justify-center rounded-r-md bg-primary-500 px-3 py-2 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-primary-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                :disabled="loading"
                :loading="loading"
                @click="isShow = true"
              >
                发送验证码
              </button>
            </div>

            <div class="mt-4">
              <div class="mt-2">
                <input
                  id="username"
                  type="text"
                  v-model="identityForm.username"
                  placeholder="请输入用户名"
                  class="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm dark:text-gray-300 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-300 sm:text-sm sm:leading-6 dark:bg-gray-800 dark:focus:ring-gray-400"
                />
              </div>
            </div>

            <div class="mt-4">
              <div class="mt-2">
                <input
                  id="password"
                  type="password"
                  v-model="identityForm.password"
                  placeholder="请输入密码"
                  class="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm dark:text-gray-300 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-300 sm:text-sm sm:leading-6 dark:bg-gray-800 dark:focus:ring-gray-400"
                />
              </div>
            </div>

            <div class="mt-4">
              <div class="mt-2">
                <input
                  id="confirmPassword"
                  type="password"
                  v-model="identityForm.confirmPassword"
                  placeholder="请再次输入密码"
                  class="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm dark:text-gray-300 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-300 sm:text-sm sm:leading-6 dark:bg-gray-800 dark:focus:ring-gray-400"
                />
              </div>
            </div>

            <div
              v-if="globalConfig.isAutoOpenAgreement === '1'"
              class="flex items-center justify-between my-3"
            >
              <div class="flex items-center">
                <input
                  v-model="agreedToUserAgreement"
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                />
                <p
                  class="ml-1 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  已阅读并同意
                  <a
                    href="#"
                    class="font-semibold leading-6 text-primary-600 hover:text-primary-500 dark:text-primary-500 dark:hover:text-primary-600"
                    @click="handleClick"
                    >《{{ globalConfig.agreementTitle }}》</a
                  >
                </p>
              </div>
            </div>

            <!-- <div class="mt-4">
              <div class="mt-2">
                <input
                  id="phone"
                  type="text"
                  v-model="identityForm.phone"
                  placeholder="请输入手机号"
                  class="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm dark:text-gray-300 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-300 sm:text-sm sm:leading-6 dark:bg-gray-800 dark:focus:ring-gray-400"
                />
              </div>
            </div> -->

            <div>
              <button
                @click="handlerSubmit()"
                type="submit"
                class="flex w-full my-5 justify-center rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-primary-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                提交认证
              </button>
            </div>
            <Vcode
              :show="isShow"
              @success="handleSendCaptcha()"
              @close="isShow = false"
              class="bg-red-500"
            />
          </NForm>
        </div>
      </div>
    </div>
  </div>
</template>
