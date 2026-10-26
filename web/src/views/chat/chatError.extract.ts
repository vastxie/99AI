/**
 * 对话错误的纯提取函数：从 socket ack / agent.error / axios 响应 里取错误码与文案。
 * 不依赖扩展包注册表，扩展包的错误分类钩子也从这里取值。
 */
/** 错误码可能挂在几个层级：socket ack、agent.error 事件、axios 响应体 */
function collectCodeCandidates(error: any): unknown[] {
  return [
    error?.code,
    error?.data?.code,
    error?.event?.data?.code,
    error?.response?.code,
    error?.response?.data?.code,
  ]
}

function toInteger(value: unknown): number {
  if (typeof value === 'number') return Number.isInteger(value) ? value : 0
  if (typeof value !== 'string' || !value.trim()) return 0
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : 0
}

/** 提取后端字符串错误码（大写归一）；取不到返回 '' */
export function extractAgentErrorCode(error: any): string {
  for (const candidate of collectCodeCandidates(error)) {
    if (typeof candidate === 'string' && candidate.trim() && !Number.isFinite(Number(candidate))) {
      return candidate.trim().toUpperCase()
    }
  }
  return ''
}

/** 提取 HTTP 状态码：显式 status 优先，其次是被 allExceptions.filter 写成状态码的数字 `code` */
export function extractHttpStatus(error: any): number {
  const candidates = [
    error?.status,
    error?.response?.status,
    error?.statusCode,
    ...collectCodeCandidates(error),
  ]

  for (const candidate of candidates) {
    const value = toInteger(candidate)
    if (value >= 100 && value <= 599) return value
  }

  return 0
}

/** 当前错误入口的 message 是字符串。 */
export function extractErrorMessage(error: any): string {
  const raw = error?.message
  if (typeof raw === 'string') return raw
  return ''
}

export function isAbortedChatError(error: any): boolean {
  const message = extractErrorMessage(error)
  const lowerMessage = message.toLowerCase()

  return (
    error?.name === 'AbortError' ||
    message.includes('canceled') ||
    message.includes('aborted') ||
    message.includes('abort') ||
    lowerMessage.includes('streambuffer') ||
    lowerMessage.includes('bodystream')
  )
}
