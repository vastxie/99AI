import { ConsoleLogger, Injectable } from '@nestjs/common';
import util from 'util';

@Injectable()
export class CustomLoggerService extends ConsoleLogger {
  private isDev: boolean;

  constructor() {
    super();
    this.isDev = process.env.ISDEV === 'true';
  }

  /**
   * 过滤日志消息中的敏感数据，如 Base64 编码
   * @param message 需要过滤的日志消息
   * @returns 过滤后的日志消息
   */
  private sanitizeLogMessage(message: any): string {
    // 处理空值情况
    if (message === null || message === undefined) {
      return String(message);
    }

    // 处理对象或数组
    if (typeof message === 'object') {
      try {
        // 使用 util.inspect 确保对象完全序列化，包括循环引用
        if (Array.isArray(message)) {
          // 数组特殊处理，避免JSON.parse可能的问题
          const sanitizedArray = [...message];
          this.sanitizeDeep(sanitizedArray);
          return util.inspect(sanitizedArray, { depth: null, maxArrayLength: null });
        } else {
          // 对象处理
          const clone = JSON.parse(JSON.stringify(message));
          this.sanitizeDeep(clone);
          return util.inspect(clone, { depth: null, maxArrayLength: null });
        }
      } catch (e) {
        // 如果对象无法序列化（例如循环引用），则转为字符串
        try {
          return this.sanitizeBase64String(util.inspect(message, { depth: null }));
        } catch (err) {
          return '[无法序列化的对象]';
        }
      }
    }

    // 处理字符串
    if (typeof message === 'string') {
      return this.sanitizeBase64String(message);
    }

    // 处理其他类型
    return this.sanitizeBase64String(String(message));
  }

  /**
   * 递归处理对象中的所有字符串属性
   * @param obj 需要处理的对象
   */
  private sanitizeDeep(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      // 处理数组
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        if (typeof value === 'string') {
          obj[i] = this.sanitizeBase64String(value);
        } else if (value && typeof value === 'object') {
          this.sanitizeDeep(value);
        }
      }
      return;
    }

    // 处理对象
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (typeof value === 'string') {
        obj[key] = this.sanitizeBase64String(value);
      } else if (value && typeof value === 'object') {
        this.sanitizeDeep(value);
      }
    }
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

  log(message: any, context?: string) {
    const sanitized = this.sanitizeLogMessage(message);
    super.log(sanitized, context);
  }

  error(message: any, trace?: string, context?: string) {
    const sanitized = this.sanitizeLogMessage(message);
    super.error(sanitized, trace, context);
  }

  warn(message: any, context?: string) {
    if (this.isDev) {
      const sanitized = this.sanitizeLogMessage(message);
      super.warn(sanitized, context);
    }
  }

  debug(message: any, context?: string) {
    if (this.isDev) {
      const sanitized = this.sanitizeLogMessage(message);
      super.debug(sanitized, context);
    }
  }

  verbose(message: any, context?: string) {
    if (this.isDev) {
      const sanitized = this.sanitizeLogMessage(message);
      super.verbose(sanitized, context);
    }
  }
}
