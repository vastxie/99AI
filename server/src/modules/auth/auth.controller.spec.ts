import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { RegisteredUserAuthGuard } from '@/common/auth/registeredUserAuth.guard';
import { AuthController } from './auth.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function guardsOf(handler: unknown) {
  return Reflect.getMetadata(GUARDS_METADATA, handler as object);
}

const visitorRequest = {
  user: { uid: 'visitor-uid', id: 'visitor:abc123', username: '游客', role: 'visitor' },
} as any;
const registeredRequest = {
  user: { uid: 'AbC123xYz789', id: 42, username: 'viewer', role: 'user' },
} as any;

describe('AuthController guards', () => {
  it.each([
    ['updatePassword', AuthController.prototype.updatePassword],
    ['listIdentities', AuthController.prototype.listIdentities],
    ['unbindIdentity', AuthController.prototype.unbindIdentity],
    ['sendCaptchaBindCode', AuthController.prototype.sendCaptchaBindCode],
    ['captchaBind', AuthController.prototype.captchaBind],
  ])('guards %s for registered users only', (_name: string, handler: unknown) => {
    expect(guardsOf(handler)).toEqual([RegisteredUserAuthGuard]);
  });

  it('keeps getInfo open to visitors behind the plain login guard', () => {
    expect(guardsOf(AuthController.prototype.getInfo)).toEqual([JwtAuthGuard]);
  });
});

describe('AuthController contact binding', () => {
  function createController() {
    const captchaAuth = {
      sendBindCode: jest.fn().mockResolvedValue('sent'),
      bind: jest.fn().mockResolvedValue('绑定成功'),
    };
    const controller = new AuthController({} as any, captchaAuth as any, {} as any, {} as any);
    return { controller, captchaAuth };
  }

  it('passes the numeric user id to the binding flow', async () => {
    const { controller, captchaAuth } = createController();

    await controller.sendCaptchaBindCode(registeredRequest, { contact: 'a@example.com' } as any);
    await controller.captchaBind(registeredRequest, {
      contact: 'a@example.com',
      code: '123456',
    } as any);

    expect(captchaAuth.sendBindCode).toHaveBeenCalledWith(42, 'a@example.com');
    expect(captchaAuth.bind).toHaveBeenCalledWith(42, 'a@example.com', '123456');
  });

  it('refuses visitors with 403 before any code is sent or bound', async () => {
    const { controller, captchaAuth } = createController();

    await expect(
      controller.sendCaptchaBindCode(visitorRequest, { contact: 'a@example.com' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.captchaBind(visitorRequest, { contact: 'a@example.com', code: '1' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(captchaAuth.sendBindCode).not.toHaveBeenCalled();
    expect(captchaAuth.bind).not.toHaveBeenCalled();
  });
});
