import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { createEgressProxy } from './proxy.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}
const publicDns = async () => [{ address: '8.8.8.8', family: 4 }];
function fetchProxy(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, headers, agent: false }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
      });
      res.once('end', () => resolve({ status: res.statusCode, body }));
    });
    req.once('error', reject);
    req.end();
  });
}

test('HTTP forwarding pins the checked address and removes proxy credentials and hop headers', async () => {
  let received;
  let routed;
  const upstream = http.createServer((req, res) => {
    received = req.headers;
    res.end('fixture response');
  });
  const upstreamPort = await listen(upstream);
  const proxy = createEgressProxy({
    env: {},
    resolve: publicDns,
    request: (options, callback) => {
      routed = options;
      return http.request({ ...options, host: '127.0.0.1', port: upstreamPort }, callback);
    },
  });
  const port = await listen(proxy);
  try {
    assert.deepEqual(
      await fetchProxy(port, 'http://packages.example/fixture?q=1', {
        host: 'packages.example',
        'proxy-authorization': 'synthetic-fixture',
        connection: 'x-hop, close',
        'x-hop': 'remove-me',
        'x-request': 'keep-me',
      }),
      { status: 200, body: 'fixture response' },
    );
    assert.equal(routed.host, '8.8.8.8');
    assert.equal(routed.port, 80);
    assert.equal(routed.path, '/fixture?q=1');
    assert.equal(received.host, 'packages.example');
    assert.equal(received['proxy-authorization'], undefined);
    assert.equal(received['x-hop'], undefined);
    assert.equal(received['x-request'], 'keep-me');
  } finally {
    await close(proxy);
    await close(upstream);
  }
});

test('private resolution and mismatched HTTP authority never contact an upstream', async () => {
  let calls = 0;
  const proxy = createEgressProxy({
    env: {},
    resolve: async name =>
      name === 'private.example' ? [{ address: '169.254.169.254', family: 4 }] : publicDns(),
    request: () => {
      calls++;
      throw new Error('unexpected');
    },
  });
  const port = await listen(proxy);
  try {
    assert.equal(
      (
        await fetchProxy(port, 'http://private.example/', {
          host: 'private.example',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetchProxy(port, 'http://public.example/', {
          host: 'other.example',
        })
      ).status,
      403,
    );
    assert.equal(calls, 0);
  } finally {
    await close(proxy);
  }
});

test('CONNECT tunnels to the pinned public address on 443 and closes with the client', async () => {
  let routed;
  const upstreamSockets = new Set();
  const echo = net.createServer(socket => {
    upstreamSockets.add(socket);
    socket.on('data', data => socket.write(data));
    socket.once('close', () => upstreamSockets.delete(socket));
  });
  const echoPort = await listen(echo);
  const proxy = createEgressProxy({
    env: {},
    resolve: publicDns,
    connect: options => {
      routed = options;
      return net.connect({ host: '127.0.0.1', port: echoPort });
    },
  });
  const port = await listen(proxy);
  const client = net.connect({ host: '127.0.0.1', port });
  try {
    await once(client, 'connect');
    const handshake = once(client, 'data');
    client.write('CONNECT packages.example:443 HTTP/1.1\r\nHost: packages.example:443\r\n\r\n');
    assert.match(String((await handshake)[0]), /200 Connection Established/);
    assert.deepEqual(routed, { host: '8.8.8.8', port: 443 });
    const payload = once(client, 'data');
    client.write('synthetic TLS payload');
    assert.equal(String((await payload)[0]), 'synthetic TLS payload');
  } finally {
    client.destroy();
    for (const socket of upstreamSockets) socket.destroy();
    await close(proxy);
    await close(echo);
  }
});

test('clients resetting CONNECT tunnels mid-stream never crash the proxy for other sessions', async () => {
  // 沙箱里的请求超时放弃时会直接断开隧道；代理往已断开的连接写数据不能变成未捕获异常
  const upstreamSockets = new Set();
  const streamer = net.createServer(socket => {
    upstreamSockets.add(socket);
    socket.on('error', () => {});
    const timer = setInterval(() => {
      if (!socket.destroyed) socket.write(Buffer.alloc(64 * 1024));
    }, 2);
    socket.once('close', () => {
      clearInterval(timer);
      upstreamSockets.delete(socket);
    });
  });
  const streamPort = await listen(streamer);
  const proxy = createEgressProxy({
    env: {},
    resolve: publicDns,
    connect: () => net.connect({ host: '127.0.0.1', port: streamPort }),
  });
  const port = await listen(proxy);
  const uncaught = [];
  const record = error => uncaught.push(error?.code || String(error));
  process.on('uncaughtException', record);
  const tunnel = async () => {
    const client = net.connect({ host: '127.0.0.1', port });
    client.on('error', () => {});
    await once(client, 'connect');
    const handshake = once(client, 'data');
    client.write('CONNECT packages.example:443 HTTP/1.1\r\nHost: packages.example:443\r\n\r\n');
    assert.match(String((await handshake)[0]), /200 Connection Established/);
    return client;
  };
  try {
    for (let i = 0; i < 5; i += 1) {
      const client = await tunnel();
      await new Promise(resolve => setTimeout(resolve, 30));
      client.resetAndDestroy();
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.deepEqual(uncaught, []);
    (await tunnel()).destroy();
  } finally {
    process.off('uncaughtException', record);
    for (const socket of upstreamSockets) socket.destroy();
    await close(proxy);
    await close(streamer);
  }
});

test('explicit DNS keeps every A record subject to private-address rejection and never falls back', async t => {
  const { Resolver } = await import('node:dns/promises');
  let queries = 0;
  t.mock.method(Resolver.prototype, 'resolve4', async () => {
    queries++;
    if (queries === 1) return ['8.8.8.8', '10.0.0.1'];
    if (queries === 2) return [];
    if (queries === 3) return Array(33).fill('8.8.8.8');
    throw new Error('synthetic DNS outage');
  });
  let upstreamCalls = 0;
  const proxy = createEgressProxy({
    env: { EGRESS_DNS_SERVERS: '223.5.5.5,119.29.29.29' },
    request: () => {
      upstreamCalls++;
      throw new Error('unexpected upstream');
    },
  });
  const port = await listen(proxy);
  try {
    for (let i = 0; i < 4; i++)
      assert.equal(
        (await fetchProxy(port, 'http://public.example/', { host: 'public.example' })).status,
        403,
      );
    assert.equal(queries, 4);
    assert.equal(upstreamCalls, 0);
  } finally {
    await close(proxy);
  }
});

test('invalid, empty or private DNS configuration prevents proxy startup', () => {
  for (const value of [
    '',
    '127.0.0.11',
    '169.254.169.254',
    'dns.example',
    '1.1.1.1:53',
    '1.1.1.1,',
  ])
    assert.throws(
      () => createEgressProxy({ env: { EGRESS_DNS_SERVERS: value } }),
      /Invalid egress DNS servers/,
    );
});
