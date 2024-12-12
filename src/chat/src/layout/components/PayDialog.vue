<script setup lang="ts">
import { fetchOrderBuyAPI, fetchOrderQueryAPI } from '@/api/order';
import { useBasicLayout } from '@/hooks/useBasicLayout';
import { t } from '@/locales';
import { useAuthStore, useGlobalStore } from '@/store';
import { Close } from '@icon-park/vue-next';
import type { CountdownInst } from 'naive-ui';
import { NButton, NCountdown, NSkeleton, NSpin, useMessage } from 'naive-ui';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import type { ResData } from '@/api/types';
import alipay from '@/assets/alipay.png';
import wxpay from '@/assets/wxpay.png';
import QRCode from '@/components/common/QRCode/index.vue';
defineProps<Props>();

const { isMobile } = useBasicLayout();

const authStore = useAuthStore();
const useGlobal = useGlobalStore();
const POLL_INTERVAL = 1000;
const ms = useMessage();
const active = ref(true);
const payType = ref('wxpay');

interface Props {
  visible: boolean;
}

/* 是否是微信环境 */
/* 是否是微信移动端环境 */
const isWxEnv = computed(() => {
  const ua = window.navigator.userAgent.toLowerCase();

  // 判断是否为微信环境

  const isWxBrowser =
    ua.match(/MicroMessenger/i) &&
    ua?.match(/MicroMessenger/i)?.[0] === 'micromessenger';

  // 判断是否为非PC端（即移动端）
  const isMobile = !ua.includes('windows') && !ua.includes('macintosh');

  // 返回是否是微信的移动端环境
  return isWxBrowser && isMobile;
});

/* 开启的支付平台 */
const payPlatform = computed(() => {
  const {
    payHupiStatus,
    payEpayStatus,
    payMpayStatus,
    payWechatStatus,
    payLtzfStatus,
  } = authStore.globalConfig;
  if (Number(payWechatStatus) === 1) return 'wechat';

  if (Number(payEpayStatus) === 1) return 'epay';

  if (Number(payMpayStatus) === 1) return 'mpay';

  if (Number(payHupiStatus) === 1) return 'hupi';

  if (Number(payLtzfStatus) === 1) return 'ltzf';

  return null;
});

/* 支付平台开启的支付渠道 */
const payChannel = computed(() => {
  const { payEpayChannel, payMpayChannel } = authStore.globalConfig;
  if (payPlatform.value === 'mpay')
    return payMpayChannel ? JSON.parse(payMpayChannel) : [];

  if (payPlatform.value === 'epay')
    return payEpayChannel ? JSON.parse(payEpayChannel) : [];

  if (payPlatform.value === 'wechat') return ['wxpay'];

  if (payPlatform.value === 'hupi') return ['wxpay'];

  if (payPlatform.value === 'ltzf') return ['wxpay'];

  return [];
});

const plat = computed(() => {
  return payType.value === 'wxpay' ? t('pay.wechat') : t('pay.alipay');
});
const countdownRef = ref<CountdownInst | null>();

const isRedirectPay = computed(() => {
  const { payEpayApiPayUrl } = authStore.globalConfig;
  return (
    (payPlatform.value === 'epay' && payEpayApiPayUrl.includes('submit')) ||
    payPlatform.value === 'mpay'
  );
});

watch(payType, () => {
  getQrCode();
  countdownRef.value?.reset();
});

const orderId = ref('');
let timer: any;
const payTypes = computed(() => {
  return [
    {
      label: t('pay.wechatPay'),
      value: 'wxpay',
      icon: wxpay,
      payChannel: 'wxpay',
    },
    {
      label: t('pay.alipayPay'),
      value: 'alipay',
      icon: alipay,
      payChannel: 'alipay',
    },
  ].filter((item) => payChannel.value.includes(item.payChannel));
});

const queryOrderStatus = async () => {
  if (!orderId.value) return;
  const result: ResData = await fetchOrderQueryAPI({ orderId: orderId.value });
  const { success, data } = result;
  if (success) {
    const { status } = data;
    if (status === 1) {
      clearInterval(timer);
      ms.success(t('pay.paymentSuccess'));
      active.value = false;
      authStore.getUserInfo();
      setTimeout(() => {
        useGlobal.updatePayDialog(false);
      }, 2000);
    }
  }
};

const orderInfo = computed(() => useGlobal?.orderInfo);
const url_qrcode = ref('');
const qrCodeloading = ref(true);
const redirectloading = ref(true);
const redirectUrl = ref('');

function handleCloseDialog() {
  useGlobal.updateOrderInfo({});
  stopPolling();
  useGlobal.updatePayDialog(false);
}

/* 请求二维码 */
async function getQrCode() {
  !isRedirectPay.value && (qrCodeloading.value = true);
  isRedirectPay.value && (redirectloading.value = true);
  let qsPayType = null;
  qsPayType = payType.value;
  if (payPlatform.value === 'wechat')
    qsPayType = isWxEnv.value ? 'jsapi' : 'native';

  try {
    const res: ResData = await fetchOrderBuyAPI({
      goodsId: orderInfo.value.pkgInfo.id,
      payType: qsPayType,
    });
    const { data, success, message } = res;
    if (!success) {
      return ms.error(message);
    }

    const { url_qrcode: code, orderId: id, redirectUrl: url } = data;
    redirectUrl.value = url;
    orderId.value = id;
    url_qrcode.value = code;
    qrCodeloading.value = false;
    redirectloading.value = false;
  } catch (error) {
    useGlobal.updatePayDialog(false);
    qrCodeloading.value = false;
    redirectloading.value = false;
  }
}

/* 跳转支付 */
function handleRedPay() {
  window.open(redirectUrl.value);
}

async function handleOpenDialog() {
  await getQrCode();
  if (!timer) {
    // 检查定时器是否已存在
    timer = setInterval(() => {
      queryOrderStatus();
    }, POLL_INTERVAL);
  }
}

// 清除定时器的函数
function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null; // 清除定时器后将变量设置为 null
  }
}

function handleFinish() {
  ms.error(t('pay.paymentTimeout'));
  stopPolling();
  useGlobal.updatePayDialog(false);
  useGlobal.updateGoodsDialog(true);
}

onMounted(async () => {
  handleOpenDialog();
  // await getQrCode();
  // timer.value = setInterval(() => {
  //   queryOrderStatus();
  // }, POLL_INTERVAL);
});

onUnmounted(() => {
  stopPolling();
  handleCloseDialog();
});
</script>

<template>
  <transition
    name="modal-fade"
    @after-enter="handleOpenDialog"
    @after-leave="stopPolling"
  >
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    >
      <div
        class="p-4 rounded bg-white dark:bg-gray-900"
        :class="
          isMobile ? ' w-full h-full' : ' rounded-lg shadow-lg   p-4 mx-2 '
        "
      >
        <div class="flex justify-between">
          <div
            class="flex text-xl font-bold mb-[20px] bg-currentflex items-center"
          >
            <span class="ml-[8px]">{{ t('pay.productPayment') }}</span>
          </div>
          <Close
            size="18"
            class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            @click="handleCloseDialog"
          />
        </div>
        <div class="p-4">
          <div>
            <span class="whitespace-nowrap font-bold">{{
              t('pay.amountDue')
            }}</span>

            <span class="ml-1 text-xl font-bold tracking-tight">{{
              `￥${orderInfo.pkgInfo?.price}`
            }}</span>
          </div>
          <div class="mt-2 flex">
            <span class="whitespace-nowrap font-bold">{{
              t('pay.packageName')
            }}</span
            ><span class="ml-2"> {{ orderInfo.pkgInfo?.name }}</span>
          </div>

          <div
            class="flex justify-center"
            :class="[
              isMobile ? 'flex-col' : 'flex-row',
              isRedirectPay ? 'flex-row-reverse' : '',
            ]"
          >
            <div>
              <div class="flex items-center justify-center my-3 relative">
                <NSpin
                  v-if="qrCodeloading && !isRedirectPay"
                  size="large"
                  class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
                />
                <NSkeleton
                  v-if="qrCodeloading"
                  :width="240"
                  :height="240"
                  :sharp="false"
                  size="medium"
                />

                <!-- epay -->
                <QRCode
                  v-if="
                    payPlatform === 'epay' &&
                    !qrCodeloading &&
                    !redirectloading &&
                    !isRedirectPay
                  "
                  :value="url_qrcode"
                  :size="240"
                />
                <img
                  v-if="payType === 'wxpay' && !qrCodeloading && !isRedirectPay"
                  :src="wxpay"
                  class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 bg-[#fff]"
                />
                <img
                  v-if="
                    payType === 'alipay' && !qrCodeloading && !isRedirectPay
                  "
                  :src="alipay"
                  class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 bg-[#fff]"
                />

                <!-- wechat -->
                <QRCode
                  v-if="payPlatform === 'wechat' && !qrCodeloading"
                  :value="url_qrcode"
                  :size="240"
                />

                <div
                  v-if="isRedirectPay"
                  class="flex flex-col"
                  :class="[isRedirectPay && isMobile ? 'ml-0' : 'ml-20']"
                >
                  <span class="mb-10 mt-5 text-base">{{
                    t('pay.siteAdminEnabledRedirect')
                  }}</span>

                  <!-- mapy 跳转支付 -->
                  <NButton
                    v-if="isRedirectPay"
                    type="primary"
                    ghost
                    :disabled="redirectloading"
                    :loading="redirectloading"
                    @click="handleRedPay"
                  >
                    {{ t('pay.clickToPay') }}
                  </NButton>
                </div>

                <!-- hupi -->
                <iframe
                  v-if="payPlatform === 'hupi' && !redirectloading"
                  class="w-[280px] h-[280px] scale-90"
                  :src="url_qrcode"
                  frameborder="0"
                />

                <!-- ltzf -->
                <img
                  v-if="payPlatform === 'ltzf' && !redirectloading"
                  :src="url_qrcode"
                  class="w-[280px] h-[280px] scale-90"
                  alt="QRCode"
                />
              </div>
              <span
                v-if="!isRedirectPay"
                class="flex items-center justify-center text-lg"
              >
                {{ t('pay.open') }} {{ plat }} {{ t('pay.scanToPay') }}
              </span>
            </div>
            <div
              class="flex flex-col"
              :class="[isMobile ? 'w-full ' : ' ml-10 w-[200] ']"
            >
              <!-- <h4 class="mb-10 font-bold text-lg">
              支付方式
            </h4> -->
              <div
                class="flex items-center justify-center mt-6 w-full font-bold text-sm"
                :class="[isMobile ? 'mb-2' : 'mb-10']"
                style="white-space: nowrap"
              >
                <span>{{ t('pay.completePaymentWithin') }}</span>
                <span class="inline-block w-20 text-primary-500 text-center">
                  <NCountdown
                    ref="countdownRef"
                    :active="active"
                    :duration="300 * 1000"
                    :on-finish="handleFinish"
                  />
                </span>
                <span>{{ t('pay.timeToCompletePayment') }}</span>
              </div>
              <!-- 支付方式选择区域 -->
              <div class="mt-6 space-y-6">
                <div
                  v-for="pay in payTypes"
                  :key="pay.value"
                  class="flex items-center"
                >
                  <input
                    type="radio"
                    :id="pay.value"
                    name="payment-method"
                    :value="pay.value"
                    v-model="payType"
                    class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <label
                    :for="pay.value"
                    class="ml-3 block text-sm font-medium leading-6 text-gray-900"
                  >
                    <img
                      class="h-4 object-contain mr-2 inline-block"
                      :src="pay.icon"
                      alt=""
                    />
                    {{ pay.label }}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.5s;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}
.fade-enter, .fade-leave-to /* .fade-leave-active in <2.1.8 */ {
  opacity: 0;
}
</style>
