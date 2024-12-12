<route lang="yaml">
meta:
  title: 码支付设置
</route>

<script lang="ts" setup>
import apiConfig from '@/api/modules/config';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

const formInline = reactive({
  payMpayStatus: '',
  payMpayPid: '',
  payMpaySecret: '',
  payMpayNotifyUrl: '',
  payMpayReturnUrl: '',
  payMpayApiPayUrl: '',
  payMpayRedirect: '',
  payMpayChannel: [],
});

const rules = ref<FormRules>({
  payMpayStatus: [
    { required: true, trigger: 'change', message: '请选择当前支付开启状态' },
  ],
  payMpaySecret: [
    { required: true, trigger: 'blur', message: '请填写支付秘钥' },
  ],
  payMpayPid: [{ required: true, trigger: 'blur', message: '请填写商户PID' }],
  payMpayNotifyUrl: [
    { required: true, trigger: 'blur', message: '请填写支付通知地址' },
  ],
  payMpayApiPayUrl: [
    { required: true, trigger: 'blur', message: '请填写平台支付API请求地址' },
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
      'payMpaySecret',
      'payMpayNotifyUrl',
      'payMpayReturnUrl',
      'payMpayPid',
      'payMpayStatus',
      'payMpayApiPayUrl',
      'payMpayRedirect',
      'payMpayChannel',
    ],
  });
  const payMpayChannel = res.data.payMpayChannel
    ? JSON.parse(res.data.payMpayChannel)
    : [];
  Object.assign(formInline, res.data, { payMpayChannel });
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
  if (['payMpayChannel'].includes(key)) {
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
        <div class="flex items-center gap-4">码支付设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
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
            <el-form-item label="启用当前支付" prop="payMpayPid">
              <el-switch
                v-model="formInline.payMpayStatus"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="商户PID" prop="payMpayPid">
              <el-input
                v-model="formInline.payMpayPid"
                placeholder="请填写商户PID"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="商户秘钥" prop="payMpaySecret">
              <el-input
                v-model="formInline.payMpaySecret"
                placeholder="请填写商户秘钥"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="支付通知地址" prop="payMpaySecret">
              <el-input
                v-model="formInline.payMpayNotifyUrl"
                placeholder="请填写支付通知地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="支付回调地址" prop="payMpaySecret">
              <el-input
                v-model="formInline.payMpayReturnUrl"
                placeholder="请填写支付成功后的回跳地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider />
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="支付请求地址" prop="payMpayApiPayUrl">
              <el-input
                v-model="formInline.payMpayApiPayUrl"
                placeholder="请填写平台支付请求地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider />
        <!-- <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12" >
            <el-form-item label="是否开启跳转支付" prop="payMpayRedirect" label-width="130px">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="请注意、仅mapi支持不跳转支付、其他都需要为跳转支付、不开启跳转支付表示购买页面显示二维码直接扫码购买、跳转支付表示前往新页面！"
                placement="right"
              >
              <el-switch
                v-model="formInline.payMpayRedirect"
                active-value="1"
                inactive-value="0"
              />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row> -->
        <el-row>
          <el-col :xs="24" :md="24" :lg="24" :xl="24">
            <el-form-item label="开启支付渠道" prop="payMpayChannel">
              <el-checkbox-group
                v-model="formInline.payMpayChannel"
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
