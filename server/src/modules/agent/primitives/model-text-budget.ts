import { sliceUtf16, sliceUtf16From } from '../../chatLog/tool-result-payload';

/**
 * 原语结果交给模型的长度预算（按 UTF-16 长度，与模型内容上限同一口径）。
 * 整条结果上限 12,000：先扣掉状态、提示、交付说明与文件引用行，正文最多 8,000。
 */
export const PRIMITIVE_RESULT_LIMIT = 12_000;
export const PRIMITIVE_BODY_BUDGET = 8_000;
/** 交付清单与文件引用行最多列这么多个文件，其余写「另有 N 个」 */
export const LISTED_FILES_MAX = 20;

/** 正文预算：先扣掉框架（状态、说明、交付清单）与结果后面会补的文件引用行 */
export function primitiveBodyBudget(frameLength: number, fileRefReserve = 0): number {
  return Math.max(
    0,
    Math.min(PRIMITIVE_BODY_BUDGET, PRIMITIVE_RESULT_LIMIT - frameLength - fileRefReserve - 100),
  );
}

/**
 * 交付清单里没写出引用编号的文件，会在结果后面补一行文件引用（fileRef、名称、类型、大小、角色，最多 20 行）：
 * 按完整的名称与类型估算长度，编号、大小与角色按较长的写法预留
 */
export function fileRefLinesReserve(files: Array<{ name?: string; mime?: string }>): number {
  if (!files.length) return 0;
  const listed = files.slice(0, LISTED_FILES_MAX);
  const lines = listed.reduce(
    (sum, file) => sum + 100 + String(file.name || '').length + String(file.mime || '').length,
    '输出文件：'.length + 1,
  );
  return lines + (files.length > LISTED_FILES_MAX ? 30 : 0);
}

/** 沙箱捕获输出时被截断，会在结尾追加这段说明（见 sandbox/exec-support.ts 的 OutputCollector） */
const CAPTURE_NOTE = /\n…（输出超过 (\d+) 字节已截断）$/u;

/**
 * 去掉捕获截断说明，返回实际捕获到的内容与捕获上限。
 * 只认这一路确实被截断时的说明：截断时已捕获的正好是上限字节数（截在多字节字符中间时，
 * 解码出的替换字符会多出最多 2 字节）；命令输出恰好以同样文字结尾时不动。
 */
export function splitCaptureNote(text: string): { text: string; capturedBytes?: number } {
  const match = CAPTURE_NOTE.exec(text);
  if (!match) return { text };
  const captured = text.slice(0, match.index);
  const capturedBytes = Number(match[1]);
  const bytes = Buffer.byteLength(captured, 'utf8');
  return bytes >= capturedBytes && bytes <= capturedBytes + 3
    ? { text: captured, capturedBytes }
    : { text };
}

/** 码点数（与 Python 的字符串下标一致） */
export function codePointLength(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

/** 按换行切成行；结尾的换行不算多出一行 */
export function splitLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export interface LineWindow {
  text: string;
  /** 装入的行数（首行装不下、只给了一段时为 0） */
  count: number;
  /** 首行就超出预算时只给了该行开头一段 */
  partial?: { shown: number; total: number };
}

/** 从第一行起按完整行装入预算；首行就装不下时只给该行开头一段 */
export function fitLinesFromStart(lines: string[], budget: number): LineWindow {
  let used = 0;
  let count = 0;
  for (const line of lines) {
    const cost = line.length + (count > 0 ? 1 : 0);
    if (used + cost > budget) break;
    used += cost;
    count += 1;
  }
  if (count === 0 && lines.length > 0) {
    const shown = sliceUtf16(lines[0], budget);
    return { text: shown, count: 0, partial: { shown: shown.length, total: lines[0].length } };
  }
  return { text: lines.slice(0, count).join('\n'), count };
}

/**
 * 命令输出按完整行保留头 1/4、尾 3/4（报错与结果多在结尾）；装不下任何完整行时按字符保留头尾。
 * 只能截取已经捕获到的内容，中间写明省略了哪些。
 */
export function fitHeadTail(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const room = Math.max(0, budget - 80);
  const headBudget = Math.floor(room / 4);
  const tailBudget = room - headBudget;
  const lines = text.split('\n');
  let headCount = 0;
  let headUsed = 0;
  while (headCount < lines.length) {
    const cost = lines[headCount].length + 1;
    if (headUsed + cost > headBudget) break;
    headUsed += cost;
    headCount += 1;
  }
  let tailCount = 0;
  let tailUsed = 0;
  while (tailCount < lines.length - headCount) {
    const cost = lines[lines.length - 1 - tailCount].length + 1;
    if (tailUsed + cost > tailBudget) break;
    tailUsed += cost;
    tailCount += 1;
  }
  if (headCount > 0 && tailCount > 0) {
    const from = headCount + 1;
    const to = lines.length - tailCount;
    return [
      ...lines.slice(0, headCount),
      `…[省略已捕获输出的第 ${from}–${to} 行，共 ${lines.length} 行]…`,
      ...lines.slice(lines.length - tailCount),
    ].join('\n');
  }
  // 有超长的行：按字符保留头尾
  const head = sliceUtf16(text, headBudget);
  const tail = sliceUtf16From(text, text.length - tailBudget);
  return `${head}\n…[省略已捕获输出中间约 ${text.length - head.length - tail.length} 字]…\n${tail}`;
}
