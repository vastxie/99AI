<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormRules } from 'element-plus';
  import { nextTick, onMounted, reactive, ref } from 'vue';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';

  /** 邮箱登录：开关、发信通道（SMTP / 腾讯云邮件）与对应凭证（邮箱包） */
  const emailProviderOptions = [
    { label: 'SMTP 邮箱', value: 'smtp' },
    { label: '腾讯云邮件', value: 'tencent-ses' },
  ];

  const formInline = reactive({
    emailLoginStatus: '',
    emailProvider: 'smtp',
    MAILER_HOST: '',
    MAILER_PORT: '',
    MAILER_USER: '',
    MAILER_PASS: '',
    MAILER_SECURE: '',
    tencentSecretId: '',
    tencentSecretKey: '',
    tencentRegion: '',
    tencentEmailFromAddress: '',
    tencentEmailFromName: '',
    tencentEmailReplyTo: '',
    tencentEmailTemplateId: '',
  });
  const configKeys = Object.keys(formInline);
  const { loadFailed, isReady, initFromConfig, markLoadFailed, saveField, saving } =
    useConfigAutoSave({
      form: formInline,
      // 没配置过的服务商在界面上默认显示 SMTP（与加载时一致）；回滚到空串时同样显示 SMTP
      codecs: {
        emailProvider: {
          toRaw: (value) => String(value ?? '').trim(),
          fromRaw: (raw) => raw || 'smtp',
        },
      },
    });

  const rules = ref<FormRules>({
    emailLoginStatus: [{ required: false, trigger: 'blur', message: '请选择是否开启邮箱登录' }],
    MAILER_HOST: [{ required: false, trigger: 'blur', message: '请填写 SMTP 服务器地址' }],
    MAILER_PORT: [{ required: false, trigger: 'blur', message: '请填写 SMTP 服务器端口' }],
    MAILER_USER: [{ required: false, trigger: 'blur', message: '请填写 SMTP 用户名称' }],
    MAILER_PASS: [{ required: false, trigger: 'blur', message: '请填写 SMTP 用户密码' }],
    MAILER_SECURE: [{ required: false, trigger: 'blur', message: '是否使用 SSL' }],
    tencentSecretId: [{ required: false, trigger: 'blur', message: '请填写腾讯云 SecretId' }],
    tencentSecretKey: [{ required: false, trigger: 'blur', message: '请填写腾讯云 SecretKey' }],
    tencentRegion: [{ required: false, trigger: 'blur', message: '请填写腾讯云地域' }],
    tencentEmailFromAddress: [
      { required: false, trigger: 'blur', message: '请填写腾讯云邮件发件地址' },
    ],
    tencentEmailTemplateId: [
      { required: false, trigger: 'blur', message: '请填写腾讯云邮件模板 ID' },
    ],
  });

  async function queryAllConfig() {
    try {
      const res = await apiConfig.queryConfig({ keys: configKeys });
      Object.assign(formInline, res.data);
      formInline.emailProvider = formInline.emailProvider || 'smtp';
      await nextTick();
      initFromConfig(res.data, configKeys);
    } catch {
      markLoadFailed();
    }
  }

  function setEmailProvider(value: string) {
    if (formInline.emailProvider === value) return;
    formInline.emailProvider = value;
    saveField('emailProvider', value);
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
          <el-form-item label="开启邮箱注册/登录" prop="emailLoginStatus">
            <el-tooltip
              class="box-item"
              effect="dark"
              content="开启后，用户端可以通过邮箱验证码注册或登录"
              placement="right"
            >
              <el-switch
                :loading="saving('emailLoginStatus')"
                v-model="formInline.emailLoginStatus"
                active-value="1"
                inactive-value="0"
                @change="(val: any) => saveField('emailLoginStatus', String(val))"
              />
            </el-tooltip>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :xs="24" :md="20" :lg="15" :xl="12">
          <el-form-item label="发信通道" prop="emailProvider">
            <el-segmented
              :model-value="formInline.emailProvider"
              :options="emailProviderOptions"
              @change="(value: string) => setEmailProvider(value)"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <template v-if="formInline.emailProvider === 'smtp'">
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SMTP服务器地址" prop="MAILER_HOST">
              <el-input
                v-model="formInline.MAILER_HOST"
                placeholder="示例: smtp.example.com"
                clearable
                @blur="saveField('MAILER_HOST', formInline.MAILER_HOST)"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SMTP服务器端口" prop="MAILER_PORT">
              <el-input
                v-model="formInline.MAILER_PORT"
                placeholder="示例: 465"
                clearable
                @blur="saveField('MAILER_PORT', formInline.MAILER_PORT)"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SMTP用户名称" prop="MAILER_USER">
              <el-input
                v-model="formInline.MAILER_USER"
                placeholder="SMTP 认证用户名"
                clearable
                @blur="saveField('MAILER_USER', formInline.MAILER_USER)"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SMTP用户密码" prop="MAILER_PASS">
              <el-input
                v-model="formInline.MAILER_PASS"
                placeholder="SMTP 授权码或应用专用密码"
                type="password"
                show-password
                clearable
                @blur="saveField('MAILER_PASS', formInline.MAILER_PASS)"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="邮箱SSL配置" prop="MAILER_SECURE">
              <el-checkbox
                v-model="formInline.MAILER_SECURE"
                true-label="1"
                false-label="0"
                @change="(val: any) => saveField('MAILER_SECURE', String(val))"
              >
                启用 SSL
              </el-checkbox>
            </el-form-item>
          </el-col>
        </el-row>
      </template>

      <template v-else>
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
            <el-form-item label="发件地址" prop="tencentEmailFromAddress">
              <el-input
                v-model="formInline.tencentEmailFromAddress"
                placeholder="已在腾讯云邮件服务验证的发件地址"
                clearable
                @blur="saveField('tencentEmailFromAddress', formInline.tencentEmailFromAddress)"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="发件名称" prop="tencentEmailFromName">
              <el-input
                v-model="formInline.tencentEmailFromName"
                placeholder="例如：99Agent 通知"
                clearable
                @blur="saveField('tencentEmailFromName', formInline.tencentEmailFromName)"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="回复地址" prop="tencentEmailReplyTo">
              <el-input
                v-model="formInline.tencentEmailReplyTo"
                placeholder="可选，用户回复邮件时使用"
                clearable
                @blur="saveField('tencentEmailReplyTo', formInline.tencentEmailReplyTo)"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="模板 ID" prop="tencentEmailTemplateId">
              <el-input
                v-model="formInline.tencentEmailTemplateId"
                placeholder="可选；填写后使用腾讯云邮件模板发送"
                clearable
                @blur="saveField('tencentEmailTemplateId', formInline.tencentEmailTemplateId)"
              />
              <div class="mt-2 text-sm text-gray-500">
                模板变量可使用 code、siteName、siteUrl、expireMinutes。留空时使用接口 Simple
                内容发送。
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </template>
    </el-form>
  </ConfigLoadGuard>
</template>
