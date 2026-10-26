import { getClientIp, getClientIpFromHeaders } from './getClientIp';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;

function createRequest(headers: Record<string, string>, remoteAddress: string) {
  return {
    headers,
    header: (name: string) => headers[name.toLowerCase()],
    connection: { remoteAddress },
    socket: { remoteAddress },
  } as any;
}

describe('getClientIp', () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
    delete process.env.TRUSTED_PROXY_CIDRS;
  });

  it('ignores forwarded headers when the remote address is not a trusted proxy', () => {
    const req = createRequest({ 'x-forwarded-for': '8.8.8.8' }, '203.0.113.10');

    expect(getClientIp(req)).toBe('203.0.113.10');
  });

  it('uses forwarded headers from loopback proxy during local development', () => {
    const req = createRequest({ 'x-forwarded-for': '8.8.8.8, 127.0.0.1' }, '127.0.0.1');

    expect(getClientIp(req)).toBe('8.8.8.8');
  });

  it('ignores a client-supplied X-Forwarded-For prefix appended to by the local proxy', () => {
    // nginx 的 $proxy_add_x_forwarded_for：客户端自带的值在左，nginx 看到的真实地址追加在右
    const req = createRequest(
      { 'x-forwarded-for': '198.51.100.99, 203.0.113.5', 'x-real-ip': '203.0.113.5' },
      '127.0.0.1',
    );

    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('skips configured trusted proxies from the right, such as a CDN in front of nginx', () => {
    process.env.TRUSTED_PROXY_CIDRS = '192.0.2.0/24';
    const req = createRequest(
      { 'x-forwarded-for': '198.51.100.99, 203.0.113.5, 192.0.2.10' },
      '127.0.0.1',
    );

    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('stops at a malformed hop instead of trusting anything to its left', () => {
    // 不能跳过无法解析的一项继续相信左边，也不能改信请求自带的 X-Real-IP
    const req = createRequest(
      { 'x-forwarded-for': '203.0.113.5, not-an-ip', 'x-real-ip': '198.51.100.7' },
      '127.0.0.1',
    );

    expect(getClientIp(req)).toBe('127.0.0.1');
  });

  it('returns the leftmost hop when every hop is a trusted proxy', () => {
    process.env.TRUSTED_PROXY_CIDRS = '10.0.0.0/8';
    const req = createRequest({ 'x-forwarded-for': '10.0.0.5, 10.0.0.6' }, '10.0.0.7');

    expect(getClientIp(req)).toBe('10.0.0.5');
  });

  it('matches IPv6 proxy ranges and equivalent address spellings', () => {
    process.env.TRUSTED_PROXY_CIDRS = '2001:db8:100::/48';
    expect(
      getClientIp(
        createRequest({ 'x-forwarded-for': '198.51.100.99, 203.0.113.5' }, '2001:DB8:100::7'),
      ),
    ).toBe('203.0.113.5');
    // 回环的映射写法与完整写法也算本机代理
    expect(
      getClientIp(createRequest({ 'x-forwarded-for': '203.0.113.5' }, '::FFFF:127.0.0.1')),
    ).toBe('203.0.113.5');
    expect(
      getClientIp(createRequest({ 'x-forwarded-for': '203.0.113.5' }, '0:0:0:0:0:0:0:1')),
    ).toBe('203.0.113.5');
  });

  it('applies the same chain rules to WebSocket handshakes', () => {
    expect(
      getClientIpFromHeaders({ 'x-forwarded-for': '198.51.100.99, 203.0.113.5' }, '127.0.0.1'),
    ).toBe('203.0.113.5');
    expect(getClientIpFromHeaders({ 'x-forwarded-for': '198.51.100.99' }, '203.0.113.9')).toBe(
      '203.0.113.9',
    );
  });

  it('accepts IPv4-mapped and bracketed IPv6 hops', () => {
    expect(
      getClientIp(createRequest({ 'x-forwarded-for': '1.2.3.4, ::ffff:203.0.113.5' }, '::1')),
    ).toBe('203.0.113.5');
    expect(getClientIp(createRequest({ 'x-forwarded-for': '[2001:db8::1]' }, '127.0.0.1'))).toBe(
      '2001:db8::1',
    );
  });

  it('keeps the leftmost hop when the whole proxy chain is declared trusted', () => {
    process.env.TRUST_PROXY = 'true';
    const req = createRequest({ 'x-forwarded-for': '198.51.100.99, 203.0.113.5' }, '10.0.0.2');

    expect(getClientIp(req)).toBe('198.51.100.99');
  });

  it('uses configured trusted proxy CIDRs before reading forwarded headers', () => {
    process.env.TRUSTED_PROXY_CIDRS = '10.0.0.0/8';
    const req = createRequest({ 'x-real-ip': '198.51.100.7' }, '10.2.3.4');

    expect(getClientIp(req)).toBe('198.51.100.7');
  });
});
