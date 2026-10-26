/** 站点公开配置（内核键）；扩展包用 declare module 增补自己的键 */
export interface GlobalConfig {
  siteName: string
  siteTitle: string
  siteDescription: string
  siteKeywords: string
  noticeInfo: string
  clientLogoPath: string
  clientFaviconPath: string
  isAutoOpenNotice: string
  companyName: string
  filingNumber: string
  publicSecurityFilingNumber: string // 公安备案号
  showWatermark: string
  isAutoOpenAgreement: string
  agreementInfo: string
  agreementTitle: string
  noticeTitle: string
  defaultLanguage: string
  enabledLanguages: string
  maxInputLength: string
  uploadFileLimit: string
  uploadFileSizeLimit: string
}

export interface AuthState {
  loginDialog: boolean
  authDialogMode: 'login' | 'register'
  globalConfigLoading: boolean
  userInfoResolved: boolean
  userInfoLoadFailed: boolean
  loadInit: boolean
  userInfo: {
    username: string
    role: string
    id: number | string
    uid?: string
    avatar?: string
    nickname: string
    customInstruction?: string
  }
  /** 计费实现下发的账户摘要，对内核不透明；没有计费包时为 null */
  billing: unknown
  globalConfig: GlobalConfig
}

/** 未登录（游客）时的用户信息 */
export function createGuestUserInfo(): AuthState['userInfo'] {
  return {
    username: '',
    role: 'visitor',
    id: '',
    nickname: '',
  }
}
