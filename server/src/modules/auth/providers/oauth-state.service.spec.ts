import { HttpException, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { OAuthStateService } from './oauth-state.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const newSecret = () => randomBytes(32).toString('base64url');
const proofOf = (secret: string) => createHash('sha256').update(secret, 'utf8').digest('hex');

/** 内存里的 Redis：set / getDel 与真实语义一致（getDel 取出即删） */
function memoryRedis() {
  const data = new Map<string, string>();
  return {
    data,
    set: jest.fn(async ({ key, val }: { key: string; val: string }) => void data.set(key, val)),
    getDel: jest.fn(async ({ key }: { key: string }) => {
      const value = data.get(key) ?? null;
      data.delete(key);
      return value;
    }),
  };
}

describe('OAuthStateService browser binding', () => {
  let redis: ReturnType<typeof memoryRedis>;
  let service: OAuthStateService;

  beforeEach(() => {
    redis = memoryRedis();
    service = new OAuthStateService(redis as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const inputWith = (secret: string, requestOrigin: string | null = 'https://example.com') =>
    service.normalizeCreateOAuthUrlInput(
      { scene: 'login', redirectPath: '/', browserProof: proofOf(secret) },
      requestOrigin,
    );

  describe('normalizeCreateOAuthUrlInput', () => {
    it('requires a lowercase 64-hex browser proof and keeps the request origin', () => {
      const proof = proofOf(newSecret());
      expect(service.normalizeCreateOAuthUrlInput({ browserProof: proof }, null)).toEqual({
        scene: 'oauth',
        source: undefined,
        redirectPath: '/',
        browserProof: proof,
        requestOrigin: null,
      });

      for (const browserProof of [undefined, '', proof.toUpperCase(), proof.slice(1), 123]) {
        expect(() =>
          service.normalizeCreateOAuthUrlInput({ browserProof } as any, 'https://example.com'),
        ).toThrow('登录页已更新，请刷新后重试');
      }
    });
  });

  describe('requestOriginOf', () => {
    const originOf = (headers: Record<string, unknown>) =>
      service.requestOriginOf({ headers } as any);

    it('prefers Origin, falls back to X-Website-Domain, skips only when both are absent and refuses unusable ones', () => {
      expect(originOf({ origin: 'HTTPS://Example.COM:443' })).toBe('https://example.com');
      expect(originOf({ 'x-website-domain': 'http://example.com:8080' })).toBe(
        'http://example.com:8080',
      );
      expect(
        originOf({ origin: 'https://a.example.com', 'x-website-domain': 'https://b.example.com' }),
      ).toBe('https://a.example.com');
      // 字面值 null、不合法、非 http(s) 的 Origin 不用，改用备用头
      for (const origin of ['null', 'not a url', 'chrome-extension://abc']) {
        expect(originOf({ origin, 'x-website-domain': 'https://example.com' })).toBe(
          'https://example.com',
        );
      }
      expect(
        originOf({ origin: ['https://first.example.com', 'https://second.example.com'] }),
      ).toBe('https://first.example.com');
      // 两个头都没有（或为空）才不比较
      expect(originOf({})).toBeNull();
      expect(originOf({ origin: '  ', 'x-website-domain': '' })).toBeNull();
      expect(service.requestOriginOf(undefined)).toBeNull();
      // 有头却都用不了：拒绝，不放过同源检查
      for (const headers of [
        { origin: 'null' },
        { origin: 'null', 'x-website-domain': 'garbage' },
        { 'x-website-domain': 'garbage' },
        { origin: 'chrome-extension://abc' },
      ]) {
        expect(() => originOf(headers)).toThrow('无法确认发起登录的站点，请刷新页面后重试');
      }
    });
  });

  describe('createPayload', () => {
    it('carries the proof and origin, normalizes the source and keeps the user id only for bind', () => {
      const secret = newSecret();
      const login = service.createPayload(
        'demo_oauth',
        { ...inputWith(secret), source: 'Bad-Source', userId: 3 } as any,
        'https://example.com/auth/callback/demo_oauth',
        { defaultSource: 'pc_web', userId: 3 },
      );
      expect(login).toMatchObject({
        provider: 'demo_oauth',
        scene: 'login',
        source: 'pc_web',
        browserProof: proofOf(secret),
        requestOrigin: 'https://example.com',
      });
      expect(login.userId).toBeUndefined();

      const bind = service.createPayload(
        'demo_oauth',
        { ...inputWith(secret), scene: 'bind', source: 'mobile_web' },
        'https://example.com/auth/callback/demo_oauth',
        { defaultSource: 'pc_web', userId: 3 },
      );
      expect(bind).toMatchObject({ scene: 'bind', source: 'mobile_web', userId: 3 });
    });
  });

  describe('store', () => {
    const payloadFor = (callbackUrl: string, requestOrigin: string | null) =>
      service.createPayload('demo_oauth', inputWith(newSecret(), requestOrigin), callbackUrl, {
        defaultSource: 'pc_web',
      });

    it('refuses a payload without a browser proof (a channel that skipped createPayload)', async () => {
      const logged = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
      const payload = { ...payloadFor('https://example.com/cb', null), browserProof: undefined };

      await expect(service.store('state-1', payload as any)).rejects.toMatchObject({
        status: 500,
        message: '第三方登录发起失败，请联系管理员。',
      });
      expect(redis.set).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalledWith(
        'OAuth state 缺少浏览器证明，已拒绝保存',
        undefined,
        'OAuthStateService',
      );
    });

    it('refuses a callback on another origin when the request origin is known', async () => {
      for (const callbackUrl of [
        'https://other.example.com/auth/callback/demo_oauth',
        'http://example.com/auth/callback/demo_oauth',
        'https://example.com:8443/auth/callback/demo_oauth',
        'not a url',
      ]) {
        await expect(
          service.store('state-1', payloadFor(callbackUrl, 'https://example.com')),
        ).rejects.toThrow('第三方登录的回调地址必须与当前站点同源，请检查回调地址配置');
      }
      expect(redis.set).not.toHaveBeenCalled();

      // 默认端口与大小写差异不算不同源；不知道发起站点时不比较
      await service.store(
        'state-2',
        payloadFor('HTTPS://EXAMPLE.COM:443/auth/callback/demo_oauth', 'https://example.com'),
      );
      await service.store('state-3', payloadFor('https://other.example.com/cb', null));
      expect(redis.set).toHaveBeenCalledTimes(2);
      expect(redis.set.mock.calls[0][1]).toBe(5 * 60);
    });
  });

  describe('consume', () => {
    async function stored(secret: string, provider = 'demo_oauth') {
      const payload = service.createPayload(
        provider,
        inputWith(secret),
        'https://example.com/auth/callback/demo_oauth',
        { defaultSource: 'pc_web' },
      );
      await service.store('state-1', payload);
      return payload;
    }

    it('returns the payload only with the matching tab secret', async () => {
      const secret = newSecret();
      const payload = await stored(secret);
      await expect(service.consume('demo_oauth', 'state-1', secret)).resolves.toEqual(payload);
      // 一次性：同一个 state 再来一次失效
      await expect(service.consume('demo_oauth', 'state-1', secret)).rejects.toThrow(
        '登录状态已失效，请重新授权。',
      );
    });

    it('consumes the state before checking, so a missing or wrong secret burns it', async () => {
      const secret = newSecret();
      for (const attempt of [undefined, '', newSecret(), secret.slice(0, 42), `${secret}+`, 42]) {
        await stored(secret);
        await expect(service.consume('demo_oauth', 'state-1', attempt)).rejects.toThrow(
          '登录状态已失效，请重新授权。',
        );
        expect(redis.data.size).toBe(0);
      }
      // 之后带对的密钥也回不去了
      await expect(service.consume('demo_oauth', 'state-1', secret)).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('only accepts a base64url secret of 43 – 128 characters, even when its hash matches', async () => {
      for (const secret of ['x'.repeat(129), `${'a'.repeat(42)}+`, 'short']) {
        const payload = service.createPayload(
          'demo_oauth',
          service.normalizeCreateOAuthUrlInput({ browserProof: proofOf(secret) }, null),
          'https://example.com/auth/callback/demo_oauth',
          { defaultSource: 'pc_web' },
        );
        await service.store('state-1', payload);
        await expect(service.consume('demo_oauth', 'state-1', secret)).rejects.toThrow(
          '登录状态已失效，请重新授权。',
        );
      }
      const longest = 'y'.repeat(128);
      const payload = service.createPayload(
        'demo_oauth',
        service.normalizeCreateOAuthUrlInput({ browserProof: proofOf(longest) }, null),
        'https://example.com/auth/callback/demo_oauth',
        { defaultSource: 'pc_web' },
      );
      await service.store('state-1', payload);
      await expect(service.consume('demo_oauth', 'state-1', longest)).resolves.toEqual(payload);
    });

    it('rejects states saved before the upgrade (no proof) and states of another provider', async () => {
      redis.data.set(
        'auth:oauth:state:old',
        JSON.stringify({
          provider: 'demo_oauth',
          scene: 'oauth',
          callbackUrl: 'x',
          redirectPath: '/',
        }),
      );
      await expect(service.consume('demo_oauth', 'old', newSecret())).rejects.toThrow(
        '登录状态已失效，请重新授权。',
      );

      const secret = newSecret();
      await stored(secret, 'other_oauth');
      await expect(service.consume('demo_oauth', 'state-1', secret)).rejects.toThrow(
        '登录状态不匹配，请重新授权。',
      );

      await expect(service.consume('demo_oauth', '', secret)).rejects.toBeInstanceOf(HttpException);
      expect(redis.getDel).toHaveBeenCalledTimes(2);
    });
  });
});
