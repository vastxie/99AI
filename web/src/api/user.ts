import { t } from '@/locales'
import { message } from '@/utils/message'
import type { ApiResponse } from '@/utils/request'
import { get, post } from '@/utils/request'
import { UPSTREAM_REQUEST_TIMEOUT_MS } from '@/utils/request/client'
import { sha256Hex } from '@/utils/sha256'

/** 发起授权的来源：内核用 pc_web / mobile_web，登录渠道包可传自己的来源名 */
export type OAuthSource = string

export interface OAuthUrlRequest {
  scene?: string
  source?: OAuthSource
  redirectPath?: string
}

export interface OAuthCallbackRequest {
  code: string
  state: string
}

/** GET /auth/providers 里的一条登录方式 */
export interface AuthProviderEntry {
  provider: string
  displayName: string
  type: 'captcha' | 'password' | 'qr' | 'oauth'
  scene?: string
  enabled?: boolean
  /** 账号密码方式：是否开放自助注册 */
  registerEnabled?: boolean
  /** 验证码方式：联系方式类型（决定输入框提示与账号页文案） */
  contactField?: 'email' | 'phone'
}

export interface AuthIdentityView {
  id: number
  provider: string
  scene?: string
  email?: string | null
  phone?: string | null
  nickname?: string | null
  avatar?: string | null
  status?: string
  boundAt?: string
  lastLoginAt?: string
}

export type CaptchaCodeScene = 'login' | 'reset'
export type QrScene = 'login' | 'bind'

export interface QrSceneCreated {
  sceneId: string
  qrUrl: string
  expiresIn: number
}

export type QrPollResult =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'failed'; message: string }
  | { status: 'confirmed'; token?: string; message?: string }

/* ---- 内核：登录方式 / 注册 / 身份 ---- */

export function fetchAuthProvidersAPI(): Promise<ApiResponse<AuthProviderEntry[]>> {
  return get<AuthProviderEntry[]>({ url: '/auth/providers' })
}

export function fetchRegisterAPI(
  data: {
    username: string
    password: string
    nickname?: string
  },
  options: { silentError?: boolean } = {}
): Promise<ApiResponse<string>> {
  return post<string>({ url: '/auth/register', data, ...options })
}

export function fetchAuthIdentitiesAPI(): Promise<ApiResponse<AuthIdentityView[]>> {
  return get<AuthIdentityView[]>({ url: '/auth/identities' })
}

export function fetchUnbindAuthIdentityAPI<T>(identityId: number): Promise<ApiResponse<T>> {
  return post<T>({ url: `/auth/identities/${identityId}/unbind` })
}

/* ---- 验证码类登录方式（邮箱 / 手机号……） ---- */

export function fetchCaptchaSendCodeAPI(
  data: {
    contact: string
    scene: CaptchaCodeScene
  },
  options: { silentError?: boolean } = {}
): Promise<ApiResponse<string>> {
  return post<string>({
    url: '/auth/captcha/send-code',
    data,
    timeout: UPSTREAM_REQUEST_TIMEOUT_MS,
    ...options,
  })
}

export function fetchCaptchaSendBindCodeAPI(
  data: { contact: string },
  options: { silentError?: boolean } = {}
): Promise<ApiResponse<string>> {
  return post<string>({
    url: '/auth/captcha/send-bind-code',
    data,
    timeout: UPSTREAM_REQUEST_TIMEOUT_MS,
    ...options,
  })
}

export function fetchCaptchaLoginAPI(
  data: {
    contact: string
    code: string
  },
  options: { silentError?: boolean } = {}
): Promise<ApiResponse<string>> {
  return post<string>({ url: '/auth/captcha/login', data, ...options })
}

export function fetchCaptchaBindAPI(
  data: {
    contact: string
    code: string
  },
  options: { silentError?: boolean } = {}
): Promise<ApiResponse<string>> {
  return post<string>({ url: '/auth/captcha/bind', data, ...options })
}

export function fetchCaptchaVerifyResetAPI(
  data: {
    contact: string
    code: string
  },
  options: { silentError?: boolean } = {}
): Promise<ApiResponse<{ resetToken: string }>> {
  return post<{ resetToken: string }>({ url: '/auth/captcha/verify-reset', data, ...options })
}

export function fetchResetPasswordAPI(
  data: {
    contact: string
    resetToken: string
    password: string
  },
  options: { silentError?: boolean } = {}
): Promise<ApiResponse<{ success: boolean }>> {
  return post<{ success: boolean }>({ url: '/auth/reset-password', data, ...options })
}

/* ---- OAuth 类登录方式 ---- */

/**
 * 发起授权的标签页密钥（防登录 CSRF）：发起时生成，只把摘要发给服务端存进 state；
 * 回调时按 state 从本标签页取出原文交给服务端核对。别人发来的回调地址在这个标签页里没有对应的密钥，会被拒绝。
 * 存在 sessionStorage：只属于当前标签页，跳到第三方再回来仍在（回调页必须与发起页同源）
 */
const OAUTH_SECRET_PREFIX = 'oauth:secret:'

/** 已经提示过原因的失败（调用方的 notifyError 不再提示），不跳转 */
function oauthStartError(reason: string): Error {
  message().error(reason)
  return Object.assign(new Error(reason), { notified: true })
}

/** 能写入的 sessionStorage；浏览器禁用了存储时提示并失败（跳过去也带不回密钥，登录一定失败） */
function oauthSecretStorage(): Storage {
  try {
    const storage = window.sessionStorage
    const probe = `${OAUTH_SECRET_PREFIX}probe`
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    throw oauthStartError(t('login.oauthStorageUnavailable'))
  }
}

/** 32 字节随机数的 base64url（43 位） */
function createOAuthBrowserSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** 授权响应里的 state：授权地址（字符串，或对象的 url / authUrl）取查询参数，对象取 state 字段 */
export function oauthStateOf(data: unknown): string {
  if (typeof data === 'string') {
    try {
      return new URL(data, window.location.origin).searchParams.get('state') || ''
    } catch {
      return ''
    }
  }
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>
    if (typeof payload.state === 'string') return payload.state
    if (typeof payload.url === 'string') return oauthStateOf(payload.url)
    if (typeof payload.authUrl === 'string') return oauthStateOf(payload.authUrl)
  }
  return ''
}

/**
 * 取授权地址：请求带上密钥摘要 browserProof，成功后按 state 存下密钥。
 * 存储不可用、响应里取不到 state 时提示并抛出（不能跳转：回来也登录不了）
 */
export async function fetchOAuthUrlAPI<T>(
  provider: string,
  data: OAuthUrlRequest = {}
): Promise<ApiResponse<T>> {
  const storage = oauthSecretStorage()
  const secret = createOAuthBrowserSecret()
  const res: ApiResponse<T> = await post<T>({
    url: `/auth/oauth/${provider}/url`,
    data: { ...data, browserProof: sha256Hex(secret) },
  })
  if (!res.success) return res
  const state = oauthStateOf(res.data)
  if (!state) throw oauthStartError(t('login.oauthFailed'))
  try {
    storage.setItem(`${OAUTH_SECRET_PREFIX}${state}`, secret)
  } catch {
    throw oauthStartError(t('login.oauthStorageUnavailable'))
  }
  return res
}

/** 取出并删除这个 state 的密钥（只用一次）；读不到时为空，由服务端拒绝 */
function takeOAuthBrowserSecret(state: string): string {
  const key = `${OAUTH_SECRET_PREFIX}${state}`
  let secret = ''
  try {
    secret = window.sessionStorage.getItem(key) || ''
  } catch {}
  try {
    window.sessionStorage.removeItem(key)
  } catch {}
  return secret
}

export function fetchOAuthCallbackAPI<T>(
  provider: string,
  data: OAuthCallbackRequest
): Promise<ApiResponse<T>> {
  const browserSecret = data.state ? takeOAuthBrowserSecret(data.state) : ''
  return post<T>({
    url: `/auth/oauth/${provider}/callback`,
    data: { ...data, browserSecret },
    timeout: UPSTREAM_REQUEST_TIMEOUT_MS,
  })
}

/* ---- 扫码类登录方式 ---- */

/* 取码与轮询的失败都显示在二维码卡片上（useQrScanFlow），请求层不另弹提示；轮询每隔一两秒一次，弹了会一直挂着 */

export function fetchQrSceneAPI(
  provider: string,
  data: { scene: QrScene }
): Promise<ApiResponse<QrSceneCreated>> {
  return post<QrSceneCreated>({
    url: `/auth/qr/${provider}/scene`,
    data,
    silentError: true,
    timeout: UPSTREAM_REQUEST_TIMEOUT_MS,
  })
}

export function fetchQrPollAPI(
  provider: string,
  data: { sceneId: string; scene: QrScene }
): Promise<ApiResponse<QrPollResult>> {
  return post<QrPollResult>({ url: `/auth/qr/${provider}/poll`, data, silentError: true })
}
