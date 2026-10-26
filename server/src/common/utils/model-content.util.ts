/**
 * 模型协议适配层共用的消息内容 helper。
 *
 * 各协议扩展包只负责字段映射；把 ModelGateway 消息内容拍平成纯文本、解析 base64 dataUrl、
 * 解析工具调用参数这三类逻辑在此单源维护。以下两处是不同语义的同名函数，不要合并：
 * - modules/agent/context/context-budget-manager.ts 的 stringifyContent（JSON.stringify 变体）；
 * - modules/fileAsset/materializer/file-materializer.service.ts 的 parseImageDataUrl（带大小上限、返回 Buffer）。
 */

export interface ParsedDataUrl {
  /** 小写 MIME 类型 */
  mime: string;
  base64: string;
  /** 传入的原始 dataUrl 字符串 */
  dataUrl: string;
}

export interface ParsedImageDataUrl {
  /** MIME 类型，保留原始大小写 */
  mime: string;
  base64: string;
}

/** 解析任意 MIME 的 base64 dataUrl；非字符串或格式不符返回 null。 */
export function parseDataUrl(value: unknown): ParsedDataUrl | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:([a-zA-Z0-9.+/-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), base64: match[2], dataUrl: value };
}

/** 只接受 image/* 的 base64 dataUrl；非图片或格式不符返回 null。 */
export function parseImageDataUrl(value: unknown): ParsedImageDataUrl | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

/** 工具调用 arguments（JSON 字符串）转对象；空串、非法 JSON、非对象一律返回 {}。 */
export function parseToolArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** 把消息内容拍平成文本：字符串原样返回，content part 数组只取文本部分并按行拼接。 */
export function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content === null || content === undefined) return '';
  if (!Array.isArray(content)) return String(content);
  return content
    .map(part => {
      if (part?.type === 'text') return String(part.text || '');
      if (typeof part?.text === 'string') return part.text;
      if (typeof part?.content === 'string') return part.content;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}
