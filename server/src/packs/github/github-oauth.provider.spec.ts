import { HttpException } from '@nestjs/common';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { LoginProviderRegistry } from '@/modules/auth/providers/login-provider.registry';
import { OAuthStateService } from '@/modules/auth/providers/oauth-state.service';
import { GITHUB_PROVIDER, GithubOAuthProvider } from './github-oauth.provider';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const secret = randomBytes(32).toString('base64url');
const browserProof = createHash('sha256').update(secret, 'utf8').digest('hex');

describe('GithubOAuthProvider', () => {
  let globalConfigService: { getConfigs: any };
  let redisCacheService: { set: any; getDel: any };
  let oauthState: OAuthStateService;
  let registry: LoginProviderRegistry;
  let github: GithubOAuthProvider;

  beforeEach(() => {
    globalConfigService = { getConfigs: jest.fn() };
    redisCacheService = { set: jest.fn(), getDel: jest.fn() };
    oauthState = new OAuthStateService(redisCacheService as any);
    registry = new LoginProviderRegistry();
    github = new GithubOAuthProvider(globalConfigService as any, oauthState, registry);
    (axios.get as any).mockReset();
    (axios.post as any).mockReset();
  });

  it('registers itself as the github OAuth adapter', () => {
    expect(registry.getOAuth(GITHUB_PROVIDER)).toBe(github);
  });

  it('lists GitHub login only when enabled and configured', async () => {
    globalConfigService.getConfigs.mockResolvedValue({
      githubLoginEnabled: '1',
      githubClientId: 'github-client-id',
      githubClientSecret: 'github-client-secret',
      siteUrl: 'https://chat.example.com',
    });
    await expect(github.listEntries()).resolves.toEqual([
      {
        provider: GITHUB_PROVIDER,
        displayName: 'GitHub',
        type: 'oauth',
        scene: 'login',
        enabled: true,
      },
    ]);

    globalConfigService.getConfigs.mockResolvedValue({
      githubLoginEnabled: '1',
      githubClientId: 'github-client-id',
      githubClientSecret: '',
      siteUrl: 'https://chat.example.com',
    });
    await expect(github.listEntries()).resolves.toEqual([]);
  });

  it('lists GitHub login only when its callback address can be resolved', async () => {
    const base = {
      githubLoginEnabled: '1',
      githubClientId: 'github-client-id',
      githubClientSecret: 'github-client-secret',
    };
    const listed = async (extra: Record<string, string>) => {
      globalConfigService.getConfigs.mockResolvedValue({ ...base, ...extra });
      return (await github.listEntries()).length === 1;
    };
    const callback = 'https://chat.example.com/auth/callback/github';

    await expect(listed({ githubCallbackUrl: callback })).resolves.toBe(true);
    await expect(listed({ siteUrl: 'https://chat.example.com' })).resolves.toBe(true);
    await expect(listed({})).resolves.toBe(false);
    await expect(listed({ githubCallbackUrl: '  ', siteUrl: ' ' })).resolves.toBe(false);
    await expect(
      listed({ githubCallbackUrl: '  ', siteUrl: 'https://chat.example.com' }),
    ).resolves.toBe(true);
    await expect(listed({ githubCallbackUrl: callback, githubClientId: ' ' })).resolves.toBe(false);
    // 配置补齐后入口恢复
    await expect(listed({ githubCallbackUrl: callback })).resolves.toBe(true);
  });

  it('creates GitHub OAuth authorize URL and stores provider state', async () => {
    globalConfigService.getConfigs.mockResolvedValue({
      githubLoginEnabled: '1',
      githubClientId: 'github-client-id',
      githubClientSecret: 'github-client-secret',
      githubCallbackUrl: 'https://example.com/auth/callback/github',
      siteUrl: '',
    });

    const url = (await github.createOAuthUrl(
      oauthState.normalizeCreateOAuthUrlInput({ scene: 'login', browserProof }, null),
    )) as string;

    expect(url).toContain('https://github.com/login/oauth/authorize?');
    expect(url).toContain('client_id=github-client-id');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fauth%2Fcallback%2Fgithub');
    expect(url).toContain('scope=read%3Auser+user%3Aemail');
    expect(redisCacheService.set).toHaveBeenCalledWith(
      { key: expect.stringMatching(/^auth:oauth:state:/), val: expect.any(String) },
      5 * 60,
    );
    const statePayload = JSON.parse(redisCacheService.set.mock.calls[0][0].val);
    expect(statePayload).toMatchObject({
      provider: GITHUB_PROVIDER,
      scene: 'login',
      source: 'pc_web',
      callbackUrl: 'https://example.com/auth/callback/github',
      redirectPath: '/',
      browserProof,
      requestOrigin: null,
    });
    expect(statePayload.userId).toBeUndefined();
  });

  it('stores the initiating user id for bind OAuth state', async () => {
    globalConfigService.getConfigs.mockResolvedValue({
      githubLoginEnabled: '1',
      githubClientId: 'github-client-id',
      githubClientSecret: 'github-client-secret',
      githubCallbackUrl: 'https://example.com/auth/callback/github',
      siteUrl: '',
    });

    await github.createOAuthUrl(
      oauthState.normalizeCreateOAuthUrlInput({ scene: 'bind', browserProof }, null),
      42,
    );

    const statePayload = JSON.parse(redisCacheService.set.mock.calls[0][0].val);
    expect(statePayload).toMatchObject({ provider: GITHUB_PROVIDER, scene: 'bind', userId: 42 });
  });

  it('rejects OAuth URL creation when disabled', async () => {
    globalConfigService.getConfigs.mockResolvedValue({
      githubLoginEnabled: '0',
      githubClientId: 'github-client-id',
      githubClientSecret: 'github-client-secret',
      githubCallbackUrl: 'https://example.com/auth/callback/github',
      siteUrl: '',
    });

    await expect(
      github.createOAuthUrl(
        oauthState.normalizeCreateOAuthUrlInput({ scene: 'login', browserProof }, null),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(redisCacheService.set).not.toHaveBeenCalled();
  });

  it('consumes OAuth state once and rejects provider mismatch or replay', async () => {
    redisCacheService.getDel
      .mockResolvedValueOnce(
        JSON.stringify({
          provider: 'wechat_open_web',
          scene: 'oauth',
          source: 'pc_web',
          callbackUrl: 'https://example.com/auth/callback/wechat_open_web',
          redirectPath: '/',
          createdAt: Date.now(),
        }),
      )
      .mockResolvedValueOnce(null);

    await expect(oauthState.consume(GITHUB_PROVIDER, 'state-token', secret)).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(
      oauthState.consume('wechat_open_web', 'state-token', secret),
    ).rejects.toBeInstanceOf(HttpException);
    expect(redisCacheService.getDel).toHaveBeenCalledTimes(2);
  });

  it('normalizes GitHub profile without leaking access token into identity payload', async () => {
    globalConfigService.getConfigs.mockResolvedValue({
      githubClientId: 'github-client-id',
      githubClientSecret: 'github-client-secret',
    });
    (axios.post as any).mockResolvedValue({ data: { access_token: 'github-access-token' } });
    (axios.get as any)
      .mockResolvedValueOnce({
        data: {
          id: 10001,
          login: 'octo-user',
          name: 'Octo User',
          email: null,
          avatar_url: 'https://avatars.githubusercontent.com/u/10001',
          html_url: 'https://github.com/octo-user',
        },
      })
      .mockResolvedValueOnce({
        data: [{ email: 'octo@example.com', primary: true, verified: true }],
      });

    const identity = await github.fetchIdentityByCode('github-code', 'oauth');

    expect(identity).toMatchObject({
      provider: GITHUB_PROVIDER,
      providerUserId: '10001',
      email: 'octo@example.com',
      emailVerified: true,
      nickname: 'Octo User',
    });
    expect(JSON.stringify(identity)).not.toContain('github-access-token');
    expect(axios.get).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer github-access-token' }),
      }),
    );
  });
});
