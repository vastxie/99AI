<route lang="yaml">
meta:
  title: 易支付设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  payEpayStatus: '',
  payEpayPid: '',
  payEpaySecret: '',
  payEpayNotifyUrl: '',
  payEpayReturnUrl: '',
  payEpayApiPayUrl: '',
  payEpayApiQueryUrl: '',
  payEpayRedirect: '',
  payEpayChannel: [],
});

const rules = ref<FormRules>({
  payEpayStatus: [
    { required: true, trigger: 'change', message: '请选择当前支付开启状态' },
  ],
  payEpaySecret: [
    { required: true, trigger: 'blur', message: '请填写支付秘钥' },
  ],
  payEpayPid: [{ required: true, trigger: 'blur', message: '请填写商户PID' }],
  payEpayNotifyUrl: [
    { required: true, trigger: 'blur', message: '请填写支付通知地址' },
  ],
  payEpayApiPayUrl: [
    { required: true, trigger: 'blur', message: '请填写平台支付API请求地址' },
  ],
  payEpayApiQueryUrl: [
    { required: true, trigger: 'blur', message: '请填写平台API商户查询地址' },
  ],
});

const formRef = ref<FormInstance>();

const channelList = [
  { label: '微信支付', value: 'wxpay' },
  { label: '支付宝支付', value: 'alipay' },
];

async function queryAllconfig() {
  const res = await apiConfig.queryConfig({
    keys: [
      'payEpaySecret',
      'payEpayNotifyUrl',
      'payEpayReturnUrl',
      'payEpayPid',
      'payEpayStatus',
      'payEpayApiPayUrl',
      'payEpayApiQueryUrl',
      'payEpayRedirect',
      'payEpayChannel',
    ],
  });
  const payEpayChannel = res.data.payEpayChannel
    ? JSON.parse(res.data.payEpayChannel)
    : [];
  Object.assign(formInline, res.data, { payEpayChannel });
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

function formatMenuListConfig(key: string, val: any) {
  if (['payEpayChannel'].includes(key)) {
    if (!val) {
      return [];
    }
    if (val) {
      return JSON.stringify(val);
    }
  } else {
    return val;
  }
}

function fotmatSetting(settings: any) {
  return Object.keys(settings).map((key) => {
    return {
      configKey: key,
      configVal: formatMenuListConfig(key, settings[key]),
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
        <div class="flex items-center gap-4">易支付设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>通用易支付渠道，请按文档配置即可。</div>
          <div>支付通知地址为： https://您的域名/api/pay/notify。</div>
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
        label-width="120px"
      >
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="启用当前支付" prop="payEpayPid">
              <el-switch
                v-model="formInline.payEpayStatus"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="商户PID" prop="payEpayPid">
              <el-input
                v-model="formInline.payEpayPid"
                placeholder="请填写商户PID"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="商户秘钥" prop="payEpaySecret">
              <el-input
                v-model="formInline.payEpaySecret"
                placeholder="请填写商户秘钥"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="支付通知地址" prop="payEpaySecret">
              <el-input
                v-model="formInline.payEpayNotifyUrl"
                placeholder="请填写支付通知地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="支付回调地址" prop="payEpaySecret">
              <el-input
                v-model="formInline.payEpayReturnUrl"
                placeholder="请填写支付成功后的回跳地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider />
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="支付请求地址" prop="payEpayApiPayUrl">
              <el-input
                v-model="formInline.payEpayApiPayUrl"
                placeholder="请填写平台支付请求地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="商户查询地址" prop="payEpayApiQueryUrl">
              <el-input
                v-model="formInline.payEpayApiQueryUrl"
                placeholder="请填写平台查询商户地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider />
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="是否开启跳转支付"
              prop="payEpayRedirect"
              label-width="130px"
            >
              <el-tooltip
                class="box-item"
                effect="dark"
                content="请注意、仅mapi支持不跳转支付、其他都需要为跳转支付、不开启跳转支付表示购买页面显示二维码直接扫码购买、跳转支付表示前往新页面！"
                placement="right"
              >
                <el-switch
                  v-model="formInline.payEpayRedirect"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="24" :lg="24" :xl="24">
            <el-form-item label="开启支付渠道" prop="payEpayChannel">
              <el-checkbox-group
                v-model="formInline.payEpayChannel"
                size="small"
              >
                <el-checkbox
                  v-for="item in channelList"
                  :key="item.value"
                  border
                  :label="item.value"
                >
                  {{ item.label }}
                </el-checkbox>
              </el-checkbox-group>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
