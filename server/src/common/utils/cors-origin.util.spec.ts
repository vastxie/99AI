import { Logger } from '@nestjs/common';
import {
  createCorsOriginDelegate,
  isCorsOriginAllowed,
  resolveCorsAllowedOrigins,
} from './cors-origin.util';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('cors-origin.util', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('resolves site origins without allowing wildcard', () => {
    process.env.SITE_URL = 'https://env.example.com/base';

    expect(resolveCorsAllowedOrigins({ siteUrl: 'https://site.example.com/app' })).toEqual([
      'https://site.example.com',
      'https://env.example.com',
    ]);
  });

  it('ignores legacy split-domain CORS environment variables', () => {
    process.env.FRONTEND_URL = 'https://chat.example.com';
    process.env.ADMIN_URL = 'https://admin.example.com';
    process.env.CORS_ALLOWED_ORIGINS = 'https://other.example.com';

    expect(resolveCorsAllowedOrigins()).toEqual([]);
  });

  it('rejects unknown production origins while allowing configured site origin', () => {
    const allowed = ['https://site.example.com'];

    expect(isCorsOriginAllowed('https://site.example.com/page', allowed, 'production')).toBe(true);
    expect(isCorsOriginAllowed('https://evil.example.com', allowed, 'production')).toBe(false);
    expect(isCorsOriginAllowed(undefined, allowed, 'production')).toBe(true);
  });

  it('allows localhost only in an explicitly declared development environment', () => {
    delete process.env.ISDEV;
    expect(isCorsOriginAllowed('http://localhost:9002', [], 'development')).toBe(true);
    expect(isCorsOriginAllowed('http://127.0.0.1:9000', [], 'development')).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:9002', [], 'production')).toBe(false);
    // 未设置 NODE_ENV 视为生产，不再默认放行 localhost（jest 自带 NODE_ENV=test，这里显式传空串模拟未设置）
    expect(isCorsOriginAllowed('http://localhost:9002', [], '')).toBe(false);
    process.env.ISDEV = 'true';
    expect(isCorsOriginAllowed('http://localhost:9002', [], '')).toBe(true);
  });

  it('uses a callback delegate compatible with HTTP and Socket.IO CORS', () => {
    const callback = jest.fn();
    const delegate = createCorsOriginDelegate(['https://site.example.com'], 'production');

    delegate('https://site.example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rejects unknown origins through the delegate in production', () => {
    const callback = jest.fn();
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    const delegate = createCorsOriginDelegate(['https://site.example.com'], 'production');

    delegate('https://evil.example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
    warnSpy.mockRestore();
  });
});
