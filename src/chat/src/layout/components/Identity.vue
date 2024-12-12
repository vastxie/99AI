<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout';

import { fetchVerifyIdentityAPI } from '@/api/user';
import { useAuthStore, useGlobalStoreWithOut } from '@/store';
import { Close } from '@icon-park/vue-next';
import { NForm, useMessage } from 'naive-ui';
import { computed, ref } from 'vue';
import Vcode from './Login/SliderCaptcha.vue';

defineProps<Props>();

const Nmessage = useMessage();
const { isMobile } = useBasicLayout();
const isShow = ref(false);
const useGlobalStore = useGlobalStoreWithOut();
const authStore = useAuthStore();
const globalConfig = computed(() => authStore.globalConfig);

const identityForm = ref({
  name: '',
  idCard: '',
});

const rules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  idCard: [{ required: true, message: '请输入身份证号', trigger: 'blur' }],
};

// 使用 ref 来管理全局参数的状态
const agreedToUserAgreement = ref(true); // 读取初始状态并转换为布尔类型

// 点击“用户协议及隐私政策”时，自动同意
function handleClick() {
  agreedToUserAgreement.value = true; // 设置为同意
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
  fetchVerifyIdentityAPI(identityForm.value).then((res) => {
    if (res.code === 200) {
      Nmessage.success('认证成功');
      useGlobalStore.updateIdentityDialog(false);
    } else {
      Nmessage.error('认证失败');
    }
  });
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
        @click="useGlobalStore.updateIdentityDialog(false)"
      />

      <div class="flex-1 flex flex-col items-center">
        <div
          class="flex w-full flex-col h-full justify-center"
          :class="isMobile ? 'px-5 py-5' : 'px-10 py-5'"
        >
          <!-- forget passwd-->
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
                实名认证
              </h2>
            </div>

            <div class="mt-4">
              <label
                for="username"
                class="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-300"
                >姓名
              </label>
              <div class="mt-2">
                <input
                  id="username"
                  type="text"
                  v-model="identityForm.name"
                  placeholder="请输入姓名"
                  class="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm dark:text-gray-300 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-300 sm:text-sm sm:leading-6 dark:bg-gray-800 dark:focus:ring-gray-400"
                />
              </div>
            </div>
            <div class="mt-4">
              <label
                for="username"
                class="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-300"
                >身份证号
              </label>
              <div class="mt-2">
                <input
                  id="username"
                  type="text"
                  v-model="identityForm.idCard"
                  placeholder="请输入身份证号"
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

            <div>
              <button
                @click="isShow = true"
                type="submit"
                class="flex w-full my-5 justify-center rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-primary-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                提交认证
              </button>
            </div>
          </NForm>
        </div>
      </div>
    </div>
    <Vcode
      :show="isShow"
      @success="handlerSubmit()"
      @close="isShow = false"
      class="bg-red-500"
    />
  </div>
</template>
