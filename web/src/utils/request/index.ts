import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import { t } from '@/locales'
import {
  currentUserToken,
  identityEpoch,
  IdentityChangedError,
  isIdentityChanged,
} from '@/services/identity'
import { replaceVisitorCredential } from '@/services/visitorSession'
import { useAuthStore } from '@/store/modules/auth'
import { message } from '@/utils/message'
import { apiClient, type IdentityBoundConfig } from './client'

/** 服务端统一响应 `{ code, data, success, message }` */
export interface ApiResponse<T = any> {
  code?: number
  data: T
  success: boolean
  message: string
  status: string
}

export interface RequestOptions {
  url: string
  data?: any
  headers?: Record<string, string>
  /** 失败时不弹出错误提示，交给调用方处理 */
  silentError?: boolean
  /** 取消请求（如移除还在上传的附件、离开页面）；被取消的请求不提示 */
  signal?: AbortSignal
  /** 超时（毫秒）；不传时普通接口 30 秒、上传不限时；0 表示不限时 */
  timeout?: number
  /** 上传进度（0–1）；需要进度时请求改走 XHR（fetch 适配器拿不到上传进度） */
  onUploadProgress?: (ratio: number) => void
}

type SendConfig = AxiosRequestConfig & IdentityBoundConfig & { visitorRetried?: boolean }
/** notified：请求层已经把原因提示给用户，调用方不要再提示一次（见 utils/message 的 notifyError） */
type RequestError = Error & { code?: string | number; status?: number; notified?: boolean }

/** 首页加载时就会请求的接口：未登录时返回 401 属于正常情况，不弹登录提示 */
const QUIET_UNAUTHORIZED_PATHS = ['/chatlog/chatList', '/group/query']
/** 并发请求同时 401 时，登录提示在这个间隔内只弹一次 */
const LOGIN_PROMPT_INTERVAL_MS = 3000
let lastUnauthorizedAt = 0

/** 保留服务端的业务码与 HTTP 状态，业务流程按 code 分支；不把整份响应体复制进错误对象 */
function toRequestError(
  error: AxiosError | undefined,
  body: any,
  status: number | undefined,
  notified: boolean
): RequestError {
  // 超时：给用户看的是「连接超时」，不是请求库的英文原文
  const timedOut = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT'
  const requestError: RequestError = new Error(
    body?.message ||
      (timedOut ? t('common.connectionTimeout') : '') ||
      error?.message ||
      t('common.requestError')
  )
  if (body?.code !== undefined) requestError.code = body.code
  if (status !== undefined) requestError.status = status
  if (notified) requestError.notified = true
  return requestError
}

/**
 * 提示登录：原来已登录（会话过期）时不论哪个接口都提示，否则用户会看到会话列表被清空却不知道为什么；
 * 访客访问首页时的静默接口不打扰。返回是否提示过。
 * url 取自请求配置：fetch 适配器下 error.request 是 Request 对象，没有 responseURL。
 */
function promptLogin(url: string, sessionExpired: boolean, serverMessage?: string): boolean {
  const auth = useAuthStore()
  const quiet = !sessionExpired && QUIET_UNAUTHORIZED_PATHS.some(path => url.includes(path))
  if (!quiet) {
    if (auth.loadInit) auth.setLoginDialog(true)
    if (Date.now() - lastUnauthorizedAt > LOGIN_PROMPT_INTERVAL_MS) {
      message().error(
        sessionExpired ? t('common.sessionExpired') : serverMessage || t('common.loginRequired')
      )
    }
  }
  lastUnauthorizedAt = Date.now()
  return !quiet
}

/**
 * 401（HTTP 401 与业务码 401 同样处理，不整页刷新），按请求发起时的身份判断：
 * - 发起后身份已经换了：这个 401 属于已经结束的身份，不动当前会话，静默作废；
 * - 以登录令牌发出：会话过期，清掉令牌并提示重新登录；
 * - 以访客凭证发出（或没带凭证）：换一张访客凭证（申请失败保留原凭证）。换掉的是本页在用的身份时，
 *   旧身份发起的这个请求不重放（由 store/initStores.ts 按新身份重新加载）；只是建立身份时用新凭证重试一次。
 * makeError 生成最终抛出的错误（notified 表示已经提示过）
 */
async function onUnauthorized<T>(
  config: SendConfig,
  sentBearer: string,
  serverMessage: string | undefined,
  makeError: (notified: boolean) => unknown,
  silentError: boolean
): Promise<ApiResponse<T>> {
  if (config.identityEpoch !== identityEpoch()) throw new IdentityChangedError()
  const url = config.url ?? ''
  if (sentBearer && sentBearer === currentUserToken()) {
    useAuthStore().removeToken()
    throw makeError(promptLogin(url, true))
  }
  if (!config.visitorRetried) {
    try {
      await replaceVisitorCredential(sentBearer)
    } catch {
      // 等换签期间身份已经换了（登录、退出）：这个 401 属于旧身份，静默作废
      if (config.identityEpoch !== identityEpoch()) throw new IdentityChangedError()
      // 申请不到新凭证：保留原凭证，按普通失败处理
      throw makeError(promptLogin(url, false, serverMessage))
    }
    // 换掉的是在用的身份时代次已变：重试经过拦截器，按发起时的代次中止（IDENTITY_CHANGED），不会重放
    config.visitorRetried = true
    return send<T>(config, silentError)
  }
  throw makeError(promptLogin(url, false, serverMessage))
}

async function send<T>(config: SendConfig, silentError: boolean): Promise<ApiResponse<T>> {
  // 发起时绑定身份代次：拦截器等待期间、401 时都按它判断（重试沿用）
  if (config.identityEpoch === undefined) config.identityEpoch = identityEpoch()
  let response: AxiosResponse<ApiResponse<T>>
  try {
    response = await apiClient.request<ApiResponse<T>>(config)
  } catch (error) {
    return recover<T>(error as AxiosError<any>, config, silentError)
  }
  // 业务码 2xx 或没有业务码视为成功
  const body = response.data
  const code = body?.code
  if (!code || (code >= 200 && code < 300)) return body
  if (code === 401) {
    const sentBearer = (response.config as SendConfig | undefined)?.sentBearer ?? ''
    // 已经提示过：标上 notified，调用方的 notifyError 不再提示一次
    return onUnauthorized<T>(
      config,
      sentBearer,
      body?.message,
      notified => (notified ? Object.assign(body, { notified: true }) : body),
      silentError
    )
  }
  throw body
}

/** 请求失败：401 按身份处理；其余情况提示后抛出带业务码的错误 */
async function recover<T>(
  error: AxiosError<any>,
  config: SendConfig,
  silentError: boolean
): Promise<ApiResponse<T>> {
  // 调用方主动取消、身份已经换了（拦截器没发出）：原样抛出，不提示、不当成失败
  if (isRequestCancelled(error) || isIdentityChanged(error)) throw error
  const status = error.response?.status
  const body = error.response?.data || ''

  if (status === 401) {
    const sentBearer = (error.config as SendConfig | undefined)?.sentBearer ?? ''
    return onUnauthorized<T>(
      config,
      sentBearer,
      error.response?.data?.message,
      notified => toRequestError(error, body, status, notified),
      silentError
    )
  }
  if (!silentError && body && !body.success) {
    message().error(body.message || t('common.requestError'))
    throw toRequestError(error, body, status, true)
  }
  throw toRequestError(error, body, status, false)
}

export function get<T = any>({
  url,
  data,
  silentError = false,
  signal,
  timeout,
}: RequestOptions): Promise<any> {
  return send<T>(
    {
      method: 'GET',
      url,
      params: data ?? {},
      signal,
      ...(timeout === undefined ? {} : { timeout }),
    },
    silentError
  )
}

export function post<T = any>({
  url,
  data,
  headers,
  silentError = false,
  signal,
  timeout,
  onUploadProgress,
}: RequestOptions): Promise<any> {
  return send<T>(
    {
      method: 'POST',
      url,
      data: data ?? {},
      headers,
      signal,
      // 上传（带进度的请求）默认不限时：靠取消信号中止
      ...(timeout !== undefined ? { timeout } : onUploadProgress ? { timeout: 0 } : {}),
      ...(onUploadProgress
        ? {
            adapter: 'xhr',
            onUploadProgress: event => {
              if (event.total) onUploadProgress(Math.min(1, event.loaded / event.total))
            },
          }
        : {}),
    },
    silentError
  )
}

/** 请求是被调用方主动取消的（不是失败） */
export function isRequestCancelled(error: unknown) {
  const name = (error as { name?: string } | null)?.name
  return name === 'CanceledError' || name === 'AbortError'
}
