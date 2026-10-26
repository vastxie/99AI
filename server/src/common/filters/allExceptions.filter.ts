import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { getErrorStack } from '../utils/error-stack.util';

@Catch()
export class AllExceptionsFilter<_T> implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // 记录错误日志：4xx 客户端错误用 WARN，5xx 服务端错误用 ERROR
    if (exception instanceof Error) {
      if (exception instanceof HttpException) {
        const status = exception.getStatus();
        if ((status >= 400 && status < 500) || (exception as any).controlled) {
          Logger.warn(`异常: ${exception.message}`, 'AllExceptionsFilter');
        } else {
          Logger.error(
            `异常: ${exception.message}`,
            getErrorStack(exception),
            'AllExceptionsFilter',
          );
        }
      } else {
        Logger.error(`异常: ${exception.message}`, getErrorStack(exception), 'AllExceptionsFilter');
      }
    }

    // 检查响应是否已经发送，如果已发送则不再处理
    if (response.headersSent || response.writableEnded) {
      return;
    }

    // 检查异常是否是 HttpException 类型
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      // 如果是 ValidationPipe 抛出的异常
      if (status === HttpStatus.BAD_REQUEST && Array.isArray(exceptionResponse?.message)) {
        response.status(status).json({
          code: status,
          message: exceptionResponse.message[0],
          messageKey: exceptionResponse?.messageKey,
          data: null,
        });
        return;
      }

      const isControlled = (exception as any).controlled === true;
      const rawMessage =
        typeof exceptionResponse === 'string'
          ? exception.message
          : exceptionResponse?.message || exception.message;
      // 非受控 5xx 不回显原始 message（可能含内部细节/SQL/路径），用通用文案
      const safeMessage = status >= 500 && !isControlled ? '服务器内部错误' : rawMessage;
      response.status(status).json({
        code: exceptionResponse?.code || status,
        message: safeMessage,
        messageKey: exceptionResponse?.messageKey,
        // TransformInterceptor 只为白名单业务码保留短字符串 reason，此处原样透传给客户端
        reason:
          typeof exceptionResponse?.reason === 'string' ? exceptionResponse.reason : undefined,
        data: exceptionResponse?.data || null,
      });
      return;
    }

    // 处理其他类型的异常
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '服务器内部错误',
      data: null,
    });
  }
}
