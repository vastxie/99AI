<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormRules } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref } from 'vue';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';

  /** GitHub 登录：开关与 OAuth App 凭证（GitHub 包） */
  const formInline = reactive({
    githubLoginEnabled: '',
    githubClientId: '',
    githubClientSecret: '',
    githubCallbackUrl: '',
    siteUrl: '',
  });
  const configKeys = Object.keys(formInline);
  const { loadFailed, isReady, initFromConfig, markLoadFailed, saveField, saving } =
    useConfigAutoSave({
      form: formInline,
    });

  const rules = ref<FormRules>({
    githubLoginEnabled: [
      { required: false, trigger: 'blur', message: '请选择是否开启 GitHub 登录' },
    ],
    githubClientId: [{ required: false, trigger: 'blur', message: '请填写 GitHub Client ID' }],
    githubClientSecret: [
      { required: false, trigger: 'blur', message: '请填写 GitHub Client Secret' },
    ],
    githubCallbackUrl: [{ required: false, trigger: 'blur', message: '请填写 GitHub 回调地址' }],
  });

  const githubDefaultCallbackUrl = computed(() => {
    const base = String(formInline.siteUrl || '').replace(/\/+$/u, '');
    return base ? `${base}/auth/callback/github` : '/auth/callback/github';
  });

  async function queryAllConfig() {
    try {
      const res = await apiConfig.queryConfig({ keys: configKeys });
      Object.assign(formInline, res.data);
      await nextTick();
      initFromConfig(res.data, configKeys);
    } catch {
      markLoadFailed();
    }
  }

  onMounted(() => {
    queryAllConfig();
  });
</script>

<template>
  <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="queryAllConfig">
    <el-form :rules="rules" :model="formInline" label-width="170px">
      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="开启 GitHub 登录" prop="githubLoginEnabled">
            <el-switch
              :loading="saving('githubLoginEnabled')"
              v-model="formInline.githubLoginEnabled"
              active-value="1"
              inactive-value="0"
              @change="(val: any) => saveField('githubLoginEnabled', String(val))"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="Client ID" prop="githubClientId">
            <el-input
              v-model="formInline.githubClientId"
              placeholder="GitHub OAuth App Client ID"
              clearable
              @blur="saveField('githubClientId', formInline.githubClientId)"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="Client Secret" prop="githubClientSecret">
            <el-input
              v-model="formInline.githubClientSecret"
              placeholder="GitHub OAuth App Client Secret"
              clearable
              type="password"
              show-password
              @blur="saveField('githubClientSecret', formInline.githubClientSecret)"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="回调地址" prop="githubCallbackUrl">
            <el-input
              v-model="formInline.githubCallbackUrl"
              :placeholder="githubDefaultCallbackUrl"
              clearable
              @blur="saveField('githubCallbackUrl', formInline.githubCallbackUrl)"
            />
            <div class="mt-2 text-sm text-gray-500">
              填写到 GitHub OAuth App 的 Authorization callback URL。
            </div>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </ConfigLoadGuard>
</template>
