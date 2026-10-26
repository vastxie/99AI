/**
 * Prompt 运行时上下文工具
 *
 * 用于将动态信息（当前时间、用户个性化、记忆等）统一追加到最后一条 user 消息末尾，
 * 而不是写入第一条 system 消息，从而保持 system 前缀稳定，提升 DeepSeek 等模型的上下文缓存命中率。
 *
 * 核心原则：
 * - 第一条 system 只保留静态内容（平台规则、模型规则、工具规则）
 * - 运行时动态信息放在最后一条 user 消息末尾（追加动作由 agent/context/model-message-mapper 完成）
 * - runtime context 不应持久化进聊天历史
 */

/**
 * 运行时上下文字段（按需填充）
 */
export interface RuntimeContext {
  /** 当前时间，格式 YYYY/MM/DD HH:00 */
  currentTime?: string;
  /** 用户名称 */
  userName?: string;
  /** 用户个性化说明 */
  customInstruction?: string;
}

/**
 * 构建运行时上下文文本块
 *
 * 只输出有值的字段，用固定标题包裹，方便模型识别
 */
export function buildRuntimeContextBlock(ctx: RuntimeContext): string {
  const lines: string[] = [];

  if (ctx.currentTime) {
    lines.push(`- 当前时间: ${ctx.currentTime}`);
  }
  if (ctx.userName || ctx.customInstruction) {
    lines.push(`- 用户名称: ${ctx.userName || '用户'}`);
    if (ctx.customInstruction) {
      lines.push(`- 用户个性化说明: ${ctx.customInstruction}`);
    }
  }

  if (lines.length === 0) return '';
  return `\n\n[运行时上下文]\n${lines.join('\n')}`;
}
