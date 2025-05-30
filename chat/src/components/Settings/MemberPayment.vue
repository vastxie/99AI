<script setup lang="ts">
import { fetchOrderBuyAPI, fetchOrderQueryAPI } from '@/api/order'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useGlobalStore } from '@/store'
import { message } from '@/utils/message'
import { ArrowLeft } from '@icon-park/vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ResData } from '@/api/types'
import alipay from '@/assets/alipay.png'
import wxpay from '@/assets/wxpay.png'
import QRCode from '@/components/common/QRCode/index.vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits(['back-to-main', 'payment-success'])

const { isMobile } = useBasicLayout()
const authStore = useAuthStore()
const useGlobal = useGlobalStore()
const POLL_INTERVAL = 1000
const ms = message()
const active = ref(true)
const payType = ref('wxpay')

/* 是否是微信环境 */
/* 是否是微信移动端环境 */
const isWxEnv = computed(() => {
  const ua = window.navigator.userAgent.toLowerCase()

  // 判断是否为微信环境
  const isWxBrowser =
    ua.match(/MicroMessenger/i) && ua?.match(/MicroMessenger/i)?.[0] === 'micromessenger'

  // 判断是否为非PC端（即移动端）
  const isMobile = !ua.includes('windows') && !ua.includes('macintosh')

  // 返回是否是微信的移动端环境
  return isWxBrowser && isMobile
})

/* 开启的支付平台 */
const payPlatform = computed(() => {
  const {
    payHupiStatus,
    payEpayStatus,
    payMpayStatus,
    payWechatStatus,
    payLtzfStatus,
    payDuluPayStatus,
  } = authStore.globalConfig
  if (Number(payWechatStatus) === 1) return 'wechat'

  if (Number(payEpayStatus) === 1) return 'epay'

  if (Number(payMpayStatus) === 1) return 'mpay'

  if (Number(payHupiStatus) === 1) return 'hupi'

  if (Number(payLtzfStatus) === 1) return 'ltzf'

  if (Number(payDuluPayStatus) === 1) return 'dulu'

  return null
})

/* 支付平台开启的支付渠道 */
const payChannel = computed(() => {
  const { payEpayChannel, payMpayChannel, payDuluPayChannel } = authStore.globalConfig
  if (payPlatform.value === 'mpay') return payMpayChannel ? JSON.parse(payMpayChannel) : []

  if (payPlatform.value === 'epay') return payEpayChannel ? JSON.parse(payEpayChannel) : []

  if (payPlatform.value === 'wechat') return ['wxpay']

  if (payPlatform.value === 'hupi') return ['wxpay']

  if (payPlatform.value === 'ltzf') return ['wxpay']

  if (payPlatform.value === 'dulu') return payDuluPayChannel ? JSON.parse(payDuluPayChannel) : []

  return []
})

const plat = computed(() => {
  return payType.value === 'wxpay' ? t('pay.wechat') : t('pay.alipay')
})
const countdownRef = ref<ReturnType<typeof setInterval> | null>(null)
const remainingTime = ref(60)
const isCountingDown = ref(false)

const isRedirectPay = computed(() => {
  const { payEpayApiPayUrl, payDuluPayRedirect } = authStore.globalConfig
  return (
    (payPlatform.value === 'epay' && payEpayApiPayUrl.includes('submit')) ||
    payPlatform.value === 'mpay' ||
    (payPlatform.value === 'dulu' && payDuluPayRedirect === '1')
  )
})

// 倒计时函数
function startCountdown() {
  remainingTime.value = 300 // 5分钟倒计时
  if (!countdownRef.value) {
    countdownRef.value = setInterval(() => {
      remainingTime.value--
      if (remainingTime.value <= 0) {
        handleFinish()
      }
    }, 1000)
  }
}

// 倒计时结束处理
function handleFinish() {
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }
  active.value = false
  ms.warning(t('pay.paymentTimeExpired'))
  backToMainView()
}

watch(payType, () => {
  getQrCode()
  // 重新开始倒计时
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }
  startCountdown()
})

const orderId = ref('')
let timer: any
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
  ].filter(item => payChannel.value.includes(item.payChannel))
})

const queryOrderStatus = async () => {
  if (!orderId.value) return
  const result: ResData = await fetchOrderQueryAPI({ orderId: orderId.value })
  const { success, data } = result
  if (success) {
    const { status } = data
    if (status === 1) {
      stopPolling()
      ms.success(t('pay.paymentSuccess'))
      active.value = false
      authStore.getUserInfo()

      // 支付成功后通知父组件
      emit('payment-success')
    }
  }
}

const orderInfo = computed(() => useGlobal?.orderInfo)
const url_qrcode = ref('')
const qrCodeloading = ref(true)
const redirectloading = ref(true)
const redirectUrl = ref('')

// 返回主视图
function backToMainView() {
  cleanupResources()
  emit('back-to-main')
}

/* 请求二维码 */
async function getQrCode() {
  !isRedirectPay.value && (qrCodeloading.value = true)
  isRedirectPay.value && (redirectloading.value = true)
  let qsPayType = null
  qsPayType = payType.value
  if (payPlatform.value === 'wechat') qsPayType = isWxEnv.value ? 'jsapi' : 'native'

  try {
    const res: ResData = await fetchOrderBuyAPI({
      goodsId: orderInfo.value.pkgInfo.id,
      payType: qsPayType,
    })
    const { data, success } = res
    if (!success) {
      return
    }

    const { url_qrcode: code, orderId: id, redirectUrl: url } = data
    redirectUrl.value = url
    orderId.value = id
    url_qrcode.value = code
    qrCodeloading.value = false
    redirectloading.value = false
  } catch (error) {
    backToMainView()
    qrCodeloading.value = false
    redirectloading.value = false
  }
}

/* 跳转支付 */
function handleRedPay() {
  window.open(redirectUrl.value)
}

// 清理所有资源
function cleanupResources() {
  // 停止轮询
  stopPolling()

  // 清理倒计时
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }

  // 清理其他资源
  url_qrcode.value = ''
  orderId.value = ''
  active.value = false
}

async function handleOpenPayment() {
  await getQrCode()
  if (!timer) {
    // 检查定时器是否已存在
    timer = setInterval(() => {
      queryOrderStatus()
    }, POLL_INTERVAL)
  }

  // 启动倒计时
  startCountdown()
}

// 清除定时器的函数
function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null // 清除定时器后将变量设置为 null
  }
}

// 监听visible变化，处理资源
watch(
  () => props.visible,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      // 变为可见时
      active.value = true
      handleOpenPayment()
    } else if (!newVal && oldVal) {
      // 变为不可见时
      cleanupResources()
    }
  }
)

onMounted(() => {
  if (props.visible) {
    handleOpenPayment()
  }
})

onBeforeUnmount(() => {
  cleanupResources()
})
</script>

<template>
  <div class="overflow-y-auto custom-scrollbar p-2" :class="{ 'max-h-[70vh]': !isMobile }">
    <div
      class="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
    >
      <!-- 卡片标题 -->
      <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        <button @click="backToMainView" class="btn-icon btn-md mr-2">
          <ArrowLeft size="18" />
        </button>
        <div class="text-base font-semibold text-gray-900 dark:text-gray-100">
          {{ t('pay.productPayment') }}
        </div>
      </div>

      <div class="p-2">
        <div>
          <span class="whitespace-nowrap font-bold">{{ t('pay.amountDue') }}</span>
          <span class="ml-1 text-xl font-bold tracking-tight">{{
            `￥${orderInfo.pkgInfo?.price}`
          }}</span>
        </div>
        <div class="mt-2 flex">
          <span class="whitespace-nowrap font-bold">{{ t('pay.packageName') }}</span
          ><span class="ml-2"> {{ orderInfo.pkgInfo?.name }}</span>
        </div>

        <div
          class="flex justify-center"
          :class="[isMobile ? 'flex-col' : 'flex-row', isRedirectPay ? 'flex-row-reverse' : '']"
        >
          <div>
            <div class="flex items-center justify-center my-3 relative">
              <!-- 微信登录风格的加载动画 -->
              <div
                v-if="qrCodeloading && !isRedirectPay"
                class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
              >
                <div
                  class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400"
                ></div>
              </div>
              <div
                v-if="qrCodeloading"
                class="w-[240px] h-[240px] rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
              ></div>

              <!-- epay -->
              <QRCode
                v-if="
                  payPlatform === 'epay' && !qrCodeloading && !redirectloading && !isRedirectPay
                "
                :value="url_qrcode"
                :size="240"
              />
              <QRCode
                v-if="
                  payPlatform === 'dulu' && !qrCodeloading && !redirectloading && !isRedirectPay
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
                v-if="payType === 'alipay' && !qrCodeloading && !isRedirectPay"
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
                <span class="mb-10 mt-5 text-base">{{ t('pay.siteAdminEnabledRedirect') }}</span>

                <!-- mapy 跳转支付 -->
                <button
                  v-if="isRedirectPay"
                  type="button"
                  class="btn btn-primary btn-md"
                  :disabled="redirectloading"
                  @click="handleRedPay"
                >
                  {{ t('pay.clickToPay') }}
                </button>
              </div>

              <!-- dulu -->
              <!-- <iframe
                v-if="payPlatform === 'dulu' && !redirectloading"
                class="w-[280px] h-[280px] scale-90"
                :src="url_qrcode"
                frameborder="0"
              /> -->

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
            <span v-if="!isRedirectPay" class="flex items-center justify-center text-lg">
              {{ t('pay.open') }} {{ plat }} {{ t('pay.scanToPay') }}
            </span>
          </div>
          <div class="flex flex-col" :class="[isMobile ? 'w-full ' : ' ml-10 w-[200] ']">
            <div
              class="flex items-center justify-center mt-6 w-full font-bold text-sm"
              :class="[isMobile ? 'mb-2' : 'mb-10']"
              style="white-space: nowrap"
            >
              <span>{{ t('pay.completePaymentWithin') }}</span>
              <span class="inline-block w-16 text-primary-500 text-center">
                {{ remainingTime }}秒
              </span>
              <span>{{ t('pay.timeToCompletePayment') }}</span>
            </div>
            <!-- 支付方式选择区域 -->
            <div class="mt-6 space-y-6">
              <div v-for="pay in payTypes" :key="pay.value" class="flex items-center">
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
                  class="ml-3 block text-sm font-medium leading-6 text-gray-900 dark:text-gray-300"
                >
                  <img class="h-4 object-contain mr-2 inline-block" :src="pay.icon" alt="" />
                  {{ pay.label }}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(155, 155, 155, 0.5);
  border-radius: 20px;
  border: transparent;
}

/* 暗黑模式下滚动条样式 */
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(100, 100, 100, 0.5);
}

.dark .custom-scrollbar {
  scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
}
</style>
