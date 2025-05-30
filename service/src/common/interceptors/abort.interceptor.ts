import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Request } from 'express';
import { AbortController } from 'abort-controller';
import { Observable } from 'rxjs';
@Injectable()
export class AbortInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const abortController = new AbortController();
    request.abortController = abortController;
    return next.handle();
  }
}
