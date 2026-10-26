import { get, isRequestCancelled, post } from '@/utils/request'
import { isIdentityChanged } from '@/services/identity'
import { socketService, type SocketAck } from '@/services/socket-io'
import { t } from '@/locales'

/* ===== WebSocket 聊天 API ===== */

export function createSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
}

/** 开始聊天（通过 WebSocket） */
export async function startChat(params: {
  model?: string
  modelName?: string
  modelId?: number
  reasoningEffort?: Chat.ReasoningEffort
  modelType?: number
  prompt: string
  imageUrl?: string
  videoUrl?: string
  message?: string
  action?: string
  gid: string
  submissionId: string
  /** 重新生成 / 编辑重发：从这条提问起替换原来的回合（服务端接受这一轮时才删除） */
  replaceFromCid?: string
  /** 用户确认要一并删除的后续轮数；和服务端实际的不一样时被拒（REPLACE_RANGE_CHANGED） */
  replaceLaterTurns?: number
}): Promise<
  SocketAck<{
    accepted?: boolean
    cid?: string
    turnId?: string
    duplicate?: boolean
  }>
> {
  const ack = await socketService.emitWithAck<{
    accepted?: boolean
    cid?: string
    turnId?: string
    duplicate?: boolean
  }>('chat:start', params)
  if (!ack.ok) {
    const error = new Error(ack.message || t('common.connectionFailed'))
    // 透传 gateway ack 的错误码（'UNAUTHORIZED' / 'BAD_REQUEST' / 'NOT_ACCEPTED' 等），
    // classifyChatError 按错误码分类（不看文案），详见 chatError.helpers；
    // data 是拒绝的细节（如 REPLACE_RANGE_CHANGED 的实际轮数）
    Object.assign(error, { code: ack.code, data: ack.data })
    throw error
  }
  return ack
}

/**
 * 停止请求的结果（服务端回执的 status 描述这条回复本身）：
 * - accepted：取消已受理，这条回复按已停止落定（status 为 stopped）；
 * - ended：回复其实已经结束（附真实结局），需要按服务端核对这一条；
 * - verify：服务端没有它的运行记录，需要按服务端核对这一条；
 * - rejected：服务端拒绝（附文案；notified 表示请求层已经提示过）；
 * - unknown：没能确认（服务端内部错误、HTTP 也没拿到结果）；
 * - cancelled：身份或页面已经变了，结果不再处理
 */
export type StopChatOutcome =
  | { kind: 'accepted' }
  | { kind: 'ended'; status: 'completed' | 'error' }
  | { kind: 'verify' }
  | { kind: 'rejected'; message: string; notified: boolean }
  | { kind: 'unknown' }
  | { kind: 'cancelled' }

const STOP_REPLY_STATUSES = new Set(['stopped', 'completed', 'error', 'not_found'])
/** 回执没有送到（超时、连接失败、回执不对、旧网关不回执）：改走 HTTP 再试一次 */
const STOP_FALLBACK_CODES = new Set([
  'TIMEOUT',
  'CONNECTION_FAILED',
  'INVALID_ACK',
  // 实时连接校验失败（服务端随后断开）：结果没有落定，改走 HTTP
  'SESSION_UNAVAILABLE',
  'SESSION_INVALID',
])

function stopOutcomeOf(data: unknown): StopChatOutcome | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const { stopped, status } = data as { stopped?: unknown; status?: unknown }
  if (typeof stopped !== 'boolean' || typeof status !== 'string') return null
  if (!STOP_REPLY_STATUSES.has(status)) return null
  if (status === 'stopped') return { kind: 'accepted' }
  if (status === 'not_found') return { kind: 'verify' }
  return { kind: 'ended', status: status as 'completed' | 'error' }
}

/** WebSocket 回执能给出结论时返回它；需要改走 HTTP 时返回 null */
function stopOutcomeOfAck(ack: SocketAck<unknown>): StopChatOutcome | null {
  if (ack.ok) return stopOutcomeOf(ack.data)
  if (ack.code === 'IDENTITY_CHANGED') return { kind: 'cancelled' }
  if (!ack.code || STOP_FALLBACK_CODES.has(ack.code)) return null
  if (ack.code === 'INTERNAL_ERROR') return { kind: 'unknown' }
  return { kind: 'rejected', message: ack.message || t('chat.stopFailed'), notified: false }
}

async function stopChatOverHttp(cid: string): Promise<StopChatOutcome> {
  try {
    const res: any = await post({ url: '/chat/stop', data: { cid }, silentError: true })
    return stopOutcomeOf(res?.data) ?? { kind: 'unknown' }
  } catch (error: any) {
    if (isIdentityChanged(error) || isRequestCancelled(error)) return { kind: 'cancelled' }
    const status = Number(error?.status ?? error?.code)
    if (status >= 400 && status < 500) {
      return {
        kind: 'rejected',
        message: error?.message || t('chat.stopFailed'),
        notified: Boolean(error?.notified),
      }
    }
    return { kind: 'unknown' }
  }
}

/**
 * 停止生成：先发 WebSocket 并等回执，回执没送到时改走 HTTP（最多一次）。
 * isCurrent 是停止操作是否仍然有效（身份、会话数据、页面都没变）：改走 HTTP 之前与拿到结果之后都核对，
 * 变了就是 cancelled，不发 HTTP、不交出结果
 */
export async function stopChat(
  cid: string,
  isCurrent: () => boolean = () => true
): Promise<StopChatOutcome> {
  let outcome: StopChatOutcome | null = null
  try {
    outcome = stopOutcomeOfAck(await socketService.emitWithAck('chat:stop', { cid }))
  } catch (error) {
    // 按合同不会抛（失败都折成回执）；万一抛了，身份变化照常取消，其余当作没送到
    if (isIdentityChanged(error)) return { kind: 'cancelled' }
  }
  if (!outcome) {
    if (!isCurrent()) return { kind: 'cancelled' }
    outcome = await stopChatOverHttp(cid)
  }
  return outcome.kind === 'cancelled' || isCurrent() ? outcome : { kind: 'cancelled' }
}

export type QueuedChatTurnInput = Record<string, unknown> & {
  prompt: string
  submissionId: string
  expectedTurnId?: string
}

export interface QueueChatTurnAckData {
  replaced?: boolean
  duplicate?: boolean
  queuedPrompt?: string
  parentTurnId?: string
  conversationGid?: string
  submissionId?: string
}

/** 生成中提交下一轮消息 */
export function queueChatTurnWithAck(
  cid: string,
  turn: QueuedChatTurnInput
): Promise<SocketAck<QueueChatTurnAckData>> {
  return socketService.emitWithAck('chat:queueTurn', { cid, turn })
}

/** 删除已提交但尚未执行的下一轮消息 */
export function cancelQueuedChatTurnWithAck(
  cid: string,
  expectedTurnId?: string
): Promise<SocketAck<{ removed?: boolean }>> {
  return socketService.emitWithAck('chat:cancelQueuedTurn', {
    cid,
    ...(expectedTurnId ? { expectedTurnId } : {}),
  })
}

type ChatResyncAckMode = 'buffer' | 'snapshot' | 'terminal'

export interface ChatResyncAckData {
  accepted: boolean
  cid: string
  mode: ChatResyncAckMode
  seq?: number
  eventCount?: number
  status?: string | number
  finishReason?: 'stop' | 'abort' | 'error'
  terminal?: boolean
}

/** 重新同步状态（断线重连）；携带 afterSeq 时服务端优先增量补发缓冲事件 */
export async function resyncChat(
  cid: string,
  afterSeq?: number
): Promise<SocketAck<ChatResyncAckData>> {
  // 身份在 emitWithAck 的入口记下（不先单独等连接：那段等待里换了身份，旧 cid 会发到新身份的连接上）
  return socketService.emitWithAck<ChatResyncAckData>('chat:resync', {
    cid,
    ...(typeof afterSeq === 'number' && afterSeq > 0 ? { afterSeq } : {}),
  })
}

/* 获取个人信息 */
export function fetchGetInfo<T>() {
  return get<T>({ url: '/auth/getInfo' })
}

/* 登录 */
export function fetchLoginAPI<T>(
  data: { username: string; password: string },
  options: { silentError?: boolean } = {}
): Promise<T> {
  return post<T>({ url: '/auth/login', data, ...options }) as Promise<T>
}

/* 修改个人信息 */
export function fetchUpdateInfoAPI<T>(data: {
  username?: string
  avatar?: string
  nickname?: string
  customInstruction?: string
}): Promise<T> {
  return post<T>({ url: '/user/update', data }) as Promise<T>
}

/* 修改密码 */
export function fetchUpdatePasswordAPI<T>(
  data: { oldPassword?: string; password?: string },
  options: { silentError?: boolean } = {}
): Promise<T> {
  return post<T>({ url: '/auth/updatePassword', data, ...options }) as Promise<T>
}
