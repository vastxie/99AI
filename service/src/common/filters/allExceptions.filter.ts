import { Result } from '@/common/result';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class AllExceptionsFilter<_T> implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const _request = ctx.getRequest<Request>();

    // 检查异常是否是 HttpException 类型
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      // 如果是 ValidationPipe 抛出的异常
      if (status === HttpStatus.BAD_REQUEST && Array.isArray(exceptionResponse?.message)) {
        response.status(status).json({
          code: status,
          message: exceptionResponse.message[0],
          data: null,
        });
        return;
      }

      response.status(status).json({
        code: status,
        message: exception.message,
        data: null,
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
