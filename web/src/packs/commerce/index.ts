import { ReceiptText } from '@lucide/vue'
import { definePack } from '@/core/packs/definePack'
import { t } from '@/locales'
import './config-augment'
import { classifyCommerceError, handleCommerceError } from './chatError'
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'
import manifest from './pack.json'
import { handlePaymentReturn } from './paymentReturn'
import { ACCOUNT_DATA_TAB, useCommerceStore } from './store'

/**
 * 商业包（前端）：会员 / 积分 / 套餐 / 支付 / 每日签到的入口与弹窗。
 *
 * 由构建期环境变量 `VITE_COMMERCE_ENABLED` 控制：
 * - 默认开启（变量缺省、为空或取其它任意值均视为开启，现有部署零改动）；
 * - 仅当取值（去空白、忽略大小写）为 `false` / `0` / `off` / `no` 之一时关闭。
 *
 * 关闭后包内组件全部不装载，内核经挂载点渲染时自然没有这些入口。
 */
const COMMERCE_DISABLED_VALUES = new Set(['false', '0', 'off', 'no'])

/** 纯解析函数：便于单测覆盖各种取值，不直接依赖 import.meta.env */
export function parseCommerceEnabled(rawValue: unknown): boolean {
  if (rawValue === undefined || rawValue === null) return true
  const normalized = String(rawValue).trim().toLowerCase()
  if (!normalized) return true
  return !COMMERCE_DISABLED_VALUES.has(normalized)
}

/** 当前构建是否启用商业化 UI（每次调用实时读取 import.meta.env，便于测试桩替换） */
export function isCommerceEnabled(): boolean {
  return parseCommerceEnabled(import.meta.env.VITE_COMMERCE_ENABLED)
}

export default definePack({
  id: manifest.id,
  tier: 'feature',
  enabled: isCommerceEnabled(),
  locales: { 'zh-CN': zhCN, 'en-US': enUS },
  slots: {
    'settings.tab': [
      {
        id: 'commerce.account-data',
        key: ACCOUNT_DATA_TAB,
        order: 30,
        label: () => t('commerce.accountData'),
        navigationLabel: () => t('commerce.accountDataNav'),
        icon: ReceiptText,
        component: () => import('./AccountData.vue'),
      },
    ],
    'settings.mobile.badge': [
      { id: 'commerce.credits-badge', component: () => import('./CreditsBadge.vue') },
    ],
    'sider.user': [
      { id: 'commerce.membership-badge', component: () => import('./MembershipBadge.vue') },
    ],
    'header.menu': [
      { id: 'commerce.member-center-menu', component: () => import('./HeaderMenuItem.vue') },
    ],
    // 第一次打开时才挂载（连带加载各自的代码），之后一直挂着
    'chat.dialog': [
      {
        id: 'commerce.sign-in-dialog',
        component: () => import('./SignInDialog.vue'),
        when: () => useCommerceStore().signInDialogUsed,
      },
      {
        id: 'commerce.purchase-dialog',
        component: () => import('./PackagePurchaseDialog.vue'),
        when: () => useCommerceStore().purchaseDialogUsed,
      },
    ],
  },
  overlays: [
    {
      hash: '#packages',
      open: () => useCommerceStore().openPackagePurchase(),
      close: () => useCommerceStore().closePackagePurchase(),
      isOpen: () => useCommerceStore().purchaseDialog,
    },
    {
      hash: '#signin',
      open: () => useCommerceStore().updateSignInDialog(true),
      close: () => useCommerceStore().updateSignInDialog(false),
      isOpen: () => useCommerceStore().signInDialog,
    },
  ],
  hooks: {
    onAppReady: () => handlePaymentReturn(),
    classifyChatError: classifyCommerceError,
    onChatError: handleCommerceError,
  },
})
