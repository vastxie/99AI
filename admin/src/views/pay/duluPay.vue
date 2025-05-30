<route lang="yaml">
meta:
  title: 嘟噜支付设置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref, watch } from 'vue';

  const formInline = reactive({
    payDuluPayStatus: '',
    payDuluPayPid: '',
    payDuluPaySecret: '',
    payDuluPayNotifyUrl: '',
    payDuluPayReturnUrl: '',
    payDuluPayRedirect: '',
    payDuluPayChannel: [],
  });

  const rules = computed<FormRules>(() => {
    const isPayEnabled = formInline.payDuluPayStatus === '1';

    return {
      payDuluPayStatus: [{ required: true, trigger: 'change', message: '请选择当前支付开启状态' }],
      payDuluPaySecret: [{ required: isPayEnabled, trigger: 'blur', message: '请填写支付秘钥' }],
      payDuluPayPid: [{ required: isPayEnabled, trigger: 'blur', message: '请填写商户PID' }],
      payDuluPayNotifyUrl: [
        { required: isPayEnabled, trigger: 'blur', message: '请填写支付通知地址' },
      ],
      payDuluPayReturnUrl: [
        { required: isPayEnabled, trigger: 'blur', message: '请填写支付回调地址' },
      ],
      payDuluPayRedirect: [
        { required: isPayEnabled, trigger: 'change', message: '请选择支付模式' },
      ],
      payDuluPayChannel: [
        { required: isPayEnabled, trigger: 'change', message: '请选择至少一个支付渠道' },
      ],
    };
  });

  const formRef = ref<FormInstance>();

  const channelList = [
    { label: '微信支付', value: 'wxpay' },
    { label: '支付宝支付', value: 'alipay' },
  ];

  async function queryAllconfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'payDuluPaySecret',
        'payDuluPayNotifyUrl',
        'payDuluPayReturnUrl',
        'payDuluPayPid',
        'payDuluPayStatus',
        'payDuluPayRedirect',
        'payDuluPayChannel',
      ],
    });
    const payDuluPayChannel = res.data.payDuluPayChannel
      ? JSON.parse(res.data.payDuluPayChannel)
      : [];
    Object.assign(formInline, res.data, { payDuluPayChannel });
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
    if (['payDuluPayChannel'].includes(key)) {
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

  // 监听支付状态的变化，当状态改变时重新验证表单
  watch(
    () => formInline.payDuluPayStatus,
    () => {
      // 给下一个事件循环一点时间来更新规则
      setTimeout(() => {
        formRef.value?.validateField([
          'payDuluPaySecret',
          'payDuluPayPid',
          'payDuluPayNotifyUrl',
          'payDuluPayReturnUrl',
          'payDuluPayRedirect',
          'payDuluPayChannel',
        ]);
      }, 0);
    },
  );

  onMounted(() => {
    queryAllconfig();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">嘟噜支付设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            <a href="https://www.dulupay.com/?invite=99AI" target="_blank">嘟噜支付</a>
            支付渠道，请按文档配置即可。
          </div>
          <div>支付通知地址为： https://您的域名/api/pay/notify。</div>
        </div>
      </template>
      <HButton outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="120px">
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="启用当前支付" prop="payDuluPayPid">
              <el-switch
                v-model="formInline.payDuluPayStatus"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="商户PID" prop="payDuluPayPid">
              <el-input v-model="formInline.payDuluPayPid" placeholder="请填写商户PID" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="商户秘钥" prop="payDuluPaySecret">
              <el-input
                v-model="formInline.payDuluPaySecret"
                placeholder="请填写商户秘钥"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="支付通知地址" prop="payDuluPaySecret">
              <el-input
                v-model="formInline.payDuluPayNotifyUrl"
                placeholder="请填写支付通知地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="支付回调地址" prop="payDuluPaySecret">
              <el-input
                v-model="formInline.payDuluPayReturnUrl"
                placeholder="请填写支付成功后的回跳地址"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="支付模式" prop="payDuluPayRedirect" label-width="130px">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="说明：扫码模式在购买页面直接显示二维码供用户扫码支付；跳转模式则会引导用户前往新页面完成支付"
                placement="right"
              >
                <el-radio-group v-model="formInline.payDuluPayRedirect">
                  <el-radio label="0">扫码模式</el-radio>
                  <el-radio label="1">跳转模式</el-radio>
                </el-radio-group>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="24" :lg="24" :xl="24">
            <el-form-item label="开启支付渠道" prop="payDuluPayChannel">
              <el-checkbox-group v-model="formInline.payDuluPayChannel" size="small">
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
