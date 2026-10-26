import http from 'node:http';
import net from 'node:net';
import { Resolver } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';
import { resolveTarget, forwardingHeaders, publicIPv4 } from './policy.mjs';

function publicDns(env) {
  const servers = String(env.EGRESS_DNS_SERVERS ?? '1.1.1.1,8.8.8.8')
    .split(',')
    .map(value => value.trim());
  if (!servers.length || servers.length > 3 || !servers.every(publicIPv4))
    throw new Error('Invalid egress DNS servers');
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  resolver.setServers(servers);
  // Docker's loopback resolver is outside gVisor. Validate every returned A record as before.
  return async hostname =>
    (await resolver.resolve4(hostname)).map(address => ({ address, family: 4 }));
}

/** 不保存 URL/认证头；限制在 socket 入口，HTTP keep-alive 不能绕过连接与流量额度。 */
export function createEgressProxy({
  env = process.env,
  resolve,
  connect = net.connect,
  request = http.request,
} = {}) {
  const resolveHost = resolve ?? publicDns(env);
  const clients = new Map();
  const sockets = new Set();
  const server = http.createServer({
    maxHeaderSize: 16384,
    requestTimeout: 30000,
    headersTimeout: 10000,
  });
  server.maxRequestsPerSocket = 100;
  function validClient(socket) {
    return Boolean(socket.egressAccepted && !socket.destroyed);
  }
  server.on('connection', socket => {
    const key = socket.remoteAddress;
    let client = clients.get(key);
    if (!client) {
      client = { active: 0, bytes: 0, started: Date.now() };
      clients.set(key, client);
    }
    if (Date.now() - client.started >= 3600000) {
      client.bytes = 0;
      client.started = Date.now();
    }
    if (
      sockets.size >= 128 ||
      client.active >= 16 ||
      client.bytes >= 512 * 1024 ** 2 ||
      clients.size > 256
    ) {
      socket.destroy();
      return;
    }
    client.active++;
    sockets.add(socket);
    socket.egressAccepted = true;
    let bytes = 0;
    socket.setTimeout(30000, () => socket.destroy());
    const lifetime = setTimeout(() => socket.destroy(), 120000);
    lifetime.unref();
    socket.on('data', chunk => {
      bytes += chunk.length;
      client.bytes += chunk.length;
      if (bytes > 200 * 1024 ** 2 || client.bytes > 512 * 1024 ** 2) socket.destroy();
    });
    socket.egressAccount = amount => {
      bytes += amount;
      client.bytes += amount;
      if (bytes > 200 * 1024 ** 2 || client.bytes > 512 * 1024 ** 2) {
        socket.destroy();
        return false;
      }
      return true;
    };
    socket.once('close', () => {
      clearTimeout(lifetime);
      sockets.delete(socket);
      client.active--;
    });
  });
  const reap = setInterval(() => {
    for (const [key, client] of clients)
      if (!client.active && Date.now() - client.started >= 3600000) clients.delete(key);
  }, 60000);
  reap.unref();
  server.once('close', () => {
    clearInterval(reap);
    for (const socket of sockets) socket.destroy();
  });
  server.on('request', async (req, res) => {
    const socket = req.socket;
    if (!validClient(socket)) {
      socket.destroy();
      return;
    }
    let upstream;
    const close = () => upstream?.destroy();
    socket.once('close', close);
    try {
      if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method))
        throw new Error('method');
      const target = await resolveTarget(req.url, { env, resolve: resolveHost });
      if (!validClient(socket) || req.headers.host?.toLowerCase() !== target.authority)
        throw new Error('authority');
      upstream = request(
        {
          host: target.address,
          port: target.port,
          method: req.method,
          path: target.path,
          headers: {
            ...forwardingHeaders(req.headers),
            host: target.authority,
          },
          agent: false,
          timeout: 30000,
        },
        response => {
          res.writeHead(response.statusCode || 502, forwardingHeaders(response.headers));
          response.on('data', chunk => socket.egressAccount(chunk.length));
          response.on('error', () => res.destroy());
          response.pipe(res);
        },
      );
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.once('aborted', close);
      req.on('error', close);
      res.on('error', close);
      res.once('close', close);
      res.once('finish', () => socket.removeListener('close', close));
      req.pipe(upstream);
    } catch {
      if (!res.headersSent) res.writeHead(403, { connection: 'close' });
      res.end('Egress denied');
    }
  });
  server.on('connect', async (req, socket, head) => {
    // 交出隧道时 Node 已摘掉服务器的 error 监听：客户端断开（ECONNRESET / EPIPE）只结束这条隧道
    socket.on('error', () => socket.destroy());
    if (!validClient(socket) || head.length > 16384) {
      socket.destroy();
      return;
    }
    let upstream;
    socket.once('close', () => upstream?.destroy());
    try {
      const target = await resolveTarget(req.url, {
        tunnel: true,
        env,
        resolve: resolveHost,
      });
      if (!validClient(socket)) return;
      upstream = connect({ host: target.address, port: target.port });
      upstream.setTimeout(30000, () => upstream.destroy());
      upstream.once('connect', () => {
        if (!validClient(socket)) {
          upstream.destroy();
          return;
        }
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.on('data', chunk => socket.egressAccount(chunk.length));
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      upstream.on('error', () => socket.destroy());
      upstream.once('close', () => socket.destroy());
    } catch {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    }
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  return server;
}
const CONNECTION_ERRORS = new Set([
  'ECONNRESET',
  'EPIPE',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ERR_STREAM_DESTROYED',
  'ERR_STREAM_WRITE_AFTER_END',
]);
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // 连接级错误已由各连接自己的处理收尾，这里只兜住遗漏的一条连接；其他异常仍然退出
  process.on('uncaughtException', error => {
    if (CONNECTION_ERRORS.has(error?.code)) return;
    console.error(error);
    process.exit(1);
  });
  createEgressProxy().listen(3128, '0.0.0.0');
}
