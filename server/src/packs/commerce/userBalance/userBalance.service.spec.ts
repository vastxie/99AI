import { HttpException, Logger } from '@nestjs/common';
import { AccountLogEntity } from './accountLog.entity';
import { UserBalanceEntity } from './userBalance.entity';
import { UserBalanceService } from './userBalance.service';
import { UserEntity } from '@/modules/user/user.entity';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('UserBalanceService membership and deduction safety', () => {
  let userBalanceRepository: any;
  let accountLogRepository: any;
  let userRepository: any;
  let packageRepository: any;
  let redisClient: any;
  let globalConfigService: any;
  let dataSource: any;
  let terminalRefundQueryBuilder: any;
  let service: UserBalanceService;

  beforeEach(() => {
    userBalanceRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    accountLogRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    terminalRefundQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    accountLogRepository.createQueryBuilder.mockReturnValue(terminalRefundQueryBuilder);
    userRepository = {
      findOne: jest.fn(),
    };
    packageRepository = {
      findOne: jest.fn(),
    };
    redisClient = {
      eval: jest.fn(),
      incrBy: jest.fn(),
      decrBy: jest.fn(),
      expire: jest.fn(),
    };
    globalConfigService = {
      getConfigs: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn((handler: any) =>
        handler({
          getRepository: (target: any) => {
            if (target === UserBalanceEntity) return userBalanceRepository;
            if (target === AccountLogEntity) return accountLogRepository;
            if (target === UserEntity) return userRepository;
            return packageRepository;
          },
        }),
      ),
    };

    service = new UserBalanceService(
      userBalanceRepository,
      accountLogRepository,
      packageRepository,
      {} as any,
      redisClient,
      dataSource,
      globalConfigService,
    );
  });

  it('logs only a static message and a safe summary when the registration bonus fails', async () => {
    const logged: unknown[][] = [];
    const spy = jest.spyOn(Logger, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    try {
      userBalanceRepository.findOne.mockResolvedValue(null);
      (service as any).configEntity = {
        find: jest.fn().mockRejectedValue(
          Object.assign(
            new Error("Lock wait timeout for 'dedup-synthetic@example.test' user 4242"),
            {
              code: 'ER_LOCK_WAIT_TIMEOUT',
              errno: 1205,
            },
          ),
        ),
      };

      await expect(service.addBalanceToNewUser(4242)).rejects.toThrow(
        '注册赠送失败,请联系管理员！',
      );
      expect(logged).toEqual([
        ['注册赠送额度失败', 'Error code=ER_LOCK_WAIT_TIMEOUT errno=1205', 'UserBalanceService'],
      ]);
    } finally {
      // 断言失败也要恢复，避免后续用例的 Logger 计数被污染
      spy.mockRestore();
    }
  });

  it('includes high user IDs in the unfiltered administrative account log', async () => {
    const row = { id: 1, userId: 100000001, user: { nickname: 'synthetic user' } };
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[row], 1]),
    };
    accountLogRepository.createQueryBuilder.mockReturnValue(query);
    const result = await service.getAccountLog({ user: { id: 42, role: 'super' } } as any, {
      page: 2,
      size: 10,
    });
    expect(result.rows[0]).toMatchObject({ userId: 100000001, nickname: 'synthetic user' });
    expect(result.count).toBe(1);
    expect(query.where).not.toHaveBeenCalled();
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.take).toHaveBeenCalledWith(10);
    await service.getAccountLog({ user: { id: 42, role: 'super' } } as any, { userId: 100000001 });
    expect(query.where).toHaveBeenCalledWith('accountLog.userId = :userId');
    expect(query.setParameter).toHaveBeenCalledWith('userId', 100000001);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not allow expired member credits to satisfy balance validation', async () => {
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 0,
      memberCredits: 100,
      packageId: 1,
      expirationTime: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      service.validateBalance({ user: { id: 1, role: 'user' } }, null, 1),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('deducts inside a locked transaction and ignores expired member credits', async () => {
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 5,
      memberCredits: 100,
      packageId: 1,
      expirationTime: new Date('2026-01-01T00:00:00.000Z'),
    });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });
    accountLogRepository.save.mockResolvedValue({ id: 7 });

    await expect(service.deductFromBalance(1, null, 4, 12, 99, 2)).resolves.toBe(7);

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(userBalanceRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 1 },
      lock: { mode: 'pessimistic_write' },
    });
    const updateSet = userBalanceRepository.update.mock.calls[0][1];
    expect(updateSet.memberCredits).toBeUndefined();
    expect(updateSet.credits()).toBe('COALESCE(credits, 0) - 4');
    expect(accountLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        credits: 4,
        memberCredits: 0,
        tokenUsed: 12,
        relatedId: 99,
      }),
    );
  });

  it('rejects a deduction larger than the available credits unless overdraft is allowed', async () => {
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 3,
      memberCredits: 0,
      packageId: null,
      expirationTime: null,
    });

    await expect(service.deductFromBalance(1, null, 10, 0, 99, 2)).rejects.toMatchObject({
      status: 402,
    });
    expect(userBalanceRepository.update).not.toHaveBeenCalled();
  });

  it('settles a turn beyond the balance by overdrawing ordinary credits after member credits', async () => {
    // 对话结算：本轮实际用量 30 积分，可用 3 + 10 会员积分 → 会员积分扣完，普通积分透支到 -17
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 3,
      memberCredits: 10,
      packageId: 1,
      expirationTime: new Date(Date.now() + 86_400_000),
    });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });
    accountLogRepository.findOne.mockResolvedValue(null);
    accountLogRepository.save.mockResolvedValue({ id: 8 });

    await expect(
      service.deductFromBalance(1, null, 30, 15000, 99, 1, 'chat-base-v1', {
        allowOverdraft: true,
      }),
    ).resolves.toBe(8);

    const updateSet = userBalanceRepository.update.mock.calls[0][1];
    expect(updateSet.memberCredits()).toBe('COALESCE(memberCredits, 0) - 10');
    expect(updateSet.credits()).toBe('COALESCE(credits, 0) - 20');
    expect(accountLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 30, memberCredits: 10, relatedId: 99 }),
    );
  });

  it('records the overdraft on a NULL ordinary balance instead of losing it', async () => {
    // 普通积分为 NULL、会员积分 5、本轮 10：NULL - 5 在 SQL 里仍是 NULL，欠款会丢失
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: null,
      memberCredits: 5,
      packageId: 1,
      expirationTime: new Date(Date.now() + 86_400_000),
    });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });
    accountLogRepository.findOne.mockResolvedValue(null);
    accountLogRepository.save.mockResolvedValue({ id: 9 });

    await service.deductFromBalance(1, null, 10, 0, 99, 1, 'chat-base-v1', {
      allowOverdraft: true,
    });

    const updateSet = userBalanceRepository.update.mock.calls[0][1];
    expect(updateSet.memberCredits()).toBe('COALESCE(memberCredits, 0) - 5');
    expect(updateSet.credits()).toBe('COALESCE(credits, 0) - 5');
    expect(updateSet.usedCredits()).toBe('COALESCE(usedCredits, 0) + 10');
  });

  it('keeps blocking new turns while the balance is negative', async () => {
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: -17,
      memberCredits: 0,
      packageId: null,
      expirationTime: null,
    });

    await expect(
      service.validateBalance({ user: { id: 1, role: 'user' } }, null, 1),
    ).rejects.toMatchObject({ status: 402 });
  });

  it('deducts a repeated assistant charge component only once under the balance lock', async () => {
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 10,
      memberCredits: 0,
      packageId: null,
      expirationTime: null,
    });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });
    accountLogRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 7 });
    accountLogRepository.save.mockResolvedValue({ id: 7 });

    await expect(service.deductFromBalance(1, null, 4, 12, 99, 1, 'chat-base-v1')).resolves.toBe(7);
    await expect(service.deductFromBalance(1, null, 4, 12, 99, 1, 'chat-base-v1')).resolves.toBe(7);

    expect(userBalanceRepository.update).toHaveBeenCalledTimes(1);
    expect(accountLogRepository.save).toHaveBeenCalledTimes(1);
    expect(accountLogRepository.findOne).toHaveBeenLastCalledWith({
      where: {
        userId: 1,
        rechargeType: 10,
        relatedId: 99,
        extent: 'chat-base-v1',
      },
      order: { id: 'DESC' },
    });
  });

  it('renews expired memberships from the current time instead of the old expiration date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-06T00:00:00.000Z'));
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 0,
      memberCredits: 0,
      packageId: 1,
      expirationTime: new Date('2026-01-01T00:00:00.000Z'),
    });
    packageRepository.findOne.mockResolvedValueOnce({ id: 2, weight: 2 });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });

    await service.addBalanceToUser(1, { packageId: 2, credits: 100 }, 30);

    const updateSet = userBalanceRepository.update.mock.calls[0][1];
    expect(updateSet.expirationTime).toContain('2026-06-05');
    expect(updateSet.memberCredits).toBe(100);
    expect(updateSet.packageId).toBe(2);
  });

  it('treats expired lower-tier membership purchases as a new active membership', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-06T00:00:00.000Z'));
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 0,
      memberCredits: 999,
      packageId: 9,
      expirationTime: new Date('2026-01-01T00:00:00.000Z'),
    });
    packageRepository.findOne.mockResolvedValueOnce({ id: 2, weight: 1 });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });

    await service.addBalanceToUser(1, { packageId: 2, credits: 50 }, 30);

    const updateSet = userBalanceRepository.update.mock.calls[0][1];
    expect(updateSet.expirationTime).toContain('2026-06-05');
    expect(updateSet.memberCredits).toBe(50);
    expect(updateSet.packageId).toBe(2);
  });

  it('starts higher-tier upgrades from now instead of inheriting lower-tier remaining time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-06T00:00:00.000Z'));
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 0,
      memberCredits: 200,
      packageId: 1,
      expirationTime: new Date('2027-05-06T00:00:00.000Z'),
    });
    packageRepository.findOne.mockResolvedValueOnce({ id: 1, weight: 1 });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });

    await service.addBalanceToUser(1, { packageId: 2, credits: 50, weightSnapshot: 3 }, 30);

    const updateSet = userBalanceRepository.update.mock.calls[0][1];
    expect(updateSet.expirationTime).toContain('2026-06-05');
    expect(updateSet.memberCredits()).toBe('COALESCE(memberCredits, 0) + 50');
    expect(updateSet.packageId).toBe(2);
  });

  it('extends same-tier memberships from the existing expiration date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-06T00:00:00.000Z'));
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 0,
      memberCredits: 200,
      packageId: 2,
      expirationTime: new Date('2026-06-06T00:00:00.000Z'),
    });
    packageRepository.findOne.mockResolvedValueOnce({ id: 2, weight: 3 });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });

    await service.addBalanceToUser(1, { packageId: 2, credits: 50, weightSnapshot: 3 }, 30);

    const updateSet = userBalanceRepository.update.mock.calls[0][1];
    expect(updateSet.expirationTime).toContain('2026-07-06');
    expect(updateSet.memberCredits()).toBe('COALESCE(memberCredits, 0) + 50');
    expect(updateSet.packageId).toBe(2);
  });

  it('grants membership packages through a transactional admin gift flow', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-06T00:00:00.000Z'));
    userRepository.findOne.mockResolvedValueOnce({ id: 1 });
    userBalanceRepository.findOne.mockResolvedValueOnce({
      userId: 1,
      credits: 0,
      memberCredits: 0,
      packageId: 0,
      expirationTime: null,
    });
    packageRepository.findOne.mockResolvedValue({
      id: 8,
      name: 'VIP 月卡',
      planName: 'VIP',
      variantName: '月卡',
      planType: 'membership',
      days: 30,
      credits: 100,
      weight: 2,
    });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });
    accountLogRepository.save.mockResolvedValue({ id: 18 });

    const result = await service.grantPackageToUser(1, 8);

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(packageRepository.findOne).toHaveBeenCalledWith({
      where: { id: 8, status: 1 },
      select: {
        id: true,
        name: true,
        planName: true,
        variantName: true,
        planType: true,
        days: true,
        credits: true,
        weight: true,
      },
    });
    expect(userBalanceRepository.update).toHaveBeenCalledWith(
      { userId: 1 },
      expect.objectContaining({
        packageId: 8,
        memberCredits: 100,
        expirationTime: expect.stringContaining('2026-06-05'),
      }),
    );
    expect(accountLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        rechargeType: 5,
        credits: 100,
        days: 30,
        packageId: 8,
        memberDays: 30,
        extent: '管理员赠送套餐',
      }),
    );
    expect(result).toEqual({ id: 18 });
  });

  it('returns current membership weight for frontend package gating', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-06T00:00:00.000Z'));
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 10,
      memberCredits: 20,
      usedCredits: 0,
      usedTokens: 0,
      packageId: 9,
      expirationTime: new Date('2026-06-01T00:00:00.000Z'),
    });
    packageRepository.findOne.mockResolvedValue({
      id: 9,
      name: '专业版 月付',
      planName: '专业版',
      weight: 3,
    });

    const result = (await service.queryUserBalance(1))!;

    expect(packageRepository.findOne).toHaveBeenCalledWith({
      where: { id: 9 },
      select: { id: true, name: true, planName: true, weight: true },
    });
    expect(result.isMember).toBe(true);
    expect(result.packageWeight).toBe(3);
    expect(result.packageName).toBe('专业版');
    expect(result.sumCredits).toBe(30);
  });

  it('returns the default summary for a visitor without touching the balance table', async () => {
    const result = (await service.queryUserBalance(null))!;

    expect(result).toMatchObject({ credits: 0, sumCredits: 0, isMember: false });
    expect(userBalanceRepository.findOne).not.toHaveBeenCalled();
    expect(userBalanceRepository.save).not.toHaveBeenCalled();
  });

  it('returns an empty recharge log for visitors without querying by the visitorId', async () => {
    accountLogRepository.findAndCount = jest.fn().mockResolvedValue([[], 0]);

    await expect(
      service.getRechargeLog(
        {
          user: { uid: 'visitor-uid', id: 'visitor:abc123', username: '游客', role: 'visitor' },
        } as any,
        {},
      ),
    ).resolves.toEqual({ rows: [], count: 0 });
    expect(accountLogRepository.findAndCount).not.toHaveBeenCalled();

    await service.getRechargeLog({ user: { id: 42, role: 'user' } } as any, { page: 2, size: 5 });
    expect(accountLogRepository.findAndCount).toHaveBeenCalledWith({
      where: { userId: 42 },
      order: { id: 'DESC' },
      skip: 5,
      take: 5,
    });
  });

  it('charges visitor quota through a daily Redis counter', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-07T01:00:00.000Z'));
    globalConfigService.getConfigs.mockResolvedValue('10');
    redisClient.incrBy.mockResolvedValue(3);

    await expect(
      service.validateVisitorBalance({ user: { id: 'visitor-a', role: 'visitor' } }, 3),
    ).resolves.toBe(true);

    expect(redisClient.incrBy).toHaveBeenCalledWith('visitor:credits:visitor-a:2026-05-07', 3);
    expect(redisClient.expire.mock.calls[0][0]).toBe('visitor:credits:visitor-a:2026-05-07');
    expect(redisClient.expire.mock.calls[0][1]).toBeGreaterThanOrEqual(3600);
    expect(redisClient.expire.mock.calls[0][1]).toBeLessThanOrEqual(90000);
    expect(redisClient.decrBy).not.toHaveBeenCalled();
  });

  it('rolls back visitor quota increments when the daily limit is exceeded', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-07T10:00:00.000Z'));
    globalConfigService.getConfigs.mockResolvedValue('10');
    redisClient.incrBy.mockResolvedValue(12);
    redisClient.decrBy.mockResolvedValue(6);

    await expect(
      service.validateVisitorBalance({ user: { id: 'visitor-a', role: 'visitor' } }, 6),
    ).rejects.toBeInstanceOf(HttpException);

    expect(redisClient.incrBy).toHaveBeenCalledWith('visitor:credits:visitor-a:2026-05-07', 6);
    expect(redisClient.decrBy).toHaveBeenCalledWith('visitor:credits:visitor-a:2026-05-07', 6);
  });

  it('uses a stable atomic reservation for repeated visitor preflight attempts', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-07T01:00:00.000Z'));
    globalConfigService.getConfigs.mockResolvedValue('10');
    redisClient.eval.mockResolvedValue(1);
    const idempotencyKey = 'a'.repeat(64);

    await expect(
      service.validateVisitorBalance(
        { user: { id: 'visitor-a', role: 'visitor' } },
        3,
        idempotencyKey,
      ),
    ).resolves.toBe(true);
    await expect(
      service.validateVisitorBalance(
        { user: { id: 'visitor-a', role: 'visitor' } },
        3,
        idempotencyKey,
      ),
    ).resolves.toBe(true);

    expect(redisClient.eval).toHaveBeenCalledTimes(2);
    expect(redisClient.eval.mock.calls[0][0]).toContain("redis.call('GET', KEYS[2])");
    expect(redisClient.eval.mock.calls[0][0]).toContain("redis.call('INCRBY', KEYS[1], ARGV[1])");
    expect(redisClient.eval.mock.calls[0][1]).toEqual(redisClient.eval.mock.calls[1][1]);
    expect(redisClient.incrBy).not.toHaveBeenCalled();
  });

  it('remembers a denied idempotent visitor reservation without a second counter increment', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-07T01:00:00.000Z'));
    globalConfigService.getConfigs.mockResolvedValue('2');
    redisClient.eval.mockResolvedValue(0);

    await expect(
      service.validateVisitorBalance(
        { user: { id: 'visitor-a', role: 'visitor' } },
        3,
        'b'.repeat(64),
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(redisClient.incrBy).not.toHaveBeenCalled();
    expect(redisClient.decrBy).not.toHaveBeenCalled();
  });

  it('refunds a deduct log once inside a locked transaction', async () => {
    accountLogRepository.findOne
      .mockResolvedValueOnce({
        id: 10,
        userId: 1,
        rechargeType: 11,
        credits: 6,
        memberCredits: 2,
        relatedId: 99,
      })
      .mockResolvedValueOnce(null);
    userBalanceRepository.findOne.mockResolvedValue({ userId: 1, credits: 0, memberCredits: 0 });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });
    accountLogRepository.save.mockResolvedValue({ id: 11 });

    await expect((service as any).refundBalanceByLogId(10, '任务失败')).resolves.toEqual({
      refunded: true,
    });

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(accountLogRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: { id: 10 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(accountLogRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: { rechargeType: 7, refundSourceLogId: 10 },
    });
    expect(userBalanceRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 1 },
      lock: { mode: 'pessimistic_write' },
    });
    const updateSet = userBalanceRepository.update.mock.calls[0][1];
    expect(updateSet.credits()).toBe('COALESCE(credits, 0) + 4');
    expect(updateSet.memberCredits()).toBe('COALESCE(memberCredits, 0) + 2');
    expect(accountLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        rechargeType: 7,
        credits: 6,
        memberCredits: 2,
        relatedId: 99,
        refundSourceLogId: 10,
      }),
    );
  });

  it('refunds an overdrawn settlement exactly once, restoring both credit pools', async () => {
    // 透支结算的流水：会员积分扣 10，普通积分扣 20（余额从 3 变成 -17）
    const overdrawnLog = {
      id: 10,
      userId: 1,
      rechargeType: 10,
      credits: 30,
      memberCredits: 10,
      relatedId: 99,
    };
    accountLogRepository.findOne
      .mockResolvedValueOnce(overdrawnLog)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(overdrawnLog)
      .mockResolvedValueOnce({ id: 12, refundSourceLogId: 10 });
    userBalanceRepository.findOne.mockResolvedValue({ userId: 1, credits: -17, memberCredits: 0 });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });
    accountLogRepository.save.mockResolvedValue({ id: 12 });

    await expect((service as any).refundBalanceByLogId(10, '任务失败')).resolves.toEqual({
      refunded: true,
    });
    const updateSet = userBalanceRepository.update.mock.calls[0][1];
    expect(updateSet.credits()).toBe('COALESCE(credits, 0) + 20');
    expect(updateSet.memberCredits()).toBe('COALESCE(memberCredits, 0) + 10');

    // 重启补偿或重复的失败处理再退一次：已有退款流水，不再加回
    await (service as any).refundBalanceByLogId(10, '任务失败');
    expect(userBalanceRepository.update).toHaveBeenCalledTimes(1);
  });

  it('settles an overdrawn charge component only once when the settlement is retried', async () => {
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 2,
      memberCredits: 0,
      packageId: null,
      expirationTime: null,
    });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });
    accountLogRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 7 });
    accountLogRepository.save.mockResolvedValue({ id: 7 });
    const overdraft = { allowOverdraft: true };

    await expect(
      service.deductFromBalance(1, null, 40, 20000, 99, 1, 'chat-base-v1', overdraft),
    ).resolves.toBe(7);
    await expect(
      service.deductFromBalance(1, null, 40, 20000, 99, 1, 'chat-base-v1', overdraft),
    ).resolves.toBe(7);

    expect(userBalanceRepository.update).toHaveBeenCalledTimes(1);
    expect(userBalanceRepository.update.mock.calls[0][1].credits()).toBe(
      'COALESCE(credits, 0) - 40',
    );
  });

  it('refunds both charge components for one assistant turn through log IDs', async () => {
    accountLogRepository.find.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    const refund = jest
      .spyOn(service, 'refundBalanceByLogId')
      .mockResolvedValue({ refunded: true } as any);

    await expect(service.refundChatTurnCharges(99, '失败退款')).resolves.toHaveLength(2);

    expect(accountLogRepository.find).toHaveBeenCalledWith({
      where: { relatedId: 99, rechargeType: expect.anything() },
      order: { id: 'ASC' },
    });
    expect(refund).toHaveBeenNthCalledWith(1, 10, '失败退款');
    expect(refund).toHaveBeenNthCalledWith(2, 11, '失败退款');
  });

  it('reconciles only failed or Platform-marked P8 charges and retries on the next run', async () => {
    terminalRefundQueryBuilder.getRawMany
      .mockResolvedValueOnce([{ deductLogId: '10' }])
      .mockResolvedValueOnce([{ deductLogId: '10' }])
      .mockResolvedValueOnce([]);
    const refund = jest
      .spyOn(service, 'refundBalanceByLogId')
      .mockRejectedValueOnce(new Error('temporary refund failure'))
      .mockRejectedValueOnce(new Error('temporary refund failure'))
      .mockResolvedValueOnce({ refunded: true } as any);

    await expect(service.reconcileTerminalChatTurnRefunds()).rejects.toThrow(
      'temporary refund failure',
    );
    await expect(service.reconcileTerminalChatTurnRefunds()).resolves.toEqual({
      candidates: 1,
      refunded: 1,
      alreadyRefunded: 0,
    });

    expect(refund).toHaveBeenCalledTimes(3);
    expect(terminalRefundQueryBuilder.innerJoin).toHaveBeenCalledWith(
      expect.anything(),
      'assistant',
      'assistant.id = deduct.relatedId AND assistant.userId = deduct.userId',
    );
    expect(terminalRefundQueryBuilder.andWhere).toHaveBeenCalledWith(
      'deduct.extent IN (:...markers)',
      { markers: ['chat-base-v1', 'chat-tool-v1'] },
    );
    expect(terminalRefundQueryBuilder.andWhere).toHaveBeenCalledWith('deduct.userId IS NOT NULL');
    const terminalPredicateCall = terminalRefundQueryBuilder.andWhere.mock.calls.find(
      ([predicate]: any[]) =>
        typeof predicate === 'string' && predicate.includes('assistant.status = :failedStatus'),
    );
    expect(terminalPredicateCall?.[0]).toContain("'$.internal.chatTurnTerminalOrigin'");
    expect(terminalPredicateCall?.[0]).not.toContain("'$.turn.status'");
    expect(terminalPredicateCall?.[1]).toEqual({
      failedStatus: 4,
      stoppedStatus: 5,
      systemRecoveryOrigin: 'service-recovery-v1',
    });
  });

  it('treats a concurrent refund as reconciled and does not create a second refund', async () => {
    terminalRefundQueryBuilder.getRawMany
      .mockResolvedValueOnce([{ deductLogId: 10 }])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(service, 'refundBalanceByLogId')
      .mockResolvedValue({ refunded: false, alreadyRefunded: true } as any);

    await expect(service.reconcileTerminalChatTurnRefunds()).resolves.toEqual({
      candidates: 1,
      refunded: 0,
      alreadyRefunded: 1,
    });
  });

  it('does not add balance again when the deduct log already has a refund log', async () => {
    accountLogRepository.findOne
      .mockResolvedValueOnce({
        id: 10,
        userId: 1,
        rechargeType: 11,
        credits: 6,
        memberCredits: 0,
        relatedId: 99,
      })
      .mockResolvedValueOnce({ id: 11, rechargeType: 7, refundSourceLogId: 10 });

    await expect((service as any).refundBalanceByLogId(10, '任务失败')).resolves.toEqual({
      refunded: false,
      alreadyRefunded: true,
    });

    expect(userBalanceRepository.update).not.toHaveBeenCalled();
    expect(accountLogRepository.save).not.toHaveBeenCalled();
  });

  it('rolls back balance update when refund log creation fails', async () => {
    accountLogRepository.findOne
      .mockResolvedValueOnce({
        id: 10,
        userId: 1,
        rechargeType: 11,
        credits: 6,
        memberCredits: 0,
        relatedId: 99,
      })
      .mockResolvedValueOnce(null);
    userBalanceRepository.findOne.mockResolvedValue({ userId: 1, credits: 0, memberCredits: 0 });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });
    accountLogRepository.save.mockRejectedValue(new Error('insert failed'));
    dataSource.transaction.mockImplementationOnce(async (handler: any) =>
      handler({
        getRepository: (target: any) => {
          if (target === UserBalanceEntity) return userBalanceRepository;
          if (target === AccountLogEntity) return accountLogRepository;
          return packageRepository;
        },
      }),
    );

    await expect((service as any).refundBalanceByLogId(10, '任务失败')).rejects.toThrow(
      'insert failed',
    );

    expect(userBalanceRepository.update).toHaveBeenCalled();
    expect(accountLogRepository.save).toHaveBeenCalled();
  });

  it('validates balance against the existing row without creating one', async () => {
    const row = { userId: 1, credits: 5, memberCredits: 0, packageId: null, expirationTime: null };
    userBalanceRepository.findOne.mockResolvedValue(row);

    await expect(service.validateBalance({ user: { id: 1, role: 'user' } }, null, 1)).resolves.toBe(
      row,
    );

    expect(userBalanceRepository.findOne).toHaveBeenCalledTimes(1);
    expect(userBalanceRepository.findOne).toHaveBeenCalledWith({ where: { userId: 1 } });
    expect(userBalanceRepository.save).not.toHaveBeenCalled();
  });

  it('reuses the row written by a concurrent creator after a duplicate-key race', async () => {
    const concurrentRow = {
      userId: 1,
      credits: 0,
      memberCredits: 0,
      packageId: null,
      expirationTime: null,
    };
    userBalanceRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(concurrentRow);
    userBalanceRepository.save.mockRejectedValue(
      Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }),
    );

    await expect(service.validateBalance({ user: { id: 1, role: 'user' } }, null, 0)).resolves.toBe(
      concurrentRow,
    );

    expect(userBalanceRepository.save).toHaveBeenCalledTimes(1);
    expect(userBalanceRepository.findOne).toHaveBeenCalledTimes(3);
  });

  it('fails with an explicit conflict instead of a TypeError when the duplicate row vanished', async () => {
    userBalanceRepository.findOne.mockResolvedValue(null);
    userBalanceRepository.save.mockRejectedValue(
      Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }),
    );

    const rejection = service.validateBalance({ user: { id: 1, role: 'user' } }, null, 1);

    await expect(rejection).rejects.toBeInstanceOf(HttpException);
    await expect(rejection).rejects.toMatchObject({
      status: 409,
      message: '用户账户初始化冲突，请稍后重试！',
    });
  });

  it('refuses to credit an order without an owner before touching any balance row', async () => {
    const errorSpy = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);

    for (const userId of [null, undefined]) {
      await expect(
        service.addBalanceToOrder({
          orderId: 'order_orphan_0001',
          userId: userId as any,
          creditsSnapshot: 10,
          daysSnapshot: 0,
          count: 1,
          goodsId: 3,
        }),
      ).rejects.toMatchObject({ status: 400, message: '订单缺少归属用户，无法入账！' });
    }

    expect(userBalanceRepository.findOne).not.toHaveBeenCalled();
    expect(userBalanceRepository.update).not.toHaveBeenCalled();
    expect(userBalanceRepository.save).not.toHaveBeenCalled();
    expect(accountLogRepository.save).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('缺少归属用户'),
      'UserBalanceService',
    );
    expect(errorSpy.mock.calls[0][0]).not.toContain('order_orphan_0001');
    errorSpy.mockRestore();
  });

  it('credits a paid order to its owner and records the recharge log unchanged', async () => {
    userBalanceRepository.findOne.mockResolvedValue({
      userId: 1,
      credits: 0,
      memberCredits: 0,
      packageId: null,
      expirationTime: null,
    });
    userBalanceRepository.update.mockResolvedValue({ affected: 1 });
    accountLogRepository.save.mockResolvedValue({ id: 21 });

    await expect(
      service.addBalanceToOrder({
        orderId: 'order_paid_0001',
        userId: 1,
        creditsSnapshot: 10,
        daysSnapshot: 0,
        pkgNameSnapshot: '积分包',
        count: 2,
        goodsId: 3,
        weightSnapshot: 0,
      }),
    ).resolves.toBeUndefined();

    expect(userBalanceRepository.update).toHaveBeenCalledTimes(1);
    expect(userBalanceRepository.update.mock.calls[0][0]).toEqual({ userId: 1 });
    expect(userBalanceRepository.update.mock.calls[0][1].credits()).toBe(
      'COALESCE(credits, 0) + 20',
    );
    expect(accountLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        rechargeType: 6,
        credits: 20,
        days: 0,
        pkgName: '积分包',
        packageId: 3,
        memberDays: null,
      }),
    );
  });
});
