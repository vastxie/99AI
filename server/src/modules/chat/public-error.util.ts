import { HttpException } from '@nestjs/common';

/** 不带 HTTP 状态、但原因可以直接告诉用户的业务错误码 */
const PUBLIC_PLAIN_ERROR_CODES = new Set(['SUBMISSION_CONFLICT', 'TURN_MISMATCH']);

export function errorResponseOf(error: any): any {
  if (typeof error?.getResponse === 'function') return error.getResponse();
  return error?.response;
}

/**
 * 原因可以告诉用户的错误：4xx（参数、权限、额度、限流、违规……）与少数业务码。
 * 其余（5xx、未知异常）按内部错误处理，只给通用文案，不外泄细节
 */
export function isPublicError(error: any): boolean {
  const status = Number(
    error instanceof HttpException && typeof error.getStatus === 'function'
      ? error.getStatus()
      : error?.status,
  );
  if (Number.isInteger(status) && status >= 400 && status < 500) return true;
  return PUBLIC_PLAIN_ERROR_CODES.has(String(error?.code || ''));
}

export function publicErrorMessage(error: any, fallbackMessage: string): string {
  if (!isPublicError(error)) return fallbackMessage;
  const response = errorResponseOf(error);
  if (response && typeof response === 'object' && typeof response.message === 'string') {
    return response.message;
  }
  if (typeof response === 'string') return response;
  return error?.message || fallbackMessage;
}

function businessCodeOf(error: any): string | undefined {
  if (!isPublicError(error)) return undefined;
  const response = errorResponseOf(error);
  if (response && typeof response === 'object' && typeof response.code === 'string') {
    return response.code;
  }
  if (typeof error?.code === 'string') return error.code;
  return undefined;
}

/**
 * 对外错误码：业务 code 优先，其次按 HTTP status 归类。
 * 402（额度 / 积分不足，计费实现抛出）归为 PAYMENT_REQUIRED：前端据此引导购买，不按文案猜
 */
export function publicErrorCode(error: any): string {
  if (!isPublicError(error)) return 'INTERNAL_ERROR';
  const status = typeof error?.getStatus === 'function' ? error.getStatus() : error?.status;
  return (
    businessCodeOf(error) ||
    (status === 403
      ? 'FORBIDDEN'
      : status === 402
        ? 'PAYMENT_REQUIRED'
        : status === 401
          ? 'UNAUTHORIZED'
          : status && status < 500
            ? 'BAD_REQUEST'
            : 'INTERNAL_ERROR')
  );
}
