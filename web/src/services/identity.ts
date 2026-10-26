import { ref, watch } from 'vue'
import { refreshFileAccessCookie, registerFileAccessCredential } from '@/utils/fileAccessCookie'
import { localStore } from '@/utils/storage'

/**
 * 请求身份的唯一来源：登录令牌、访客令牌、匿名设备标识与身份代次。
 *
 * 内存为准，本地存储只做持久化：存储不可用时本次会话照常使用内存里的凭证，刷新后才会丢。
 * 存储键沿用既有键名（已登录用户升级后不掉线）。页面脚本读得到这些令牌，前端加密挡不住 XSS，所以不加密。
 *
 * 身份代次（epoch）在「请求实际使用的身份」换成另一个时加一：
 * - 登录令牌换成另一个、被清掉（登录、换号、退出、过期）；
 * - 未登录时，本页用过的访客凭证被另一张替换（服务端每次签发的访客都是新的 uid）。
 * 从没有可用凭证到拿到第一张只是建立身份，不加代次：等它的请求照常带上新凭证发出。
 * 发起时记下代次的操作（请求、资料加载、登录、建会话……），回来时代次变了就说明身份已经换了，结果作废。
 */

const USER_TOKEN_KEY = 'SECRET_TOKEN'
const VISITOR_TOKEN_KEY = 'VISITOR_SESSION_TOKEN'
const ANONYMOUS_DEVICE_ID_KEY = 'ANONYMOUS_DEVICE_ID'

const userToken = ref<string | undefined>(localStore.get<string>(USER_TOKEN_KEY) || undefined)
const visitorToken = ref<string>(localStore.get<string>(VISITOR_TOKEN_KEY) || '')
const epoch = ref(0)
let deviceId = ''
/** 内存里当前的登录令牌是否已确认在存储里；没有令牌时为 true（不需要提示） */
let userTokenPersisted = true
/** 本页带出去过的访客凭证（请求头、实时连接）：替换掉它才算换了身份 */
const usedVisitorTokens = new Set<string>()

/** 登录令牌优先，其次访客令牌 */
export function currentBearer(): string {
  return userToken.value || visitorToken.value || ''
}

registerFileAccessCredential(currentBearer)

/** cookie 写不进去（跨站部署、被禁用）不影响内存里的凭证：媒体渲染会回落到带鉴权的取数 */
function syncCookie() {
  try {
    refreshFileAccessCookie()
  } catch {
    // 忽略
  }
}

export function identityEpoch(): number {
  return epoch.value
}

/** 身份代次变化时同步回调（实时连接用它立即结束在途的连接等待与回执）；返回取消函数 */
export function onIdentityEpochChange(listener: () => void): () => void {
  return watch(epoch, () => listener(), { flush: 'sync' })
}

export function currentUserToken(): string | undefined {
  return userToken.value
}

/** 内存里当前的登录令牌是否已确认在存储里（不在时刷新后会回到未登录） */
export function isUserTokenPersisted(): boolean {
  return userTokenPersisted
}

export function currentVisitorToken(): string {
  return visitorToken.value
}

/** 换上登录令牌；与原来的不同才算换身份（代次加一）。返回是否换了 */
export function setUserToken(token: string): boolean {
  const changed = token !== userToken.value
  userToken.value = token
  // 写失败时回读：存储里已经是这个令牌（例如同一令牌重复写入）也算已保存
  userTokenPersisted =
    localStore.set(USER_TOKEN_KEY, token) || localStore.get<string>(USER_TOKEN_KEY) === token
  if (changed) epoch.value += 1
  syncCookie()
  return changed
}

/** 清掉登录令牌（退出、过期）；原来有才算换身份 */
export function clearUserToken() {
  const had = Boolean(userToken.value)
  userToken.value = undefined
  userTokenPersisted = true
  localStore.remove(USER_TOKEN_KEY)
  if (had) epoch.value += 1
  syncCookie()
}

/** 登记本页带出去过的访客凭证（请求拦截器、实时连接） */
export function markVisitorTokenUsed(token: string) {
  if (token) usedVisitorTokens.add(token)
}

/** 替换这张访客凭证会不会换掉本页正在用的身份（未登录且本页带出去过） */
export function isVisitorIdentityInUse(token: string): boolean {
  return !userToken.value && Boolean(token) && usedVisitorTokens.has(token)
}

/**
 * 写入访客凭证。未登录且换掉的是本页用过的那张时才算换身份（代次加一），返回是否换了身份；
 * 首次拿到、或替换本页没用过的（启动时存着的已过期）只是建立身份
 */
export function setVisitorToken(token: string): boolean {
  if (!token) return false
  const previous = visitorToken.value
  visitorToken.value = token
  localStore.set(VISITOR_TOKEN_KEY, token)
  const changed = previous !== token && isVisitorIdentityInUse(previous)
  if (changed) epoch.value += 1
  syncCookie()
  return changed
}

/** 去掉访客凭证（本地判定已过期、不可再用）：不算换身份，接下来的替换按 setVisitorToken 的规则判断 */
export function clearVisitorToken() {
  visitorToken.value = ''
  localStore.remove(VISITOR_TOKEN_KEY)
  syncCookie()
}

function createAnonymousDeviceId(): string {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  if (window.crypto?.getRandomValues) {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** 匿名设备标识：内存为准，第一次生成后写存储（写不进也照用） */
export function anonymousDeviceId(): string {
  if (deviceId) return deviceId
  const stored = localStore.get<string>(ANONYMOUS_DEVICE_ID_KEY)
  deviceId = stored || createAnonymousDeviceId()
  if (!stored) localStore.set(ANONYMOUS_DEVICE_ID_KEY, deviceId)
  return deviceId
}

/** 身份已经换了：发起时的操作作废，调用方静默结束（不提示、不重试、不回退、不写状态） */
export const IDENTITY_CHANGED = 'IDENTITY_CHANGED'

export class IdentityChangedError extends Error {
  readonly code = IDENTITY_CHANGED
  /** 请求层与 notifyError 的约定：已经处理过，不要再提示 */
  readonly notified = true
  constructor() {
    super('identity changed')
  }
}

export function isIdentityChanged(error: unknown): boolean {
  return Boolean(error) && (error as { code?: unknown }).code === IDENTITY_CHANGED
}
