import type { AgentTurnState, ToolCall, UnifiedMessage } from './types/message.types';

/**
 * 解析 chat_log.message 的统一消息结构。
 * 入参可为 JSON 字符串或已解析对象，解析失败返回 null。
 * 全仓唯一的 message 解析入口，禁止再手写 JSON.parse(message)。
 */
export function parseUnifiedMessage(
  message: unknown,
): (UnifiedMessage & Record<string, unknown>) | null {
  if (!message) return null;
  try {
    let parsed: unknown = message;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const prototype = Object.getPrototypeOf(parsed);
    return prototype === Object.prototype || prototype === null
      ? (parsed as UnifiedMessage & Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 从消息中提取 Agent turn 状态（无效结构返回 undefined） */
export function extractTurnFromMessage(message: unknown): AgentTurnState | undefined {
  const turn = parseUnifiedMessage(message)?.turn;
  return turn && typeof turn.id === 'string' ? turn : undefined;
}

/** 客户端附件项里服务端会用到的字段（与 web 的 MediaItem、服务端构建的附件项一致） */
const CLIENT_UPLOAD_ITEM_KEYS = [
  'type',
  'name',
  'url',
  'fileId',
  'previewUrl',
  'downloadUrl',
  'publicUrl',
  'mime',
  'mimeType',
  'size',
] as const;

function pickClientUploadItems(value: unknown): Record<string, string | number>[] {
  if (!Array.isArray(value)) return [];
  const items: Record<string, string | number>[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item: Record<string, string | number> = {};
    for (const key of CLIENT_UPLOAD_ITEM_KEYS) {
      const field = (raw as Record<string, unknown>)[key];
      if (typeof field === 'string' && field.length <= 4096) item[key] = field;
      else if (typeof field === 'number' && Number.isFinite(field)) item[key] = field;
    }
    // 类型字段统一用 mime
    if (item.mimeType !== undefined) {
      if (item.mime === undefined) item.mime = item.mimeType;
      delete item.mimeType;
    }
    if (item.url || item.previewUrl || item.downloadUrl || item.publicUrl || item.fileId) {
      items.push(item);
    }
  }
  return items;
}

/**
 * 客户端提交的当前消息只能是用户消息：按用户消息重建，只留正文与 user_upload 附件。
 * 角色、其他工具调用与结果、回合与追踪等字段只能由服务端写入，否则会在历史里被当成助手消息或工具结果回放。
 */
export function rebuildClientUserMessage(message: Record<string, unknown>): UnifiedMessage {
  const content = typeof message.content === 'string' ? message.content : '';
  const toolCalls: ToolCall[] = [];
  for (const round of Array.isArray(message.rounds) ? message.rounds : []) {
    const calls = (round as { toolCalls?: unknown } | null)?.toolCalls;
    for (const call of Array.isArray(calls) ? calls : []) {
      if (call?.name !== 'user_upload') continue;
      const files = pickClientUploadItems(call.output?.files);
      if (!files.length) continue;
      const id =
        typeof call.id === 'string' && /^user_upload[\w-]{0,80}$/.test(call.id)
          ? call.id
          : `user_upload_${toolCalls.length + 1}`;
      toolCalls.push({
        id,
        name: 'user_upload',
        arguments: {},
        status: 'success',
        output: { files },
      });
    }
  }
  const timestamp =
    typeof message.timestamp === 'string' && message.timestamp.length <= 64
      ? message.timestamp
      : new Date().toISOString();
  return {
    role: 'user',
    content,
    rounds: [{ text: content || null, thinking: null, toolCalls, completed: true }],
    timestamp,
  };
}
