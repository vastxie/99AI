import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import * as http from 'http';
import * as https from 'https';
import * as StrictPublicDns from './strict-public-dns.util';
import {
  isBlockedNetworkAddress,
  isBlockedResolvedNetworkAddress,
  resolveValidatedNetworkAddresses,
  safeDownloadToBuffer,
  validateStrictPublicHttpUrl,
  validateStrictPublicRedirectUrl,
} from './safe-download.util';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

let server: Server | null = null;
const originalEnv = { ...process.env };

function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  return new Promise(resolve => {
    server!.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      if (typeof address === 'object' && address) {
        resolve(`http://example.test:${address.port}`);
      }
    });
  });
}

const localLookup: any = (_hostname: string, optionsOrCallback: any, maybeCallback?: any) => {
  const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback || {};
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
  if (options.all) {
    callback(null, [{ address: '127.0.0.1', family: 4 }]);
    return;
  }
  callback(null, '127.0.0.1', 4);
};

function trackHttpConnections() {
  const sockets: any[] = [];
  let active = 0;
  let maxActive = 0;
  const original = http.Agent.prototype.createConnection;
  const spy = jest.spyOn(http.Agent.prototype, 'createConnection').mockImplementation(function (
    this: http.Agent,
    ...args: any[]
  ) {
    const socket = (original as any).apply(this, args);
    sockets.push(socket);
    active += 1;
    maxActive = Math.max(maxActive, active);
    socket.once('close', () => {
      active = Math.max(0, active - 1);
    });
    return socket;
  });
  return {
    sockets,
    restore: () => spy.mockRestore(),
    get active() {
      return active;
    },
    get maxActive() {
      return maxActive;
    },
  };
}

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(async () => {
  if (server) {
    await new Promise(resolve => server!.close(resolve));
    server = null;
  }
  process.env = { ...originalEnv };
});

describe('safeDownloadToBuffer', () => {
  it('downloads local URLs by default and keeps content type', async () => {
    const baseUrl = await listen((_req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.end('hello');
    });

    const result = await safeDownloadToBuffer(
      `${baseUrl.replace('example.test', 'localhost')}/file.txt`,
      {
        maxBytes: 32,
      },
    );

    expect(result.buffer.toString('utf8')).toBe('hello');
    expect(result.contentType).toBe('text/plain');
  });

  it('rejects direct loopback URLs when private network guard is enabled', async () => {
    await expect(
      safeDownloadToBuffer('http://127.0.0.1/file.txt', {
        blockPrivateNetwork: true,
      }),
    ).rejects.toThrow(/内网|保留地址/);
  });

  it('keeps direct loopback URLs blocked even in development mode', async () => {
    process.env.ISDEV = 'true';

    await expect(
      safeDownloadToBuffer('http://127.0.0.1/file.txt', {
        blockPrivateNetwork: true,
      }),
    ).rejects.toThrow(/内网|保留地址/);
  });

  it('allows localhost hostname downloads in development mode', async () => {
    process.env.ISDEV = 'true';
    const baseUrl = await listen((_req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.end('local-hostname-dev');
    });

    const result = await safeDownloadToBuffer(
      `${baseUrl.replace('example.test', 'localhost')}/file.txt`,
      {
        blockPrivateNetwork: true,
        maxBytes: 32,
      },
    );

    expect(result.buffer.toString('utf8')).toBe('local-hostname-dev');
  });

  it('supports Node all:true lookup callback shape for localhost downloads in development mode', async () => {
    process.env.ISDEV = 'true';
    const baseUrl = await listen((_req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.end('local-hostname-dev');
    });

    const hostnameUrl = baseUrl.replace('example.test', 'localhost');
    const result = await safeDownloadToBuffer(`${hostnameUrl}/file.txt`, {
      blockPrivateNetwork: true,
      maxBytes: 32,
    });

    expect(result.buffer.toString('utf8')).toBe('local-hostname-dev');
    expect(result.contentType).toBe('text/plain');
  });

  it('keeps direct 198.18/15 URLs and default DNS proxy resolutions blocked', async () => {
    expect(isBlockedNetworkAddress('198.18.13.81')).toBe(true);
    expect(isBlockedResolvedNetworkAddress('198.18.13.81', 'image.lightai.io')).toBe(true);
    await expect(
      safeDownloadToBuffer('https://198.18.13.81/file.txt', {
        blockPrivateNetwork: true,
      }),
    ).rejects.toThrow(/内网|保留地址/);
  });

  it('uses fixed TLS DNS only for all-benchmark strict resolutions and revalidates every answer', async () => {
    const resolver = jest
      .spyOn(StrictPublicDns, 'resolveStrictPublicHostname')
      .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    try {
      await expect(
        resolveValidatedNetworkAddresses(
          'example.com',
          [{ address: '198.18.13.81', family: 4 }],
          [],
          true,
        ),
      ).resolves.toEqual([{ address: '93.184.216.34', family: 4 }]);
      expect(resolver).toHaveBeenCalledWith('example.com');

      resolver.mockClear();
      await expect(
        resolveValidatedNetworkAddresses(
          'example.com',
          [
            { address: '198.18.13.81', family: 4 },
            { address: '93.184.216.34', family: 4 },
          ],
          [],
          true,
        ),
      ).rejects.toThrow(/内网|保留地址/);
      expect(resolver).not.toHaveBeenCalled();

      resolver.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      await expect(
        resolveValidatedNetworkAddresses(
          'example.com',
          [{ address: '198.19.0.2', family: 4 }],
          [],
          true,
        ),
      ).rejects.toThrow(/内网|保留地址/);

      resolver.mockRejectedValue(new Error('resolver unavailable'));
      await expect(
        resolveValidatedNetworkAddresses(
          'example.com',
          [{ address: '198.18.13.81', family: 4 }],
          [],
          true,
        ),
      ).rejects.toThrow(/DNS/);
    } finally {
      resolver.mockRestore();
    }
  });

  it('blocks documentation, mapped, translation, tunnel and non-global address families', () => {
    for (const address of [
      '192.0.2.1',
      '192.88.99.1',
      '198.51.100.1',
      '203.0.113.1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::127.0.0.1',
      '64:ff9b::7f00:1',
      '64:ff9b:1::1',
      '100::1',
      '2001:db8::1',
      '2002:7f00:1::',
      '3fff::1',
      '5f00::1',
      'fc00::1',
      'fec0::1',
      'fe80::1',
      'ff02::1',
    ]) {
      expect(isBlockedNetworkAddress(address)).toBe(true);
    }
    expect(isBlockedNetworkAddress('8.8.8.8')).toBe(false);
    expect(isBlockedNetworkAddress('2001:4860:4860::8888')).toBe(false);
    expect(isBlockedNetworkAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('keeps private URLs blocked without a process-global or per-call bypass', async () => {
    await expect(
      safeDownloadToBuffer('http://127.0.0.1/file.txt', {
        blockPrivateNetwork: true,
        maxBytes: 32,
      }),
    ).rejects.toThrow(/内网|保留地址/);
  });

  it('keeps strict public mode non-bypassable', async () => {
    process.env.ISDEV = 'true';

    await expect(
      safeDownloadToBuffer('http://127.0.0.1/file.txt', {
        blockPrivateNetwork: false,
        strictPublicNetwork: true,
        allowedHosts: ['example.test'],
      }),
    ).rejects.toThrow(/指定的公开主机/);

    await expect(
      safeDownloadToBuffer('http://localhost/file.txt', {
        strictPublicNetwork: true,
        allowedHosts: ['localhost'],
      }),
    ).rejects.toThrow(/内网|保留地址/);
  });

  it('strips sensitive headers on cross-origin redirects while retaining safe headers', async () => {
    const requests: Array<{ host?: string; apiKey?: string; trace?: string }> = [];
    let redirectTarget = '';
    const baseUrl = await listen((req, res) => {
      requests.push({
        host: req.headers.host,
        apiKey: req.headers['x-goog-api-key'] as string | undefined,
        trace: req.headers['x-trace-id'] as string | undefined,
      });
      if (req.headers.host?.startsWith('source.test')) {
        res.statusCode = 302;
        res.setHeader('Location', redirectTarget);
        res.end();
        return;
      }
      res.end('redirected');
    });
    const port = new URL(baseUrl).port;
    redirectTarget = `http://target.test:${port}/final`;

    const result = await safeDownloadToBuffer(`http://source.test:${port}/start`, {
      headers: {
        Authorization: 'Bearer sensitive',
        Cookie: 'session=sensitive',
        'x-goog-api-key': 'sensitive-key',
        'x-trace-id': 'trace-safe',
      },
      lookup: localLookup,
    });

    expect(result.buffer.toString()).toBe('redirected');
    expect(requests[0]).toMatchObject({ apiKey: 'sensitive-key', trace: 'trace-safe' });
    expect(requests[1]).toMatchObject({ apiKey: undefined, trace: 'trace-safe' });
  });

  it('uses request-private direct agents instead of process-global HTTP agents in strict mode', async () => {
    const globalHttpConnection = jest.spyOn(http.globalAgent, 'createConnection');
    const globalHttpsConnection = jest.spyOn(https.globalAgent, 'createConnection');
    try {
      await expect(
        safeDownloadToBuffer('http://localhost/article', {
          strictPublicNetwork: true,
          allowedHosts: ['localhost'],
          maxBytes: 32,
          timeoutMs: 500,
        }),
      ).rejects.toThrow(/内网|保留地址/);
      await expect(
        safeDownloadToBuffer('https://localhost/article', {
          strictPublicNetwork: true,
          allowedHosts: ['localhost'],
          maxBytes: 32,
          timeoutMs: 500,
        }),
      ).rejects.toThrow(/内网|保留地址/);
      expect(globalHttpConnection).not.toHaveBeenCalled();
      expect(globalHttpsConnection).not.toHaveBeenCalled();
    } finally {
      globalHttpConnection.mockRestore();
      globalHttpsConnection.mockRestore();
    }
  });

  it('does not inherit Node 24 process proxy routing in strict mode', async () => {
    const setGlobalProxyFromEnv = (http as any).setGlobalProxyFromEnv;
    if (typeof setGlobalProxyFromEnv !== 'function') return;
    let proxyRequests = 0;
    const proxyUrl = await listen((_req, res) => {
      proxyRequests += 1;
      res.end('proxy response must not be used');
    });
    const restoreProxy = setGlobalProxyFromEnv({
      HTTP_PROXY: proxyUrl.replace('example.test', '127.0.0.1'),
      HTTPS_PROXY: proxyUrl.replace('example.test', '127.0.0.1'),
      NO_PROXY: '',
    });
    try {
      await expect(
        safeDownloadToBuffer('http://localhost/article', {
          strictPublicNetwork: true,
          allowedHosts: ['localhost'],
          maxBytes: 32,
          timeoutMs: 500,
        }),
      ).rejects.toThrow(/内网|保留地址/);
      expect(proxyRequests).toBe(0);
    } finally {
      restoreProxy();
    }
  });

  it('requires exact redirect hosts and standard ports in strict public mode', () => {
    expect(
      validateStrictPublicHttpUrl('https://example.test/article', ['EXAMPLE.test.']).hostname,
    ).toBe('example.test');
    expect(() =>
      validateStrictPublicHttpUrl('https://cdn.example.test/article', ['example.test']),
    ).toThrow(/指定的公开主机/);
    expect(() =>
      validateStrictPublicHttpUrl('https://example.test:8443/article', ['example.test']),
    ).toThrow(/标准端口/);
    expect(
      validateStrictPublicRedirectUrl(
        'http://example.test/article',
        'https://example.test/article',
        ['example.test'],
      ).protocol,
    ).toBe('https:');
    expect(() =>
      validateStrictPublicRedirectUrl(
        'https://example.test/article',
        'http://example.test/article',
        ['example.test'],
      ),
    ).toThrow(/降级重定向/);
  });

  it('rejects strict-mode DNS, proxy and credential escape hatches', async () => {
    await expect(
      safeDownloadToBuffer('https://example.test/article', {
        strictPublicNetwork: true,
        allowedHosts: ['example.test'],
        lookup: localLookup,
      }),
    ).rejects.toThrow(/自定义 DNS/);
    await expect(
      safeDownloadToBuffer('https://example.test/article', {
        strictPublicNetwork: true,
        allowedHosts: ['example.test'],
        reservedProxyHosts: ['.example.test'],
      }),
    ).rejects.toThrow(/代理地址例外/);
    await expect(
      safeDownloadToBuffer('https://example.test/article', {
        strictPublicNetwork: true,
        allowedHosts: ['example.test'],
        headers: { Cookie: 'secret=1' },
      }),
    ).rejects.toThrow(/内容协商请求头/);
    await expect(
      safeDownloadToBuffer('https://example.test/article', {
        strictPublicNetwork: true,
        allowedHosts: ['example.test'],
        headers: { Host: 'internal.example.test' },
      }),
    ).rejects.toThrow(/内容协商请求头/);
    await expect(
      safeDownloadToBuffer('https://example.test/article', {
        strictPublicNetwork: true,
        allowedHosts: ['example.test'],
        maxBytes: 16 * 1024 * 1024 + 1,
      }),
    ).rejects.toThrow(/字节上限/);
    await expect(
      safeDownloadToBuffer('https://example.test/article', {
        strictPublicNetwork: true,
        allowedHosts: ['example.test'],
        maxRedirects: 6,
      }),
    ).rejects.toThrow(/重定向上限/);
    await expect(
      safeDownloadToBuffer('https://example.test/article', {
        strictPublicNetwork: true,
        allowedHosts: ['example.test'],
        timeoutMs: 30_001,
      }),
    ).rejects.toThrow(/超时上限/);
  });

  it('applies an absolute timeout while DNS lookup is still pending', async () => {
    const stalledLookup: any = (): void => undefined;
    const startedAt = Date.now();
    await expect(
      safeDownloadToBuffer('http://example.test/file.txt', {
        lookup: stalledLookup,
        maxBytes: 32,
        timeoutMs: 25,
      }),
    ).rejects.toThrow(/超时/);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it('allows 198.18/15 DNS proxy resolutions only for trusted reserved proxy hosts', async () => {
    process.env.SAFE_DOWNLOAD_RESERVED_PROXY_HOSTS = 'image.lightai.io,.trusted-cdn.test';

    expect(isBlockedResolvedNetworkAddress('198.18.13.81', 'image.lightai.io')).toBe(false);
    expect(isBlockedResolvedNetworkAddress('198.18.13.81', 'asset.trusted-cdn.test')).toBe(false);
    expect(
      isBlockedResolvedNetworkAddress(
        '198.18.19.134',
        'images-1251118812.cos.ap-guangzhou.myqcloud.com',
      ),
    ).toBe(false);
    expect(
      isBlockedResolvedNetworkAddress('198.18.19.134', 'bucket.oss-cn-hangzhou.aliyuncs.com'),
    ).toBe(false);
    expect(isBlockedResolvedNetworkAddress('198.18.19.134', 'bucket.s3.amazonaws.com')).toBe(false);
    expect(isBlockedResolvedNetworkAddress('198.18.13.81', 'evil.example.com')).toBe(true);
    expect(
      isBlockedResolvedNetworkAddress('198.18.13.81', 'img.cdn.media-vendor.example', [
        '.cdn.media-vendor.example',
      ]),
    ).toBe(false);
    expect(
      isBlockedResolvedNetworkAddress('198.18.13.81', 'media.media-vendor.example', [
        '.cdn.media-vendor.example',
      ]),
    ).toBe(true);
  });

  it('validates redirect targets before following them', async () => {
    // 开发模式只放行 localhost 解析到的回环地址，首跳能连上，跳转目标仍要校验
    process.env.ISDEV = 'true';
    const baseUrl = await listen((_req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', 'http://169.254.169.254/private');
      res.end();
    });

    await expect(
      safeDownloadToBuffer(`${baseUrl.replace('example.test', 'localhost')}/redirect`, {
        blockPrivateNetwork: true,
        lookup: localLookup,
        maxBytes: 32,
      }),
    ).rejects.toThrow(/内网|保留地址/);
  });

  it('validates the addresses returned by a caller-supplied DNS lookup', async () => {
    const privateLookup: any = (_hostname: string, options: any, callback: any) => {
      if (options?.all) callback(null, [{ address: '10.0.0.8', family: 4 }]);
      else callback(null, '10.0.0.8', 4);
    };
    const singleAddressLookup: any = (_hostname: string, _options: any, callback: any) =>
      callback(null, '192.168.1.20', 4);
    for (const lookup of [privateLookup, singleAddressLookup, localLookup]) {
      await expect(
        safeDownloadToBuffer('http://files.example.test/file.txt', {
          blockPrivateNetwork: true,
          lookup,
          maxBytes: 32,
          timeoutMs: 2000,
        }),
      ).rejects.toThrow(/内网|保留地址/);
    }
  });

  it.each([
    [302, /Location/],
    [404, /HTTP 404/],
  ])(
    'closes an unfinished HTTP %s connection before rejecting the logical fetch',
    async (statusCode: number, expectedError: RegExp) => {
      const tracker = trackHttpConnections();
      const baseUrl = await listen((_req, res) => {
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'text/plain');
        res.flushHeaders();
        res.write('unfinished-response');
        const writer = setInterval(() => res.write('.'), 10);
        writer.unref?.();
        res.once('close', () => clearInterval(writer));
      });

      try {
        await expect(
          safeDownloadToBuffer(`${baseUrl}/unfinished`, {
            lookup: localLookup,
            maxBytes: 64,
            timeoutMs: 500,
          }),
        ).rejects.toThrow(expectedError);
        expect(tracker.active).toBe(0);
        expect(tracker.sockets.every(socket => socket.destroyed)).toBe(true);
      } finally {
        tracker.restore();
      }
    },
  );

  it('closes each redirect connection before starting the next request', async () => {
    const tracker = trackHttpConnections();
    const baseUrl = await listen((req, res) => {
      if (req.url === '/redirect') {
        res.statusCode = 302;
        res.setHeader('Location', '/final');
        res.flushHeaders();
        res.write('unfinished-redirect');
        const writer = setInterval(() => res.write('.'), 10);
        writer.unref?.();
        res.once('close', () => clearInterval(writer));
        return;
      }
      res.setHeader('Content-Type', 'text/plain');
      res.end('redirected');
    });

    try {
      const result = await safeDownloadToBuffer(`${baseUrl}/redirect`, {
        lookup: localLookup,
        maxBytes: 64,
        maxRedirects: 1,
        timeoutMs: 500,
      });
      expect(result.buffer.toString('utf8')).toBe('redirected');
      expect(tracker.maxActive).toBe(1);
    } finally {
      tracker.restore();
    }
  });

  it('rejects responses whose declared content length exceeds the limit', async () => {
    const tracker = trackHttpConnections();
    const baseUrl = await listen((_req, res) => {
      res.setHeader('Content-Length', '64');
      res.end('too-large');
    });

    try {
      await expect(
        safeDownloadToBuffer(`${baseUrl}/large`, {
          lookup: localLookup,
          maxBytes: 8,
        }),
      ).rejects.toThrow(/过大/);
      expect(tracker.active).toBe(0);
      expect(tracker.sockets.every(socket => socket.destroyed)).toBe(true);
    } finally {
      tracker.restore();
    }
  });

  it('stops reading once cumulative bytes exceed the limit', async () => {
    const tracker = trackHttpConnections();
    const baseUrl = await listen((_req, res) => {
      res.write(Buffer.alloc(8, 1));
      res.write(Buffer.alloc(8, 2));
      res.end();
    });

    try {
      await expect(
        safeDownloadToBuffer(`${baseUrl}/stream`, {
          lookup: localLookup,
          maxBytes: 12,
        }),
      ).rejects.toThrow(/过大/);
      expect(tracker.active).toBe(0);
      expect(tracker.sockets.every(socket => socket.destroyed)).toBe(true);
    } finally {
      tracker.restore();
    }
  });
});
