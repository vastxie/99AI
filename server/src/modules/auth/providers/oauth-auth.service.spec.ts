import { HttpException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { LoginProviderRegistry } from './login-provider.registry';
import { OAuthAuthService } from './oauth-auth.service';
import { OAuthStateService } from './oauth-state.service';
import type { AuthProviderListEntry } from './login-provider.types';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const secret = randomBytes(32).toString('base64url');
const browserProof = createHash('sha256').update(secret, 'utf8').digest('hex');
const statePayload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    provider: 'demo_oauth',
    scene: 'oauth',
    source: 'pc_web',
    callbackUrl: 'https://example.com/auth/callback/demo_oauth',
    redirectPath: '/',
    createdAt: Date.now(),
    browserProof,
    requestOrigin: 'https://example.com',
    ...overrides,
  });

describe('OAuthAuthService', () => {
  let registry: LoginProviderRegistry;
  let redis: { set: any; getDel: any };
  let identity: { bindIdentity: any; loginOrCreateByIdentity: any };
  let tokens: { issueLoginToken: any; resolveLoginPayloadFromRequest: any };
  let adapter: any;
  let service: OAuthAuthService;
  const req = { headers: {} } as any;

  beforeEach(() => {
    registry = new LoginProviderRegistry();
    redis = { set: jest.fn(), getDel: jest.fn() };
    identity = {
      bindIdentity: jest.fn().mockResolvedValue({ provider: 'demo_oauth' }),
      loginOrCreateByIdentity: jest.fn().mockResolvedValue({ id: 1 }),
    };
    tokens = {
      issueLoginToken: jest.fn().mockResolvedValue('token'),
      resolveLoginPayloadFromRequest: jest.fn().mockResolvedValue({ id: 1, role: 'viewer' }),
    };
    adapter = {
      provider: 'demo_oauth',
      kind: 'oauth',
      listEntries: async (): Promise<AuthProviderListEntry[]> => [],
      createOAuthUrl: jest.fn().mockResolvedValue('https://oauth.example.com/authorize'),
      fetchIdentityByCode: jest
        .fn()
        .mockResolvedValue({ provider: 'demo_oauth', providerUserId: '1' }),
    };
    registry.register(adapter);
    service = new OAuthAuthService(
      registry,
      new OAuthStateService(redis as any),
      identity as any,
      tokens as any,
    );
  });

  it('rejects unknown providers before touching OAuth state', async () => {
    await expect(service.createOAuthUrl('gitlab', {}, req)).rejects.toBeInstanceOf(HttpException);
    await expect(
      service.oauthCallback('gitlab', { code: 'c', state: 's' }, req),
    ).rejects.toBeInstanceOf(HttpException);
    expect(redis.getDel).not.toHaveBeenCalled();
  });

  it('requires a logged-in, non-visitor user when creating a bind URL', async () => {
    tokens.resolveLoginPayloadFromRequest.mockResolvedValue({ id: 2, role: 'visitor' });
    await expect(
      service.createOAuthUrl('demo_oauth', { scene: 'bind', browserProof }, req),
    ).rejects.toThrow('游客账号不能绑定');

    tokens.resolveLoginPayloadFromRequest.mockResolvedValue({ id: 2, role: 'viewer' });
    await service.createOAuthUrl('demo_oauth', { scene: 'bind', browserProof }, req);
    expect(adapter.createOAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ scene: 'bind', browserProof }),
      2,
    );
  });

  it('passes the browser proof and the request origin to the adapter, and refuses without a proof', async () => {
    const withOrigin = {
      headers: { origin: 'https://example.com', 'x-website-domain': 'https://other.example.com' },
    } as any;
    await service.createOAuthUrl('demo_oauth', { browserProof, redirectPath: '/c/x' }, withOrigin);
    expect(adapter.createOAuthUrl).toHaveBeenCalledWith(
      {
        scene: 'oauth',
        source: undefined,
        redirectPath: '/c/x',
        browserProof,
        requestOrigin: 'https://example.com',
      },
      undefined,
    );

    adapter.createOAuthUrl.mockClear();
    await expect(service.createOAuthUrl('demo_oauth', {}, withOrigin)).rejects.toThrow(
      '登录页已更新，请刷新后重试',
    );
    expect(adapter.createOAuthUrl).not.toHaveBeenCalled();
  });

  it('rejects a bind callback whose state belongs to another user', async () => {
    redis.getDel.mockResolvedValue(statePayload({ scene: 'bind', userId: 99 }));

    await expect(
      service.oauthCallback(
        'demo_oauth',
        { code: 'code', state: 'state', browserSecret: secret },
        req,
      ),
    ).rejects.toThrow('绑定状态不匹配');
    expect(identity.bindIdentity).not.toHaveBeenCalled();
  });

  it('consumes the state and stops before the third party when the tab secret is missing or wrong', async () => {
    for (const browserSecret of [undefined, randomBytes(32).toString('base64url')]) {
      redis.getDel.mockResolvedValueOnce(statePayload());
      await expect(
        service.oauthCallback('demo_oauth', { code: 'code', state: 'state', browserSecret }, req),
      ).rejects.toThrow('登录状态已失效，请重新授权。');
    }
    expect(redis.getDel).toHaveBeenCalledTimes(2);
    expect(adapter.fetchIdentityByCode).not.toHaveBeenCalled();
    expect(identity.loginOrCreateByIdentity).not.toHaveBeenCalled();
  });

  it('logs in through the adapter identity and honours returnsRedirectPath', async () => {
    adapter.returnsRedirectPath = true;
    redis.getDel.mockResolvedValue(statePayload({ redirectPath: '/chat/abc' }));

    await expect(
      service.oauthCallback(
        'demo_oauth',
        { code: 'code', state: 'state', browserSecret: secret },
        req,
      ),
    ).resolves.toEqual({ token: 'token', redirectPath: '/chat/abc' });
    expect(identity.loginOrCreateByIdentity).toHaveBeenCalledWith({
      provider: 'demo_oauth',
      providerUserId: '1',
    });
  });

  it('does not consume state when the callback code is missing', async () => {
    await expect(
      service.oauthCallback('demo_oauth', { code: '', state: 'state' }, req),
    ).rejects.toThrow('缺少 OAuth 授权 code');
    expect(redis.getDel).not.toHaveBeenCalled();
  });
});
