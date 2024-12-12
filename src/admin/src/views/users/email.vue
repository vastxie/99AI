<route lang="yaml">
meta:
  title: 邮件设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  // isVerifyEmail: '',
  noVerifyRegister: '',
  emailLoginStatus: '',
  MAILER_HOST: '',
  MAILER_PORT: '',
  MAILER_USER: '',
  MAILER_PASS: '',
  MAILER_SECURE: '',
});

const rules = ref<FormRules>({
  MAILER_HOST: [
    { required: true, trigger: 'blur', message: '请填写SMTP服务器地址' },
  ],
  MAILER_PORT: [
    { required: true, trigger: 'blur', message: '请填写SMTP服务器端口' },
  ],
  MAILER_USER: [
    { required: true, trigger: 'blur', message: '请填写SMTP用户名称' },
  ],
  MAILER_PASS: [
    { required: true, trigger: 'blur', message: '请填写SMTP用户密码' },
  ],
  MAILER_SECURE: [{ required: true, trigger: 'blur', message: '是否使用SSL' }],
});
const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'noVerifyRegister',
      'emailLoginStatus',
      'MAILER_HOST',
      'MAILER_PORT',
      'MAILER_USER',
      'MAILER_PASS',
      'MAILER_SECURE',
    ],
  });
  Object.assign(formInline, res.data);
}

function handlerUpdateConfig() {
  formRef.value?.validate(async (valid) => {
    if (valid) {
      try {
        await apiConfig.setConfig({ settings: fotmatSetting(formInline) });
        ElMessage.success('变更配置信息成功');
      } catch (error) {}
      queryAllconfig();
    } else {
      ElMessage.error('请填写完整信息');
    }
  });
}

function fotmatSetting(settings: any) {
  return Object.keys(settings).map((key) => {
    return {
      configKey: key,
      configVal: settings[key],
    };
  });
}

onMounted(() => {
  queryAllconfig();
});
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">邮件登录设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>邮件设置主要用于发送注册时的激活邮件。</div>
          <div>是否开启邮箱登录：决定用户是否可以通过邮箱进行登录。</div>
          <div>是否开启邮箱注册：决定用户是否可以通过邮箱进行注册。</div>
          <div>SMTP服务器配置，用于发送邮件的 SMTP 相关配置，需自行测试。</div>
        </div>
      </template>
      <HButton text outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form
        ref="formRef"
        :rules="rules"
        :model="formInline"
        label-width="190px"
      >
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="开启邮箱注册/登录" prop="emailLoginStatus">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="如您启用当前邮箱登录、则用户端可以通过邮箱登录！"
                placement="right"
              >
                <el-switch
                  v-model="formInline.emailLoginStatus"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="关闭注册验证" prop="noVerifyRegister">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="打开即为关闭注册校验、注册将直接成功、请谨慎开启！"
                placement="right"
              >
                <el-switch
                  v-model="formInline.noVerifyRegister"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SMTP服务器地址" prop="MAILER_HOST">
              <el-input
                v-model="formInline.MAILER_HOST"
                placeholder="示例: smtp.example.com"
                clearable
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
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SMTP用户名称" prop="MAILER_USER">
              <el-input
                v-model="formInline.MAILER_USER"
                placeholder="SMTP认证用户名"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SMTP用户密码" prop="MAILER_PASS">
              <el-input
                v-model="formInline.MAILER_PASS"
                placeholder="SMTP认证密码"
                type="password"
                show-password
                clearable
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
              >
                启用SSL
              </el-checkbox>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
