import { HttpException, Logger } from '@nestjs/common';

export function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,39}$/;

/**
 * 不含消息与调用栈的错误摘要：只有类型、错误码与 errno，各自按白名单过滤，不合规的项不写。
 * 数据库等错误的消息可能带用户数据（如重复键里的联系方式），消息里还可能有伪装成栈帧的行，所以两者都不输出
 */
export function getSafeErrorSummary(error: unknown): string {
  const source = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>;
  const name =
    typeof source.name === 'string' && SAFE_ERROR_NAME.test(source.name) ? source.name : 'Error';
  const parts = [name];
  if (typeof source.code === 'string' && SAFE_ERROR_CODE.test(source.code)) {
    parts.push(`code=${source.code}`);
  }
  if (Number.isInteger(source.errno)) parts.push(`errno=${source.errno}`);
  return parts.join(' ');
}

/**
 * 业务异常（HttpException）原样抛出；其他错误只记静态文案与安全摘要，换成调用方给的静态异常抛出。
 * 原始错误不再向上传：TransformInterceptor 与全局异常过滤器会记录原始消息与调用栈
 */
export function rethrowAsSafeException(
  error: unknown,
  message: string,
  context: string,
  replacement: () => HttpException,
): never {
  if (error instanceof HttpException) throw error;
  Logger.error(message, getSafeErrorSummary(error), context);
  throw replacement();
}
