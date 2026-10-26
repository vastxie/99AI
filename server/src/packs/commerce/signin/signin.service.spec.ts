import { ForbiddenException } from '@nestjs/common';
import { SigninService } from './signin.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('SigninService registered-user boundary', () => {
  const visitorRequest = {
    user: { uid: 'visitor-uid', id: 'visitor:abc123', username: '游客', role: 'visitor' },
  } as any;

  function createService() {
    const signinRepository = { findOne: jest.fn(), createQueryBuilder: jest.fn() };
    const dataSource = { transaction: jest.fn() };
    const globalConfigService = { getConfigs: jest.fn() };
    const userBalanceService = {
      addBalanceToUser: jest.fn().mockResolvedValue(undefined),
      saveRecordRechargeLog: jest.fn().mockResolvedValue(undefined),
    };
    const userService = { clearUserCache: jest.fn().mockResolvedValue(undefined) };
    const service = new SigninService(
      signinRepository as any,
      userBalanceService as any,
      globalConfigService as any,
      userService as any,
      dataSource as any,
    );
    return {
      service,
      signinRepository,
      dataSource,
      globalConfigService,
      userBalanceService,
      userService,
    };
  }

  it('answers visitors with 403 instead of the old 401 and never queries by the visitorId', async () => {
    const { service, signinRepository, dataSource, globalConfigService } = createService();

    await expect(service.sign(visitorRequest)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getStatus(visitorRequest)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getSigninLog(visitorRequest)).rejects.toBeInstanceOf(ForbiddenException);

    expect(globalConfigService.getConfigs).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(signinRepository.findOne).not.toHaveBeenCalled();
    expect(signinRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('reads the status by the numeric user id', async () => {
    const { service, signinRepository } = createService();
    signinRepository.findOne.mockResolvedValue(null);

    await expect(service.getStatus({ user: { id: 42, role: 'user' } } as any)).resolves.toEqual({
      signedToday: false,
      consecutiveDays: 0,
    });
    expect(signinRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 42 } }),
    );
  });

  it('credits a registered user once: sign-in record, balance and recharge log all use the numeric id', async () => {
    const { service, dataSource, globalConfigService, userBalanceService, userService } =
      createService();
    globalConfigService.getConfigs.mockResolvedValue({ signInStatus: '1', signInCredits: '10' });
    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue(undefined),
      })),
    };
    dataSource.transaction.mockImplementation(async (work: (m: typeof manager) => unknown) =>
      work(manager),
    );

    await expect(service.sign({ user: { id: 42, role: 'user' } } as any)).resolves.toBe(
      'Sign in successful.',
    );
    expect(userBalanceService.addBalanceToUser).toHaveBeenCalledWith(
      42,
      { credits: 10 },
      -1,
      manager,
    );
    expect(userBalanceService.saveRecordRechargeLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, credits: 10 }),
      manager,
    );
    expect(userService.clearUserCache).toHaveBeenCalledWith(42);
  });
});
