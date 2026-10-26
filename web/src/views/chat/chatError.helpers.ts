import { classifyChatErrorByPacks } from '@/packs'
import { extractAgentErrorCode, extractHttpStatus, isAbortedChatError } from './chatError.extract'

export * from './chatError.extract'

/**
 * 后端 WebSocket 链路真实会下发的字符串错误码。
 * 与 server/src/modules/chat/{chat.gateway,chat.service,chat-preflight.service}.ts 保持一致。
 */
export const ChatAgentErrorCode = {
  /** 未登录 / 登录失效（gateway 显式码，或 HTTP 401 归类） */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** 无权访问该会话 / 工作流 / 任务（HTTP 403 归类） */
  FORBIDDEN: 'FORBIDDEN',
  /** 内容审核没有通过（预检拦下的违规内容） */
  CONTENT_VIOLATION: 'CONTENT_VIOLATION',
  /** 额度 / 积分不足（计费实现抛 402，由扩展包引导购买） */
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  /** 其余 4xx 的兜底归类 */
  BAD_REQUEST: 'BAD_REQUEST',
  /** 5xx 兜底归类 */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** chatProcess 结束但未回调 ack */
  NOT_ACCEPTED: 'NOT_ACCEPTED',
  /** 模型频率限流 / 访客额度限流 */
  RATE_LIMIT: 'RATE_LIMIT',
  TURN_NOT_FOUND: 'TURN_NOT_FOUND',
  TURN_MISMATCH: 'TURN_MISMATCH',
  /** 模型回复出错 */
  AI_ERROR: 'AI_ERROR',
  /** Agent 工作流执行失败 */
  AGENT_FAILURE: 'AGENT_FAILURE',
  PROCESS_ERROR: 'PROCESS_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  QUEUE_TURN_ERROR: 'QUEUE_TURN_ERROR',
} as const

/** 内核认识的错误种类；扩展包可以经 classifyChatError 钩子返回自己的种类并自行处理 */
export type ChatErrorKind =
  'aborted' | 'contentViolation' | 'loginRequired' | 'unknown' | (string & {})

export function classifyChatError(error: any): ChatErrorKind {
  if (isAbortedChatError(error)) return 'aborted'

  // 0) 扩展包认识的错误（如额度不足）优先
  const packKind = classifyChatErrorByPacks(error)
  if (packKind) return packKind

  // 1) 按错误码分流，不按文案猜（文案会改、也会翻译）：登录失效与内容违规有专用码；
  //    其余（FORBIDDEN / BAD_REQUEST / RATE_LIMIT …）交给调用方显示服务端给的原因
  const agentCode = extractAgentErrorCode(error)
  if (agentCode === ChatAgentErrorCode.UNAUTHORIZED) return 'loginRequired'
  if (agentCode === ChatAgentErrorCode.CONTENT_VIOLATION) return 'contentViolation'

  if (extractHttpStatus(error) === 401) return 'loginRequired'

  return 'unknown'
}
