import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { WECHAT_PAY_QUERY_REQUEST_FAILED, WechatPayQueryHttp } from './wechat-pay-query-http';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;

/** 本机 HTTP 替身：按路径给出不同的响应，记下请求头与连接是否被对方关闭 */
describe('WechatPayQueryHttp', () => {
  let server: Server;
  let base: string;
  let seenHeaders: Record<string, unknown>;
  let clientClosed: boolean;
  const timers: NodeJS.Timeout[] = [];

  beforeEach(async () => {
    seenHeaders = {};
    clientClosed = false;
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      seenHeaders = req.headers;
      req.on('close', () => {
        clientClosed = true;
      });
      res.on('close', () => {
        clientClosed = true;
      });
      switch (req.url) {
        case '/ok':
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"trade_state":"SUCCESS"}');
          return;
        case '/not-found':
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end('{"code":"ORDER_NOT_EXIST"}');
          return;
        case '/server-error':
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end('upstream failure');
          return;
        case '/not-json':
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('plain text');
          return;
        case '/trickle': {
          // 响应头立刻到，响应体每 50 毫秒写一点、永不结束
          res.writeHead(200, { 'content-type': 'application/json' });
          res.write('{"trade_state":');
          const timer = setInterval(() => res.write(' '), 50);
          timers.push(timer);
          return;
        }
        case '/silent':
        default:
          // 连响应头都不给
          return;
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    timers.splice(0).forEach(timer => clearInterval(timer));
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('parses a 2xx JSON body and forwards the signed headers', async () => {
    const http = new WechatPayQueryHttp(2000);
    await expect(http.get(`${base}/ok`, { Authorization: 'WECHATPAY2 fixture' })).resolves.toEqual({
      status: 200,
      data: { trade_state: 'SUCCESS' },
    });
    expect(seenHeaders.authorization).toBe('WECHATPAY2 fixture');
  });

  it('returns non-2xx bodies as text so ORDER_NOT_EXIST can still be parsed', async () => {
    const http = new WechatPayQueryHttp(2000);
    const notFound = await http.get(`${base}/not-found`, {});
    expect(notFound).toEqual({ status: 404, error: '{"code":"ORDER_NOT_EXIST"}' });
    expect(typeof notFound.error).toBe('string');
    await expect(http.get(`${base}/server-error`, {})).resolves.toEqual({
      status: 500,
      error: 'upstream failure',
    });
  });

  it('reports an unparsable 2xx body as a failed request', async () => {
    await expect(new WechatPayQueryHttp(2000).get(`${base}/not-json`, {})).resolves.toEqual({
      status: 200,
      error: WECHAT_PAY_QUERY_REQUEST_FAILED,
    });
  });

  it('aborts a response whose body keeps trickling once the absolute deadline passes', async () => {
    const started = Date.now();
    await expect(new WechatPayQueryHttp(300).get(`${base}/trickle`, {})).resolves.toEqual({
      status: undefined,
      error: WECHAT_PAY_QUERY_REQUEST_FAILED,
    });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(2000);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(clientClosed).toBe(true);
  });

  it('gives up on a server that never answers', async () => {
    const started = Date.now();
    await expect(new WechatPayQueryHttp(300).get(`${base}/silent`, {})).resolves.toEqual({
      status: undefined,
      error: WECHAT_PAY_QUERY_REQUEST_FAILED,
    });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('reports a refused connection without its details', async () => {
    const closed = createServer();
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', () => resolve()));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>(resolve => closed.close(() => resolve()));

    await expect(
      new WechatPayQueryHttp(2000).get(`http://127.0.0.1:${port}/ok`, {}),
    ).resolves.toEqual({
      status: undefined,
      error: WECHAT_PAY_QUERY_REQUEST_FAILED,
    });
  });

  it('does not serve other request kinds', async () => {
    const http = new WechatPayQueryHttp(2000);
    await expect(http.post()).rejects.toThrow('只支持 GET');
    await expect(http.upload()).rejects.toThrow('只支持 GET');
  });
});
