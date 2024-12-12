<script setup lang="ts">
import { fetchUpdatePasswordAPI } from '@/api';
import type { ResData } from '@/api/types';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useAuthStore } from '@/store';
import type { FormInst, FormItemInst, FormItemRule, FormRules } from 'naive-ui';
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NInput,
  useMessage,
} from 'naive-ui';
import { ref } from 'vue';

interface ModelType {
  password: string;
  reenteredPassword: string;
}

const modelRef = ref<ModelType>({
  password: '',
  reenteredPassword: '',
});
const model = modelRef;

const formRef = ref<FormInst | null>(null);

const rPasswordFormItemRef = ref<FormItemInst | null>(null);

const rules: FormRules = {
  password: [
    {
      required: true,
      message: t('usercenter.enterPassword'),
    },
  ],
  reenteredPassword: [
    {
      required: true,
      message: t('usercenter.reenterPassword'),
      trigger: ['input', 'blur'],
    },
    {
      validator: validatePasswordStartWith,
      message: t('usercenter.passwordsNotMatch'),
      trigger: 'input',
    },
    {
      validator: validatePasswordSame,
      message: t('usercenter.passwordsNotMatch'),
      trigger: ['blur', 'password-input'],
    },
  ],
};
function validatePasswordStartWith(rule: FormItemRule, value: string): boolean {
  return (
    !!modelRef.value.password &&
    modelRef.value.password.startsWith(value) &&
    modelRef.value.password.length >= value.length
  );
}
function validatePasswordSame(rule: FormItemRule, value: string): boolean {
  return value === modelRef.value.password;
}
function handlePasswordInput() {
  if (modelRef.value.reenteredPassword)
    rPasswordFormItemRef.value?.validate({ trigger: 'password-input' });
}

const { isSmallXl } = useBasicLayout();
const authStore = useAuthStore();
const ms = useMessage();

async function updatePassword(options: { password: string }) {
  const res: ResData = await fetchUpdatePasswordAPI(options);
  ms.success(t('usercenter.passwordUpdateSuccess'));
  resetForm();
  authStore.updatePasswordSuccess();
}

function resetForm() {
  modelRef.value = {
    password: '',
    reenteredPassword: '',
  };
}

function handleValidate(e: MouseEvent) {
  e.preventDefault();
  formRef.value?.validate(async (errors) => {
    if (!errors) {
      const { password } = modelRef.value;
      updatePassword({ password });
    }
  });
}
</script>

<template>
  <NCard>
    <template #header>
      <div>{{ t('usercenter.changeYourPassword') }}</div>
    </template>
    <NGrid :x-gap="24" :y-gap="24" :cols="isSmallXl ? 1 : 3" class="mt-3">
      <NGridItem class="border rounded-sm p-3 dark:border-[#ffffff17]" span="2">
        <NForm ref="formRef" :model="model" :rules="rules">
          <NFormItem path="password" :label="t('usercenter.newPassword')">
            <NInput v-model:value="model.password" type="password" @input="handlePasswordInput"
              @keydown.enter.prevent />
          </NFormItem>
          <NFormItem ref="rPasswordFormItemRef" first path="reenteredPassword" :label="t('usercenter.confirmPassword')">
            <NInput v-model:value="model.reenteredPassword" :disabled="!model.password" type="password" tabindex="0"
              @keyup.enter="handleValidate" />
          </NFormItem>

          <div class="flex justify-between">
            <span class="text-[#95AAC9]">{{
              t('usercenter.reloginAfterPasswordChange')
              }}</span>
            <NButton :disabled="model.password === null" type="primary" @click="handleValidate">
              {{ t('usercenter.updateYourPassword') }}
            </NButton>
          </div>
        </NForm>
      </NGridItem>
      <NGridItem class="border rounded-sm p-3  dark:border-[#ffffff17]">
        <b class="text-base">{{ t('usercenter.passwordRequirements') }}</b>
        <p class="text-[#95AAC9] mt-3">
          {{ t('usercenter.newPasswordInstructions') }}
        </p>
        <div class="ml-3 text-[#95AAC9] mt-2">
          {{ t('usercenter.minimumCharacters') }}
        </div>
        <div class="ml-3 text-[#95AAC9] mt-2">
          {{ t('usercenter.maximumCharacters') }}
        </div>
        <div class="ml-3 text-[#95AAC9] mt-2">
          {{ t('usercenter.requireNumber') }}
        </div>
      </NGridItem>
    </NGrid>
  </NCard>
</template>
