import { defineStore } from 'pinia'
import { fetchGetBalanceQueryAPI } from './api/balance'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'

/** 账户数据页沿用已登记的设置路由标识，选购另经 #packages 打开。 */
export const ACCOUNT_DATA_TAB = 'plans'
export type PurchaseTab = 'membership' | 'credits'

/** 待支付套餐：套餐规格快照（字段以套餐接口返回为准） */
export interface CommerceOrderInfo {
  pkgInfo: Record<string, any>
}

function emptyOrderInfo(): CommerceOrderInfo {
  return { pkgInfo: {} }
}

/** 商业包自己的 UI 状态；设置数据与套餐选购互不承载对方的内容。 */
export const useCommerceStore = defineStore('commerce-store', {
  state: () => ({
    signInDialog: false,
    purchaseDialog: false,
    /**
     * 弹窗第一次打开过：之后一直挂着（关闭动画照常播放）；打开之前不挂载，
     * 进入对话页时不加载签到、支付与二维码这些用不上的代码
     */
    signInDialogUsed: false,
    purchaseDialogUsed: false,
    purchaseTab: 'membership' as PurchaseTab,
    purchaseFromAccount: null as PurchaseTab | null,
    accountReturnFocus: null as PurchaseTab | null,
    // 跨弹窗实例的在途下单锁，关闭重开不能绕过重入保护。
    orderCreationPending: false,
    orderInfo: emptyOrderInfo(),
  }),

  actions: {
    updateSignInDialog(visible: boolean) {
      this.signInDialog = visible
      if (visible) this.signInDialogUsed = true
    },

    updateOrderInfo(info: CommerceOrderInfo) {
      this.orderInfo = info
    },

    openAccountData() {
      useGlobalStoreWithOut().updateSettingsDialog(true, ACCOUNT_DATA_TAB)
    },

    openPackagePurchase(tab?: PurchaseTab, fromAccount = false) {
      const authStore = useAuthStore()
      if (!authStore.isLogin || authStore.userInfo?.role === 'visitor') {
        this.closePackagePurchase()
        authStore.setLoginDialog(true)
        return
      }
      // hash 同步会再次调用 open；不能覆盖入口已选定的类型/返回来源。
      if (!this.purchaseDialog)
        this.purchaseFromAccount = fromAccount ? tab || this.purchaseTab : null
      if (tab) this.purchaseTab = tab
      this.purchaseDialog = true
      this.purchaseDialogUsed = true
    },

    closePackagePurchase() {
      this.purchaseDialog = false
    },

    /**
     * 主动拉取账户摘要（签到 / 支付后），写回内核的不透明 billing 字段。走内核的账单取数路径：
     * 只有仍是最新发起的查询、发起后没有账单事件写入、身份没换时才写（见 auth store 的 applyBillingQuery）
     */
    async refreshBilling() {
      const authStore = useAuthStore()
      if (!authStore.isLogin) return
      const query = authStore.beginBillingQuery()
      const res: any = await fetchGetBalanceQueryAPI()
      if (res?.success) authStore.applyBillingQuery(query, res.data)
    },
  },
})
