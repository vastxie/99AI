/** 面向模型的输入 / 前置条件错误：消息原样作为工具失败结果返回 */
export class PrimitiveInputError extends Error {}

/** 沙箱归属与对话身份：登录用户整机一台（ownerId = user-<id>），访客每个对话一台 */
export interface OwnerRef {
  /** 沙箱归属：登录用户 user-<id>；访客为「账号 + 对话」 */
  ownerId: string;
  /** 对话归属：工具串行、交付登记都按它区分，避免跨对话串号 */
  sessionId: string;
  conversationId: string;
  userId?: number;
  visitorId?: string;
}
