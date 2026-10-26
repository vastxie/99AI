import { Logger } from '@nestjs/common';
import { CommerceSandboxMeter } from './commerce-sandbox.meter';
import { CommerceUserProfileService } from '../userBalance/commerce-user-profile.service';
import { CommerceSandboxPolicyResolver } from './commerce-sandbox-policy.resolver';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;
declare const afterEach: any;

const POLICIES = JSON.stringify({
  default: { memoryMb: 512, execTimeoutSec: 60 },
  plans: { pro: { memoryMb: 4096, cpus: 2, workspaceMaxMb: 2048 } },
});
const FUTURE = new Date(Date.now() + 86_400_000);

function resolverSetup(
  options: {
    config?: unknown;
    balance?: { packageId?: number; expirationTime?: Date | null } | null;
    planKey?: string;
  } = {},
) {
  const config = { value: 'config' in options ? options.config : POLICIES };
  const globalConfigService = { getConfigs: jest.fn(async () => config.value) };
  const userBalanceRepository = {
    findOne: jest.fn(async () =>
      options.balance === undefined ? { packageId: 3, expirationTime: FUTURE } : options.balance,
    ),
  };
  const packageRepository = {
    findOne: jest.fn(async () => ({ planKey: options.planKey ?? 'pro' })),
  };
  const resolver = new CommerceSandboxPolicyResolver(
    globalConfigService as any,
    userBalanceRepository as any,
    packageRepository as any,
  );
  return { resolver, config, userBalanceRepository, packageRepository };
}

describe('CommerceSandboxPolicyResolver', () => {
  afterEach(() => jest.restoreAllMocks());

  it('gives an active member the tier of the purchased plan', async () => {
    const { resolver, userBalanceRepository, packageRepository } = resolverSetup();
    await expect(resolver.resolve('user-7')).resolves.toEqual({
      memoryMb: 4096,
      cpus: 2,
      workspaceMaxBytes: 2048 * 1024 * 1024,
    });
    expect(userBalanceRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 7 },
      select: { packageId: true, expirationTime: true },
    });
    expect(packageRepository.findOne).toHaveBeenCalledWith({
      where: { id: 3 },
      select: { planKey: true },
    });
    await expect(resolver.resolveTier('user-7')).resolves.toMatchObject({
      source: 'plan',
      planKey: 'pro',
    });
  });

  it('falls back to the default tier without an active plan or for visitors', async () => {
    const expired = resolverSetup({ balance: { packageId: 3, expirationTime: new Date(0) } });
    await expect(expired.resolver.resolve('user-7')).resolves.toEqual({
      memoryMb: 512,
      execTimeoutSec: 60,
    });
    expect(expired.packageRepository.findOne).not.toHaveBeenCalled();

    const unconfigured = resolverSetup({ planKey: 'basic' });
    await expect(unconfigured.resolver.resolveTier('user-7')).resolves.toMatchObject({
      source: 'default',
      planKey: 'basic',
    });

    const visitor = resolverSetup();
    await expect(visitor.resolver.resolveTier('visitor-abc')).resolves.toMatchObject({
      source: 'default',
      planKey: undefined,
    });
    expect(visitor.userBalanceRepository.findOne).not.toHaveBeenCalled();
  });

  it('keeps the environment policy when no tier applies', async () => {
    const empty = resolverSetup({ config: '' });
    await expect(empty.resolver.resolve('user-7')).resolves.toBeUndefined();
    expect(empty.userBalanceRepository.findOne).not.toHaveBeenCalled();

    const plansOnly = resolverSetup({
      config: JSON.stringify({ plans: { pro: { memoryMb: 1024 } } }),
      balance: null,
    });
    await expect(plansOnly.resolver.resolveTier('user-7')).resolves.toEqual({
      source: 'env',
      planKey: undefined,
    });
  });

  it('refuses sandbox calls while the stored tiers are invalid instead of widening them', async () => {
    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    const invalid = resolverSetup({ config: '{' });
    await expect(invalid.resolver.resolve('user-7')).rejects.toThrow('沙箱资源配置无效');
    await expect(invalid.resolver.resolve('visitor-1')).rejects.toThrow('沙箱资源配置无效');
    // 同一份坏配置只告警一次
    expect(warn).toHaveBeenCalledTimes(1);
    invalid.config.value = POLICIES;
    await expect(invalid.resolver.resolve('visitor-1')).resolves.toEqual({
      memoryMb: 512,
      execTimeoutSec: 60,
    });
  });

  it('matches plan keys by own properties only', async () => {
    // 用 JSON 文本：对象字面量里的 __proto__ 会设置原型而不是生成键
    const config =
      '{"default":{"memoryMb":512},"plans":{"__proto__":{"memoryMb":2048},"pro":{"memoryMb":4096}}}';
    const inherited = resolverSetup({ config, planKey: 'constructor' });
    await expect(inherited.resolver.resolveTier('user-7')).resolves.toMatchObject({
      source: 'default',
      planKey: 'constructor',
      tier: { memoryMb: 512 },
    });
    const proto = resolverSetup({ config, planKey: '__proto__' });
    await expect(proto.resolver.resolveTier('user-7')).resolves.toMatchObject({
      source: 'plan',
      tier: { memoryMb: 2048 },
    });
  });

  it('caches the plan briefly but applies tier edits immediately', async () => {
    const { resolver, config, userBalanceRepository } = resolverSetup();
    await resolver.resolve('user-7');
    config.value = JSON.stringify({ plans: { pro: { memoryMb: 1024 } } });
    await expect(resolver.resolve('user-7')).resolves.toEqual({ memoryMb: 1024 });
    expect(userBalanceRepository.findOne).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    await resolver.resolve('user-7');
    expect(userBalanceRepository.findOne).toHaveBeenCalledTimes(2);
  });

  it('lets database failures reach the kernel, which then refuses the sandbox call', async () => {
    const { resolver, userBalanceRepository } = resolverSetup();
    userBalanceRepository.findOne.mockRejectedValue(new Error('db down'));
    await expect(resolver.resolve('user-7')).rejects.toThrow('db down');
  });
});

describe('CommerceSandboxMeter', () => {
  afterEach(() => jest.restoreAllMocks());

  function meterSetup() {
    const store = new Map<string, number>();
    const redisCacheService = {
      // 模拟 RECORD_USAGE_SCRIPT：KEYS = [耗时, 次数]，ARGV = [耗时增量, 过期秒数]
      runAtomicScript: jest.fn(async (_script: string, keys: string[], args: string[]) => {
        store.set(keys[0], (store.get(keys[0]) || 0) + Number(args[0]));
        store.set(keys[1], (store.get(keys[1]) || 0) + 1);
        return store.get(keys[1]);
      }),
      mget: jest.fn(async (keys: string[]) =>
        keys.map(key => (store.has(key) ? String(store.get(key)) : null)),
      ),
    };
    return { meter: new CommerceSandboxMeter(redisCacheService as any), redisCacheService };
  }

  it('records member usage per day in UTC+8 and ignores visitors', async () => {
    // 2026-09-24 16:30 UTC 已是东八区 9 月 25 日
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 24, 16, 30));
    const { meter, redisCacheService } = meterSetup();
    await meter.record('user-7', { execMs: 1234.6 });
    await meter.record('user-7', { execMs: -5 });
    await meter.record('visitor-abc', { execMs: 99 });

    expect(redisCacheService.runAtomicScript).toHaveBeenCalledTimes(2);
    expect(redisCacheService.runAtomicScript).toHaveBeenCalledWith(
      expect.stringContaining("if redis.call('TTL', key) < 0 then"),
      ['sandbox:usage:2026-09-25:7:ms', 'sandbox:usage:2026-09-25:7:count'],
      ['1235', String(90 * 24 * 3600)],
    );
    const summary = await meter.summary(7, 7);
    expect(summary.days).toHaveLength(7);
    expect(summary.days[6]).toEqual({ date: '2026-09-25', execMs: 1235, count: 2 });
    expect(summary.days[0].date).toBe('2026-09-19');
    expect(summary).toMatchObject({ execMs: 1235, count: 2 });
  });

  it('surfaces Redis write failures to the kernel, which only logs a warning', async () => {
    const { meter, redisCacheService } = meterSetup();
    redisCacheService.runAtomicScript.mockRejectedValue(new Error('redis down'));
    await expect(meter.record('user-7', { execMs: 10 })).rejects.toThrow('redis down');
    // RedisCacheService.mget 失败时返回全空，用量按 0 展示
    redisCacheService.mget.mockResolvedValue(new Array(14).fill(null));
    await expect(meter.summary(7, 7)).resolves.toMatchObject({ execMs: 0, count: 0 });
  });

  it('clamps the summary window', async () => {
    const { meter, redisCacheService } = meterSetup();
    expect((await meter.summary(7, 0)).days).toHaveLength(1);
    expect((await meter.summary(7, 365)).days).toHaveLength(90);
    // 每天两个键（耗时 / 次数），一次 MGET 读完
    expect(redisCacheService.mget.mock.calls[1][0]).toHaveLength(180);
  });
});

describe('commerce profile sandbox block', () => {
  it('shows the tier as unavailable when it cannot be resolved, keeping the usage', async () => {
    const summary = { days: [], execMs: 1500, count: 3 };
    const service = new CommerceUserProfileService(
      { register: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { resolveTier: jest.fn(async () => Promise.reject(new Error('沙箱资源配置无效'))) } as any,
      { summary: jest.fn(async () => summary) } as any,
    );
    await expect((service as any).buildSandbox(7)).resolves.toMatchObject({
      source: 'unavailable',
      planKey: null,
      tier: null,
      last30Days: summary,
    });
  });
});
