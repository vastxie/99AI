<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { channelFieldValue } from '../channelFields';
  import { ElMessageBox } from 'element-plus';
  import { nextTick, onMounted, reactive, ref, computed } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';
  import { COMMERCE_BRAND_COLORS } from '../brand-colors';
  import FullPaymentTestDialog from '../components/FullPaymentTestDialog.vue';

  const docUrl = computed(() => getDocUrl('/configuration/payment/channel-config'));
  usePageDoc(docUrl);
  const loading = ref(false);
  const activeTab = ref('wechat_official');
  const showFullTestDialog = ref(false);

  // 定义字段类型
  interface ChannelField {
    key: string;
    label: string;
    type: 'input' | 'password' | 'textarea' | 'select';
    required: boolean;
    placeholder?: string;
    defaultValue?: string;
    options?: Array<{ label: string; value: string }>;
    // 条件显示字段
    show?: (data: any) => boolean;
  }

  interface ChannelConfig {
    name: string;
    description?: string;
    icon?: string;
    iconColor?: string;
    fields: ChannelField[];
  }

  function getWechatVerifyMode(data: any) {
    if (data?.payWeChatVerifyMode === 'wechatpay_public_key') return 'wechatpay_public_key';
    if (data?.payWeChatVerifyMode === 'auto_compat') return 'auto_compat';
    return 'platform_certificate';
  }

  function shouldShowWechatPlatformFields(data: any) {
    const mode = getWechatVerifyMode(data);
    return mode === 'platform_certificate' || mode === 'auto_compat';
  }

  function shouldShowWechatPublicKeyFields(data: any) {
    const mode = getWechatVerifyMode(data);
    return mode === 'wechatpay_public_key' || mode === 'auto_compat';
  }

  function isWechatPlatformCertificate(value: any) {
    return typeof value === 'string' && value.includes('BEGIN CERTIFICATE');
  }

  // 各渠道的配置字段
  const channelConfigs: Record<string, ChannelConfig> = {
    wechat_official: {
      name: '微信官方支付',
      description: '使用微信官方支付接口，需要企业资质认证',
      icon: 'i-simple-icons:wechat',
      iconColor: COMMERCE_BRAND_COLORS.wechatPay,
      fields: [
        {
          key: 'payWeChatMchId',
          label: '商户号',
          type: 'input',
          required: true,
          placeholder: '微信支付商户号',
        },
        {
          key: 'payWeChatAppId',
          label: 'AppId',
          type: 'input',
          required: true,
          placeholder: '微信公众号或小程序AppId',
        },
        {
          key: 'payWeChatSecret',
          label: 'APIv3密钥',
          type: 'password',
          required: true,
          placeholder: '微信支付 APIv3 密钥（32位）',
        },
        {
          key: 'payWeChatVerifyMode',
          label: '回调验签模式',
          type: 'select',
          required: false,
          defaultValue: 'platform_certificate',
          placeholder: '请选择微信支付回调验签模式',
          options: [
            { label: '平台证书模式', value: 'platform_certificate' },
            { label: '微信支付公钥模式', value: 'wechatpay_public_key' },
            { label: '切换期自动兼容', value: 'auto_compat' },
          ],
        },
        {
          key: 'payWeChatPublicKey',
          label: '平台证书/平台公钥',
          type: 'textarea',
          required: true,
          placeholder: '请输入完整的微信支付平台证书或平台公钥内容',
          show: shouldShowWechatPlatformFields,
        },
        {
          key: 'payWeChatPlatformSerialNo',
          label: '平台证书序列号',
          type: 'input',
          required: false,
          placeholder: '填写平台公钥时必填；完整平台证书可留空',
          show: shouldShowWechatPlatformFields,
        },
        {
          key: 'payWeChatWechatpayPublicKeyId',
          label: '微信支付公钥ID',
          type: 'input',
          required: true,
          placeholder: '请输入 Wechatpay-Serial 对应的微信支付公钥ID',
          show: shouldShowWechatPublicKeyFields,
        },
        {
          key: 'payWeChatWechatpayPublicKey',
          label: '微信支付公钥',
          type: 'textarea',
          required: true,
          placeholder: '请输入完整的微信支付公钥内容',
          show: shouldShowWechatPublicKeyFields,
        },
        {
          key: 'payWeChatPrivateKey',
          label: '私钥证书',
          type: 'textarea',
          required: true,
          placeholder: '请输入完整的私钥证书内容',
        },
      ],
    },
    alipay_official: {
      name: '支付宝官方支付',
      description: '使用支付宝官方支付接口，支持电脑网站支付和手机网站支付',
      icon: 'i-simple-icons:alipay',
      iconColor: COMMERCE_BRAND_COLORS.alipay,
      fields: [
        {
          key: 'alipayAppId',
          label: '应用AppId',
          type: 'input',
          required: true,
          placeholder: '支付宝应用AppId',
        },
        {
          key: 'alipayPrivateKey',
          label: '应用私钥',
          type: 'textarea',
          required: true,
          placeholder: '请输入完整的应用私钥内容（RSA2）',
        },
        {
          key: 'alipayPublicKey',
          label: '支付宝公钥',
          type: 'textarea',
          required: true,
          placeholder: '请输入支付宝公钥内容（非应用公钥）',
        },
        {
          key: 'alipayEnablePolling',
          label: '启用后端轮询',
          type: 'select',
          required: false,
          placeholder: '是否启用后端主动轮询订单状态（默认启用）',
          options: [
            { label: '启用（开发环境推荐）', value: '1' },
            { label: '禁用（仅依赖异步通知）', value: '0' },
          ],
        },
      ],
    },
    epay: {
      name: '易支付',
      description: '第三方聚合支付平台，支持多种支付方式',
      icon: 'i-lucide:credit-card',
      iconColor: COMMERCE_BRAND_COLORS.epay,
      fields: [
        {
          key: 'payEpayApiPayUrl',
          label: '支付接口地址',
          type: 'input',
          required: true,
          placeholder: 'https://pay.example.com/api/pay',
        },
        {
          key: 'payEpayApiQueryUrl',
          label: '查询接口地址',
          type: 'input',
          required: true,
          placeholder: 'https://pay.example.com/api/query',
        },
        {
          key: 'payEpayPid',
          label: '商户ID',
          type: 'input',
          required: true,
          placeholder: '易支付商户ID',
        },
        {
          key: 'payEpayApiVersion',
          label: 'API版本',
          type: 'select',
          required: true,
          placeholder: '选择API版本',
          options: [
            { label: 'V1版本（MD5签名）', value: 'v1' },
            { label: 'V2版本（RSA签名）', value: 'v2' },
          ],
        },
        {
          key: 'payEpayKey',
          label: '商户密钥',
          type: 'password',
          // 动态必需，V1时必需
          required: false,
          placeholder: '易支付商户密钥（MD5密钥）',
          show: (data) => !data.payEpayApiVersion || data.payEpayApiVersion === 'v1',
        },
        {
          key: 'payEpayPrivateKey',
          label: '商户私钥',
          type: 'textarea',
          // 动态必需，V2时必需
          required: false,
          placeholder: '请输入完整的RSA私钥内容',
          show: (data) => data.payEpayApiVersion === 'v2',
        },
        {
          key: 'payEpayPublicKey',
          label: '平台公钥',
          type: 'textarea',
          // 动态必需，V2时必需
          required: false,
          placeholder: '请输入平台公钥（用于回调验签）',
          show: (data) => data.payEpayApiVersion === 'v2',
        },
        {
          key: 'payEpayEnablePolling',
          label: '启用后端轮询',
          type: 'select',
          required: false,
          placeholder: '是否启用后端主动轮询订单状态（默认启用）',
          options: [
            { label: '启用（开发环境推荐）', value: '1' },
            { label: '禁用（仅依赖异步通知）', value: '0' },
          ],
        },
      ],
    },
    paypal_official: {
      name: 'PayPal官方',
      description: 'PayPal国际支付平台',
      icon: 'i-simple-icons:paypal',
      iconColor: COMMERCE_BRAND_COLORS.paypal,
      fields: [
        {
          key: 'payPalClientId',
          label: 'Client ID',
          type: 'input',
          required: true,
          placeholder: 'PayPal Client ID',
        },
        {
          key: 'payPalClientSecret',
          label: 'Client Secret',
          type: 'password',
          required: true,
          placeholder: 'PayPal Client Secret',
        },
        {
          key: 'payPalMode',
          label: '环境模式',
          type: 'select',
          required: true,
          options: [
            { label: '沙盒环境', value: 'sandbox' },
            { label: '生产环境', value: 'live' },
          ],
        },
        {
          key: 'payPalWebhookId',
          label: 'Webhook ID',
          type: 'input',
          required: true,
          placeholder: 'PayPal Webhook ID，用于验证异步通知',
        },
      ],
    },
    stripe_official: {
      name: 'Stripe官方',
      description: 'Stripe国际支付平台',
      icon: 'i-simple-icons:stripe',
      iconColor: COMMERCE_BRAND_COLORS.stripe,
      fields: [
        {
          key: 'stripeSecretKey',
          label: 'Secret Key',
          type: 'password',
          required: true,
          placeholder: 'Stripe Secret Key',
        },
        {
          key: 'stripePublishableKey',
          label: 'Publishable Key',
          type: 'input',
          required: true,
          placeholder: 'Stripe Publishable Key',
        },
        {
          key: 'stripeMode',
          label: '环境模式',
          type: 'select',
          required: true,
          options: [
            { label: '测试环境', value: 'test' },
            { label: '生产环境', value: 'live' },
          ],
        },
        {
          key: 'stripeWebhookSecret',
          label: 'Webhook Secret',
          type: 'password',
          required: true,
          placeholder: 'Stripe Webhook Secret，用于验证异步通知',
        },
      ],
    },
  };

  // 各渠道的配置数据
  const channelSettings = reactive<Record<string, any>>({});
  /** 含这个配置项的渠道（同一个键可能出现在几个渠道的表单里，例如共用的易支付参数） */
  const channelsWithKey = (key: string) =>
    Object.keys(channelConfigs).filter((channelKey) =>
      channelConfigs[channelKey].fields.some((field) => field.key === key),
    );
  const {
    isReady,
    loadFailed,
    initFromConfig,
    markLoadFailed,
    saveField: saveConfigField,
    saveFields,
  } = useConfigAutoSave({
    read: (key) => {
      const owners = channelsWithKey(key);
      const owner = owners.includes(activeTab.value) ? activeTab.value : owners[0];
      return owner ? channelSettings[owner]?.[key] : undefined;
    },
    write: (key, raw) => {
      // 与加载时同一个映射：没配置过（空串）的字段显示它的默认选项
      for (const owner of channelsWithKey(key)) {
        if (!channelSettings[owner]) continue;
        const field = channelConfigs[owner].fields.find((item) => item.key === key);
        channelSettings[owner][key] = channelFieldValue(raw, field?.defaultValue);
      }
    },
  });

  // 渠道状态
  const channelStatus = ref<Record<string, { configured: boolean; missing: string[] }>>({});

  // 初始化所有渠道的设置对象
  Object.keys(channelConfigs).forEach((channelKey) => {
    channelSettings[channelKey] = {};
  });

  // 获取所有渠道的配置键
  function getAllChannelKeys(): string[] {
    const keys: string[] = [];
    Object.values(channelConfigs).forEach((config) => {
      config.fields.forEach((field) => {
        if (!keys.includes(field.key)) {
          keys.push(field.key);
        }
      });
    });
    return keys;
  }

  // 获取支付参数
  async function fetchChannelConfig() {
    loading.value = true;
    try {
      const keys = getAllChannelKeys();
      const res = await apiConfig.queryConfig({ keys });

      // 初始化所有渠道的设置对象
      Object.keys(channelConfigs).forEach((channelKey) => {
        if (!channelSettings[channelKey]) {
          channelSettings[channelKey] = {};
        }
        channelConfigs[channelKey].fields.forEach((field) => {
          channelSettings[channelKey][field.key] = channelFieldValue(
            res.data[field.key],
            field.defaultValue,
          );
        });
      });

      await nextTick();
      // 记录原始值，用于变更检测
      initFromConfig(res.data);
    } catch (error) {
      console.error('获取支付参数失败:', error);
      markLoadFailed();
    } finally {
      loading.value = false;
    }
  }

  // 查询渠道状态
  async function fetchChannelStatus() {
    try {
      // 查询所有配置并检查渠道是否已配置
      const res = await apiConfig.queryAllConfig();
      // 确保 configs 是数组
      let configs = res.data || [];

      // 如果返回的是对象，尝试转换为数组
      if (!Array.isArray(configs)) {
        // 如果是对象，可能是 {rows: [...]} 或 {list: [...]} 格式
        if (configs.rows && Array.isArray(configs.rows)) {
          configs = configs.rows;
        } else if (configs.list && Array.isArray(configs.list)) {
          configs = configs.list;
        } else if (typeof configs === 'object' && configs !== null) {
          // 如果是键值对对象，转换为数组
          configs = Object.entries(configs).map(([key, value]) => ({
            configKey: key,
            configVal: value,
          }));
        } else {
          configs = [];
        }
      }

      const status: Record<string, { configured: boolean; missing: string[] }> = {};

      // 检查每个渠道是否已配置
      Object.keys(channelConfigs).forEach((channelKey) => {
        const channel = channelConfigs[channelKey];
        const missingFields: string[] = [];

        // 获取当前渠道的配置值
        const currentConfig: Record<string, any> = {};
        configs.forEach((c: any) => {
          if (channel.fields.some((f) => f.key === c.configKey)) {
            currentConfig[c.configKey] = c.configVal;
          }
        });

        // 特殊处理易支付的动态必需字段
        if (channelKey === 'wechat_official') {
          const verifyMode =
            currentConfig['payWeChatVerifyMode'] ||
            channel.fields.find((f) => f.key === 'payWeChatVerifyMode')?.defaultValue ||
            'platform_certificate';
          const requiredKeys = [
            'payWeChatMchId',
            'payWeChatAppId',
            'payWeChatSecret',
            'payWeChatPrivateKey',
          ];

          if (verifyMode === 'wechatpay_public_key') {
            requiredKeys.push('payWeChatWechatpayPublicKeyId');
            requiredKeys.push('payWeChatWechatpayPublicKey');
          } else if (verifyMode === 'auto_compat') {
            requiredKeys.push('payWeChatPublicKey');
            if (!isWechatPlatformCertificate(currentConfig['payWeChatPublicKey'])) {
              requiredKeys.push('payWeChatPlatformSerialNo');
            }
            requiredKeys.push('payWeChatWechatpayPublicKeyId');
            requiredKeys.push('payWeChatWechatpayPublicKey');
          } else {
            requiredKeys.push('payWeChatPublicKey');
            if (!isWechatPlatformCertificate(currentConfig['payWeChatPublicKey'])) {
              requiredKeys.push('payWeChatPlatformSerialNo');
            }
          }

          requiredKeys.forEach((key) => {
            if (!currentConfig[key] || currentConfig[key] === '') {
              const field = channel.fields.find((f) => f.key === key);
              if (field) {
                missingFields.push(field.label);
              }
            }
          });
        } else if (channelKey === 'epay') {
          const apiVersion = currentConfig['payEpayApiVersion'] || 'v1';
          const requiredKeys = [
            'payEpayPid',
            'payEpayApiPayUrl',
            'payEpayApiQueryUrl',
            'payEpayApiVersion',
          ];

          // 根据API版本添加必需字段
          if (apiVersion === 'v1') {
            requiredKeys.push('payEpayKey');
          } else if (apiVersion === 'v2') {
            requiredKeys.push('payEpayPrivateKey');
            requiredKeys.push('payEpayPublicKey');
          }

          // 检查必需字段
          requiredKeys.forEach((key) => {
            if (!currentConfig[key] || currentConfig[key] === '') {
              const field = channel.fields.find((f) => f.key === key);
              if (field) {
                missingFields.push(field.label);
              }
            }
          });
        } else {
          // 其他渠道使用原逻辑
          const requiredFields = channel.fields.filter((f) => f.required);
          requiredFields.forEach((field) => {
            const config = configs.find((c: any) => c.configKey === field.key);
            if (!config || !config.configVal) {
              missingFields.push(field.label);
            }
          });
        }

        status[channelKey] = {
          configured: missingFields.length === 0,
          missing: missingFields,
        };
      });

      channelStatus.value = status;
    } catch (error) {
      console.error('查询渠道状态失败:', error);
    }
  }

  // 保存单个字段，成功后刷新渠道状态
  async function saveField(key: string, value: string) {
    await saveConfigField(key, value, { onSaved: () => void fetchChannelStatus() });
  }

  // 清空当前支付参数
  async function clearCurrentConfig() {
    try {
      await ElMessageBox.confirm(
        `确定要清空 ${channelConfigs[activeTab.value].name} 的所有配置吗？`,
        '提示',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        },
      );
    } catch {
      // 用户取消
      return;
    }

    // 这一页签的全部字段一组保存（一次请求）：与在途的单项保存排队，失败时整组回到已保存的值
    const config = channelConfigs[activeTab.value];
    const values: Record<string, string> = {};
    config.fields.forEach((field) => {
      channelSettings[activeTab.value][field.key] = '';
      values[field.key] = '';
    });
    await saveFields(values, {
      successMessage: '配置已清空',
      onSaved: () => void fetchChannelStatus(),
    });
  }

  // 判断字段是否应该显示
  function shouldShowField(field: ChannelField, data: any): boolean {
    if (!field.show) return true;

    return field.show(data);
  }

  onMounted(() => {
    fetchChannelConfig();
    fetchChannelStatus();
  });
</script>

<template>
  <div>
    <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="fetchChannelConfig">
      <page-panel>
        <div class="mb-4 flex items-center justify-end gap-2">
          <el-button type="primary" @click="showFullTestDialog = true">
            <AppIcon name="i-lucide:shield-check" />
            支付测试
          </el-button>
        </div>
        <el-tabs v-model="activeTab" class="admin-page-tabs">
          <el-tab-pane v-for="(config, key) in channelConfigs" :key="key" :name="key">
            <template #label>
              <div class="tab-label">
                <app-icon
                  v-if="config.icon"
                  :name="config.icon"
                  :color="config.iconColor"
                  size="16"
                />
                <span>{{ config.name }}</span>
                <el-tag
                  v-if="channelStatus[key]"
                  :type="channelStatus[key].configured ? 'success' : 'info'"
                  size="small"
                  class="ml-2"
                >
                  {{ channelStatus[key].configured ? '已配置' : '未配置' }}
                </el-tag>
              </div>
            </template>

            <div class="channel-content">
              <el-form label-width="160px">
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item
                      v-for="field in config.fields"
                      v-show="shouldShowField(field, channelSettings[key])"
                      :key="field.key"
                      :label="field.label"
                      :required="field.required"
                    >
                      <!-- 输入框 -->
                      <el-input
                        v-if="field.type === 'input'"
                        v-model="channelSettings[key][field.key]"
                        :placeholder="field.placeholder"
                        clearable
                        @blur="saveField(field.key, channelSettings[key][field.key])"
                      />

                      <!-- 密码框 -->
                      <el-input
                        v-else-if="field.type === 'password'"
                        v-model="channelSettings[key][field.key]"
                        type="password"
                        :placeholder="field.placeholder"
                        show-password
                        clearable
                        @blur="saveField(field.key, channelSettings[key][field.key])"
                      />

                      <!-- 文本域 -->
                      <el-input
                        v-else-if="field.type === 'textarea'"
                        v-model="channelSettings[key][field.key]"
                        type="textarea"
                        :rows="4"
                        :placeholder="field.placeholder"
                        @blur="saveField(field.key, channelSettings[key][field.key])"
                      />

                      <!-- 下拉框 -->
                      <el-select
                        v-else-if="field.type === 'select'"
                        v-model="channelSettings[key][field.key]"
                        :placeholder="field.placeholder"
                        style="width: 100%"
                        @change="(val: any) => saveField(field.key, String(val))"
                      >
                        <el-option
                          v-for="option in field.options"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item>
                      <el-button type="danger" plain @click="clearCurrentConfig"
                        >清空配置</el-button
                      >
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>
          </el-tab-pane>
        </el-tabs>
      </page-panel>
      <FullPaymentTestDialog v-model="showFullTestDialog" />
    </ConfigLoadGuard>
  </div>
</template>

<style lang="scss" scoped>
  .tab-label {
    display: flex;
    align-items: center;
    gap: 6px;

    .el-tag {
      margin-left: 4px;
    }
  }

  .channel-content {
    padding: 10px 0;
  }

  :deep(.el-tabs__item.is-disabled) {
    cursor: pointer !important;
  }

  .ml-2 {
    margin-left: 8px;
  }
</style>
