import { Result } from '@/common/result';
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, throwError } from 'rxjs';
import { RAW_RESPONSE } from './raw-response.decorator';
import { map } from 'rxjs/operators';
import { getErrorStack } from '../utils/error-stack.util';

const PRESERVED_HTTP_EXCEPTION_CODES = new Set([
  'SUBMISSION_CONFLICT',
  'SUBMISSION_RECORD_INCOMPLETE',
  'EXECUTION_START_FAILED',
]);

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  intercept(context: ExecutionContext, next: CallHandler): any {
    // NestJS 12 起全局拦截器也作用于 WebSocket 网关；统一响应包装只属于 HTTP，网关 ack 原样返回
    if (context.getType() !== 'http') return next.handle();
    const rawResponse = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    return next.handle().pipe(
      map(data => {
        const response = context.switchToHttp().getResponse();
        // 只把 Nest 给 POST 默认的 201 统一成 200；处理器自己写的状态（文件分段的 206 等）保持不变，
        // 否则响应头晚于这里发出时，分段内容会带着 200 发出去
        if (response.statusCode === 201) response.statusCode = 200;
        /* 标记了 @RawResponse() 的处理器（第三方回调）按其协议原样应答 */
        if (rawResponse) {
          return data;
        }
        const message = response.status < 400 ? null : response.statusText;
        return Result.success(data, message);
      }),
      catchError(error => {
        const statusCode = error.status || 500;
        const message = this.getErrorMessage(error);
        const controlled = Boolean((error as any)?.controlled);
        if ((statusCode >= 400 && statusCode < 500) || controlled) {
          Logger.warn('请求未成功', 'TransformInterceptor');
        } else {
          Logger.error('请求处理失败', getErrorStack(error), 'TransformInterceptor');
        }
        const preserved = this.getPreservedHttpExceptionFields(error);
        const exception = new HttpException(
          preserved ? { ...preserved, message } : message,
          statusCode,
        );
        if (controlled) {
          (exception as any).controlled = true;
        }
        return throwError(exception);
      }),
    );
  }

  private getErrorMessage(error: any) {
    const response = error?.response;
    if (typeof response === 'string') return response;
    if (Array.isArray(response?.message)) return response.message[0];
    if (response?.message) return response.message;
    return error?.message || 'Internal server error';
  }

  private getPreservedHttpExceptionFields(
    error: unknown,
  ): { code: string; reason?: string } | undefined {
    if (!(error instanceof HttpException)) return undefined;
    const response = error.getResponse();
    if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined;
    const { code, reason } = response as { code?: unknown; reason?: unknown };
    if (typeof code !== 'string' || !PRESERVED_HTTP_EXCEPTION_CODES.has(code)) return undefined;
    // 白名单码在 {code,message} 之外仅额外透传短字符串 reason，
    // 其余字段（data / providerResponse / stack 等）仍全部剥离
    if (typeof reason === 'string') return { code, reason };
    return { code };
  }
}
