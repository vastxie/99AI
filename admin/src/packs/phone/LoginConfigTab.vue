<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormRules } from 'element-plus';
  import { nextTick, onMounted, reactive, ref } from 'vue';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';

  /** 手机号登录：开关与腾讯云短信凭证（手机号包）。腾讯云 SecretId / SecretKey / 地域与邮件通道共用 */
  const formInline = reactive({
    phoneLoginStatus: '',
    tencentSecretId: '',
    tencentSecretKey: '',
    tencentRegion: '',
    tencentSmsSdkAppId: '',
    tencentSmsSignName: '',
    tencentSmsTemplateId: '',
  });
  const configKeys = Object.keys(formInline);
  const { loadFailed, isReady, initFromConfig, markLoadFailed, saveField, saving } =
    useConfigAutoSave({
      form: formInline,
    });

  const rules = ref<FormRules>({
    phoneLoginStatus: [{ required: false, trigger: 'blur', message: '请选择是否开启手机号登录' }],
    tencentSecretId: [{ required: false, trigger: 'blur', message: '请填写腾讯云 SecretId' }],
    tencentSecretKey: [{ required: false, trigger: 'blur', message: '请填写腾讯云 SecretKey' }],
    tencentRegion: [{ required: false, trigger: 'blur', message: '请填写腾讯云地域' }],
    tencentSmsSdkAppId: [
      { required: false, trigger: 'blur', message: '请填写腾讯云短信 SDKAppID' },
    ],
    tencentSmsSignName: [{ required: false, trigger: 'blur', message: '请填写腾讯云短信签名' }],
    tencentSmsTemplateId: [
      { required: false, trigger: 'blur', message: '请填写腾讯云短信模板 ID' },
    ],
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
          <el-form-item label="开启手机号注册/登录" prop="phoneLoginStatus">
            <el-tooltip
              class="box-item"
              effect="dark"
              content="开启后，用户端可以通过手机号验证码注册或登录"
              placement="right"
            >
              <el-switch
                :loading="saving('phoneLoginStatus')"
                v-model="formInline.phoneLoginStatus"
                active-value="1"
                inactive-value="0"
                @change="(val: any) => saveField('phoneLoginStatus', String(val))"
              />
            </el-tooltip>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="SecretId" prop="tencentSecretId">
            <el-input
              v-model="formInline.tencentSecretId"
              placeholder="请填写腾讯云 SecretId"
              clearable
              type="password"
              show-password
              @blur="saveField('tencentSecretId', formInline.tencentSecretId)"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="SecretKey" prop="tencentSecretKey">
            <el-input
              v-model="formInline.tencentSecretKey"
              placeholder="请填写腾讯云 SecretKey"
              clearable
              type="password"
              show-password
              @blur="saveField('tencentSecretKey', formInline.tencentSecretKey)"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="地域" prop="tencentRegion">
            <el-input
              v-model="formInline.tencentRegion"
              placeholder="默认 ap-guangzhou"
              clearable
              @blur="saveField('tencentRegion', formInline.tencentRegion)"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="短信应用 SDKAppID" prop="tencentSmsSdkAppId">
            <el-input
              v-model="formInline.tencentSmsSdkAppId"
              placeholder="请填写短信应用 SDKAppID"
              clearable
              @blur="saveField('tencentSmsSdkAppId', formInline.tencentSmsSdkAppId)"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="短信签名" prop="tencentSmsSignName">
            <el-input
              v-model="formInline.tencentSmsSignName"
              placeholder="请填写审核通过的短信签名"
              clearable
              @blur="saveField('tencentSmsSignName', formInline.tencentSmsSignName)"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="短信模板 ID" prop="tencentSmsTemplateId">
            <el-input
              v-model="formInline.tencentSmsTemplateId"
              placeholder="请填写审核通过的短信模板 ID"
              clearable
              @blur="saveField('tencentSmsTemplateId', formInline.tencentSmsTemplateId)"
            />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </ConfigLoadGuard>
</template>
