<route lang="yaml">
meta:
  title: 手机验证码配置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  phoneLoginStatus: '',
  aliPhoneAccessKeyId: '',
  aliPhoneAccessKeySecret: '',
  aliPhoneSignName: '',
  aliPhoneTemplateCode: '',
});

const rules = ref<FormRules>({
  phoneLoginStatus: [
    { required: false, trigger: 'blur', message: '请选择是否开启手机号登录' },
  ],
  aliPhoneAccessKeyId: [
    {
      required: false,
      trigger: 'blur',
      message: '请填写阿里云短信服务accessKeyId',
    },
  ],
  aliPhoneAccessKeySecret: [
    {
      required: false,
      trigger: 'blur',
      message: '请填写阿里云短信服务accessKeySecret',
    },
  ],
  aliPhoneSignName: [
    {
      required: false,
      trigger: 'blur',
      message: '请填写阿里云短信服务的模板签名',
    },
  ],
  aliPhoneTemplateCode: [
    {
      required: false,
      trigger: 'blur',
      message: '请填写阿里云短信服务的模板ID',
    },
  ],
});
const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'phoneLoginStatus',
      'aliPhoneAccessKeyId',
      'aliPhoneAccessKeySecret',
      'aliPhoneSignName',
      'aliPhoneTemplateCode',
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
        <div class="flex items-center gap-4">手机验证码登录设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            手机验证使用<a
              href="https://dysms.console.aliyun.com/overview"
              target="_blank"
              >阿里云短信服务</a
            >，请先申请好签名模板以及获取到您的秘钥信息。
          </div>
          <div>当您配置并开启后则表示开启用户端手机号注册的行为！</div>
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
        label-width="170px"
      >
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="开启手机号注册/登录" prop="phoneLoginStatus">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="如您启用短信登录、则用户端则可以通过手机号的方式登录！"
                placement="right"
              >
                <el-switch
                  v-model="formInline.phoneLoginStatus"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="AccessKeyId" prop="aliPhoneAccessKeyId">
              <el-input
                v-model="formInline.aliPhoneAccessKeyId"
                placeholder="请填写AccessKeyId"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="AccessKeySecret"
              prop="aliPhoneAccessKeySecret"
            >
              <el-input
                v-model="formInline.aliPhoneAccessKeySecret"
                placeholder="请填写AccessKeySecret"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="短信签名" prop="aliPhoneSignName">
              <el-input
                v-model="formInline.aliPhoneSignName"
                placeholder="请填写您申请的短信签名"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="短信模板ID" prop="aliPhoneTemplateCode">
              <el-input
                v-model="formInline.aliPhoneTemplateCode"
                placeholder="请填写短信模板ID"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
