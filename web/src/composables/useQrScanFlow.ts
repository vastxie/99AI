import { onBeforeUnmount, ref, watch } from 'vue'
import { t } from '@/locales'
import { identityEpoch, isIdentityChanged } from '@/services/identity'

export interface QrTicket {
  id: string
  qrUrl: string
  /** 服务端给的有效期（秒）；前端最多轮询 maxSeconds */
  expiresIn?: number
  /** 取码时的身份代次（流程填写）：身份换了这张码作废；扫码登录确认时按它提交登录（见 auth store 的 commitLogin） */
  identityEpoch?: number
}

export type QrScanStatus =
  | { status: 'pending' }
  | { status: 'scanned' }
  | { status: 'expired' }
  | { status: 'failed'; message?: string }
  | { status: 'confirmed'; [key: string]: unknown }

export type QrScanPhase =
  'idle' | 'loading' | 'waiting' | 'scanned' | 'confirming' | 'done' | 'expired' | 'failed'

/**
 * 查询失败默认怎么算（返回 null 表示一时的，继续轮询；返回字符串表示停下，并显示这个原因）：
 * 没有 HTTP 状态（断网、超时）继续轮询；401 请求层已经提示过登录，停下、不再给原因；
 * 5xx 网关返回的正文不采信，用 fallback；其它 4xx（码失效、会话不存在）用服务端给的原因
 */
export function qrPollFailureReason(error: unknown, fallback: string): string | null {
  if (!error || typeof error !== 'object') return null
  const { status, message } = error as { status?: unknown; message?: unknown }
  if (typeof status !== 'number') return null
  if (status === 401) return ''
  if (status >= 500) return fallback
  const text = typeof message === 'string' ? message.trim() : ''
  return text || fallback
}

/**
 * 扫码流程：取一张二维码 → 定时查状态 → 扫码确认后收尾（登录、确认绑定）。
 * 超过有效期、服务端说过期或失败时停下，等用户刷新；每次刷新都换一个请求序号，
 * 旧二维码迟到的响应一律丢掉。active 变为 false（面板收起、弹窗关闭）或卸载时停止并清空。
 * 查询出错按 isTerminalError 判定（默认 qrPollFailureReason）：一时的继续轮询，终态停下并显示原因。
 * 只在等待扫码、已扫码时接收查询结果：本地判定过期之后迟到的结果不再改状态，确认只收尾一次。
 * 每张码绑定取码时的身份：轮询发出前与收到结果后都核对，身份换了（登录、退出、换访客）就作废这张码、
 * 显示已过期（点击刷新）；各步抛出的「身份已变化」同样按过期处理，不显示失败原因。
 */
export function useQrScanFlow(options: {
  load: () => Promise<QrTicket>
  poll: (ticket: QrTicket) => Promise<QrScanStatus | null>
  onConfirmed: (
    result: Extract<QrScanStatus, { status: 'confirmed' }>,
    ticket: QrTicket
  ) => Promise<void> | void
  active: () => boolean
  intervalMs?: number
  maxSeconds?: number
  isTerminalError?: (error: unknown) => string | null
}) {
  const intervalMs = options.intervalMs ?? 1500
  const maxSeconds = options.maxSeconds ?? 120
  const qrUrl = ref('')
  const phase = ref<QrScanPhase>('idle')
  const message = ref('')
  let ticket: QrTicket | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  let startedAt = 0
  let requestId = 0
  /**
   * 还没回来的那次查询属于哪张码（请求序号）：同一张码这一拍跳过，慢网或长轮询下请求不会越堆越多；
   * 刷新换码后新码照常查询，不等旧码的请求
   */
  let checkingFor = 0
  const terminalReason =
    options.isTerminalError ?? (error => qrPollFailureReason(error, t('common.requestError')))

  function stopPolling() {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  function reset() {
    requestId += 1
    stopPolling()
    ticket = null
    qrUrl.value = ''
    phase.value = 'idle'
    message.value = ''
  }

  function finish(next: QrScanPhase, reason = '') {
    stopPolling()
    phase.value = next
    message.value = reason
  }

  /** 还在等扫码结果：之后的阶段（过期、失败、收尾中、完成）不再接收查询结果 */
  const isPolling = () => phase.value === 'waiting' || phase.value === 'scanned'
  const identityChangedFor = (active: QrTicket) => identityEpoch() !== active.identityEpoch

  /** 身份换了：这张码作废，旧码迟到的结果一律丢掉 */
  function expireForIdentity() {
    requestId += 1
    finish('expired')
  }

  async function checkOnce(current: number, active: QrTicket) {
    if (checkingFor === current) return
    if (identityChangedFor(active)) return expireForIdentity()
    checkingFor = current
    let result: QrScanStatus | null
    try {
      result = await options.poll(active)
    } catch (error) {
      if (current !== requestId || !isPolling()) return
      if (isIdentityChanged(error) || identityChangedFor(active)) return expireForIdentity()
      const reason = terminalReason(error)
      if (reason !== null) finish('failed', reason)
      return
    } finally {
      if (checkingFor === current) checkingFor = 0
    }
    if (current !== requestId || !isPolling()) return
    if (identityChangedFor(active)) return expireForIdentity()
    if (!result) return
    if (result.status === 'scanned') {
      phase.value = 'scanned'
      return
    }
    if (result.status === 'expired') return finish('expired')
    if (result.status === 'failed') return finish('failed', result.message || '')
    if (result.status !== 'confirmed') return
    stopPolling()
    phase.value = 'confirming'
    try {
      await options.onConfirmed(result, active)
      if (current === requestId) phase.value = 'done'
    } catch (error) {
      if (current !== requestId) return
      if (isIdentityChanged(error)) return expireForIdentity()
      finish('failed', terminalReason(error) ?? ((error as Error)?.message || ''))
    }
  }

  async function refresh() {
    const current = ++requestId
    stopPolling()
    ticket = null
    qrUrl.value = ''
    message.value = ''
    phase.value = 'loading'
    const epoch = identityEpoch()
    try {
      const loaded = await options.load()
      if (current !== requestId || !options.active()) return
      if (identityEpoch() !== epoch) return expireForIdentity()
      const next: QrTicket = { ...loaded, identityEpoch: epoch }
      ticket = next
      qrUrl.value = next.qrUrl
      phase.value = 'waiting'
      startedAt = Date.now()
      const limit = Math.min(Number(next.expiresIn) || maxSeconds, maxSeconds) * 1000
      timer = setInterval(() => {
        if (Date.now() - startedAt > limit) {
          finish('expired')
          return
        }
        if (ticket) void checkOnce(current, ticket)
      }, intervalMs)
    } catch (error) {
      if (current !== requestId) return
      if (isIdentityChanged(error)) return expireForIdentity()
      finish('failed', (error as Error)?.message || '')
    }
  }

  watch(
    () => options.active(),
    active => {
      if (active) void refresh()
      else reset()
    },
    { immediate: true }
  )
  onBeforeUnmount(reset)

  return { qrUrl, phase, message, refresh }
}
