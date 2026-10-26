import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { RegisteredUserAuthGuard } from '@/common/auth/registeredUserAuth.guard';
import { WeixinBotController } from './weixinBot.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const HANDLERS = ['getBindQrCode', 'pollBindStatus', 'confirmBind', 'unbind', 'getStatus'] as const;

describe('WeixinBotController guards', () => {
  it('guards the whole controller for registered users only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, WeixinBotController)).toEqual([
      RegisteredUserAuthGuard,
    ]);
  });

  it.each(HANDLERS)('%s adds no method-level plain login guard', (name: string) => {
    const handler = (WeixinBotController.prototype as any)[name];
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

    expect(guards).not.toContain(JwtAuthGuard);
  });
});

describe('WeixinBotController identity', () => {
  function createController() {
    const weixinBotService = {
      getBindQrCode: jest.fn().mockResolvedValue({ qrData: 'data:', sessionId: 'bind_1' }),
      pollBindStatus: jest.fn().mockResolvedValue({ status: 'waiting' }),
      confirmBind: jest.fn().mockResolvedValue(undefined),
      unbindBot: jest.fn().mockResolvedValue(undefined),
      getBindStatus: jest.fn().mockResolvedValue({ bound: false, status: 0 }),
    };
    return { controller: new WeixinBotController(weixinBotService as any), weixinBotService };
  }

  it('hands the numeric user id to the bot service', async () => {
    const { controller, weixinBotService } = createController();
    const req = { user: { uid: 'AbC123xYz789', id: 42, role: 'user' } } as any;

    await controller.getBindQrCode(req);
    await controller.pollBindStatus(req, 'bind_1');
    await controller.confirmBind(req, { sessionId: 'bind_1' } as any);
    await controller.unbind(req);
    await controller.getStatus(req);

    expect(weixinBotService.getBindQrCode).toHaveBeenCalledWith(42);
    expect(weixinBotService.pollBindStatus).toHaveBeenCalledWith(42, 'bind_1');
    expect(weixinBotService.confirmBind).toHaveBeenCalledWith(42, 'bind_1');
    expect(weixinBotService.unbindBot).toHaveBeenCalledWith(42);
    expect(weixinBotService.getBindStatus).toHaveBeenCalledWith(42);
  });

  it('never passes a visitorId to the bot service', async () => {
    const { controller, weixinBotService } = createController();
    const req = {
      user: { uid: 'visitor-uid', id: 'visitor:abc123', role: 'visitor' },
    } as any;

    await expect(controller.getBindQrCode(req)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.unbind(req)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.getStatus(req)).rejects.toBeInstanceOf(ForbiddenException);

    expect(weixinBotService.getBindQrCode).not.toHaveBeenCalled();
    expect(weixinBotService.unbindBot).not.toHaveBeenCalled();
    expect(weixinBotService.getBindStatus).not.toHaveBeenCalled();
  });
});
