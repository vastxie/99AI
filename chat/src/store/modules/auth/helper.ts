import { ss } from '@/utils/storage'

const LOCAL_NAME = 'SECRET_TOKEN'

export function getToken() {
  return ss.get(LOCAL_NAME)
}

export function setToken(token: string) {
  return ss.set(LOCAL_NAME, token)
}

export function removeToken() {
  return ss.remove(LOCAL_NAME)
}

export interface UserBalance {
  isMember: boolean
  model3Count: number
  model4Count: number
  drawMjCount: number
  memberModel3Count: number
  memberModel4Count: number
  memberDrawMjCount: number
  useModel3Count: number
  useModel4Count: number
  useModel3Token: number
  useModel4Token: number
  useDrawMjToken: number
  sumModel3Count: number
  sumModel4Count: number
  sumDrawMjCount: number
  expirationTime: Date
}

export interface GlobalConfig {
  siteName: string
  siteUrl: string
  qqNumber: string
  vxNumber: string
  baiduCode: string
  buyCramiAddress: string
  noticeInfo: string
  registerSendStatus: string
  registerSendModel3Count: string
  registerSendModel4Count: string
  registerSendDrawMjCount: string
  clientHomePath: string
  clientLogoPath: string
  enableHtmlRender: string
  clientFaviconPath: string
  isUseWxLogin: boolean
  robotAvatar: string
  siteRobotName: string
  mindDefaultData: string
  payEpayStatus: string
  payDuluPayStatus: string
  payHupiStatus: string
  payWechatStatus: string
  payEpayChannel: string
  payDuluPayChannel: string
  payDuluPayRedirect: string
  payHupiChannel: string
  payWechatChannel: string
  payEpayApiPayUrl: string
  payMpayStatus: string
  payMpayChannel: string
  isAutoOpenNotice: string
  isShowAppCatIcon: string
  salesBaseRatio: string
  salesSeniorRatio: string
  salesAllowDrawMoney: string
  companyName: string
  filingNumber: string
  emailLoginStatus: string
  phoneLoginStatus: string
  openIdentity: string
  openPhoneValidation: string
  wechatRegisterStatus: string
  wechatSilentLoginStatus: string
  oldWechatMigrationStatus: string
  officialOldAccountSuccessText: string
  officialOldAccountFailText: string
  signInStatus: string
  signInModel3Count: string
  signInModel4Count: string
  signInMjDrawToken: string
  appMenuHeaderTips: string
  appMenuHeaderBgUrl: string
  pluginFirst: string
  mjHideNotBlock: string
  mjUseBaiduFy: string
  mjHideWorkIn: string
  isVerifyEmail: string
  payLtzfStatus: string
  drawingStyles: string
  isHidePlugin: string
  showWatermark: string
  isHideTts: string
  isHideDefaultPreset: string
  isHideModel3Point: string
  isHideModel4Point: string
  isHideDrawMjPoint: string
  model3Name: string
  model4Name: string
  drawMjName: string
  isModelInherited: string
  noVerifyRegister: string
  homeHtml: string
  isAutoOpenAgreement: string
  agreementInfo: string
  agreementTitle: string
  isEnableExternalLinks: string
  externalLinks: string
  clearCacheEnabled: string
  noticeTitle: string
  streamCacheEnabled: string
  homeWelcomeContent: string
  sideDrawingEditModel: string
}

export interface AuthState {
  token: string | undefined
  loginDialog: boolean
  globalConfigLoading: boolean
  loadInit: boolean
  userInfo: {
    username: string
    email: string
    role: string
    id: number
    avatar?: string
    sign?: string
    isBindWx: boolean
    consecutiveDays: number
    nickname: string
  }
  userBalance: UserBalance
  globalConfig: GlobalConfig
}
