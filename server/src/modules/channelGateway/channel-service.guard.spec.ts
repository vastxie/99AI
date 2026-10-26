import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ChannelServiceGuard } from './channel-service.guard';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;

function contextWith(token?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token === undefined ? {} : { 'x-channel-service-token': token },
      }),
    }),
  } as any;
}

describe('ChannelServiceGuard', () => {
  afterEach(() => {
    delete process.env.CHANNEL_SERVICE_TOKEN;
  });

  it('refuses everything while the token is not configured', () => {
    expect(() => new ChannelServiceGuard().canActivate(contextWith('x'))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('accepts only the exact configured token', () => {
    process.env.CHANNEL_SERVICE_TOKEN = 'secret-token';
    const guard = new ChannelServiceGuard();
    expect(guard.canActivate(contextWith('secret-token'))).toBe(true);
    expect(() => guard.canActivate(contextWith('secret-tokeN'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(contextWith('short'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(contextWith())).toThrow(UnauthorizedException);
  });
});
