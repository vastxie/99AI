import { LoginProviderRegistry } from './login-provider.registry';
import type { AuthProviderListEntry, LoginProviderKind } from './login-provider.types';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;

const entry = (provider: string, enabled = true): AuthProviderListEntry => ({
  provider,
  displayName: provider,
  type: 'oauth',
  enabled,
});

describe('LoginProviderRegistry.isProviderUsable', () => {
  let registry: LoginProviderRegistry;
  const register = (
    kind: LoginProviderKind,
    provider: string,
    listEntries: () => Promise<AuthProviderListEntry[]>,
  ) => registry.register({ kind, provider, listEntries } as any);

  beforeEach(() => {
    registry = new LoginProviderRegistry();
  });

  it('is usable while any adapter of the provider lists an enabled entry', async () => {
    register('oauth', 'demo_multi', async () => []);
    register('qr', 'demo_multi', async () => [entry('demo_multi')]);

    await expect(registry.isProviderUsable('demo_multi')).resolves.toBe(true);
  });

  it('is not usable when its adapters list nothing or only disabled entries', async () => {
    register('oauth', 'demo_multi', async () => []);
    register('qr', 'demo_multi', async () => [entry('demo_multi', false)]);

    await expect(registry.isProviderUsable('demo_multi')).resolves.toBe(false);
  });

  it('treats an adapter that fails to read its configuration as unusable and checks the others', async () => {
    register('oauth', 'demo_multi', async () => {
      throw new Error('config unavailable');
    });
    await expect(registry.isProviderUsable('demo_multi')).resolves.toBe(false);

    register('captcha', 'demo_multi', async () => [entry('demo_multi')]);
    await expect(registry.isProviderUsable('demo_multi')).resolves.toBe(true);
  });

  it('is not usable without a registered adapter, whatever other providers list', async () => {
    register('oauth', 'demo_oauth', async () => [entry('demo_oauth')]);

    await expect(registry.isProviderUsable('demo_missing')).resolves.toBe(false);
  });
});
