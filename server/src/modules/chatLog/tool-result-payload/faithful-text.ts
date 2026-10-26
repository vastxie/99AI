import * as path from 'node:path';

/**
 * 原语工具（读写用户沙箱里的文件、执行命令）的结果是用户自己的文件内容与命令输出，按原文交给模型：
 * 不去 HTML、不压空白、不按关键词换成摘要、不改代码里的字段名。只处理平台私有信息：
 * 平台内部文件地址、文件资产 ID、服务端环境变量里的密钥值、宿主机路径。
 */

/** 与 agent/primitives 的 PRIMITIVE_TOOL_NAMES 一致（原语的 spec 断言两者相同） */
export const FAITHFUL_TEXT_TOOL_NAMES = ['read', 'write', 'edit', 'bash', 'ls'] as const;

export function isFaithfulTextTool(toolName: unknown): boolean {
  return (
    typeof toolName === 'string' &&
    (FAITHFUL_TEXT_TOOL_NAMES as readonly string[]).includes(toolName)
  );
}

/** 平台内部文件地址的主体：可带协议与主机；其后的查询串与片段另行扫描 */
const INTERNAL_FILE_URL =
  /(?:https?:\/\/[^\s"'`<>()]*?)?\/?\bapi\/files\/file_[A-Za-z0-9_-]+\/(?:download|preview)\b/gi;

/**
 * 地址主体之后的查询串与片段：到空白、引号、反引号、尖括号或非 ASCII 字符为止（编码后的地址只有 ASCII，
 * 紧跟的中文正文、行内代码的结尾不算地址）；括号按层级计，落单的右括号（如 Markdown 链接的结尾）不算地址的一部分。
 */
function urlTailEnd(text: string, start: number): number {
  if (text[start] !== '?' && text[start] !== '#') return start;
  let depth = 0;
  let index = start;
  for (; index < text.length; index += 1) {
    const char = text[index];
    if (/[\s"'`<>]/.test(char) || char.charCodeAt(0) > 0x7e) break;
    if (char === '(') depth += 1;
    else if (char === ')') {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  return index;
}

function stripInternalFileUrls(text: string): string {
  let result = '';
  let last = 0;
  for (const match of text.matchAll(INTERNAL_FILE_URL)) {
    const start = match.index ?? 0;
    if (start < last) continue;
    result += `${text.slice(last, start)}[内部文件链接]`;
    last = urlTailEnd(text, start + match[0].length);
  }
  return result + text.slice(last);
}
/** 文件资产 ID：file_ + 24 位字母数字（与 FILE_ID_PATTERN 一致），代码里的 file_path 之类不受影响 */
const FILE_ASSET_ID = /\bfile_[0-9A-Za-z]{24}\b/g;
/** 名字像密钥、口令、令牌的环境变量 */
const SECRET_ENV_NAME =
  /(?:SECRET|PASSWORD|PASSWD|(?:^|_)PASS$|(?:^|_)TOKEN(?:$|_)|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|_KEY$|CREDENTIAL|SIGNING_?KEY)/i;
/** 带账号口令的连接串（scheme://user:pass@host），不论变量名 */
const CREDENTIAL_URL = /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i;
/** 更短的值不替换：容易与普通文本重合，把用户内容误改 */
const MIN_SECRET_LENGTH = 8;

function platformSecretValues(env: NodeJS.ProcessEnv): string[] {
  const values = new Set<string>();
  for (const [name, raw] of Object.entries(env)) {
    const value = String(raw ?? '').trim();
    if (value.length < MIN_SECRET_LENGTH) continue;
    if (SECRET_ENV_NAME.test(name) || CREDENTIAL_URL.test(value)) values.add(value);
  }
  // 长的先换，避免短值是长值的一部分时只换掉一半
  return [...values].sort((a, b) => b.length - a.length);
}

function hostPathReplacements(env: NodeJS.ProcessEnv): Array<[RegExp, string]> {
  const candidates: Array<[string | undefined, string]> = [
    [env.SANDBOX_LOCAL_ROOT, '[沙箱根目录]'],
    [env.SANDBOX_USER_DISK_ROOT, '[用户磁盘目录]'],
    [env.SANDBOX_SITE_SKILLS_DIR, '[站点技能目录]'],
    [process.cwd(), '[服务端目录]'],
  ];
  const result: Array<[string, string]> = [];
  for (const [raw, label] of candidates) {
    if (!raw || !raw.trim()) continue;
    const resolved = path.resolve(raw.trim());
    if (resolved === path.parse(resolved).root) continue;
    result.push([resolved, label]);
  }
  // 按完整路径边界替换：前面不能紧挨路径字符，后面只能是 / 或分隔符，
  // /srv/app 不会改写 /srv/application、/srv/app中文、/workspace/srv/app；长的先换
  return result
    .sort((a, b) => b[0].length - a[0].length)
    .map(([hostPath, label]) => [
      new RegExp(
        `(?<![^\\s"'\`<>()\\[\\]{},;:|=])${escapeRegExp(hostPath)}(?=$|[/\\s"'\`<>()\\[\\]{},;:|])`,
        'g',
      ),
      label,
    ]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAll(text: string, search: string, replacement: string): string {
  return text.includes(search) ? text.split(search).join(replacement) : text;
}

/** 原文净化：只替换平台私有信息，其余字符原样保留；不截断（先净化完整内容，再按行截断） */
export function sanitizeFaithfulText(value: string, env: NodeJS.ProcessEnv = process.env): string {
  let text = value.replace(/\0/g, '');
  text = stripInternalFileUrls(text);
  text = text.replace(FILE_ASSET_ID, '[private-file]');
  for (const secret of platformSecretValues(env)) text = replaceAll(text, secret, '[平台密钥]');
  for (const [hostPath, label] of hostPathReplacements(env)) text = text.replace(hostPath, label);
  return text;
}

/** 按 UTF-16 长度截到 end，不切断代理对 */
export function sliceUtf16(text: string, end: number): string {
  if (end >= text.length) return text;
  if (end <= 0) return '';
  const code = text.charCodeAt(end - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? end - 1 : end);
}

/** 从 start 截到结尾，起点不落在代理对的后半 */
export function sliceUtf16From(text: string, start: number): string {
  if (start <= 0) return text;
  if (start >= text.length) return '';
  const code = text.charCodeAt(start);
  return text.slice(code >= 0xdc00 && code <= 0xdfff ? start + 1 : start);
}

/** 超出上限时删掉中段（头 1/4、尾 3/4），保住结尾的状态、续读与交付说明 */
export function capFaithfulText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const marker = (omitted: number) => `\n…[超出单条结果上限，省略中间约 ${omitted} 字]…\n`;
  const keep = Math.max(0, limit - marker(text.length).length);
  const head = sliceUtf16(text, Math.floor(keep / 4));
  const tail = sliceUtf16From(text, text.length - (keep - head.length));
  return `${head}${marker(text.length - head.length - tail.length)}${tail}`;
}
