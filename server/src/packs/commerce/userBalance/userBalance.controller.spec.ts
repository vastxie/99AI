import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { UserBalanceController } from './userBalance.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const visitorRequest = {
  user: { uid: 'visitor-uid', id: 'visitor:abc123', username: '游客', role: 'visitor' },
} as any;

describe('UserBalanceController visitor-safe reads', () => {
  it('keeps the personal balance and recharge log reachable for visitors', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UserBalanceController.prototype.getBalance),
    ).toEqual([JwtAuthGuard]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UserBalanceController.prototype.getRechargeLog),
    ).toEqual([JwtAuthGuard]);
  });

  it('answers a visitor with the default summary instead of looking up the visitorId', async () => {
    const defaultSummary = { credits: 0, sumCredits: 0 };
    const userBalanceService = { queryUserBalance: jest.fn().mockResolvedValue(defaultSummary) };
    const controller = new UserBalanceController(userBalanceService as any);

    await expect(controller.getBalance(visitorRequest)).resolves.toBe(defaultSummary);

    expect(userBalanceService.queryUserBalance).toHaveBeenCalledTimes(1);
    expect(userBalanceService.queryUserBalance).toHaveBeenCalledWith(null);
  });

  it('queries registered users by their numeric id', async () => {
    const userBalanceService = { queryUserBalance: jest.fn().mockResolvedValue({ credits: 5 }) };
    const controller = new UserBalanceController(userBalanceService as any);

    await controller.getBalance({ user: { uid: 'AbC123xYz789', id: 42, role: 'user' } } as any);

    expect(userBalanceService.queryUserBalance).toHaveBeenCalledWith(42);
  });

  it('refuses a non-visitor identity whose id is not a positive integer', async () => {
    const userBalanceService = { queryUserBalance: jest.fn() };
    const controller = new UserBalanceController(userBalanceService as any);

    await expect(
      controller.getBalance({ user: { uid: 'OddUid000001', id: '42', role: 'user' } } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userBalanceService.queryUserBalance).not.toHaveBeenCalled();
  });
});
