import { createHash, randomBytes } from 'crypto';
import { AuthController } from '@/modules/auth/auth.controller';
import { LoginProviderRegistry } from '@/modules/auth/providers/login-provider.registry';
import { OAuthAuthService } from '@/modules/auth/providers/oauth-auth.service';
import { OAuthStateService } from '@/modules/auth/providers/oauth-state.service';
import { GITHUB_PROVIDER, GithubOAuthProvider } from './github-oauth.provider';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const SITE = 'https://chat.example.com';
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

/**
 * 贯穿用例：控制器 → OAuthAuthService → 规范化 → 真实的 GitHub 渠道包 → createPayload → store →
 * 回调（只替换 Redis、配置、换身份与发令牌）。攻击者用自己的 GitHub 账号授权得到 code + state，
 * 受害者的浏览器打开这个回调地址时没有对应的标签页密钥，必须被拒绝且不去 GitHub 换身份。
 */
describe('GitHub OAuth bound to the initiating browser tab', () => {
  let redis: ReturnType<typeof memoryRedis>;
  let configs: Record<string, string>;
  let github: GithubOAuthProvider;
  let identity: { loginOrCreateByIdentity: any; bindIdentity: any };
  let tokens: { issueLoginToken: any; resolveLoginPayloadFromRequest: any };
  let controller: AuthController;

  beforeEach(() => {
    redis = memoryRedis();
    configs = {
      githubLoginEnabled: '1',
      githubClientId: 'client-id',
      githubClientSecret: 'client-secret',
      githubCallbackUrl: '',
      siteUrl: SITE,
    };
    const registry = new LoginProviderRegistry();
    const oauthState = new OAuthStateService(redis as any);
    github = new GithubOAuthProvider(
      { getConfigs: jest.fn(async () => ({ ...configs })) } as any,
      oauthState,
      registry,
    );
    jest
      .spyOn(github, 'fetchIdentityByCode')
      .mockResolvedValue({ provider: GITHUB_PROVIDER, providerUserId: '1001' } as any);
    identity = {
      loginOrCreateByIdentity: jest.fn().mockResolvedValue({ id: 7 }),
      bindIdentity: jest.fn().mockResolvedValue({ provider: GITHUB_PROVIDER }),
    };
    tokens = {
      issueLoginToken: jest.fn().mockResolvedValue('login-token'),
      resolveLoginPayloadFromRequest: jest.fn().mockResolvedValue({ id: 5, role: 'viewer' }),
    };
    const oauthAuth = new OAuthAuthService(registry, oauthState, identity as any, tokens as any);
    controller = new AuthController({} as any, {} as any, oauthAuth, {} as any);
  });

  const fromSite = (headers: Record<string, string> = { origin: SITE }) => ({ headers }) as any;

  async function start(secret: string, scene = 'login', req = fromSite()) {
    const url = (await controller.createOAuthUrl(
      GITHUB_PROVIDER,
      { scene, redirectPath: '/', browserProof: proofOf(secret) },
      req,
    )) as string;
    return new URL(url).searchParams.get('state') as string;
  }

  const callback = (state: string, browserSecret?: string) =>
    controller.oauthCallback(GITHUB_PROVIDER, { code: 'code-1', state, browserSecret }, fromSite());

  it('logs in when the callback carries the secret of the tab that started it', async () => {
    const secret = newSecret();
    const state = await start(secret);

    await expect(callback(state, secret)).resolves.toBe('login-token');
    expect(github.fetchIdentityByCode).toHaveBeenCalledWith('code-1', 'oauth');
    expect(redis.data.size).toBe(0);
  });

  it('rejects the callback in a browser without the secret, burns the state and never reaches GitHub', async () => {
    const attackerSecret = newSecret();
    const state = await start(attackerSecret);

    // 受害者的浏览器：没有这个 state 的密钥
    await expect(callback(state)).rejects.toThrow('登录状态已失效，请重新授权。');
    // state 已经消费：之后连发起者自己的密钥也用不了
    await expect(callback(state, attackerSecret)).rejects.toThrow('登录状态已失效，请重新授权。');

    const otherState = await start(attackerSecret);
    await expect(callback(otherState, newSecret())).rejects.toThrow('登录状态已失效，请重新授权。');

    expect(github.fetchIdentityByCode).not.toHaveBeenCalled();
    expect(identity.loginOrCreateByIdentity).not.toHaveBeenCalled();
    expect(tokens.issueLoginToken).not.toHaveBeenCalled();
  });

  it('keeps two tabs apart: each state only accepts its own secret', async () => {
    const tabA = newSecret();
    const tabB = newSecret();
    const stateA = await start(tabA);
    const stateB = await start(tabB);

    await expect(callback(stateA, tabB)).rejects.toThrow('登录状态已失效，请重新授权。');
    await expect(callback(stateB, tabB)).resolves.toBe('login-token');
    expect(github.fetchIdentityByCode).toHaveBeenCalledTimes(1);
  });

  it('binds only with the matching secret and only for the user who started it', async () => {
    const secret = newSecret();
    let state = await start(secret, 'bind');
    tokens.resolveLoginPayloadFromRequest.mockResolvedValue({ id: 6, role: 'viewer' });
    await expect(callback(state, secret)).rejects.toThrow('OAuth 绑定状态不匹配');

    tokens.resolveLoginPayloadFromRequest.mockResolvedValue({ id: 5, role: 'viewer' });
    state = await start(secret, 'bind');
    await expect(callback(state, secret)).resolves.toEqual({
      bound: true,
      provider: GITHUB_PROVIDER,
    });
    expect(identity.bindIdentity).toHaveBeenCalledWith(5, expect.anything());
  });

  it('refuses to start without a proof or when the callback URL is on another origin', async () => {
    await expect(
      controller.createOAuthUrl(GITHUB_PROVIDER, { scene: 'login' }, fromSite()),
    ).rejects.toThrow('登录页已更新，请刷新后重试');

    // 带了来源头却都用不了（如字面值 null）：拒绝，不放过同源检查
    await expect(start(newSecret(), 'login', fromSite({ origin: 'null' }))).rejects.toThrow(
      '无法确认发起登录的站点，请刷新页面后重试',
    );

    configs.githubCallbackUrl = 'https://auth.example.com/auth/callback/github';
    const siteHeaders: Array<Record<string, string>> = [
      { origin: SITE },
      { 'x-website-domain': SITE },
    ];
    for (const headers of siteHeaders) {
      await expect(start(newSecret(), 'login', fromSite(headers))).rejects.toThrow(
        '第三方登录的回调地址必须与当前站点同源，请检查回调地址配置',
      );
    }
    expect(redis.set).not.toHaveBeenCalled();

    // 发起请求看不出站点（两个头都没有）：不比较，仍然绑定标签页
    await expect(start(newSecret(), 'login', fromSite({}))).resolves.toEqual(expect.any(String));
    // 回调地址与站点同源（默认端口写法不同也算）
    configs.githubCallbackUrl = `${SITE}:443/auth/callback/github`;
    await expect(start(newSecret())).resolves.toEqual(expect.any(String));
  });
});
