<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'

import { fetchAvailablePaymentMethods, fetchOrderBuyAPI, fetchOrderQueryAPI } from './api/order'
import type { PaymentDisplay } from './api/order'
import { COMMERCE_BRAND_COLORS } from './brand-colors'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { forgetPendingOrder, pendingOrderFor, rememberPendingOrder } from './pendingOrder'
import { usdPriceText } from './packagePlans'
import { useCommerceStore } from './store'
import { useAuthStore } from '@/store/modules/auth'
import { copyText } from '@/utils/clipboard'
import { isHttpUrl } from '@/utils/is'
import { message, notifyError } from '@/utils/message'
import { Icon, loadIcons } from '@iconify/vue'
import { ArrowLeft } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ResData } from '@/api/types'
import QRCode from './components/QRCode.vue'

interface Props {
  visible: boolean
}

interface PaymentMethod {
  method: string
  name: string
  channel: string
  priority: number
  icon: string
}

const props = defineProps<Props>()
const emit = defineEmits(['back-to-main', 'payment-success'])

const { isMobile } = useViewport()
const useGlobal = useCommerceStore()
const auth = useAuthStore()
const paymentToken = auth.token
const paymentUserId = auth.userInfo?.id
const sameIdentity = () => auth.token === paymentToken && auth.userInfo?.id === paymentUserId
/** 待确认订单按账号与套餐记（见 pendingOrder.ts） */
const pendingOrderOwner = () => ({
  userId: String(paymentUserId ?? ''),
  goodsId: String(useGlobal.orderInfo?.pkgInfo?.id ?? ''),
})
const POLL_INTERVAL = 1000
/* 前端确认窗口长度：仅决定「自动轮询多久」，不代表订单失效（后端未支付订单保留时间远长于此） */
const COUNTDOWN_SECONDS = 300
/* 确认中状态下延后暴露「重新下单」入口的秒数，避开支付渠道异步通知的到账窗口 */
const CONFIRM_GRACE_SECONDS = 15
/* 连续查询失败多少次后停止自动轮询，改为交给用户手动刷新（避免请求层错误提示刷屏） */
const MAX_POLL_FAILURES = 3
const ms = message()
const active = ref(true)
let disposed = false
let waitingForCreation = false
const isLive = () => !disposed && props.visible && sameIdentity()

/**
 * 支付流程阶段（只描述前端 UI 状态，不参与任何支付成功判定）：
 * - idle：没有正在展示的支付内容
 * - paying：已拿到支付内容（二维码 / 跳转链接 / 表单），自动轮询中
 * - confirming：已发起支付但没有可展示内容（微信 JSAPI 唤起后、恢复未支付订单），自动轮询中
 * - unresolved：自动轮询已停止且仍未确认到账，需要用户手动刷新或重新下单
 */
type PayPhase = 'idle' | 'paying' | 'confirming' | 'unresolved'
const payPhase = ref<PayPhase>('idle')
const selectedPaymentMethod = ref('')
const availablePaymentMethods = ref<PaymentMethod[]>([])

/* 获取设备类型，用于支付接口 */
const getDeviceType = computed(() => {
  const ua = window.navigator.userAgent.toLowerCase()

  // 检测微信环境
  if (ua.includes('micromessenger')) {
    return 'wechat'
  }

  // 检测QQ环境
  if (ua.includes('qq/')) {
    return 'qq'
  }

  // 检测支付宝环境
  if (ua.includes('alipay') || ua.includes('aliapp')) {
    return 'alipay'
  }

  // 检测移动端
  if (isMobile.value) {
    return 'mobile'
  }

  // 默认PC端
  return 'pc'
})

const plat = computed(() => {
  const method = availablePaymentMethods.value.find(m => m.method === selectedPaymentMethod.value)
  return method?.name || ''
})

const countdownRef = ref<ReturnType<typeof setInterval> | null>(null)
const remainingTime = ref(0)

// 跳转方式由创建订单的响应决定。
const isRedirectPay = ref(false)

// 微信 SDK 未就绪时挂在 document 上的待触发监听器（同一时刻最多保留一个）
let wechatBridgeReadyHandler: (() => void) | null = null

/* 移除待触发的微信 JSBridge 监听，避免监听器累积后连环唤起支付面板 */
function removeWechatBridgeReadyListener() {
  if (!wechatBridgeReadyHandler) return
  document.removeEventListener('WeixinJSBridgeReady', wechatBridgeReadyHandler, false)
  wechatBridgeReadyHandler = null
}

// 倒计时函数
function startCountdown() {
  if (!isLive()) return
  remainingTime.value = COUNTDOWN_SECONDS
  if (!countdownRef.value) {
    countdownRef.value = setInterval(() => {
      remainingTime.value--
      if (remainingTime.value <= 0) {
        handleFinish()
      }
    }, 1000)
  }
}

function stopCountdown() {
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }
}

/**
 * 停止轮询链。
 *
 * pollSession 自增后，任何已经排队的回调都会因为 session 不匹配而自行终止，
 * 避免出现「timer 句柄被覆盖 → 旧链失联 → 请求翻倍 / 卸载后仍有遗留回调」的孤儿轮询。
 */
function stopPolling() {
  pollSession++
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

/**
 * 重置前端支付 UI（定时器、展示内容、阶段）。
 *
 * 刻意不清除 orderId 与待确认订单记录：订单标识属于业务凭据，
 * 不应随前端倒计时或 UI 切换作废，否则用户在倒计时之后才付款就再也无法被确认。
 * 恢复标记只会在「确认到账」或「成功创建新订单（覆盖写入）」时被改写。
 */
function resetPaymentUi() {
  stopCountdown()
  stopPolling()
  // 归零剩余时间，让仍在飞行中的轮询请求返回后不再自我调度
  remainingTime.value = 0
  active.value = false
  showQrCode.value = false
  payUrl.value = ''
  isRedirectPay.value = false
  showWeChatGuide.value = false // 重置微信引导标志
  payPhase.value = 'idle'
  removeWechatBridgeReadyListener()
}

/* 进入「确认中」：已发起支付但没有可展示内容（微信 JSAPI 唤起后 / 恢复未支付订单） */
function enterConfirming() {
  if (!isLive()) return
  active.value = true
  showQrCode.value = true
  payPhase.value = 'confirming'
  startCountdown()
  startPolling()
}

/**
 * 进入「未确认」终态：停止自动轮询，但保留 orderId 与待确认订单记录。
 *
 * 这是唯一的出口态：用户既能手动刷新确认已付款项，也能明确地重新下单，
 * 不会出现空白无出口，也不会被自动带回「立即支付」而误以为必须再付一次。
 */
function enterUnresolved() {
  if (!isLive()) return
  stopCountdown()
  stopPolling()
  remainingTime.value = 0
  active.value = false
  if (!orderId.value) {
    // 没有可确认的订单，回到干净的初始态
    payPhase.value = 'idle'
    showQrCode.value = false
    return
  }
  payPhase.value = 'unresolved'
  showQrCode.value = true
}

/**
 * 倒计时结束处理：不再整页 reload（会丢失聊天草稿与面板状态）。
 *
 * 关键：超时只作废「前端确认窗口」，不作废订单本身。倒计时是前端常量，
 * 与渠道二维码 / 后端未支付订单的真实有效期无关，因此必须保留待确认订单记录，
 * 用户重新进入支付页时仍能恢复确认，避免「超时后才付款 → 永远确认不到 → 再付一笔」。
 */
async function handleFinish() {
  stopCountdown()
  stopPolling()
  // 先归零，仍在飞行中的轮询响应返回后不再自我调度
  remainingTime.value = 0
  // 等价于原先「reload 后 onMounted 重新查一次订单」的最后一次状态确认，
  // 避免最后一秒才支付成功的结果被丢弃；成功判定仍完全由 status === 1 决定
  const finishedOrderId = orderId.value
  const result = await queryOrderOnce(finishedOrderId)
  if (result === 'paid' || result === 'stale') return
  // 查询期间用户可能已重新下单：旧倒计时的收尾不得覆盖新订单的支付界面
  if (paySuccess.value || orderId.value !== finishedOrderId) return
  enterUnresolved()
  ms.warning(t('pay.paymentNotDetected'))
}

/**
 * 手动刷新支付状态：只做一次查询，永远不会新建订单，因此在任何状态下点击都是安全的。
 */
async function refreshPaymentStatus() {
  if (!isLive() || refreshing.value || submitting.value || !orderId.value) return
  refreshing.value = true
  try {
    const result = await queryOrderOnce(orderId.value)
    // 'error' 由请求层自行提示，这里不重复弹一次
    if (result === 'unpaid') ms.info(t('pay.paymentNotDetected'))
  } finally {
    refreshing.value = false
  }
}

/**
 * 新建订单的唯一入口（主「立即支付」按钮与兜底卡的「重新下单」共用）。
 *
 * 三重防重复下单：
 * 1) submitting / loading 重入锁，整个异步过程中按钮保持 disabled，双击不会并发下单；
 * 2) 若当前已经跟踪着一笔订单，先做一次终态确认，已支付则直接走成功路径，绝不再建第二笔；
 * 3) 重置 UI 时不清除恢复标记，旧订单即便此刻才到账也仍可被后续查询确认。
 */
async function createNewOrder() {
  if (
    !isLive() ||
    useGlobal.orderCreationPending ||
    submitting.value ||
    loading.value ||
    refreshing.value
  )
    return
  if (!selectedPaymentMethod.value) return
  submitting.value = true
  try {
    if (orderId.value && !paySuccess.value) {
      const result = await queryOrderOnce(orderId.value)
      if (result === 'paid' || result === 'stale') return
    }
    resetPaymentUi()
    await getQrCode()
  } finally {
    submitting.value = false
  }
}

watch(selectedPaymentMethod, () => {
  // 如果已经在支付流程中，先重置 UI（保留订单恢复标记，换支付方式不等于旧订单作废）
  if (showQrCode.value) {
    resetPaymentUi()
  }
})

const orderId = ref('')
let timer: ReturnType<typeof setTimeout> | null = null
/* 轮询代次：每次 stopPolling / startPolling 都会推进，旧链回调据此自行终止 */
let pollSession = 0
/* 连续查询失败次数，成功响应后清零 */
let pollFailures = 0

const payTypes = computed(() => {
  return availablePaymentMethods.value.map(method => ({
    label: method.name,
    value: method.method,
    icon: method.icon,
    channel: method.channel,
  }))
})

const loading = ref(false)
/* 新建订单提交中（含下单前的终态确认查询）：期间所有下单入口保持禁用，杜绝双击重复下单 */
const submitting = ref(false)
/* 手动刷新支付状态中 */
const refreshing = ref(false)
const paymentCurrency = ref('CNY')
const payUrl = ref('')
const showQrCode = ref(false)
const paySuccess = ref(false)
const showWeChatGuide = ref(false) // 添加微信引导标志

const formatedTime = computed(() => {
  const minutes = Math.floor(remainingTime.value / 60)
  const seconds = remainingTime.value % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

/**
 * 支付状态卡：确认中 / 未确认时展示，同时兜住「已进入支付流程却没有任何可展示内容」的情况，
 * 保证任何状态下都不会出现空白无出口的支付区。
 */
const showStatusCard = computed(
  () => payPhase.value === 'confirming' || payPhase.value === 'unresolved' || !payUrl.value
)

/**
 * 确认中状态下延后暴露「重新下单」：微信 JSAPI 等渠道的异步通知常有数秒延迟，
 * 刚回到页面就给出下单入口最容易诱发二次付款；这段时间内仍可手动刷新状态或返回。
 */
const canCreateNewOrder = computed(
  () =>
    payPhase.value !== 'confirming' ||
    COUNTDOWN_SECONDS - remainingTime.value >= CONFIRM_GRACE_SECONDS
)

// 显示的美元价：priceUsd 按字符串返回，转成数值再格式化（见 usdPriceText）
const displayUsdPrice = computed(() => {
  const pkgInfo = useGlobal.orderInfo.pkgInfo
  return pkgInfo ? usdPriceText(pkgInfo) : '0.00'
})

/* 从支付宝表单HTML中提取支付URL */
function extractAlipayUrl(formHtml: string): string {
  try {
    // 创建一个临时的DOM元素来解析HTML
    const div = document.createElement('div')
    div.innerHTML = formHtml
    const form = div.querySelector('form')

    if (!form) return ''

    // 获取表单的action URL
    const action = form.getAttribute('action')
    if (!action) return ''

    // 获取所有表单参数
    const params = new URLSearchParams()
    const inputs = form.querySelectorAll('input[type="hidden"]')
    inputs.forEach((input: any) => {
      const name = input.getAttribute('name')
      const value = input.getAttribute('value')
      if (name && value) {
        params.append(name, value)
      }
    })

    // 组合完整的支付URL
    const separator = action.includes('?') ? '&' : '?'
    const paymentUrl = `${action}${separator}${params.toString()}`

    return paymentUrl
  } catch (error) {
    return ''
  }
}

/* 复制文本到剪贴板 */
async function copyToClipboard(text: string) {
  if (await copyText(text)) ms.success(t('pay.copySuccess'))
  else ms.error(t('pay.copyFailed'))
}

/* 获取可用支付方式 */
async function fetchPaymentMethods() {
  try {
    const res: ResData<PaymentMethod[]> = await fetchAvailablePaymentMethods()
    if (!isLive()) return
    if (res.success && res.data && res.data.length > 0) {
      availablePaymentMethods.value = res.data
      // 默认选择第一个支付方式
      selectedPaymentMethod.value = res.data[0].method
    } else {
      ms.error(t('pay.noPaymentMethods'))
    }
  } catch (error) {
    if (isLive()) notifyError(error, t('pay.fetchPaymentMethodsFailed'))
  }
}

/* 支付流程：唯一的下单实现，只允许经 createNewOrder 调用（其中带重入锁与下单前终态确认） */
async function getQrCode() {
  if (!isLive() || !useGlobal.orderInfo?.pkgInfo?.id || !selectedPaymentMethod.value) {
    return
  }
  // 兜底防抖：loading 置位后模板才会禁用按钮，同一 tick 内的连点在此被拦下
  if (loading.value || useGlobal.orderCreationPending) return
  useGlobal.orderCreationPending = true
  active.value = true
  loading.value = true
  // 下单时的账号与套餐：响应迟到时界面可能已经换了套餐，记录仍归到这一笔下单的套餐
  const orderOwner = pendingOrderOwner()
  try {
    const res: ResData<any> = await fetchOrderBuyAPI({
      goodsId: useGlobal.orderInfo.pkgInfo.id,
      method: selectedPaymentMethod.value,
      device: getDeviceType.value,
    })

    // 关闭界面不代表取消订单。迟到响应只保留恢复凭据，不再导航/唤起渠道/轮询。
    // 新实例在跨实例下单锁释放后恢复确认，不能重入创建第二笔订单。
    if (!sameIdentity()) return
    if (!isLive()) {
      if (res.success && res.data?.orderId) rememberPendingOrder(res.data.orderId, orderOwner)
      return
    }

    if (!res.success) {
      ms.error(res.message || t('pay.orderCreateFailed'))
      return
    }

    const order_id = res.data.orderId
    orderId.value = order_id
    rememberPendingOrder(order_id, orderOwner)
    paymentCurrency.value = res.data.currency || 'CNY'

    const display: PaymentDisplay = res.data.display

    if (!display || !display.type) {
      ms.error(t('pay.getPaymentQrFailed'))
      return
    }

    // 按 display.type 统一渲染
    if (display.type === 'wechat_jsapi') {
      handleWechatJsapiPay(display.payload as any)
      return
    }

    if (display.type === 'redirect_url') {
      const url = display.payload.url
      if (!url) {
        ms.error(t('pay.getPaymentQrFailed'))
        return
      }
      // USD 渠道（PayPal/Stripe）直接跳转，CNY 渠道展示二维码
      if (res.data.currency === 'USD') {
        if (!isHttpUrl(url)) {
          ms.error(t('pay.getPaymentQrFailed'))
          return
        }
        // 在原窗口里付：先断开 opener（站点本身可能是别的页面用 window.open 打开的），
        // 否则付完后的结果页会把它当成支付弹窗，把整个站点标签关掉
        window.opener = null
        window.location.href = url
        return
      }
      isRedirectPay.value = true
      payUrl.value = url
      showQrCode.value = true
      payPhase.value = 'paying'
      // 跳转支付同样要轮询：否则用户在新窗口付完款，当前页永远停在「点击前往支付」
      startCountdown()
      startPolling()
      return
    }

    if (display.type === 'html_form') {
      const html = display.payload.html
      const ua = window.navigator.userAgent.toLowerCase()
      const isWeChatBrowser = ua.includes('micromessenger')

      if (isWeChatBrowser) {
        const paymentUrl = extractAlipayUrl(html)
        if (paymentUrl) {
          isRedirectPay.value = true
          payUrl.value = paymentUrl
          showQrCode.value = true
          showWeChatGuide.value = true
          payPhase.value = 'paying'
          startCountdown()
          startPolling()
        } else {
          ms.error(t('pay.wechatAlipayNotSupported'))
        }
        return
      }

      isRedirectPay.value = false
      payUrl.value = html
      showQrCode.value = true
      active.value = true
      payPhase.value = 'paying'
      startCountdown()
      startPolling()
      return
    }

    if (display.type === 'qr_content') {
      const content = display.payload.content
      isRedirectPay.value = false
      payUrl.value = content
      showQrCode.value = true
      payPhase.value = 'paying'
      startCountdown()
      startPolling()
      return
    }

    ms.error(t('pay.getPaymentQrFailed'))
  } catch (error) {
    if (isLive()) notifyError(error, t('pay.paymentError'))
  } finally {
    loading.value = false
    useGlobal.orderCreationPending = false
  }
}

/* 处理微信JSAPI支付 */
function handleWechatJsapiPay(paymentData: {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}) {
  const callWxPay = () => {
    if (!isLive()) return
    window.WeixinJSBridge.invoke(
      'getBrandWCPayRequest',
      {
        appId: paymentData.appId,
        timeStamp: paymentData.timeStamp,
        nonceStr: paymentData.nonceStr,
        package: paymentData.package,
        signType: paymentData.signType,
        paySign: paymentData.paySign,
      },
      (res: any) => {
        if (!isLive()) return
        if (res.err_msg === 'get_brand_wcpay_request:cancel') {
          // 用户主动取消支付：订单仍在（未支付），停在可手动刷新 / 明确重新下单的出口态，
          // 不把用户直接丢回「立即支付」，避免误以为必须再走一遍
          ms.error(t('pay.paymentCancelled'))
          enterUnresolved()
        } else {
          // 微信返回成功/失败/其他状态
          // 官方文档警告：res.err_msg 返回 ok 不完全可靠
          // 社区反馈：支付成功后经常不触发 ok 回调
          // 因此统一通过轮询后端接口验证真实支付状态
          enterConfirming()
        }
      }
    )
  }

  // 唤起支付面板前就进入「确认中」：期间隐藏主「立即支付」入口，
  // 避免用户在微信支付面板与异步到账通知的窗口里再下一单
  enterConfirming()

  if (typeof window.WeixinJSBridge === 'undefined') {
    // 微信SDK未加载，等待加载：
    // 先移除上一次遗留的监听，保证任何时刻最多只有一个待触发监听器，
    // 触发后立即自我移除，避免多次点击支付累积监听导致连环唤起支付面板
    removeWechatBridgeReadyListener()
    wechatBridgeReadyHandler = () => {
      removeWechatBridgeReadyListener()
      callWxPay()
    }
    document.addEventListener('WeixinJSBridgeReady', wechatBridgeReadyHandler, false)
  } else {
    // 微信SDK已加载，直接调用
    callWxPay()
  }
}

/* 切换到微信支付 */
function switchToWechatPay() {
  // 查找微信支付方式
  const wechatMethod = availablePaymentMethods.value.find(m => m.method === 'wechat')
  if (wechatMethod) {
    selectedPaymentMethod.value = 'wechat'
    showWeChatGuide.value = false
  }
}

/* 确认到账后的统一收口；幂等，payment-success 只会 emit 一次 */
function markPaymentSuccess() {
  if (!isLive() || paySuccess.value) return
  paySuccess.value = true
  active.value = false
  payPhase.value = 'idle'
  stopCountdown()
  stopPolling()
  forgetPendingOrder(orderId.value)
  emit('payment-success')
}

/**
 * 查询一次订单状态。永远不自我排队，供轮询链、倒计时收尾、手动刷新、下单前置确认共用，
 * 因此手动触发不会再产生第二条失联的轮询链。
 *
 * - paid：status === 1，已走成功路径（判定条件未做任何放宽）
 * - unpaid：查询成功但未到账
 * - stale：await 期间已换单或已成功，本次响应作废（不得触发任何副作用）
 * - error：请求失败（错误提示由请求层负责）
 */
type OrderQueryResult = 'paid' | 'unpaid' | 'stale' | 'error'

async function queryOrderOnce(id: string): Promise<OrderQueryResult> {
  if (!isLive() || !id) return 'stale'
  try {
    const res: ResData<any> = await fetchOrderQueryAPI({ orderId: id })
    if (!isLive()) return 'stale'
    pollFailures = 0
    // await 期间流程可能已被重置或换单：过期响应不得再触发成功副作用，
    // 否则会误删新订单的恢复标记并重复 emit
    if (paySuccess.value || id !== orderId.value) return 'stale'
    if (!res.success) return 'unpaid'
    const { status } = res.data
    if (status === 1) {
      markPaymentSuccess()
      return 'paid'
    }
    return 'unpaid'
  } catch (error) {
    if (!isLive()) return 'stale'
    pollFailures++
    return 'error'
  }
}

/* 启动轮询链（先停掉旧链，保证任何时刻只有一条存活） */
function startPolling() {
  if (!isLive()) return
  stopPolling()
  pollFailures = 0
  void runPoll(pollSession)
}

/* 轮询订单状态 */
async function runPoll(session: number) {
  if (session !== pollSession || !active.value || !orderId.value) return

  const queriedOrderId = orderId.value
  const result = await queryOrderOnce(queriedOrderId)
  if (result === 'paid' || result === 'stale') return
  // 本链已被替换（重置 / 换单 / 卸载）：直接终止，不再排队，避免遗留回调
  if (session !== pollSession) return

  if (pollFailures >= MAX_POLL_FAILURES) {
    // 连续查询失败（订单已不存在或网络异常）：停止自动轮询，交给用户手动刷新，
    // 既避免请求层错误提示按秒刷屏，也保留订单恢复标记
    enterUnresolved()
    return
  }

  if (!active.value || remainingTime.value <= 0 || queriedOrderId !== orderId.value) return
  timer = setTimeout(() => void runPoll(session), POLL_INTERVAL)
}

/* 返回主视图（保留待确认订单记录，重新进入支付页仍可恢复确认） */
function backToMainView() {
  dispose()
  emit('back-to-main')
  active.value = false
  showQrCode.value = false
  paySuccess.value = false
  payPhase.value = 'idle'
  stopPolling()
  stopCountdown()
}

/* 打开新窗口支付 */
function openPayWindow() {
  if (!payUrl.value) return
  if (!isHttpUrl(payUrl.value)) return
  // 支付回调页通过 window.opener 识别弹窗并自动关窗；到账仍由服务端查询确认。
  // 此处只校验 http(s)，不能证明目标来源可信；payUrl 必须来自受信任的支付配置。
  // 先断开站点自己的 opener（站点可能是别的页面用 window.open 打开的）：有的内置浏览器把新窗口开在当前视图里，
  // 结果页不会把那个外部页面当成支付弹窗的来源、把整个站点关掉；新弹窗的 opener 仍是站点
  window.opener = null
  window.open(payUrl.value, '_blank')
}

/**
 * 支付渠道的回跳都先到服务端的结果页，再带着结果回到站点（商业包的 paymentReturn 处理），
 * 不会带着订单号回到这里：打开支付页时只接着确认本账号本套餐还没确认的那一笔。
 */
/**
 * 支付方式的品牌图标来自 Iconify 的在线图标库：取到了才显示，取不到（内网部署、断网）就显示
 * 方式名称的首字母徽标，不留一块空白
 */
const PAYMENT_ICONS: Record<string, string> = {
  wechat: 'streamline-logos:wechat-pay-logo-solid',
  alipay: 'ant-design:alipay-circle-filled',
  paypal: 'logos:paypal',
  stripe: 'logos:stripe',
}
const loadedPaymentIcons = ref<ReadonlySet<string>>(new Set())
let stopLoadingPaymentIcons: (() => void) | undefined

function paymentIconOf(icon?: string) {
  const name = icon ? PAYMENT_ICONS[icon] : undefined
  return name && loadedPaymentIcons.value.has(name) ? name : ''
}

onMounted(() => {
  stopLoadingPaymentIcons = loadIcons(Object.values(PAYMENT_ICONS), loaded => {
    loadedPaymentIcons.value = new Set(loaded.map(icon => `${icon.prefix}:${icon.name}`))
  })
})
onBeforeUnmount(() => stopLoadingPaymentIcons?.())

onMounted(async () => {
  await fetchPaymentMethods()
  if (!isLive()) return

  if (useGlobal.orderCreationPending) {
    waitingForCreation = true
    return
  }
  await restorePendingOrder()
  // 不自动调用 getQrCode，等待用户点击支付按钮
})

async function restorePendingOrder() {
  if (!isLive()) return
  const pendingOrderId = pendingOrderFor(pendingOrderOwner())
  if (pendingOrderId) {
    // 恢复上一次未确认的订单：先记为当前跟踪的订单，再做一次状态查询
    orderId.value = pendingOrderId
    const result = await queryOrderOnce(pendingOrderId)

    // 恢复查询在途期间用户可能已手动新建订单：旧单不得再接管 UI，
    // 否则会串单、起重复轮询链，甚至覆盖新订单的支付界面
    if (!isLive() || paySuccess.value || orderId.value !== pendingOrderId) return

    // 'paid' 已在 queryOrderOnce 内走成功路径
    if (result === 'unpaid') {
      enterConfirming()
    } else if (result === 'error') {
      // 查询失败可能只是网络抖动，不删除恢复标记（订单标识不因一次查询失败作废），
      // 改为展示可手动刷新 / 重新下单的状态卡，避免空白无出口
      enterUnresolved()
    }
  }
}

watch(
  () => useGlobal.orderCreationPending,
  pending => {
    if (!pending && waitingForCreation && isLive()) {
      waitingForCreation = false
      void restorePendingOrder()
    }
  }
)

function dispose() {
  disposed = true
  active.value = false
  stopPolling()
  stopCountdown()
  removeWechatBridgeReadyListener()
}
watch(
  () => props.visible,
  visible => {
    if (!visible) dispose()
  },
  { flush: 'sync' }
)
onBeforeUnmount(dispose)
watch(
  () => [auth.token, auth.userInfo?.id],
  () => {
    if (!sameIdentity()) dispose()
  },
  { flush: 'sync' }
)
</script>

<template>
  <div class="member-payment">
    <!-- Header -->
    <div class="payment-header">
      <UiTooltip :text="t('common.back')" placement="bottom">
        <UiButton icon :aria-label="t('common.back')" @click="backToMainView">
          <ArrowLeft :size="20" />
        </UiButton>
      </UiTooltip>
      <h2 class="payment-title">{{ t('pay.selectPaymentMethod') }}</h2>
    </div>

    <!-- Package Info -->
    <div v-if="useGlobal.orderInfo?.pkgInfo" class="rounded-xl border border-app-border p-4 mb-5">
      <div class="flex justify-between items-center pb-2 mb-2 border-b border-app-divider">
        <span class="type-control text-text-muted">{{ t('pay.packageName') }}</span>
        <span class="type-control text-text-primary">{{ useGlobal.orderInfo.pkgInfo.name }}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="type-control text-text-muted">{{ t('pay.amountDue') }}</span>
        <span class="type-dialog-title text-text-link">
          <template v-if="paymentCurrency === 'USD'"> ${{ displayUsdPrice }} </template>
          <template v-else> ¥{{ useGlobal.orderInfo.pkgInfo.price }} </template>
        </span>
      </div>
    </div>

    <!-- QR Code Section (moved here) -->
    <div v-if="showQrCode && !paySuccess" class="mb-5">
      <!-- 微信浏览器内的支付宝支付引导 -->
      <div v-if="showWeChatGuide && isRedirectPay && payUrl" class="settings-subtle-card p-6">
        <!-- 简洁提示 -->
        <div class="text-center mb-4">
          <p class="type-control mb-2 text-text-secondary">
            {{ t('pay.wechatAlipayGuideTitle') }}
          </p>
          <p class="type-control text-text-muted">
            {{ t('pay.wechatAlipaySimpleGuide') }}
          </p>
        </div>

        <!-- 操作按钮 -->
        <div class="space-y-3">
          <UiButton variant="primary" class="w-full" @click="copyToClipboard(payUrl)">
            {{ t('pay.copyPaymentLink') }}
          </UiButton>
          <UiButton
            variant="secondary"
            v-if="availablePaymentMethods.some(m => m.method === 'wechat')"
            class="w-full"
            @click="switchToWechatPay"
          >
            {{ t('pay.switchToWechatPay') }}
          </UiButton>
        </div>
      </div>

      <!-- 普通跳转支付（非微信环境） -->
      <div
        v-else-if="isRedirectPay && !showWeChatGuide && payUrl"
        class="settings-subtle-card p-6 text-center"
      >
        <UiButton variant="primary" class="mb-3" @click="openPayWindow">
          {{ t('pay.clickToPay') }}
        </UiButton>
        <p class="type-control text-text-muted">{{ t('pay.redirectPayHint') }}</p>
      </div>

      <div v-else-if="payUrl" class="settings-subtle-card p-6">
        <!-- 支付宝iframe嵌入模式 -->
        <div v-if="payUrl.includes('<form')" class="flex flex-col items-center">
          <iframe
            ref="alipayIframe"
            :srcdoc="payUrl"
            class="border-0 alipay-iframe"
            sandbox="allow-scripts allow-forms"
          ></iframe>
          <p class="type-control mt-4 text-text-muted">
            {{ t('pay.scanQrCodeToPay', { platform: plat }) }}
          </p>
          <div v-if="remainingTime > 0" class="type-caption mt-3 text-text-muted">
            {{ t('pay.qrCodeExpires', { time: formatedTime }) }}
          </div>
        </div>

        <!-- 二维码显示模式 -->
        <div v-else class="flex flex-col items-center">
          <QRCode :value="payUrl" :size="200" />
          <p class="type-control mt-4 text-text-muted">
            {{ t('pay.scanQrCodeToPay', { platform: plat }) }}
          </p>
          <div v-if="remainingTime > 0" class="type-caption mt-3 text-text-muted">
            {{ t('pay.qrCodeExpires', { time: formatedTime }) }}
          </div>
        </div>
      </div>

      <!--
        支付状态与出口卡。两种职责：
        1) 确认中 / 未确认时说明当前真实状态，并提供「不会新建订单」的手动刷新；
        2) 兜住「已进入支付流程却没有任何可展示内容」的情况（恢复未支付订单时 payUrl 不会被持久化、
           微信 JSAPI 唤起后也没有 payUrl），避免出现既无二维码也无任何按钮的空白支付区。
        倒计时超时后 payUrl 会被保留，本卡片直接叠在二维码下方，用户仍可继续扫码或手动确认。
      -->
      <div
        v-if="showStatusCard"
        class="settings-subtle-card p-6 text-center"
        :class="payUrl ? 'mt-4' : ''"
      >
        <!--
          轮询仍在进行时，说明支付已经发起、正在确认真实到账状态（微信 JSAPI 唤起后、
          或恢复未支付订单）。这里必须显示「确认中」而不是「支付未完成」，
          否则会在到账确认窗口里诱导用户再付一笔。
        -->
        <div v-if="payPhase === 'confirming'" class="flex flex-col items-center gap-2">
          <UiSpinner size="md" class="text-text-muted" />
          <p class="type-control text-text-secondary">{{ t('pay.confirmingPayment') }}</p>
          <p class="type-caption text-text-muted">{{ t('pay.confirmingPaymentHint') }}</p>
        </div>
        <div v-else class="flex flex-col items-center gap-2">
          <p class="type-control text-text-secondary">{{ t('pay.paymentNotDetected') }}</p>
          <p class="type-caption text-text-muted">{{ t('pay.pendingOrderHint') }}</p>
        </div>

        <div class="mt-4 flex flex-col gap-2">
          <!-- 只做一次状态查询，绝不新建订单：任何状态下点击都不会重复扣款 -->
          <UiButton
            class="w-full"
            :variant="payPhase === 'confirming' ? 'primary' : 'secondary'"
            :disabled="!orderId || refreshing || submitting || loading"
            :aria-busy="refreshing"
            @click="refreshPaymentStatus"
          >
            {{ t('pay.refreshPaymentStatus') }}
          </UiButton>
          <!-- 明确表达「新建一笔订单」的后果；确认中的前 15 秒不暴露，避开异步到账窗口 -->
          <UiButton
            v-if="canCreateNewOrder"
            class="w-full"
            :variant="payPhase === 'confirming' ? 'secondary' : 'primary'"
            :disabled="
              submitting ||
              loading ||
              refreshing ||
              useGlobal.orderCreationPending ||
              !selectedPaymentMethod
            "
            :aria-busy="submitting || loading"
            @click="createNewOrder"
          >
            {{ t('pay.createNewOrder') }}
          </UiButton>
        </div>
      </div>
    </div>

    <!-- Payment Success (moved here) -->
    <div
      v-if="paySuccess"
      class="rounded-xl border p-6 mb-5"
      style="
        background: color-mix(in srgb, var(--semantic-success) 12%, transparent);
        border-color: color-mix(in srgb, var(--semantic-success) 35%, transparent);
      "
    >
      <div class="flex flex-col items-center">
        <div
          class="w-12 h-12 mb-3 bg-semantic-success text-text-inverse rounded-full flex items-center justify-center text-2xl"
        >
          ✓
        </div>
        <h3 class="type-section-title mb-3 text-semantic-success">
          {{ t('pay.paymentSuccess') }}
        </h3>
        <UiButton variant="secondary" @click="backToMainView">
          {{ t('common.back') }}
        </UiButton>
      </div>
    </div>

    <!-- Payment Methods -->
    <div v-if="availablePaymentMethods.length > 1" class="mb-8">
      <p class="type-control mb-4 text-text-muted">
        {{ t('pay.selectPaymentMethod') }}
      </p>
      <div class="flex flex-col gap-2">
        <label
          v-for="method in payTypes"
          :key="method.value"
          class="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors duration-md"
          :class="
            selectedPaymentMethod === method.value
              ? 'border-[var(--dialog-control-selected-border)] bg-[var(--dialog-control-selected-bg)]'
              : 'border-app-border hover:bg-[var(--dialog-card-bg-hover)]'
          "
        >
          <!-- Radio Button -->
          <input
            type="radio"
            :value="method.value"
            :checked="selectedPaymentMethod === method.value"
            @change="selectedPaymentMethod = method.value"
            class="w-4 h-4 text-text-link border-app-border focus:ring-0"
          />

          <!-- Icon -->
          <div class="flex items-center justify-center w-8 h-8">
            <Icon
              v-if="paymentIconOf(method.icon)"
              :icon="paymentIconOf(method.icon)"
              :width="22"
              :height="22"
              :color="method.icon === 'wechat' ? COMMERCE_BRAND_COLORS.wechatPay : undefined"
            />
            <div
              v-else
              aria-hidden="true"
              class="type-caption flex h-6 w-6 items-center justify-center rounded-full"
              :class="
                selectedPaymentMethod === method.value
                  ? 'bg-[var(--dialog-control-selected-bg)] text-text-link'
                  : 'bg-[var(--dialog-control-bg)] text-text-muted'
              "
            >
              {{ (method.label || method.value || '?').charAt(0).toUpperCase() }}
            </div>
          </div>

          <!-- Text -->
          <span
            class="type-control flex-1"
            :class="
              selectedPaymentMethod === method.value ? 'text-text-link' : 'text-text-secondary'
            "
          >
            {{ method.label }}
          </span>
        </label>
      </div>
    </div>

    <div v-if="!showQrCode && !paySuccess && availablePaymentMethods.length > 0" class="mb-5">
      <UiButton
        variant="primary"
        class="w-full"
        :disabled="
          loading ||
          submitting ||
          refreshing ||
          useGlobal.orderCreationPending ||
          !selectedPaymentMethod
        "
        :aria-busy="loading || submitting"
        @click="createNewOrder"
      >
        {{ t('pay.clickToPay') }}
      </UiButton>
    </div>

    <!-- No Payment Methods -->
    <div v-else-if="!loading && availablePaymentMethods.length === 0" class="no-payment-methods">
      <p>{{ t('pay.noPaymentMethods') }}</p>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center z-1 rounded-xl"
      style="background: color-mix(in srgb, var(--app-surface) 95%, transparent)"
    >
      <UiSpinner :size="40" tone="link" />
    </div>
  </div>
</template>

<style scoped>
.member-payment {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
  position: relative;
  /* 支付宝表单嵌入模式的 iframe（模板里 class="border-0 alipay-iframe"） */
}
.member-payment .payment-header {
  display: flex;
  align-items: center;
  margin-bottom: 30px;
}
.member-payment .payment-header .payment-title {
  font-size: var(--type-dialog-title-size);
  font-weight: 400;
  margin: 0;
  color: var(--text-primary);
}
.member-payment .no-payment-methods {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}
.member-payment .alipay-iframe {
  width: 200px;
  height: 280px;
  border-radius: var(--radius-lg);
  background: var(--app-surface);
  overflow: hidden;
}
@media (max-width: 767.9px) {
  .member-payment {
    padding: 15px;
  }
}
</style>
