import { defineStore } from 'pinia'
import { eventBus } from '@/core/events/eventBus'
import { fetchGetInfo } from '@/api'
import { fetchQueryConfigAPI } from '@/api/config'
import { identityEpoch, IdentityChangedError, isUserTokenPersisted } from '@/services/identity'
import { socketService } from '@/services/socket-io'
import { ensureVisitorToken } from '@/services/visitorSession'
import { t } from '@/locales'
import { message } from '@/utils/message'
import { rawStore } from '@/utils/storage'
import { clearUserToken, readUserToken, writeUserToken } from './token'
import { createGuestUserInfo, type AuthState, type GlobalConfig } from './types'

/** 登录令牌没能保存的提示：同一次页面加载最多一次（写成功、清掉令牌都不复位；退出会刷新页面） */
let tokenNotPersistedNotified = false

/**
 * 资料请求的调用序号与「最新一次」：同一身份下被更新的调用取代时，等最新那次的结果并返回同样的结果，
 * 自己不写状态（否则先发后到的旧响应会覆盖新响应）
 */
let userInfoSeq = 0
let latestUserInfoRun: Promise<any> = Promise.resolve()

/**
 * 账单的两类写入：取数（资料、刷新账单、扩展包的余额查询）按「最新发起的查询」获胜，且发起之后
 * 有事件写入（流事件、计费事件更新）就不覆盖；事件写入总是生效。换身份时清空并作废在途的取数
 */
let billingQuerySeq = 0
let billingEventVersion = 0

/** 一次账单取数的凭据：apply 时核对它仍是最新的查询、期间没有事件写入、身份没换 */
export interface BillingQuery {
  seq: number
  eventVersion: number
  epoch: number
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    loginDialog: false,
    authDialogMode: 'login',
    globalConfigLoading: true,
    userInfoResolved: false,
    userInfoLoadFailed: false,
    userInfo: createGuestUserInfo(),
    billing: null,
    globalConfig: {} as GlobalConfig,
    loadInit: false,
  }),

  getters: {
    /** 登录令牌（身份模块是唯一来源，只能经 setToken / endSession 修改） */
    token: (): string | undefined => readUserToken(),
    isLogin: (): boolean => Boolean(readUserToken()),
  },

  actions: {
    /**
     * 取当前身份的资料与账户摘要。三种结果：
     * - 成功：写入资料、账单，标记已解析；
     * - 被同一身份的更新调用取代：返回最新那次的结果（成功的数据或失败的错误），自己不写状态；
     * - 期间身份换了：抛 IDENTITY_CHANGED，不写任何状态（旧身份的资料不能落到新身份上）。
     */
    async getUserInfo(): Promise<any> {
      const seq = ++userInfoSeq
      const epoch = identityEpoch()
      const run = this.loadUserInfo(seq, epoch)
      latestUserInfoRun = run
      return run
    },

    async loadUserInfo(seq: number, epoch: number): Promise<any> {
      const superseded = () => seq !== userInfoSeq
      // 被取代时返回最新那次调用（它若也被取代，会接着交给更新的那次）
      const latest = () => latestUserInfoRun
      const assertCurrent = () => {
        if (identityEpoch() !== epoch) throw new IdentityChangedError()
      }
      this.userInfoResolved = false
      this.userInfoLoadFailed = false
      const billing = this.beginBillingQuery()
      try {
        if (!this.loadInit) await this.getGlobalConfig()
        assertCurrent()
        if (!this.token) await ensureVisitorToken()
        assertCurrent()

        const res = await fetchGetInfo()
        assertCurrent()
        if (superseded()) return latest()
        if (!res) {
          this.userInfoLoadFailed = Boolean(this.token)
          return res
        }
        const { data } = res
        const { userInfo } = data
        this.userInfo = { ...userInfo }
        this.applyBillingQuery(billing, data.billing ?? null)
        return data
      } catch (error) {
        if (identityEpoch() !== epoch) throw new IdentityChangedError()
        if (superseded()) return latest()
        this.userInfoLoadFailed = Boolean(this.token) && !String(this.userInfo?.id || '')
        throw error
      } finally {
        if (identityEpoch() === epoch && !superseded()) this.userInfoResolved = true
      }
    },

    /** 计费摘要由服务端事件（billing.update / agent.end）或扩展包写入，内核不解释内容；事件写入总是生效 */
    setBilling(summary: unknown) {
      billingEventVersion += 1
      this.billing = summary ?? null
    },

    /** 开始一次账单取数：回来后用 applyBillingQuery 写入 */
    beginBillingQuery(): BillingQuery {
      billingQuerySeq += 1
      return { seq: billingQuerySeq, eventVersion: billingEventVersion, epoch: identityEpoch() }
    },

    /** 取数结果只有仍是最新发起的查询、发起后没有事件写入、身份没换时才写入；返回是否写入 */
    applyBillingQuery(query: BillingQuery, summary: unknown): boolean {
      if (
        query.seq !== billingQuerySeq ||
        query.eventVersion !== billingEventVersion ||
        query.epoch !== identityEpoch()
      ) {
        return false
      }
      this.billing = summary ?? null
      return true
    },

    /** 换身份：账单清空，在途的取数与事件版本一并作废 */
    resetBilling() {
      billingQuerySeq += 1
      billingEventVersion += 1
      this.billing = null
    },

    /** 只刷新账户摘要，不重置用户信息加载状态 */
    async refreshBilling() {
      const query = this.beginBillingQuery()
      const res = await fetchGetInfo()
      if (res?.data) this.applyBillingQuery(query, res.data.billing ?? null)
    },

    async getGlobalConfig(domain = '') {
      const res = await fetchQueryConfigAPI({ domain })
      // 为缺失的字段提供默认值，确保配置的完整性
      const configData = res.data as any
      if (configData) {
        // 确保 clientFaviconPath 字段存在
        if (!('clientFaviconPath' in configData)) {
          configData.clientFaviconPath = ''
        }
      }
      this.globalConfig = configData as GlobalConfig
      this.globalConfigLoading = false
      this.loadInit = true

      // 界面语言：本页已确定的语言优先（存储不可用时也保持本页的选择）；本页还没有确定、或本页的语言已被停用时，
      // 用存储里保存的语言（可能是其他页签的选择，别名按别名表解释）；都不在后台启用列表里就用后台默认。
      // 这里只读共享的语言偏好、从不改写（保存只发生在用户切换语言时）：页签之间没有原子的读改写，
      // 自动写回或删除都可能覆盖其他页签刚做的选择；停用的保存值留着，后台重新启用后照常生效。
      // 每次都经 setLocale 登记本页语言、同步 i18n 与 <html lang>
      // （getGlobalConfig 在 main.ts 中于 mount 前被 await，首屏渲染前语言包就绪；加载失败由 en-US fallback 兜底）
      const { currentLocaleChoice, setLocale } = await import('@/locales')
      const { LANGUAGE_KEY, normalizeLanguage, parseEnabledLanguages } =
        await import('@/store/modules/app/preferences')
      const { useAppStore } = await import('@/store')
      const appStore = useAppStore()
      const enabledLanguages = parseEnabledLanguages(this.globalConfig?.enabledLanguages)
      const pageLanguage = currentLocaleChoice()
      const savedRaw = rawStore.get(LANGUAGE_KEY)
      const saved = savedRaw ? normalizeLanguage(savedRaw) : null

      let targetLanguage = normalizeLanguage(this.globalConfig?.defaultLanguage || 'zh-CN')
      // 默认语言也不在启用列表中时，使用第一个可用的语言
      if (!enabledLanguages.includes(targetLanguage)) {
        targetLanguage = enabledLanguages[0] || 'zh-CN'
      }
      if (pageLanguage !== null && enabledLanguages.includes(pageLanguage)) {
        targetLanguage = pageLanguage
      } else if (saved !== null && enabledLanguages.includes(saved)) {
        targetLanguage = saved
      }
      await setLocale(targetLanguage, { persist: false })
      appStore.setLanguage(targetLanguage, { persist: false })
    },

    setToken(token: string) {
      const changed = writeUserToken(token)
      // 登录令牌没能保存：本次照常，刷新后可能回到未登录。与令牌是否变化无关（同一令牌重试写失败也检查）
      if (!isUserTokenPersisted() && !tokenNotPersistedNotified) {
        tokenNotPersistedNotified = true
        message().warning(t('login.tokenNotPersisted'))
      }
      if (changed) {
        this.userInfo = createGuestUserInfo()
        this.userInfoResolved = false
        this.userInfoLoadFailed = false
        this.resetBilling()
        eventBus.emit('auth:loginSuccess', { token })
        // 令牌变了才以新令牌重连；重设同一令牌不重建连接（同一身份，在途的发送与回执不受影响）
        socketService.disconnect()
        socketService.connect()
      }
    },

    /**
     * 写入登录令牌，但只在身份代次仍是 expectedEpoch 时（登录请求发出之后没有别的身份变化）；
     * 变了就不写、返回 false，调用方按「已取消」结束（不提示成功）
     */
    commitLogin(token: string, expectedEpoch: number): boolean {
      if (identityEpoch() !== expectedEpoch) return false
      this.setToken(token)
      return true
    },

    /** 开始一次登录：在发起登录请求之前调用，拿到令牌后用 commit 写入（见 commitLogin） */
    beginLogin() {
      const epoch = identityEpoch()
      return {
        epoch,
        isCurrent: () => identityEpoch() === epoch,
        commit: (token: string): boolean => this.commitLogin(token, epoch),
      }
    },

    /** 结束当前登录会话：回到访客身份。访客凭证、实时连接与资料由 store/initStores.ts 按新身份恢复 */
    endSession() {
      clearUserToken()
      this.userInfo = createGuestUserInfo()
      this.userInfoResolved = false
      this.userInfoLoadFailed = false
      this.resetBilling()
      socketService.disconnect()
    },

    /** 登录已失效（服务端判定）：各 store 按访客身份收尾，保留草稿（见 store/initStores.ts） */
    removeToken() {
      this.endSession()
      eventBus.emit('auth:tokenExpired')
    },

    setLoginDialog(bool: boolean, mode: 'login' | 'register' = 'login') {
      if (bool) {
        this.authDialogMode = mode
      }
      this.loginDialog = bool
    },

    /** 主动退出：各 store 连同草稿清掉后整页刷新（见 store/initStores.ts） */
    logOut() {
      this.endSession()
      eventBus.emit('auth:logout')
    },
  },
})
