<route lang="yaml">
meta:
  title: 官方微信支付设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  payWechatStatus: '',
  payWeChatMchId: '',
  payWeChatAppId: '',
  payWeChatSecret: '',
  payWeChatNotifyUrl: '',
  payWeChatPublicKey: '',
  payWeChatPrivateKey: '',
});

const rules = ref<FormRules>({
  payWechatStatus: [
    { required: true, trigger: 'change', message: '请选择当前支付开启状态' },
  ],
  payWeChatSecret: [
    { required: true, trigger: 'blur', message: '请填写支付Secret秘钥' },
  ],
  payWeChatMchId: [
    { required: true, trigger: 'blur', message: '请填写商户号' },
  ],
  payWeChatAppId: [{ required: true, trigger: 'blur', message: '请填写AppId' }],
  payWeChatNotifyUrl: [
    { required: true, trigger: 'blur', message: '请填写支付通知地址' },
  ],
  payWeChatPublicKey: [
    {
      required: true,
      trigger: 'blur',
      message: '请填写支付公钥信息（cert.pem文件）',
    },
  ],
  payWeChatPrivateKey: [
    {
      required: true,
      trigger: 'blur',
      message: '请填写支付私钥地址（key.pem文件）',
    },
  ],
});

const formRef = ref<FormInstance>();

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'payWeChatSecret',
      'payWeChatNotifyUrl',
      'payWeChatAppId',
      'payWechatStatus',
      'payWeChatMchId',
      'payWeChatPublicKey',
      'payWeChatPrivateKey',
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
        <div class="flex items-center gap-4">微信支付设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            同时开启多个支付，将以微信支付作为最高优先级，在pc端会调用 native
            支付，在微信环境内将调用 Jsapi 支付。
          </div>
          <div>
            请确认微信支付已经申请了支付权限，支付通知地址为：
            https://您的域名/api/pay/notify。
          </div>
        </div>
      </template>
      <HButton outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-form
        ref="formRef"
        :rules="rules"
        :model="formInline"
        label-width="140px"
      >
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="启用当前支付" prop="payWechatStatus">
              <el-switch
                v-model="formInline.payWechatStatus"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="商户ID" prop="payWeChatMchId">
              <el-input
                v-model="formInline.payWeChatMchId"
                placeholder="请填写商户ID"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="AppId" prop="payWeChatAppId">
              <el-input
                v-model="formInline.payWeChatAppId"
                placeholder="请填写AppId"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="商户秘钥" prop="payWeChatSecret">
              <el-input
                v-model="formInline.payWeChatSecret"
                placeholder="请填写Secret秘钥"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="支付通知地址" prop="payWeChatNotifyUrl">
              <el-input
                v-model="formInline.payWeChatNotifyUrl"
                placeholder="请填写支付通知地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="公钥地址" prop="payWeChatPublicKey">
              <el-input
                v-model="formInline.payWeChatPublicKey"
                type="textarea"
                :rows="6"
                placeholder="请填写支付公钥信息（cert.pem文件）"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="私钥地址" prop="payWeChatPrivateKey">
              <el-input
                v-model="formInline.payWeChatPrivateKey"
                type="textarea"
                :rows="6"
                placeholder="请填写支付私钥地址（key.pem文件）"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
