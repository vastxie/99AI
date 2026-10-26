import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive, ref } from 'vue'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useCommerceStore } from './store'
import PackageCatalog from './PackageCatalog.vue'
import PackagePlanCard from './PackagePlanCard.vue'
import AccountData from './AccountData.vue'
import AccountDetails from './AccountDetails.vue'
import PackagePurchaseDialog from './PackagePurchaseDialog.vue'
import type { PackagePlan } from './packagePlans'

const mocks = vi.hoisted(() => ({
  auth: {} as {
    isLogin: boolean
    token: string
    userInfo: { role: string; id: number }
    globalConfig: {}
    billing: {}
    setLoginDialog: ReturnType<typeof vi.fn>
    setBilling: ReturnType<typeof vi.fn>
    beginBillingQuery: ReturnType<typeof vi.fn>
    applyBillingQuery: ReturnType<typeof vi.fn>
  },
  plans: vi.fn(),
  balance: vi.fn(),
  logs: vi.fn(),
  desktop: vi.fn(),
}))
vi.mock('@/store/modules/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/store/modules/global', () => ({
  useGlobalStoreWithOut: () => ({
    updateSettingsDialog: mocks.desktop,
  }),
}))
vi.mock('./api/balance', () => ({
  fetchGetBalanceQueryAPI: mocks.balance,
  fetchGetRechargeLogAPI: mocks.logs,
}))
vi.mock('./api/package', () => ({ fetchGetPackagePlansAPI: mocks.plans }))
vi.mock('@/locales', () => ({
  t: (key: string) => key,
  tp: (key: string) => key,
  formatNumber: (value: number) => String(value),
  formatDate: (value: Date) => value.toISOString().slice(0, 10),
  formatDateTime: (value: Date) => value.toISOString(),
}))
vi.mock('@/hooks/useViewport', () => ({ useViewport: () => ({ isMobile: ref(false) }) }))
vi.mock('./MemberPayment.vue', () => ({
  default: {
    name: 'MemberPayment',
    props: ['visible'],
    emits: ['payment-success', 'back-to-main'],
    template:
      '<div><button @click="$emit(\'payment-success\')">paid</button><button @click="$emit(\'back-to-main\')">back</button></div>',
  },
}))

const basic: PackagePlan = {
  planKey: 'test-basic',
  planName: 'Basic fixture',
  planType: 'membership',
  features: ['Fixture feature'],
  defaultVariantId: 1,
  variants: [
    {
      id: 1,
      name: 'Monthly fixture',
      variantName: 'Month',
      billingCycle: 'month',
      billingCycleCount: 1,
      variantOrder: 1,
      isDefaultVariant: 1,
      price: 19,
      days: 30,
      credits: 1000,
      weight: 1,
    },
    {
      id: 2,
      name: 'Yearly fixture',
      variantName: 'Year',
      billingCycle: 'year',
      billingCycleCount: 1,
      variantOrder: 2,
      isDefaultVariant: 0,
      price: 190,
      days: 365,
      credits: 12000,
      weight: 1,
    },
  ],
}
const credit: PackagePlan = {
  ...basic,
  planKey: 'test-credit',
  planName: 'Credit fixture',
  planType: 'credit_pack',
  variants: [
    { ...basic.variants[0], id: 3, billingCycle: 'one_time', credits: 500, price: 9, weight: 0 },
  ],
}
const wrappers: VueWrapper[] = []
function render(component: Parameters<typeof mount>[0], props = {}): VueWrapper {
  const wrapper = mount(component, { props, attachTo: document.body })
  wrappers.push(wrapper)
  return wrapper
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
const logPage = (id: number, count = 21) => ({
  success: true,
  data: {
    count,
    rows: [{ id, rechargeType: 10, credits: 1, createdAt: '2026-01-01T00:00:00Z', tokenUsed: 10 }],
  },
})

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.auth = reactive({
    isLogin: true,
    token: 'fixture-session-a',
    userInfo: { role: 'user', id: 1 },
    globalConfig: {},
    billing: { isMember: false, sumCredits: 12 },
    setLoginDialog: vi.fn(),
    setBilling: vi.fn(),
    beginBillingQuery: vi.fn(() => ({ seq: 1, eventVersion: 0, epoch: 0 })),
    applyBillingQuery: vi.fn(() => true),
  })
  mocks.balance.mockResolvedValue({ success: true, data: {} })
  mocks.plans.mockResolvedValue({ success: true, data: { rows: [basic, credit] } })
  mocks.logs.mockResolvedValue(logPage(1))
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('commerce account and purchase UI', () => {
  it('身份变化立即关闭选购，不把旧账户页面/焦点来源带到新账号', async () => {
    const store = useCommerceStore()
    render(PackagePurchaseDialog)
    store.openPackagePurchase('credits', true)
    await flushPromises()
    mocks.auth.token = 'fixture-session-b'
    mocks.auth.userInfo.id = 2
    expect(store.purchaseDialog).toBe(false)
    expect(store.purchaseFromAccount).toBeNull()
    expect(store.accountReturnFocus).toBeNull()
    expect(mocks.desktop).not.toHaveBeenCalled()
  })
  it('访客不能打开选购，已登录入口保留类型和来源，hash 重入不重置', () => {
    const store = useCommerceStore()
    mocks.auth.userInfo.role = 'visitor'
    store.openPackagePurchase('credits')
    expect(store.purchaseDialog).toBe(false)
    expect(mocks.auth.setLoginDialog).toHaveBeenCalledWith(true)
    mocks.auth.userInfo.role = 'user'
    store.openPackagePurchase('credits', true)
    store.openPackagePurchase()
    expect(store.purchaseTab).toBe('credits')
    expect(store.purchaseFromAccount).toBe('credits')
    store.closePackagePurchase()
    store.openPackagePurchase('membership')
    expect(store.purchaseFromAccount).toBeNull()
    store.openAccountData()
    expect(mocks.desktop).toHaveBeenCalledWith(true, 'plans')
  })

  it('套餐默认规格与年付切换，只选择不下单，低等级不可购买但积分不受限', async () => {
    const card = render(PackagePlanCard, { plan: basic, currentWeight: 0 })
    expect(card.text()).toContain('¥19')
    await card
      .findAll('button')
      .find(button => button.text() === 'Year')!
      .trigger('click')
    expect(card.text()).toContain('¥190')
    expect(card.emitted('purchase')).toBeUndefined()
    await card.get('.btn-primary').trigger('click')
    expect(card.emitted('purchase')?.[0]?.[1]).toMatchObject({ id: 2 })
    await card.setProps({ currentWeight: 2 })
    expect(card.get('.btn-primary').attributes('disabled')).toBeDefined()
    await card.setProps({ plan: credit })
    expect(card.get('.btn-primary').attributes('disabled')).toBeUndefined()
  })

  it('柔和分类与规格切换保留卡片和选项，不重载目录或触发购买', async () => {
    useCommerceStore().openPackagePurchase()
    const dialog = render(PackagePurchaseDialog)
    await flushPromises()
    const catalog = dialog.getComponent(PackageCatalog)
    expect(dialog.get('header [role="tablist"]').classes()).toContain('ui-segmented-soft')
    expect(catalog.get('.panel-switcher').attributes('data-current-page')).toBe('1')
    expect(catalog.get('.panel-switcher').classes()).not.toContain('panel-switcher-fade')
    const card = catalog.get('[data-plan-key="test-basic"]')
    const cardNode = card.element
    const detailsSlot = card.get('[aria-live="polite"]').element
    const purchaseNode = card.get('.btn-primary').element
    expect(card.get('.ui-segmented-control').classes()).toContain('ui-segmented-soft')
    await card.get('button[aria-label="Year"]').trigger('click')
    expect(card.text()).toContain('¥190')
    expect(card.text()).toContain('12000')
    expect(card.get('[aria-live="polite"]').element).toBe(detailsSlot)
    expect(card.findAll('[data-package-details]')).toHaveLength(1)
    expect(card.get('.btn-primary').element).toBe(purchaseNode)
    for (const tab of ['credits', 'membership', 'credits', 'membership']) {
      await dialog.get(`#purchase-tab-${tab}`).trigger('click')
      expect(dialog.get(`#purchase-tab-${tab}`).attributes('aria-selected')).toBe('true')
    }
    expect(catalog.get('[data-plan-key="test-basic"]').element).toBe(cardNode)
    expect(card.get('button[aria-label="Year"]').attributes('aria-pressed')).toBe('true')
    expect(card.text()).toContain('¥190')
    expect(mocks.plans).toHaveBeenCalledOnce()
    expect(catalog.emitted('purchase')).toBeUndefined()
  })

  it('快速切换规格只更新展示区，立即购买仍使用最后选中的规格', async () => {
    const card = render(PackagePlanCard, { plan: basic, currentWeight: 0 })
    const cardNode = card.element
    const featuresNode = card.get('ul').element
    for (const cycle of ['Year', 'Month', 'Year', 'Month']) {
      await card.get(`button[aria-label="${cycle}"]`).trigger('click')
    }
    expect(card.element).toBe(cardNode)
    expect(card.get('ul').element).toBe(featuresNode)
    expect(card.get('[data-package-details]').text()).toContain('¥19')
    expect(card.get('[data-package-details]').text()).toContain('1000')
    expect(card.findAll('[data-package-details]')).toHaveLength(1)
    expect(card.emitted('purchase')).toBeUndefined()
    await card.get('.btn-primary').trigger('click')
    expect(card.emitted('purchase')?.[0]?.[1]).toMatchObject({ id: 1 })
  })

  it('目录键盘切换与页语义一致，空态和失败态可重试', async () => {
    useCommerceStore().openPackagePurchase()
    const dialog = render(PackagePurchaseDialog)
    await flushPromises()
    const catalog = dialog.getComponent(PackageCatalog)
    expect(catalog.findAll('[data-plan-key]')).toHaveLength(2)
    expect(dialog.findAll('[role="tablist"]')).toHaveLength(1)
    expect(dialog.get('#package-purchase-title').classes()).toContain('sr-only')
    expect(catalog.find('[role="tablist"]').exists()).toBe(false)
    await dialog.get('header [role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    expect(useCommerceStore().purchaseTab).toBe('credits')
    expect(dialog.get('#purchase-tab-credits').attributes('aria-selected')).toBe('true')
    expect(catalog.find('[aria-label="common.refresh"]').exists()).toBe(false)
    mocks.plans.mockResolvedValueOnce({ success: false })
    const failedCatalog = render(PackageCatalog, { active: true })
    await flushPromises()
    expect(failedCatalog.find('[role="alert"]').exists()).toBe(true)
    mocks.plans.mockResolvedValueOnce({ success: true, data: { rows: [] } })
    await failedCatalog.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(failedCatalog.text()).toContain('member.noRecords')
  })

  it('账户页仅摘要、入口和明细，无套餐卡片/嵌套固定高度', async () => {
    const page = render(AccountData, { visible: true })
    await flushPromises()
    expect(page.find('[data-plan-key]').exists()).toBe(false)
    expect(page.findAll('section')).toHaveLength(2)
    expect(page.text()).toContain('member.accountDetails')
    await page.get('.btn-primary').trigger('click')
    expect(useCommerceStore().purchaseFromAccount).toBe('membership')
  })

  it('明细服务端分页，隐藏后的旧响应不能覆盖重开页；错误不是无记录', async () => {
    const details = render(AccountDetails, { visible: true })
    await flushPromises()
    const late = deferred<ReturnType<typeof logPage>>()
    mocks.logs.mockReturnValueOnce(late.promise)
    await details.findAll('nav button')[1].trigger('click')
    expect(mocks.logs).toHaveBeenLastCalledWith({ page: 2, size: 10 })
    await details.setProps({ visible: false })
    mocks.logs.mockResolvedValueOnce(logPage(99, 1))
    await details.setProps({ visible: true })
    await flushPromises()
    late.resolve(logPage(2))
    await flushPromises()
    expect(details.find('nav').exists()).toBe(false)
    mocks.logs.mockRejectedValueOnce(new Error('synthetic failure'))
    await details.setProps({ revision: 1 })
    await flushPromises()
    expect(details.find('[role="alert"]').exists()).toBe(true)
    expect(details.text()).not.toContain('member.noRecords')
  })

  it('选购与支付保持单一弹窗，成功保留；回列表规格不丢，关闭返回来源', async () => {
    const store = useCommerceStore()
    const dialog = render(PackagePurchaseDialog)
    store.openPackagePurchase('membership', true)
    await flushPromises()
    const card = dialog.get('[data-plan-key="test-basic"]')
    await card
      .findAll('button')
      .find(button => button.text() === 'Year')!
      .trigger('click')
    await card.get('.btn-primary').trigger('click')
    expect(dialog.get('header [role="tablist"]').isVisible()).toBe(false)
    expect(store.orderInfo.pkgInfo.id).toBe(2)
    expect(dialog.findAll('[role="dialog"]')).toHaveLength(1)
    const payment = dialog.findComponent({ name: 'MemberPayment' })
    await payment.findAll('button')[0].trigger('click')
    await flushPromises()
    expect(dialog.findComponent({ name: 'MemberPayment' }).exists()).toBe(true)
    await payment.findAll('button')[1].trigger('click')
    expect(dialog.get('header [role="tablist"]').isVisible()).toBe(true)
    expect(dialog.get('[data-plan-key="test-basic"]').text()).toContain('¥190')
    await dialog.get('[aria-label="common.close"]').trigger('click')
    expect(store.purchaseDialog).toBe(false)
    expect(mocks.desktop).toHaveBeenCalledWith(true, 'plans')
    const account = render(AccountData, { visible: true })
    await flushPromises()
    expect(document.activeElement).toBe(account.get('[data-purchase-entry="membership"]').element)
  })

  it('登录态仍为 true 时切换身份，旧账户迟到明细不得落到新账户', async () => {
    const first = deferred<ReturnType<typeof logPage>>()
    mocks.logs.mockReturnValueOnce(first.promise)
    const details = render(AccountDetails, { visible: true })
    mocks.logs.mockResolvedValueOnce(logPage(22, 1))
    mocks.auth.token = 'fixture-session-b'
    mocks.auth.userInfo.id = 2
    await flushPromises()
    first.resolve(logPage(11, 100))
    await flushPromises()
    expect(mocks.logs).toHaveBeenCalledTimes(2)
    expect(details.find('nav').exists()).toBe(false)
    expect(details.findAll('li')).toHaveLength(1)
  })
})
