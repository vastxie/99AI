import { HttpException } from '@nestjs/common';
import { LoginProviderRegistry } from './login-provider.registry';
import { QrAuthService } from './qr-auth.service';
import type { AuthProviderListEntry } from './login-provider.types';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('QrAuthService', () => {
  let registry: LoginProviderRegistry;
  let adapter: any;
  let identity: { getActiveUserById: any };
  let tokens: { issueLoginToken: any; resolveLoginPayloadFromRequest: any };
  let service: QrAuthService;
  const req = { headers: {} } as any;

  beforeEach(() => {
    registry = new LoginProviderRegistry();
    adapter = {
      provider: 'acme_qr',
      kind: 'qr',
      listEntries: async (): Promise<AuthProviderListEntry[]> => [],
      createScene: jest
        .fn()
        .mockResolvedValue({ sceneId: 's'.repeat(32), qrUrl: 'data:', expiresIn: 300 }),
      pollScene: jest.fn(),
    };
    registry.register(adapter);
    identity = { getActiveUserById: jest.fn().mockResolvedValue({ id: 42 }) };
    tokens = {
      issueLoginToken: jest.fn().mockResolvedValue('token'),
      resolveLoginPayloadFromRequest: jest.fn().mockResolvedValue({ id: 7, role: 'viewer' }),
    };
    service = new QrAuthService(registry, identity as any, tokens as any);
  });

  it('rejects providers without a QR adapter', async () => {
    await expect(service.createScene('demo_oauth', 'login', req)).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('creates bind scenes for the current user only', async () => {
    await service.createScene('acme_qr', 'bind', req);
    expect(adapter.createScene).toHaveBeenCalledWith('bind', 7);

    tokens.resolveLoginPayloadFromRequest.mockResolvedValue({ id: 8, role: 'visitor' });
    await expect(service.createScene('acme_qr', 'bind', req)).rejects.toThrow('游客账号不能绑定');
  });

  it('issues a login token once the adapter confirms a scanned user', async () => {
    adapter.pollScene.mockResolvedValueOnce({ status: 'pending' });
    await expect(service.pollScene('acme_qr', 's'.repeat(32), 'login', req)).resolves.toEqual({
      status: 'pending',
    });

    adapter.pollScene.mockResolvedValueOnce({ status: 'confirmed', userId: 42 });
    await expect(service.pollScene('acme_qr', 's'.repeat(32), 'login', req)).resolves.toEqual({
      status: 'confirmed',
      token: 'token',
    });
    expect(identity.getActiveUserById).toHaveBeenCalledWith(42);
  });

  it('passes bind results through without issuing a token', async () => {
    adapter.pollScene.mockResolvedValueOnce({ status: 'confirmed', message: '绑定成功' });
    await expect(service.pollScene('acme_qr', 's'.repeat(32), 'bind', req)).resolves.toEqual({
      status: 'confirmed',
      message: '绑定成功',
    });
    expect(adapter.pollScene).toHaveBeenCalledWith('s'.repeat(32), 'bind', 7);
    expect(tokens.issueLoginToken).not.toHaveBeenCalled();
  });
});
