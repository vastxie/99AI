<script setup lang="ts">
  import type { FormInstance, FormRules } from 'element-plus';
  import { HOME_PATH } from '@/router/routes';
  import useUserStore from '@/store/modules/user';

  /** 勾选「记住我」时保存用户名的本地存储键 */
  const REMEMBERED_USERNAME_KEY = 'login_username';

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const appTitle = import.meta.env.VITE_APP_TITLE;

  function readRememberedUsername() {
    try {
      return localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? '';
    } catch {
      return '';
    }
  }

  function saveRememberedUsername() {
    try {
      if (form.remember) localStorage.setItem(REMEMBERED_USERNAME_KEY, form.username);
      else localStorage.removeItem(REMEMBERED_USERNAME_KEY);
    } catch {
      // 存不进去只影响下次登录时的预填
    }
  }

  const rememberedUsername = readRememberedUsername();
  const form = reactive({
    username: rememberedUsername,
    password: '',
    remember: Boolean(rememberedUsername),
  });
  const rules: FormRules = {
    username: [{ required: true, trigger: 'blur', message: '请输入用户名' }],
    password: [
      { required: true, trigger: 'blur', message: '请输入密码' },
      { min: 6, max: 30, trigger: 'blur', message: '密码长度为 6 到 30 位' },
    ],
  };
  const formRef = ref<FormInstance>();
  const submitting = ref(false);

  async function submit() {
    if (submitting.value) return;
    const valid = await formRef.value?.validate().catch(() => false);
    if (!valid) return;
    submitting.value = true;
    try {
      await user.login({ username: form.username, password: form.password });
      saveRememberedUsername();
      const redirect = route.query.redirect;
      await router.push(typeof redirect === 'string' && redirect ? redirect : HOME_PATH);
    } catch {
      // 失败原因由请求层统一提示
    } finally {
      submitting.value = false;
    }
  }
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        autocomplete="on"
        @submit.prevent="submit"
      >
        <div class="login-card__head">
          <span class="login-card__mark">
            <AppIcon name="i-lucide:bot" :size="22" />
          </span>
          <div>
            <h1 class="login-card__title">{{ appTitle }}</h1>
            <p class="login-card__subtitle">登录管理后台</p>
          </div>
        </div>
        <el-form-item prop="username" class="login-card__field">
          <el-input
            v-model="form.username"
            placeholder="用户名"
            size="large"
            autocomplete="username"
          >
            <template #prefix>
              <el-icon><AppIcon name="i-lucide:user" /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item prop="password" class="login-card__field">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            autocomplete="current-password"
          >
            <template #prefix>
              <el-icon><AppIcon name="i-lucide:lock" /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <div class="login-card__options">
          <el-checkbox v-model="form.remember">记住我</el-checkbox>
        </div>
        <el-button
          type="primary"
          size="large"
          native-type="submit"
          class="login-card__submit"
          :loading="submitting"
        >
          登录
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
    background-color: var(--u-bg-page);
  }

  .login-card {
    width: 100%;
    max-width: 400px;
    padding: 32px;
    background-color: var(--u-bg-container);
    border: 1px solid var(--u-border);
    border-radius: var(--u-radius-l);
    box-shadow: var(--u-shadow-m);
  }

  .login-card__head {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  .login-card__mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    color: var(--u-on-accent);
    background-color: var(--u-accent);
    border-radius: var(--u-radius-m);
  }

  .login-card__title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 28px;
    letter-spacing: -0.025em;
    color: var(--u-text-primary);
  }

  .login-card__subtitle {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--u-text-secondary);
  }

  .login-card__field {
    padding: 4px 0;
  }

  .login-card__options {
    display: flex;
    align-items: center;
    margin-bottom: 16px;
  }

  .login-card__submit {
    width: 100%;
  }
</style>
