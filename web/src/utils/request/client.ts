import axios from 'axios'
import {
  currentUserToken,
  identityEpoch,
  IdentityChangedError,
  markVisitorTokenUsed,
} from '@/services/identity'
import { ensureUsableVisitorToken, usableVisitorToken } from '@/services/visitorSession'

/**
 * 接口请求实例：前缀由 VITE_GLOB_API_URL 配置。
 * 普通接口 30 秒没有响应就按超时失败（服务端挂住时页面不会一直等，加载状态不会一直悬着）；
 * 上传不设超时（大文件在慢网下要很久），靠取消信号中止，见 utils/request 的 post
 */
export const REQUEST_TIMEOUT_MS = 30_000
/**
 * 要等第三方服务的接口（发验证码、第三方登录回调、取扫码登录的码、支付下单）：上游慢的时候可能超过 30 秒，
 * 前端先放弃的话一次性的授权码已经被用掉、订单可能已经建好，所以多等一会儿
 */
export const UPSTREAM_REQUEST_TIMEOUT_MS = 60_000

/** 请求在发起时绑定的身份代次与实际带上的凭证（见 utils/request 的 send 与 401 处理） */
export interface IdentityBoundConfig {
  identityEpoch?: number
  sentBearer?: string
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_GLOB_API_URL,
  timeout: REQUEST_TIMEOUT_MS,
  adapter: 'fetch',
})

// 每个请求带上站点来源与当前身份：已登录用户用登录令牌，否则用访客凭证。
// 没登录时先确保有可用的访客凭证（首次访问时等申请回来，本地判定过期的先换掉，最多等 5 秒），过期的凭证不发出去。
// 发起时绑定了身份代次的请求（utils/request 的 send），等待期间身份换了（登录、退出、换访客）就不发：
// 不能让旧身份发起的操作带着新身份出去
apiClient.interceptors.request.use(async config => {
  config.headers['X-Website-Domain'] = window.location.origin
  if (!currentUserToken()) await ensureUsableVisitorToken()
  const bound = config as typeof config & IdentityBoundConfig
  if (bound.identityEpoch !== undefined && bound.identityEpoch !== identityEpoch()) {
    throw new IdentityChangedError()
  }
  const userToken = currentUserToken()
  const bearer = userToken || usableVisitorToken()
  bound.sentBearer = bearer
  if (bearer) {
    config.headers.Authorization = `Bearer ${bearer}`
    if (!userToken) markVisitorTokenUsed(bearer)
  }
  return config
})

// 只把 200 / 201 视为成功，其余状态码一律按失败处理
apiClient.interceptors.response.use(response => {
  if (response.status === 200 || response.status === 201) return response
  throw new Error(String(response.status))
})
