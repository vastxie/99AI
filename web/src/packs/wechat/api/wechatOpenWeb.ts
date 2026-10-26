import type { OAuthCallbackRequest, OAuthUrlRequest } from '@/api/user'
import { fetchOAuthCallbackAPI, fetchOAuthUrlAPI } from '@/api/user'
import type { ApiResponse } from '@/utils/request'

export const WECHAT_OPEN_WEB_PROVIDER = 'wechat_open_web'
export const WECHAT_OFFICIAL_PROVIDER = 'wechat_official'

export interface WechatOpenWebOAuthUrlResult {
  appId: string
  scope: 'snsapi_login'
  redirectUri: string
  state: string
  style?: 'black' | 'white'
  fastLogin?: boolean
  fallbackUrl?: string
}

export interface WechatOpenWebCallbackResult {
  token: string
  redirectPath?: string
}

/** 微信开放平台网站登录：内嵌扫码组件所需的配置（走内核通用 OAuth 路由） */
export function fetchWechatOpenWebOAuthUrlAPI(
  data: OAuthUrlRequest = {}
): Promise<ApiResponse<WechatOpenWebOAuthUrlResult>> {
  return fetchOAuthUrlAPI<WechatOpenWebOAuthUrlResult>(WECHAT_OPEN_WEB_PROVIDER, data)
}

export function fetchWechatOpenWebOAuthCallbackAPI(
  data: OAuthCallbackRequest
): Promise<ApiResponse<WechatOpenWebCallbackResult>> {
  return fetchOAuthCallbackAPI<WechatOpenWebCallbackResult>(WECHAT_OPEN_WEB_PROVIDER, data)
}
