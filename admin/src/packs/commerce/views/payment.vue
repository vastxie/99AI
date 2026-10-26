<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import apiPayment from '../api/payment';
  import { COMMERCE_BRAND_COLORS } from '../brand-colors';
  import { nextTick, onMounted, reactive, ref, computed } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';

  const docUrl = computed(() => getDocUrl('/configuration/payment/payment-config'));
  usePageDoc(docUrl);
  const loading = ref(false);

  // 支付方式配置
  const paymentConfig = reactive({
    wechat: {
      enabled: false,
      channel: 'wechat_official',
      priority: 1,
    },
    alipay: {
      enabled: false,
      channel: 'epay',
      priority: 2,
    },
    paypal: {
      enabled: false,
      channel: 'paypal_official',
      priority: 3,
    },
    stripe: {
      enabled: false,
      channel: 'stripe_official',
      priority: 4,
    },
  });

  type PaymentMethod = keyof typeof paymentConfig;
  const DEFAULT_CHANNEL: Record<PaymentMethod, string> = {
    wechat: 'wechat_official',
    alipay: 'epay',
    paypal: 'paypal_official',
    stripe: 'stripe_official',
  };
  const DEFAULT_PRIORITY: Record<PaymentMethod, number> = {
    wechat: 1,
    alipay: 2,
    paypal: 3,
    stripe: 4,
  };

  /** paymentWechatEnabled → { method: 'wechat', field: 'enabled' } */
  function locatePaymentKey(key: string) {
    const match = /^payment(Wechat|Alipay|Paypal|Stripe)(Enabled|Channel|Priority)$/u.exec(key);
    if (!match) return undefined;
    return {
      method: match[1].toLowerCase() as PaymentMethod,
      field: match[2].toLowerCase() as 'enabled' | 'channel' | 'priority',
    };
  }

  const {
    isReady,
    loadFailed,
    initFromConfig,
    markLoadFailed,
    saveField: saveConfigField,
    saving,
  } = useConfigAutoSave({
    read: (key) => {
      const located = locatePaymentKey(key);
      if (!located) return undefined;
      const value = paymentConfig[located.method][located.field];
      return normalizeConfigValue(value);
    },
    write: (key, raw) => {
      const located = locatePaymentKey(key);
      if (!located) return;
      const target = paymentConfig[located.method];
      if (located.field === 'enabled') target.enabled = isEnabledValue(raw);
      else if (located.field === 'channel') target.channel = raw || DEFAULT_CHANNEL[located.method];
      else target.priority = Number(raw) || DEFAULT_PRIORITY[located.method];
    },
  });

  // 微信支付渠道选项
  const wechatChannels = [
    { label: '微信官方', value: 'wechat_official' },
    { label: '易支付', value: 'epay' },
  ];

  // 支付宝渠道选项
  const alipayChannels = [
    { label: '支付宝官方', value: 'alipay_official' },
    { label: '易支付', value: 'epay' },
  ];

  // PayPal渠道选项
  const paypalChannels = [
    { label: 'PayPal官方', value: 'paypal_official' },
    { label: '易支付', value: 'epay' },
  ];

  // 渠道状态
  const channelStatus = ref<Record<string, { configured: boolean }>>({});

  function normalizeConfigValue(value: string | number | boolean | null | undefined): string {
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  function isEnabledValue(value: unknown): boolean {
    return value === '1' || value === 1 || value === true || value === 'true';
  }

  // 获取支付配置
  async function fetchPaymentConfig() {
    loading.value = true;
    try {
      const res = await apiConfig.queryConfig({
        keys: [
          'paymentWechatEnabled',
          'paymentWechatChannel',
          'paymentWechatPriority',
          'paymentAlipayEnabled',
          'paymentAlipayChannel',
          'paymentAlipayPriority',
          'paymentPaypalEnabled',
          'paymentPaypalChannel',
          'paymentPaypalPriority',
          'paymentStripeEnabled',
          'paymentStripeChannel',
          'paymentStripePriority',
        ],
      });
      const config = res.data;

      // 更新配置
      paymentConfig.wechat.enabled = isEnabledValue(config.paymentWechatEnabled);
      paymentConfig.wechat.channel = config.paymentWechatChannel || 'wechat_official';
      paymentConfig.wechat.priority = Number(config.paymentWechatPriority) || 1;

      paymentConfig.alipay.enabled = isEnabledValue(config.paymentAlipayEnabled);
      paymentConfig.alipay.channel = config.paymentAlipayChannel || 'epay';
      paymentConfig.alipay.priority = Number(config.paymentAlipayPriority) || 2;

      paymentConfig.paypal.enabled = isEnabledValue(config.paymentPaypalEnabled);
      paymentConfig.paypal.channel = config.paymentPaypalChannel || 'paypal_official';
      paymentConfig.paypal.priority = Number(config.paymentPaypalPriority) || 3;

      paymentConfig.stripe.enabled = isEnabledValue(config.paymentStripeEnabled);
      paymentConfig.stripe.channel = config.paymentStripeChannel || 'stripe_official';
      paymentConfig.stripe.priority = Number(config.paymentStripePriority) || 4;

      // 记录原始值用于变更检测（统一归一化后再作为比对基准）
      const normalized: Record<string, string> = {};
      Object.keys(config).forEach((key) => {
        normalized[key] = normalizeConfigValue(config[key]);
      });
      await nextTick();
      initFromConfig(normalized);
    } catch (error) {
      console.error('获取支付配置失败:', error);
      markLoadFailed();
    } finally {
      loading.value = false;
    }
  }

  // 查询渠道状态
  async function fetchChannelStatus() {
    try {
      const res = await apiPayment.getPaymentChannelStatus();
      if (res.data) {
        channelStatus.value = res.data;
      } else {
        console.error('获取渠道状态失败');
      }
    } catch (error) {
      console.error('查询渠道状态失败:', error);
    }
  }

  // 单字段保存（布尔转 '1'/'0'，空值转 ''，避免 'undefined'/'null' 字面量落库）
  async function saveField(key: string, value: string | number | boolean | null | undefined) {
    await saveConfigField(key, normalizeConfigValue(value));
  }

  onMounted(() => {
    fetchPaymentConfig();
    fetchChannelStatus();
  });
</script>

<template>
  <div>
    <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="fetchPaymentConfig">
      <page-panel>
        <el-row :gutter="20">
          <!-- 微信支付 -->
          <el-col :xs="24" :sm="12" :lg="6" style="margin-bottom: 20px">
            <div class="payment-item">
              <div class="payment-header">
                <div class="payment-icon wechat">
                  <app-icon name="i-simple-icons:wechat" size="28" />
                </div>
                <span class="payment-title">微信支付</span>
              </div>

              <el-form label-position="top">
                <el-form-item label="启用状态">
                  <el-switch
                    :loading="saving('paymentWechatEnabled')"
                    v-model="paymentConfig.wechat.enabled"
                    @change="(val: any) => saveField('paymentWechatEnabled', val)"
                  />
                </el-form-item>

                <el-form-item label="支付渠道" v-if="paymentConfig.wechat.enabled">
                  <el-select
                    v-model="paymentConfig.wechat.channel"
                    style="width: 100%"
                    @change="(val: any) => saveField('paymentWechatChannel', val)"
                  >
                    <el-option
                      v-for="channel in wechatChannels"
                      :key="channel.value"
                      :value="channel.value"
                    >
                      <div class="channel-option">
                        <span>{{ channel.label }}</span>
                        <el-tag
                          v-if="channelStatus[channel.value]"
                          :type="channelStatus[channel.value].configured ? 'success' : 'info'"
                          size="small"
                        >
                          {{ channelStatus[channel.value].configured ? '已配置' : '未配置' }}
                        </el-tag>
                      </div>
                    </el-option>
                  </el-select>
                </el-form-item>

                <el-form-item label="优先级" v-if="paymentConfig.wechat.enabled">
                  <el-input-number
                    v-model="paymentConfig.wechat.priority"
                    :min="0"
                    :max="999"
                    style="width: 100%"
                    @change="(val: any) => saveField('paymentWechatPriority', val)"
                  />
                </el-form-item>
              </el-form>
            </div>
          </el-col>

          <!-- 支付宝 -->
          <el-col :xs="24" :sm="12" :lg="6" style="margin-bottom: 20px">
            <div class="payment-item">
              <div class="payment-header">
                <div class="payment-icon alipay">
                  <app-icon name="i-simple-icons:alipay" size="28" />
                </div>
                <span class="payment-title">支付宝</span>
              </div>

              <el-form label-position="top">
                <el-form-item label="启用状态">
                  <el-switch
                    :loading="saving('paymentAlipayEnabled')"
                    v-model="paymentConfig.alipay.enabled"
                    @change="(val: any) => saveField('paymentAlipayEnabled', val)"
                  />
                </el-form-item>

                <el-form-item label="支付渠道" v-if="paymentConfig.alipay.enabled">
                  <el-select
                    v-model="paymentConfig.alipay.channel"
                    style="width: 100%"
                    @change="(val: any) => saveField('paymentAlipayChannel', val)"
                  >
                    <el-option
                      v-for="channel in alipayChannels"
                      :key="channel.value"
                      :value="channel.value"
                    >
                      <div class="channel-option">
                        <span>{{ channel.label }}</span>
                        <el-tag
                          v-if="channelStatus[channel.value]"
                          :type="channelStatus[channel.value].configured ? 'success' : 'info'"
                          size="small"
                        >
                          {{ channelStatus[channel.value].configured ? '已配置' : '未配置' }}
                        </el-tag>
                      </div>
                    </el-option>
                  </el-select>
                </el-form-item>

                <el-form-item label="优先级" v-if="paymentConfig.alipay.enabled">
                  <el-input-number
                    v-model="paymentConfig.alipay.priority"
                    :min="0"
                    :max="999"
                    style="width: 100%"
                    @change="(val: any) => saveField('paymentAlipayPriority', val)"
                  />
                </el-form-item>
              </el-form>
            </div>
          </el-col>

          <!-- PayPal -->
          <el-col :xs="24" :sm="12" :lg="6" style="margin-bottom: 20px">
            <div class="payment-item">
              <div class="payment-header">
                <div class="payment-icon paypal">
                  <app-icon name="i-simple-icons:paypal" size="28" />
                </div>
                <span class="payment-title">PayPal</span>
              </div>

              <el-form label-position="top">
                <el-form-item label="启用状态">
                  <el-switch
                    :loading="saving('paymentPaypalEnabled')"
                    v-model="paymentConfig.paypal.enabled"
                    @change="(val: any) => saveField('paymentPaypalEnabled', val)"
                  />
                </el-form-item>

                <el-form-item label="支付渠道" v-if="paymentConfig.paypal.enabled">
                  <el-select
                    v-model="paymentConfig.paypal.channel"
                    style="width: 100%"
                    @change="(val: any) => saveField('paymentPaypalChannel', val)"
                  >
                    <el-option
                      v-for="channel in paypalChannels"
                      :key="channel.value"
                      :value="channel.value"
                    >
                      <div class="channel-option">
                        <span>{{ channel.label }}</span>
                        <el-tag
                          v-if="channelStatus[channel.value]"
                          :type="channelStatus[channel.value].configured ? 'success' : 'info'"
                          size="small"
                        >
                          {{ channelStatus[channel.value].configured ? '已配置' : '未配置' }}
                        </el-tag>
                      </div>
                    </el-option>
                  </el-select>
                </el-form-item>

                <el-form-item label="优先级" v-if="paymentConfig.paypal.enabled">
                  <el-input-number
                    v-model="paymentConfig.paypal.priority"
                    :min="0"
                    :max="999"
                    style="width: 100%"
                    @change="(val: any) => saveField('paymentPaypalPriority', val)"
                  />
                </el-form-item>
              </el-form>
            </div>
          </el-col>

          <!-- Stripe -->
          <el-col :xs="24" :sm="12" :lg="6" style="margin-bottom: 20px">
            <div class="payment-item">
              <div class="payment-header">
                <div class="payment-icon stripe">
                  <app-icon name="i-simple-icons:stripe" size="28" />
                </div>
                <span class="payment-title">Stripe</span>
              </div>

              <el-form label-position="top">
                <el-form-item label="启用状态">
                  <el-switch
                    :loading="saving('paymentStripeEnabled')"
                    v-model="paymentConfig.stripe.enabled"
                    @change="(val: any) => saveField('paymentStripeEnabled', val)"
                  />
                </el-form-item>

                <el-form-item label="支付渠道" v-if="paymentConfig.stripe.enabled">
                  <el-select v-model="paymentConfig.stripe.channel" style="width: 100%" disabled>
                    <el-option value="stripe_official" label="Stripe官方">
                      <div class="channel-option">
                        <span>Stripe官方</span>
                        <el-tag
                          v-if="channelStatus['stripe_official']"
                          :type="channelStatus['stripe_official'].configured ? 'success' : 'info'"
                          size="small"
                        >
                          {{ channelStatus['stripe_official'].configured ? '已配置' : '未配置' }}
                        </el-tag>
                      </div>
                    </el-option>
                  </el-select>
                </el-form-item>

                <el-form-item label="优先级" v-if="paymentConfig.stripe.enabled">
                  <el-input-number
                    v-model="paymentConfig.stripe.priority"
                    :min="0"
                    :max="999"
                    style="width: 100%"
                    @change="(val: any) => saveField('paymentStripePriority', val)"
                  />
                </el-form-item>
              </el-form>
            </div>
          </el-col>
        </el-row>
      </page-panel>
    </ConfigLoadGuard>
  </div>
</template>

<style lang="scss" scoped>
  .payment-item {
    padding: 15px;
    border: 1px solid var(--u-border-light);
    border-radius: 8px;
    height: 100%;

    .payment-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--u-border-light);

      .payment-title {
        font-size: 15px;
        font-weight: 500;
        color: var(--u-text-primary);
      }
    }

    .payment-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      border-radius: 6px;

      /* 品牌色来自 brand-colors.ts；底色为品牌色 10% 透明 */
      &.wechat {
        background: color-mix(in srgb, v-bind('COMMERCE_BRAND_COLORS.wechatPay') 10%, transparent);
        color: v-bind('COMMERCE_BRAND_COLORS.wechatPay');
      }

      &.alipay {
        background: color-mix(in srgb, v-bind('COMMERCE_BRAND_COLORS.alipay') 10%, transparent);
        color: v-bind('COMMERCE_BRAND_COLORS.alipay');
      }

      &.paypal {
        background: color-mix(in srgb, v-bind('COMMERCE_BRAND_COLORS.paypal') 10%, transparent);
        color: v-bind('COMMERCE_BRAND_COLORS.paypal');
      }

      &.stripe {
        background: color-mix(in srgb, v-bind('COMMERCE_BRAND_COLORS.stripe') 10%, transparent);
        color: v-bind('COMMERCE_BRAND_COLORS.stripe');
      }
    }
  }

  .channel-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;

    .el-tag {
      margin-left: 8px;
    }
  }

  :deep(.el-form-item) {
    margin-bottom: 18px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(.el-form-item__label) {
    margin-bottom: 4px;
    font-size: 13px;
    color: var(--u-text-regular);
  }
</style>
