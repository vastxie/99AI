<script setup lang="ts">
  import { ref, watch, computed, onBeforeUnmount } from 'vue';
  import { ElMessage } from 'element-plus';
  import QRCode from 'qrcode';
  import { packagePriceText, paymentAmountText } from '../paymentAmount';
  import apiPackage from '../api/package';
  import apiPayment from '../api/payment';

  interface PaymentMethod {
    method: string;
    name: string;
    channel: string;
    priority: number;
  }

  interface Package {
    id: number;
    name: string;
    price: number;
    /** 美元价（DECIMAL，接口可能按字符串返回）；美元渠道下单时用它，没有时按人民币价估算 */
    priceUsd?: number | string | null;
    status: number;
  }

  interface PaymentDisplay {
    type: 'qr_content' | 'redirect_url' | 'html_form' | 'wechat_jsapi';
    payload: Record<string, any>;
  }

  interface TestOrderResult {
    orderId: string;
    packageId: number;
    packageName: string;
    price: number;
    method: string;
    channel: string;
    paymentData: any;
    display?: PaymentDisplay;
  }

  interface PollResult {
    orderId: string;
    status: number;
    paid: boolean;
    granted: boolean;
    step: string;
    message: string;
  }

  type FlowStep = 'select' | 'created' | 'waiting_payment' | 'paid' | 'granted' | 'failed';

  const props = defineProps<{ modelValue: boolean }>();
  const emit = defineEmits<{ (e: 'update:modelValue', val: boolean): void }>();

  const visible = ref(false);
  const loading = ref(false);

  // 选择阶段
  const methods = ref<PaymentMethod[]>([]);
  const packages = ref<Package[]>([]);
  const selectedMethod = ref('');
  /** 所选支付方式走的渠道：美元渠道（PayPal、Stripe 官方）按美元显示金额 */
  const selectedChannel = computed(
    () => methods.value.find((item) => item.method === selectedMethod.value)?.channel,
  );
  const selectedPackageId = ref<number | undefined>(undefined);

  // 测试状态
  const currentStep = ref<FlowStep>('select');
  const orderResult = ref<TestOrderResult | null>(null);
  const pollResult = ref<PollResult | null>(null);
  const pollTimer = ref<ReturnType<typeof setInterval> | null>(null);
  const startTime = ref<number>(0);
  // 15 分钟
  const TIMEOUT_MS = 15 * 60 * 1000;
  const qrCodeDataUrl = ref('');

  const selectedPkg = computed(() => {
    return packages.value.find((p) => p.id === selectedPackageId.value);
  });

  const steps = [
    { title: '创建订单' },
    { title: '生成支付请求' },
    { title: '等待支付' },
    { title: '支付成功' },
    { title: '权益到账' },
  ];

  const activeStepIndex = computed(() => {
    switch (currentStep.value) {
      case 'select':
        return 0;
      case 'created':
        return 1;
      case 'waiting_payment':
        return 2;
      case 'paid':
        return 3;
      case 'granted':
        return 4;
      case 'failed':
        return 2;
      default:
        return 0;
    }
  });

  watch(
    () => props.modelValue,
    (val) => {
      visible.value = val;
      if (val) {
        resetState();
        fetchInitData();
      }
    },
  );

  watch(visible, (val) => {
    emit('update:modelValue', val);
    if (!val) stopPolling();
  });

  onBeforeUnmount(() => {
    stopPolling();
  });

  function resetState() {
    currentStep.value = 'select';
    orderResult.value = null;
    pollResult.value = null;
    selectedMethod.value = '';
    selectedPackageId.value = undefined;
    qrCodeDataUrl.value = '';
    stopPolling();
  }

  async function fetchInitData() {
    loading.value = true;
    try {
      const [methodsRes, packagesRes] = await Promise.all([
        apiPayment.getPaymentMethods(),
        apiPackage.queryAllPackage({}),
      ]);
      // axios 拦截器已解包 response.data，业务数据直接在 res 上
      const methodsData: any = methodsRes;
      const packagesData: any = packagesRes;
      methods.value = methodsData.data || methodsData || [];
      const allPkgs: Package[] = packagesData.data?.rows || packagesData.rows || [];
      packages.value = allPkgs.filter((p: Package) => p.status === 1 && Number(p.price) > 0);

      if (methods.value.length > 0 && !selectedMethod.value) {
        selectedMethod.value = methods.value[0].method;
      }
      if (packages.value.length > 0 && !selectedPackageId.value) {
        // 默认选最低价
        const sorted = packages.value.toSorted((a, b) => Number(a.price) - Number(b.price));
        selectedPackageId.value = sorted[0].id;
      }
    } catch {
      methods.value = [];
      packages.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function createOrder() {
    if (!selectedMethod.value || !selectedPackageId.value) {
      ElMessage.warning('请选择支付方式和套餐');
      return;
    }
    loading.value = true;
    try {
      const res = await apiPayment.createFullPaymentTest({
        method: selectedMethod.value,
        packageId: selectedPackageId.value,
      });
      orderResult.value = res.data || res;
      currentStep.value = 'created';
      startTime.value = Date.now();
      if (getPaymentType() === 'qrcode') {
        await generateQrCode();
      }
      startPolling();
    } catch (error: any) {
      currentStep.value = 'failed';
      pollResult.value = {
        orderId: '',
        status: -1,
        paid: false,
        granted: false,
        step: 'failed',
        message: error?.response?.data?.message || error?.message || '创建订单失败',
      };
    } finally {
      loading.value = false;
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer.value = setInterval(pollStatus, 3000);
    // 立即执行一次
    pollStatus();
  }

  function stopPolling() {
    if (pollTimer.value) {
      clearInterval(pollTimer.value);
      pollTimer.value = null;
    }
  }

  async function pollStatus() {
    if (!orderResult.value) return;
    // 超时检查
    if (Date.now() - startTime.value > TIMEOUT_MS) {
      currentStep.value = 'failed';
      pollResult.value = {
        orderId: orderResult.value.orderId,
        status: 0,
        paid: false,
        granted: false,
        step: 'failed',
        message: '测试超时（15 分钟），订单保留，可手动检查状态',
      };
      stopPolling();
      return;
    }
    try {
      const res = await apiPayment.queryFullPaymentTest(orderResult.value.orderId);
      const result: PollResult = res.data || res;
      pollResult.value = result;

      if (result.step === 'granted') {
        currentStep.value = 'granted';
        stopPolling();
      } else if (result.step === 'failed') {
        currentStep.value = 'failed';
        stopPolling();
      } else if (result.step === 'waiting_payment') {
        currentStep.value = 'waiting_payment';
      }
    } catch (error: any) {
      // 轮询错误不中断，继续尝试
    }
  }

  function getMethodName(method: string): string {
    return methods.value.find((m) => m.method === method)?.name || method;
  }

  function getPaymentUrl(): string {
    const display = orderResult.value?.display || orderResult.value?.paymentData?.display;
    if (!display) return '';
    if (display.type === 'redirect_url') return display.payload.url || '';
    if (display.type === 'qr_content') return display.payload.content || '';
    return '';
  }

  // 支付跳转/外链必须是 http(s)，防 javascript:/data: 等注入
  function safeHttpUrl(url: string): string {
    return /^https?:\/\//i.test(url) ? url : '';
  }

  async function generateQrCode() {
    const content = getPaymentUrl();
    if (!content) {
      qrCodeDataUrl.value = '';
      return;
    }
    try {
      qrCodeDataUrl.value = await QRCode.toDataURL(content, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }, // design-guard-allow: 二维码必须纯黑白，不随主题翻转
      });
    } catch {
      qrCodeDataUrl.value = '';
    }
  }

  function extractAlipayUrl(formHtml: string): string {
    try {
      const actionMatch = formHtml.match(/action=["']([^"']+)["']/iu);
      if (!actionMatch) return '';
      const action = actionMatch[1];
      // form action 必须是 http(s)，防 javascript:/data: 注入
      if (!/^https?:\/\//i.test(action)) return '';
      const inputRegex = /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']+)["']/giu;
      const params = new URLSearchParams();
      let match;
      while ((match = inputRegex.exec(formHtml)) !== null) {
        params.set(match[1], match[2]);
      }
      const separator = action.includes('?') ? '&' : '?';
      return `${action}${separator}${params.toString()}`;
    } catch {
      return '';
    }
  }

  function openPaymentPage() {
    const url = safeHttpUrl(getPaymentUrl());
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function getPaymentType(): 'qrcode' | 'redirect' | 'alipay_form' | '' {
    const display = orderResult.value?.display || orderResult.value?.paymentData?.display;
    if (!display?.type) return '';
    if (display.type === 'qr_content') return 'qrcode';
    if (display.type === 'redirect_url') return 'redirect';
    if (display.type === 'html_form') return 'alipay_form';
    return '';
  }
</script>

<template>
  <el-dialog v-model="visible" title="完整支付测试" width="700px" :close-on-click-modal="false">
    <!-- 选择阶段 -->
    <template v-if="currentStep === 'select'">
      <el-alert
        title="本测试会创建真实支付订单，需要实际付款。支付成功后将触发真实回调和权益发放。"
        type="warning"
        :closable="false"
        show-icon
        class="mb-4"
      />

      <div v-loading="loading" class="space-y-4">
        <!-- 支付方式 -->
        <div>
          <div class="mb-2 text-sm font-medium text-gray-700">选择支付方式</div>
          <el-select
            v-model="selectedMethod"
            placeholder="请选择支付方式"
            class="w-full"
            :disabled="loading"
          >
            <el-option v-for="m in methods" :key="m.method" :label="m.name" :value="m.method" />
          </el-select>
          <div v-if="methods.length === 0" class="mt-2 text-xs text-gray-400">
            暂无已启用的支付方式
          </div>
        </div>

        <!-- 套餐选择 -->
        <div>
          <div class="mb-2 text-sm font-medium text-gray-700">选择测试套餐</div>
          <el-select
            v-model="selectedPackageId"
            placeholder="请选择套餐"
            class="w-full"
            :disabled="loading"
          >
            <el-option
              v-for="p in packages"
              :key="p.id"
              :label="`${p.name} - ${packagePriceText(p, selectedChannel)}`"
              :value="p.id"
            />
          </el-select>
          <div v-if="packages.length === 0" class="mt-2 text-xs text-gray-400">
            暂无可用付费套餐
          </div>
        </div>

        <!-- 确认信息 -->
        <div v-if="selectedPkg" class="rounded bg-gray-50 p-3 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">支付方式</span>
            <span>{{ getMethodName(selectedMethod) }}</span>
          </div>
          <div class="mt-1 flex justify-between">
            <span class="text-gray-500">套餐名称</span>
            <span>{{ selectedPkg.name }}</span>
          </div>
          <div class="mt-1 flex justify-between font-medium">
            <span class="text-gray-500">支付金额</span>
            <span class="text-[var(--el-color-warning)]">{{
              packagePriceText(selectedPkg, selectedChannel)
            }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 测试进行中 -->
    <template v-else>
      <!-- 步骤进度 -->
      <el-steps :active="activeStepIndex" finish-status="success" class="mb-6" :align-center="true">
        <el-step v-for="s in steps" :key="s.title" :title="s.title" />
      </el-steps>

      <!-- 支付信息 -->
      <template v-if="orderResult && currentStep !== 'granted' && currentStep !== 'failed'">
        <div class="mb-4 rounded bg-gray-50 p-3 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">订单号</span>
            <span class="font-mono">{{ orderResult.orderId }}</span>
          </div>
          <div class="mt-1 flex justify-between">
            <span class="text-gray-500">套餐</span>
            <span>{{ orderResult.packageName }}</span>
          </div>
          <div class="mt-1 flex justify-between">
            <span class="text-gray-500">金额</span>
            <span class="font-medium text-[var(--el-color-warning)]">{{
              paymentAmountText(orderResult.paymentData, orderResult.price)
            }}</span>
          </div>
          <div class="mt-1 flex justify-between">
            <span class="text-gray-500">渠道</span>
            <span>{{ orderResult.channel }}</span>
          </div>
        </div>

        <!-- 二维码 -->
        <template v-if="getPaymentType() === 'qrcode' && qrCodeDataUrl">
          <div class="mb-4 flex flex-col items-center">
            <div class="mb-2 text-sm text-gray-500">请扫描二维码完成支付</div>
            <img :src="qrCodeDataUrl" alt="支付二维码" class="h-48 w-48" />
          </div>
        </template>

        <!-- PayPal / Stripe 跳转 -->
        <template v-if="getPaymentType() === 'redirect'">
          <div class="mb-4 text-center">
            <div class="mb-2 text-sm text-gray-500">支付链接已生成，请在新窗口完成支付</div>
            <el-button type="primary" @click="openPaymentPage"> 前往支付 </el-button>
          </div>
        </template>

        <!-- 支付宝表单 -->
        <template v-if="getPaymentType() === 'alipay_form'">
          <div class="mb-4">
            <div class="mb-2 text-center text-sm text-gray-500">请在下方完成支付宝支付</div>
            <iframe
              :srcdoc="
                (orderResult?.display || orderResult?.paymentData?.display)?.payload?.html || ''
              "
              sandbox="allow-scripts allow-forms"
              class="mx-auto block h-64 w-full max-w-md border"
            ></iframe>
            <div
              v-if="
                extractAlipayUrl(
                  (orderResult?.display || orderResult?.paymentData?.display)?.payload?.html || '',
                )
              "
              class="mt-2 text-center"
            >
              <el-link
                :href="
                  extractAlipayUrl(
                    (orderResult?.display || orderResult?.paymentData?.display)?.payload?.html ||
                      '',
                  )
                "
                target="_blank"
                type="primary"
              >
                如无法显示，点击在新窗口打开支付宝
              </el-link>
            </div>
          </div>
        </template>

        <!-- 跳转链接 -->
        <template v-if="getPaymentType() === 'redirect' && getPaymentUrl()">
          <div class="mb-4 text-center">
            <el-link
              :href="safeHttpUrl(getPaymentUrl())"
              target="_blank"
              rel="noopener noreferrer"
              type="primary"
            >
              点击跳转到支付页面
            </el-link>
          </div>
        </template>

        <div class="text-center text-xs text-gray-400">正在等待支付结果...</div>
      </template>

      <!-- 成功 -->
      <template v-if="currentStep === 'granted'">
        <el-result icon="success" title="完整支付测试通过" :sub-title="pollResult?.message">
          <template #extra>
            <el-descriptions :column="1" border size="small" class="w-full">
              <el-descriptions-item label="订单号">
                {{ pollResult?.orderId }}
              </el-descriptions-item>
              <el-descriptions-item label="状态"> 支付成功，权益已到账 </el-descriptions-item>
            </el-descriptions>
          </template>
        </el-result>
      </template>

      <!-- 失败 -->
      <template v-if="currentStep === 'failed'">
        <el-result icon="error" title="测试未通过" :sub-title="pollResult?.message">
          <template #extra>
            <el-descriptions
              v-if="pollResult?.orderId"
              :column="1"
              border
              size="small"
              class="w-full"
            >
              <el-descriptions-item label="订单号">
                {{ pollResult.orderId }}
              </el-descriptions-item>
            </el-descriptions>
          </template>
        </el-result>
      </template>
    </template>

    <template v-if="currentStep === 'select'" #footer>
      <span class="flex justify-end gap-2">
        <el-button @click="visible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="loading"
          :disabled="
            !selectedMethod || !selectedPackageId || methods.length === 0 || packages.length === 0
          "
          @click="createOrder"
        >
          创建测试订单
        </el-button>
      </span>
    </template>
    <template v-else #footer>
      <span class="flex justify-end gap-2">
        <el-button @click="visible = false">
          {{ currentStep === 'created' ? '取消测试' : '关闭' }}
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>
