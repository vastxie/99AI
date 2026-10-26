import { eventBus } from '@/core/events/eventBus'
import {
  anonymousDeviceId,
  currentVisitorToken,
  isVisitorIdentityInUse,
  setVisitorToken,
} from './identity'

const API_URL = import.meta.env.VITE_GLOB_API_URL || ''
const TOKEN_EXPIRY_LEEWAY_SECONDS = 60
const VISITOR_TOKEN_TIMEOUT_MS = 10_000
/** 自动更换访客身份的上限：这段时间内最多这么多次，超过就暂停，免得新凭证也被拒时反复更换 */
const REPLACEMENT_WINDOW_MS = 60_000
const MAX_REPLACEMENTS_IN_WINDOW = 2

let visitorTokenRequest: Promise<string> | null = null
const recentReplacements: number[] = []
let recoveryPausedUntil = 0

function getApiUrl(path: string): string {
  return `${API_URL}${path}`
}

function parseJwtPayload(token: string): Record<string, any> | null {
  const payload = token.split('.')[1]
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    return JSON.parse(window.atob(padded))
  } catch {
    return null
  }
}

function isVisitorTokenExpired(token: string): boolean {
  const payload = parseJwtPayload(token)
  const exp = Number(payload?.exp)
  if (!Number.isFinite(exp)) return false
  return exp <= Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_LEEWAY_SECONDS
}

/** 可以带出去的访客凭证：存在且本地没判定过期；过期的不再发给服务端 */
export function usableVisitorToken(): string {
  const token = currentVisitorToken()
  return token && !isVisitorTokenExpired(token) ? token : ''
}

/** 向服务端申请一张新的访客凭证（并发调用共用一次申请）；只返回凭证，不写入 */
function requestVisitorToken(): Promise<string> {
  if (visitorTokenRequest) return visitorTokenRequest

  visitorTokenRequest = fetch(getApiUrl('/auth/visitor-session'), {
    method: 'POST',
    // 服务端挂住时不让启动（实时连接、模型列表、扩展包的启动钩子）一直等
    signal: AbortSignal.timeout(VISITOR_TOKEN_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deviceId: anonymousDeviceId(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
    }),
  })
    .then(async response => {
      if (!response.ok) throw new Error(response.status.toString())

      const payload = await response.json()
      const token = typeof payload?.data === 'string' ? payload.data : ''
      if (!token) throw new Error('visitor token missing')
      return token
    })
    .finally(() => {
      visitorTokenRequest = null
    })

  return visitorTokenRequest
}

/** 自动恢复暂停中（更换太频繁）：抛这个错误，调用方按普通失败处理 */
export class VisitorRecoveryPausedError extends Error {
  readonly code = 'VISITOR_RECOVERY_PAUSED'
  constructor() {
    super('visitor recovery paused')
  }
}

/**
 * 换掉在用身份的频率上限：最近一段时间内已经换过这么多次就暂停（新凭证也被拒时不反复更换）。
 * 只有真正换掉在用身份的那次才计数；申请失败（断网、服务暂时故障）不占额度
 */
function assertReplacementAllowed(replacingUsedIdentity: boolean) {
  if (!replacingUsedIdentity) return
  const now = Date.now()
  if (now < recoveryPausedUntil) throw new VisitorRecoveryPausedError()
  while (recentReplacements.length && now - recentReplacements[0] > REPLACEMENT_WINDOW_MS) {
    recentReplacements.shift()
  }
  if (recentReplacements.length >= MAX_REPLACEMENTS_IN_WINDOW) {
    recoveryPausedUntil = now + REPLACEMENT_WINDOW_MS
    recentReplacements.length = 0
    eventBus.emit('auth:visitorRecoveryPaused')
    throw new VisitorRecoveryPausedError()
  }
}

/**
 * 访客凭证的唯一替换入口（服务端拒绝了它、本地判定过期、强制刷新、实时连接被拒都走这里）：
 * - rejected 已经不是当前凭证（别处已经换好）：直接返回当前的，不再申请；
 * - 先申请、成功才替换，申请失败保留原凭证（它可能仍然有效，例如只是网络或服务暂时故障）；
 * - 换掉的是本页用过的凭证时算换了身份（代次加一），发 auth:visitorChanged，由 store/initStores.ts 统一收尾；
 *   这类替换有频率上限，超过就暂停自动恢复。
 */
export async function replaceVisitorCredential(rejected: string): Promise<string> {
  if (rejected !== currentVisitorToken()) return currentVisitorToken()
  assertReplacementAllowed(isVisitorIdentityInUse(rejected))
  // 并发的替换共用同一次申请；第一个落地的写入，其余看到凭证已换就直接用它（只计一次额度）
  const token = await requestVisitorToken()
  // 等待期间别处已经换好：以那张为准
  if (rejected !== currentVisitorToken()) return currentVisitorToken()
  if (setVisitorToken(token)) {
    recentReplacements.push(Date.now())
    eventBus.emit('auth:visitorChanged')
  }
  return token
}

/** 等正在申请的访客凭证最多这么久：申请卡住时请求照常发出（没带身份会被拒，由请求层按 401 处理） */
const PENDING_VISITOR_TOKEN_WAIT_MS = 5000

async function waitAtMost<T>(promise: Promise<T>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    promise.then(
      () => undefined,
      () => undefined
    ),
    new Promise<void>(resolve => {
      timer = setTimeout(resolve, PENDING_VISITOR_TOKEN_WAIT_MS)
    }),
  ])
  clearTimeout(timer)
}

/**
 * 等正在申请的访客凭证回来（最多 5 秒）：首次访问时 App 启动就去申请，页面同时发出的请求
 * （如会话列表）等它回来再带上凭证，不然这一批都会因为没带身份被拒。没在申请、申请失败都立即返回
 */
export async function settleVisitorTokenRequest(): Promise<void> {
  const pending = visitorTokenRequest
  if (!pending) return
  await waitAtMost(pending)
}

/** 没有可用的访客凭证时先去拿一张，最多等 5 秒；拿不到也返回（请求不带过期的凭证发出） */
export async function ensureUsableVisitorToken(): Promise<void> {
  if (usableVisitorToken()) {
    await settleVisitorTokenRequest()
    return
  }
  await waitAtMost(ensureVisitorToken())
}

/** 确保有可用的访客凭证：没有就申请，本地判定过期就替换（失败保留原凭证）；forceRefresh 时一律替换 */
export async function ensureVisitorToken(
  options: { forceRefresh?: boolean } = {}
): Promise<string> {
  const existing = currentVisitorToken()
  if (!options.forceRefresh && existing && !isVisitorTokenExpired(existing)) return existing
  return replaceVisitorCredential(existing)
}
