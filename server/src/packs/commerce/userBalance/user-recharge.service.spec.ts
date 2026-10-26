import { HttpException } from '@nestjs/common';
import { UserRechargeService } from './user-recharge.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createService(userExists = true) {
  const manager = {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(userExists ? { id: 7 } : null),
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (run: (m: any) => Promise<any>) => run(manager)),
  };
  const userBalanceService = {
    addBalanceToUser: jest.fn().mockResolvedValue(undefined),
    reduceBalanceFromUser: jest.fn().mockResolvedValue(undefined),
    saveRecordRechargeLog: jest.fn().mockResolvedValue({ id: 99 }),
    grantPackageToUser: jest.fn().mockResolvedValue({ ok: true }),
  };
  const userService = { clearUserCache: jest.fn().mockResolvedValue(undefined) };
  const service = new UserRechargeService(
    userBalanceService as any,
    userService as any,
    dataSource as any,
  );
  return { service, manager, userBalanceService, userService };
}

describe('UserRechargeService', () => {
  it('adds credits inside one transaction and clears the user cache', async () => {
    const { service, manager, userBalanceService, userService } = createService();
    await expect(service.userRecharge({ userId: 7, credits: 10 } as any)).resolves.toEqual({
      id: 99,
    });
    expect(userBalanceService.addBalanceToUser).toHaveBeenCalledWith(
      7,
      { credits: 10 },
      -1,
      manager,
    );
    expect(userBalanceService.reduceBalanceFromUser).not.toHaveBeenCalled();
    expect(userBalanceService.saveRecordRechargeLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, credits: 10 }),
      manager,
    );
    expect(userService.clearUserCache).toHaveBeenCalledWith(7);
  });

  it('reduces credits for negative amounts and rejects unknown users', async () => {
    const { service, userBalanceService } = createService();
    await service.userRecharge({ userId: 7, credits: -3 } as any);
    expect(userBalanceService.reduceBalanceFromUser).toHaveBeenCalledWith(7, 3, expect.anything());

    const missing = createService(false);
    await expect(missing.service.userRecharge({ userId: 8, credits: 1 } as any)).rejects.toThrow(
      HttpException,
    );
    expect(missing.userService.clearUserCache).not.toHaveBeenCalled();
  });

  it('grants a package and clears the user cache', async () => {
    const { service, userBalanceService, userService } = createService();
    await expect(service.grantPackage({ userId: 7, packageId: 3 } as any)).resolves.toEqual({
      ok: true,
    });
    expect(userBalanceService.grantPackageToUser).toHaveBeenCalledWith(7, 3);
    expect(userService.clearUserCache).toHaveBeenCalledWith(7);
  });
});
