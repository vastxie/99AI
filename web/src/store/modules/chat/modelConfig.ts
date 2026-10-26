/**
 * 会话生效配置的唯一解析口径（纯函数，不依赖 store，便于单测）。
 *
 * 会话自身的 config 为底：侧栏「新对话」建组时服务端写入 null、前端归一成 "{}"，
 * 或者结构损坏时，它不含可用模型，此时回落到兜底配置（本次改动 → 管理员默认模型 → 列表第一个）。
 * 模型选择器、输入框与发送链路（含重新生成、编辑重发）都读 store 的 effectiveModelConfig，
 * 保证「选择器显示的模型」就是「实际发送的模型」。
 */
export function resolveEffectiveModelConfig(sessionConfig: any, fallbackConfig: any): any {
  const session = toConfigObject(sessionConfig)

  // 会话自身带可用模型：直接生效，不允许被全局配置顶掉
  if (session.modelInfo?.model) return session
  // 会话声明了固定模型：即使信息不完整也保持原样，避免把固定模型会话放宽成可切换
  if (session.modelInfo?.isFixedModel === 1) return session

  const fallback = toConfigObject(fallbackConfig)

  // 会话字段（reasoningEffort 等）优先保留，只有模型信息整体取兜底；
  // 兜底也没有可用模型时置空，让「没有模型」是一个明确状态而不是半截结构
  return {
    ...fallback,
    ...session,
    modelInfo: fallback.modelInfo?.model ? fallback.modelInfo : undefined,
  }
}

function toConfigObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
