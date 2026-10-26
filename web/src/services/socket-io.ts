import { io, Socket } from 'socket.io-client'
import { t } from '@/locales'
import {
  currentUserToken,
  IDENTITY_CHANGED,
  IdentityChangedError,
  identityEpoch,
  markVisitorTokenUsed,
  onIdentityEpochChange,
} from './identity'
import { ensureVisitorToken, usableVisitorToken } from './visitorSession'

const API_URL = import.meta.env.VITE_GLOB_API_URL || ''

const CONNECT_TIMEOUT = 10000
const EMIT_ACK_TIMEOUT = 10000

/** 服务端主动断开后的身份核对：退避间隔（之后保持最后一档） */
const AUTH_PROBE_DELAYS_MS = [2000, 5000, 15000, 30000]
/** 连续这么多次没能恢复（核对失败，或重连后很快又被断开）就暂停 */
const AUTH_PROBE_MAX_ATTEMPTS = 10
const AUTH_PROBE_PAUSE_MS = 5 * 60_000
/** 连接保持这么久才算恢复稳定，计数清零 */
const STABLE_CONNECTION_MS = 30_000
/** 暂停期间的唤醒（联网、页面可见、发送）：这段时间内的多次唤醒合并成一次尝试 */
const AUTH_PROBE_WAKE_MERGE_MS = 10_000

/** 一次身份核对任务：绑定发起时的 socket 实例与身份代次，任一变化就交给新的连接 / 统一恢复，自己结束 */
interface AuthProbeTask {
  socket: Socket
  epoch: number
  timer?: ReturnType<typeof setTimeout>
  running: boolean
}

/** 一次连接等待：属于发起它的操作（身份代次、截止时间），不绑定具体的 socket 实例 */
interface ConnectWaiter {
  epoch: number
  resolve: (socket: Socket) => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

export interface SocketAck<T = unknown> {
  ok: boolean
  code?: string
  message?: string
  data?: T
}

/** 身份已经变了：调用方静默结束（不提示、不重发、不回退） */
const identityChangedAck = <T>(): SocketAck<T> => ({ ok: false, code: IDENTITY_CHANGED })

function getSocketIOPath(): string {
  try {
    const url = new URL(API_URL, window.location.origin)
    const pathname = url.pathname.replace(/\/$/, '')
    return `${pathname}/socket.io`
  } catch {
    return '/socket.io'
  }
}

function getSocketOrigin(): string {
  try {
    const url = new URL(API_URL, window.location.origin)
    return url.origin
  } catch {
    return window.location.origin
  }
}

class SocketService {
  private socket: Socket | null = null
  /** 建当前 socket 时用的凭证：相同就复用（正在连、自动重连中也复用），不同才重建 */
  private socketToken = ''
  private listeners: Map<string, Set<(data: any) => void>> = new Map()
  /** 在途的连接等待：当前 socket 连上时一起放行，身份代次变化时立即以 IDENTITY_CHANGED 结束 */
  private waiters = new Set<ConnectWaiter>()
  private authProbe: AuthProbeTask | null = null
  /** 连续没能恢复的次数：连接保持 STABLE_CONNECTION_MS 以上才清零 */
  private authProbeFailures = 0
  private authProbePausedUntil = 0
  private lastAuthProbeWakeAt = 0
  private stableTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    // 身份变了：在途的连接等待立即结束，不等超时（回执等待在 emitWithAck 里各自监听）
    onIdentityEpochChange(() => this.rejectWaiters(() => new IdentityChangedError()))
    if (typeof window === 'undefined') return
    window.addEventListener('online', () => this.wakeAuthProbe())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.wakeAuthProbe()
    })
  }

  get connected(): boolean {
    return this.socket?.connected ?? false
  }

  /** 已经开始连接（连上了或正在连）：页面刚打开、还没开始连时不算断开 */
  get started(): boolean {
    return this.socket !== null
  }

  /** 连接用的凭证：登录令牌优先，其次可用的访客凭证（登记为本页用过） */
  private currentToken(): string {
    const userToken = currentUserToken()
    const token = userToken || usableVisitorToken()
    if (token && !userToken) markVisitorTokenUsed(token)
    return token
  }

  /**
   * 当前凭证的连接：凭证与当前 socket 相同就复用（已连上、正在连、自动重连中都算；被服务端拒绝或断开后
   * 由身份核对任务负责重连，发送路径上不反复重建）；凭证变了才拆掉重建
   */
  connect(): Socket {
    const token = this.currentToken()
    if (this.socket && this.socketToken === token) return this.socket

    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
    this.cancelAuthProbe()
    this.clearStableTimer()

    const socket = io(getSocketOrigin(), {
      path: getSocketIOPath(),
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    })
    this.socket = socket
    this.socketToken = token

    socket.on('connect', () => {
      this.handleConnected(socket)
      this.dispatchInternal('socket:connected')
      this.resolveWaiters(socket)
    })

    socket.on('disconnect', reason => {
      this.clearStableTimer()
      this.dispatchInternal('socket:disconnected')
      // 服务端主动断开（鉴权路径上判定身份无效，或暂时无法验证）：客户端不会自己重连，先核对身份再连
      if (reason === 'io server disconnect') this.handleServerDisconnect(socket)
    })

    // 断网、传输失败（socket 仍在重试）：交给 socket.io 自己重连，凭证不动，等待者继续等。
    // 握手被服务端拒绝（鉴权失败，socket.io 不会自己重连）：等待者以连接失败结束，与服务端断开同样先用 HTTP 核对身份
    socket.on('connect_error', () => {
      this.dispatchInternal('socket:connect_error')
      if (socket.active || this.socket !== socket) return
      this.rejectWaiters(() => new Error(t('common.connectionFailed')))
      this.handleServerDisconnect(socket)
    })

    socket.on('agent:event', (event: any) => {
      const handlers = this.listeners.get('agent:event')
      if (handlers) {
        handlers.forEach(handler => handler(event))
      }
    })

    socket.on('chat:sync', (event: any) => {
      const handlers = this.listeners.get('chat:sync')
      if (handlers) {
        handlers.forEach(handler => handler(event))
      }
    })

    return socket
  }

  /**
   * 等 epoch 这个身份的连接就绪，截止时间属于发起的操作（重新等待时沿用，不重置）。
   * 失败出口由调用方按身份代次判断（变了就是 IDENTITY_CHANGED，不报连接失败）
   */
  private async waitForConnection(epoch: number, deadline: number): Promise<Socket> {
    this.wakeAuthProbe()
    if (!currentUserToken() && !usableVisitorToken()) await ensureVisitorToken()
    if (identityEpoch() !== epoch) throw new IdentityChangedError()
    const socket = this.connect()
    if (socket.connected) return socket
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error(t('common.connectionTimeout'))
    return new Promise<Socket>((resolve, reject) => {
      const waiter: ConnectWaiter = {
        epoch,
        resolve: connected => {
          this.finishWaiter(waiter)
          resolve(connected)
        },
        reject: error => {
          this.finishWaiter(waiter)
          reject(error)
        },
      }
      waiter.timer = setTimeout(
        () => waiter.reject(new Error(t('common.connectionTimeout'))),
        remaining
      )
      this.waiters.add(waiter)
    })
  }

  private finishWaiter(waiter: ConnectWaiter) {
    clearTimeout(waiter.timer)
    this.waiters.delete(waiter)
  }

  /** 当前 socket 连上：同一身份的等待者一起放行（之后各自核对实例与连接状态） */
  private resolveWaiters(socket: Socket) {
    for (const waiter of [...this.waiters]) {
      if (waiter.epoch === identityEpoch()) waiter.resolve(socket)
      else waiter.reject(new IdentityChangedError())
    }
  }

  private rejectWaiters(error: () => Error) {
    for (const waiter of [...this.waiters]) waiter.reject(error())
  }

  // 只断开连接，保留订阅：登录 / 换 token / 401 都会走这里再重连，
  // 清空 listeners 会让常驻订阅（socket:connected、agent:event）静默失效。
  // 在途的连接等待不结束：同一身份下随后的 connect() 连上时照常放行，身份变了由代次监听结束
  disconnect(): void {
    this.cancelAuthProbe()
    this.clearStableTimer()
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.socketToken = ''
  }

  // 应用级销毁：断开连接并清空全部订阅，仅供根组件卸载使用
  destroy(): void {
    this.disconnect()
    this.listeners.clear()
  }

  emit(event: string, data: any): boolean {
    if (!this.socket?.connected) return false
    this.socket.emit(event, data)
    return true
  }

  /**
   * 发出并等回执。身份代次与它的变化监听在第一个 await 之前就位：凭证申请、连接等待、发送、等回执任一阶段
   * 身份变了都立即以 IDENTITY_CHANGED 结束（不等旧的凭证申请或连接结束，也不被随后到来的失败回调覆盖）
   */
  async emitWithAck<T = unknown>(event: string, data: unknown): Promise<SocketAck<T>> {
    const epoch = identityEpoch()
    const deadline = Date.now() + CONNECT_TIMEOUT
    let markChanged!: () => void
    const identityChanged = new Promise<'changed'>(resolve => {
      markChanged = () => resolve('changed')
    })
    const stopWatching = onIdentityEpochChange(() => markChanged())
    try {
      let socket!: Socket
      try {
        for (;;) {
          // 与身份变化竞争：身份先变就立即结束，不等旧的凭证申请或连接（它随后的成功或失败由 race 收下，没有人再用）
          const outcome = await Promise.race([
            this.waitForConnection(epoch, deadline),
            identityChanged,
          ])
          if (outcome === 'changed' || identityEpoch() !== epoch) return identityChangedAck()
          socket = outcome
          // 发送前同步核对三项（与 emit 之间没有 await）：身份未变、仍是当前实例、仍已连接。
          // 同一身份下换了实例或又断开：回到等待（截止时间不变），不把包塞进旧实例的缓冲区
          if (socket === this.socket && socket.connected) break
        }
      } catch (error: any) {
        // 等待先失败、随后才换了身份（同一轮微任务里先后发生）：按代次判断，仍是身份已变
        if (identityEpoch() !== epoch) return identityChangedAck()
        return {
          ok: false,
          code: 'CONNECTION_FAILED',
          message: error?.message || t('common.connectionFailed'),
        }
      }
      return await new Promise<SocketAck<T>>(resolve => {
        let settled = false
        const settle = (ack: SocketAck<T>) => {
          if (settled) return
          settled = true
          resolve(ack)
        }
        void identityChanged.then(() => settle(identityChangedAck()))
        socket
          .timeout(EMIT_ACK_TIMEOUT)
          .emit(event, data, (error: Error | null, response?: unknown) => {
            if (identityEpoch() !== epoch) {
              settle(identityChangedAck())
              return
            }
            if (error) {
              // 回执超时，或同一身份下连接断开（已发出的包立即失败）：结果不确定
              settle({ ok: false, code: 'TIMEOUT', message: t('common.connectionTimeout') })
              return
            }
            if (
              response &&
              typeof response === 'object' &&
              !Array.isArray(response) &&
              'ok' in response &&
              typeof response.ok === 'boolean'
            ) {
              const ack = response as Record<string, unknown>
              settle({
                ok: response.ok,
                code: typeof ack.code === 'string' ? ack.code : undefined,
                message: typeof ack.message === 'string' ? ack.message : undefined,
                data: ack.data as T | undefined,
              })
              return
            }
            settle({ ok: false, code: 'INVALID_ACK', message: t('common.connectionFailed') })
          })
      })
    } finally {
      stopWatching()
    }
  }

  on(event: string, handler: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)

    return () => {
      const handlers = this.listeners.get(event)
      if (handlers) {
        handlers.delete(handler)
      }
    }
  }

  off(event: string, handler?: (data: any) => void): void {
    if (handler) {
      const handlers = this.listeners.get(event)
      if (handlers) {
        handlers.delete(handler)
      }
    } else {
      this.listeners.delete(event)
    }
  }

  private dispatchInternal(event: string): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach(handler => handler(undefined))
    }
  }

  // ====== 服务端主动断开后的恢复 ======

  private handleConnected(socket: Socket) {
    this.clearStableTimer()
    this.stableTimer = setTimeout(() => {
      this.stableTimer = null
      if (this.socket === socket && socket.connected) {
        this.authProbeFailures = 0
        this.authProbePausedUntil = 0
      }
    }, STABLE_CONNECTION_MS)
  }

  private clearStableTimer() {
    if (this.stableTimer) clearTimeout(this.stableTimer)
    this.stableTimer = null
  }

  /**
   * 服务端在鉴权路径上断开了连接：不直接换凭证（暂时故障也会走到这里），先用 HTTP 资料请求核对身份——
   * 401 由请求层处理（访客换凭证、登录用户按过期），身份变了这次任务就交给统一恢复；核对通过就以当前凭证
   * 重连；503、断网按退避再核对。同一个连接同一时刻只有一个核对任务
   */
  private handleServerDisconnect(socket: Socket) {
    if (this.authProbe?.socket === socket) return
    this.cancelAuthProbe()
    this.authProbe = { socket, epoch: identityEpoch(), running: false }
    this.armAuthProbe()
  }

  private isAuthProbeCurrent(task: AuthProbeTask) {
    return this.authProbe === task && this.socket === task.socket && identityEpoch() === task.epoch
  }

  private armAuthProbe() {
    const task = this.authProbe
    if (!task) return
    if (task.timer) clearTimeout(task.timer)
    const now = Date.now()
    if (this.authProbeFailures >= AUTH_PROBE_MAX_ATTEMPTS && !this.authProbePausedUntil) {
      this.authProbePausedUntil = now + AUTH_PROBE_PAUSE_MS
    }
    if (this.authProbePausedUntil) {
      // 暂停中：期满后计数清零、从头退避；期间的唤醒见 wakeAuthProbe
      task.timer = setTimeout(
        () => {
          task.timer = undefined
          if (!this.isAuthProbeCurrent(task)) return
          this.authProbeFailures = 0
          this.authProbePausedUntil = 0
          this.armAuthProbe()
        },
        Math.max(0, this.authProbePausedUntil - now)
      )
      return
    }
    const delay =
      AUTH_PROBE_DELAYS_MS[Math.min(this.authProbeFailures, AUTH_PROBE_DELAYS_MS.length - 1)]
    task.timer = setTimeout(() => {
      task.timer = undefined
      void this.runAuthProbe(task)
    }, delay)
  }

  private async runAuthProbe(task: AuthProbeTask) {
    if (!this.isAuthProbeCurrent(task) || task.running) return
    task.running = true
    this.authProbeFailures += 1
    try {
      const { fetchGetInfo } = await import('@/api')
      // 加载期间断开、销毁或换了身份：不再发请求
      if (!this.isAuthProbeCurrent(task)) {
        task.running = false
        return
      }
      await fetchGetInfo()
    } catch {
      task.running = false
      // 身份已经变了（401 换了访客凭证、登录过期、别处登录）：交给统一恢复，本任务结束
      if (this.isAuthProbeCurrent(task)) this.armAuthProbe()
      return
    }
    task.running = false
    if (!this.isAuthProbeCurrent(task)) return
    // 身份有效：以当前凭证重连（可能是核对时刚建立的访客凭证）。重连后很快又被断开时计数接着累加
    this.authProbe = null
    const token = this.currentToken()
    task.socket.auth = { token }
    this.socketToken = token
    if (!task.socket.connected) task.socket.connect()
  }

  /** 暂停期间的唤醒（联网、页面可见、用户发送）：立即尝试一次，10 秒内的多次唤醒与在途核对合并 */
  private wakeAuthProbe() {
    const task = this.authProbe
    if (!task || task.running || !this.authProbePausedUntil) return
    const now = Date.now()
    if (now - this.lastAuthProbeWakeAt < AUTH_PROBE_WAKE_MERGE_MS) return
    this.lastAuthProbeWakeAt = now
    void this.runAuthProbe(task)
  }

  private cancelAuthProbe() {
    if (this.authProbe?.timer) clearTimeout(this.authProbe.timer)
    this.authProbe = null
  }
}

export const socketService = new SocketService()
