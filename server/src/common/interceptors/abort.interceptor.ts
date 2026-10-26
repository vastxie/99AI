import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
@Injectable()
export class AbortInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // NestJS 12 起全局拦截器也作用于 WebSocket 网关；中止控制器只挂在 HTTP 请求上
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const abortController = new AbortController();
    request.abortController = abortController;
    return next.handle();
  }
}
