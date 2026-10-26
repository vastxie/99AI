import { of } from 'rxjs';
import { AbortInterceptor } from './abort.interceptor';

declare const describe: any;
declare const expect: any;
declare const it: any;

function contextOf(type: string, request: Record<string, unknown>) {
  return { getType: () => type, switchToHttp: () => ({ getRequest: () => request }) } as any;
}

describe('AbortInterceptor', () => {
  it('attaches an abort controller to HTTP requests', () => {
    const request: Record<string, unknown> = {};
    new AbortInterceptor().intercept(contextOf('http', request), { handle: () => of(null) });
    expect(request.abortController).toBeInstanceOf(AbortController);
  });

  it('leaves WebSocket clients untouched', () => {
    // NestJS 12 把全局拦截器也应用到网关，此时 switchToHttp().getRequest() 拿到的是 socket
    const socket: Record<string, unknown> = {};
    new AbortInterceptor().intercept(contextOf('ws', socket), { handle: () => of(null) });
    expect(socket.abortController).toBeUndefined();
  });
});
