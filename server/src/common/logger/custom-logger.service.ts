import { ConsoleLogger, Injectable } from '@nestjs/common';
import { inspect } from 'node:util';

const REDACTED = '[已脱敏]';
/**
 * 键名（去掉分隔符、转小写后）以这些词结尾即整体脱敏；usedTokens、tokenCount 之类不受影响。
 * 字符串里的 key=value、JSON "key": "value" 用同一口径判断键名。
 */
const SENSITIVE_KEY_SUFFIXES = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'secretkey',
  'accesskey',
  'privatekey',
  'sessionkey',
  'paykey',
  'authorization',
  'cookie',
  'credential',
  'signature',
];
/** 同一行内的认证令牌；分隔只认空格与制表符，不跨行 */
const BEARER_TEXT = /\b(Bearer|Basic)[ \t]+[A-Za-z0-9._~+/=-]+/gi;
/**
 * 文本里的敏感键名：以上面某个词结尾，词的字母之间允许 _ . -（与键名归一化同口径）。
 * 只匹配敏感键，普通键值对不会被整体吞掉，URL 里嵌套的 token=… 仍能命中；
 * 键名只从一串键名字符的开头起算，超长普通键不会被逐位重扫。
 */
const SENSITIVE_KEY_TEXT = `(?<![A-Za-z0-9_.-])[A-Za-z0-9_.-]*?(?:${SENSITIVE_KEY_SUFFIXES.map(
  suffix => suffix.split('').join('[_.-]?'),
).join('|')})`;
/** 行分隔符：\r、\n 与 Unicode 的行 / 段分隔符 */
const LINE_BREAK = '\\r\\n\\u2028\\u2029';
/** 引号值允许转义引号；缺结束引号（含以孤立反斜杠结尾）时替换到行尾，行分隔符原样保留 */
const QUOTED_VALUE_TEXT = [`"`, `'`]
  .map(
    quote => `${quote}(?:[^${quote}\\\\${LINE_BREAK}]|\\\\.?)*(?:${quote}|(?=[${LINE_BREAK}])|$)`,
  )
  .join('|');
/** 查询串、表单、命令行与请求头里的 key=value、key: value；值可带引号，请求头的认证方案一并替换 */
const ASSIGNMENT_TEXT = new RegExp(
  `(${SENSITIVE_KEY_TEXT})([ \\t]*[=:][ \\t]*)(?:(?:Bearer|Basic)[ \\t]+)?(${QUOTED_VALUE_TEXT}|[^&\\s"',;]+)`,
  'gi',
);
/** JSON 或对象字面量文本里带引号的键值 */
const JSON_FIELD_TEXT = new RegExp(
  `(["'])(${SENSITIVE_KEY_TEXT})\\1([ \\t]*:[ \\t]*)(["'])(?:(?!\\4)[^\\\\${LINE_BREAK}]|\\\\.?)*(?:\\4|(?=[${LINE_BREAK}])|$)`,
  'gi',
);
const MAX_DEPTH = 4;
const MAX_ENTRIES = 50;
const MAX_STRING = 2000;

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return SENSITIVE_KEY_SUFFIXES.some(suffix => normalized.endsWith(suffix));
}

@Injectable()
export class CustomLoggerService extends ConsoleLogger {
  private isDev: boolean;

  constructor() {
    super();
    this.isDev = process.env.ISDEV === 'true';
  }

  /**
   * 日志内容脱敏：对象按键名去掉密码、令牌、密钥等字段，字符串去掉 Bearer 令牌、key=value 形式的密钥
   * 和 Base64 大块数据；对象限制层级、条目与字符串长度，避免把整份请求或响应写进日志。
   */
  private sanitizeLogMessage(message: unknown): string {
    if (message === null || message === undefined) return String(message);
    if (typeof message === 'string') return this.sanitizeText(message);
    if (typeof message === 'object') {
      try {
        return this.sanitizeText(
          inspect(this.redactValue(message, 0, new WeakSet()), {
            depth: MAX_DEPTH + 1,
            maxArrayLength: MAX_ENTRIES,
            maxStringLength: MAX_STRING,
            breakLength: 160,
          }),
        );
      } catch {
        return '[无法序列化的对象]';
      }
    }
    return this.sanitizeText(String(message));
  }

  private redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (typeof value === 'string') return this.sanitizeText(value);
    if (!value || typeof value !== 'object') return value;
    if (value instanceof Date) return value;
    if (Buffer.isBuffer(value)) return `<Buffer ${value.length} bytes>`;
    if (value instanceof Error) return `${value.name}: ${this.sanitizeText(value.message)}`;
    if (seen.has(value)) return '[Circular]';
    if (depth >= MAX_DEPTH) return Array.isArray(value) ? '[Array]' : '[Object]';
    seen.add(value);
    if (Array.isArray(value)) {
      return value.slice(0, MAX_ENTRIES).map(item => this.redactValue(item, depth + 1, seen));
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_ENTRIES)) {
      result[key] = isSensitiveKey(key) ? REDACTED : this.redactValue(item, depth + 1, seen);
    }
    return result;
  }

  private sanitizeText(text: string): string {
    return this.sanitizeCredentials(this.sanitizeBase64String(text));
  }

  /** 堆栈只去凭据：长文件路径会被 Base64 规则误伤 */
  private sanitizeCredentials(text: string): string {
    return text
      .replace(BEARER_TEXT, `$1 ${REDACTED}`)
      .replace(ASSIGNMENT_TEXT, (_match, key: string, separator: string, value: string) => {
        const quote = /^["']/.test(value) ? value[0] : '';
        return `${key}${separator}${quote}${REDACTED}${quote}`;
      })
      .replace(
        JSON_FIELD_TEXT,
        (_match, keyQuote: string, key: string, separator: string, valueQuote: string) =>
          `${keyQuote}${key}${keyQuote}${separator}${valueQuote}${REDACTED}${valueQuote}`,
      );
  }

  /**
   * 附加参数脱敏但保持类型：Nest 把最后一个字符串当上下文、把普通对象当结构化参数，
   * 换成字符串会打乱它的判断。
   */
  private sanitizeParams(params: unknown[]): unknown[] {
    return params.map(param => {
      if (typeof param === 'string') return this.sanitizeCredentials(param);
      if (param instanceof Error) {
        const copy = new Error(this.sanitizeText(param.message));
        copy.name = param.name;
        copy.stack = param.stack && this.sanitizeCredentials(param.stack);
        return copy;
      }
      if (param && typeof param === 'object') return this.redactValue(param, 0, new WeakSet());
      return param;
    });
  }

  /**
   * 过滤字符串中的 Base64 数据
   * @param str 需要过滤的字符串
   * @returns 过滤后的字符串
   */
  private sanitizeBase64String(str: string): string {
    if (!str) return str;

    // 1. 过滤 data URL 格式的 Base64
    str = str.replace(/(data:[^;]+;base64,)[a-zA-Z0-9+/=]{20,}/g, '$1***BASE64_DATA***');

    // 2. 过滤常见的 Base64 模式 - 宽松匹配
    // 匹配至少有50个连续的Base64字符的字符串
    str = str.replace(/([a-zA-Z0-9+/=]{50})[a-zA-Z0-9+/=]{10,}/g, '$1***BASE64_DATA***');

    // 3. 特别处理可能在JSON中的Base64（引号包围的）
    str = str.replace(/"([a-zA-Z0-9+/=]{20,})"/g, function (match, p1) {
      // 只处理很可能是Base64的长字符串
      if (p1.length >= 50 && /^[a-zA-Z0-9+/=]+$/.test(p1)) {
        return '"' + p1.substring(0, 20) + '***BASE64_DATA***"';
      }
      return match;
    });

    // 4. 特别处理 url 字段中的 Base64 数据
    str = str.replace(/("url"\s*:\s*")([a-zA-Z0-9+/=]{20,})(")/g, '$1***BASE64_DATA***$3');

    return str;
  }

  // 参数个数原样保留：Nest 按参数个数区分「上下文」与「堆栈 + 上下文」，补 undefined 会打乱判断
  log(message: any, ...optionalParams: any[]) {
    super.log(this.sanitizeLogMessage(message), ...this.sanitizeParams(optionalParams));
  }

  error(message: any, ...optionalParams: any[]) {
    super.error(this.sanitizeLogMessage(message), ...this.sanitizeParams(optionalParams));
  }

  /** 警告在生产环境也输出：沙箱接管失败、配置无效等都需要管理员看到 */
  warn(message: any, ...optionalParams: any[]) {
    super.warn(this.sanitizeLogMessage(message), ...this.sanitizeParams(optionalParams));
  }

  debug(message: any, ...optionalParams: any[]) {
    if (this.isDev)
      super.debug(this.sanitizeLogMessage(message), ...this.sanitizeParams(optionalParams));
  }

  verbose(message: any, ...optionalParams: any[]) {
    if (this.isDev)
      super.verbose(this.sanitizeLogMessage(message), ...this.sanitizeParams(optionalParams));
  }
}
