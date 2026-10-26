/**
 * 会话 ID：`g_` 加 24 位字母数字（服务端生成规则）。
 * 路由参数、会话 store、登录回跳地址的校验共用这一处，改规则只改这里。
 */
export const CONVERSATION_ID_SOURCE = 'g_[0-9A-Za-z]{24}'

const CONVERSATION_ID_PATTERN = new RegExp(`^${CONVERSATION_ID_SOURCE}$`, 'u')

export function isConversationId(value?: string | null) {
  return CONVERSATION_ID_PATTERN.test(String(value || '').trim())
}
