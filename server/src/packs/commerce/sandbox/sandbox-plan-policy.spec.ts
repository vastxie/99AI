import { GlobalConfigRegistry } from '@/modules/globalConfig/global-config.registry';
import { CommerceConfigSection } from '../commerce-config.section';
import {
  parseSandboxPlanPolicies,
  SANDBOX_PLAN_POLICIES_KEY,
  toSandboxPolicyOverride,
} from './sandbox-plan-policy';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const afterEach: any;

const limits = {
  memoryMb: 2048,
  workspaceMaxBytes: 1024 ** 3,
  totalMemoryMb: 8192,
  maxAccountSandboxes: 2,
};

describe('sandbox plan policies', () => {
  it('normalizes tiers keyed by plan and treats blank values as unset', () => {
    expect(
      parseSandboxPlanPolicies(
        JSON.stringify({
          default: { memoryMb: '512', workspaceMaxMb: 256, cpus: '' },
          plans: {
            pro: { memoryMb: 4096, cpus: 0.29, execTimeoutSec: 600, maxAccountSandboxes: 1 },
          },
        }),
        limits,
      ),
    ).toEqual({
      default: { memoryMb: 512, workspaceMaxMb: 256 },
      plans: { pro: { memoryMb: 4096, cpus: 0.29, execTimeoutSec: 600, maxAccountSandboxes: 1 } },
    });
    expect(parseSandboxPlanPolicies('')).toEqual({ plans: {} });
    expect(parseSandboxPlanPolicies(undefined)).toEqual({ plans: {} });
  });

  it.each([
    ['{', '不是合法 JSON'],
    ['[]', '必须是对象'],
    [{ plans: [] }, 'plans 必须是以方案标识为键的对象'],
    [{ plans: { 'bad key': {} } }, '方案标识不合法'],
    [{ default: { memoryMb: 64 } }, '内存（MB）须为 128–65536'],
    [{ default: { memoryMb: 512.5 } }, '内存（MB）须为 128–65536'],
    [{ default: { cpus: 0.1 } }, 'CPU 须在 0.25–64'],
    [{ default: { cpus: 1.005 } }, '最多两位小数'],
    [{ plans: { pro: { execTimeoutSec: 4000 } } }, '方案 pro 的单次执行超时'],
    [{ default: { diskMaxMb: 128 } }, '磁盘容量（MB）须为 256–1048576'],
    [{ default: { diskMaxMb: 2048.5 } }, '磁盘容量（MB）须为 256–1048576'],
  ])('rejects %j', (raw: unknown, message: string) => {
    expect(() => parseSandboxPlanPolicies(raw)).toThrow(message);
  });

  it('sizes persistent disks independently of memory and maps them to the disk policy', () => {
    const parsed = parseSandboxPlanPolicies(
      { plans: { pro: { memoryMb: 2048, diskMaxMb: 8192 } } },
      limits,
    );
    expect(parsed.plans.pro).toEqual({ memoryMb: 2048, diskMaxMb: 8192 });
    expect(toSandboxPolicyOverride(parsed.plans.pro)).toEqual({
      memoryMb: 2048,
      diskMaxBytes: 8192 * 1024 ** 2,
    });
    // 临时工作区仍在内存里，照旧必须小于内存
    expect(() =>
      parseSandboxPlanPolicies(
        { plans: { pro: { memoryMb: 2048, workspaceMaxMb: 4096 } } },
        limits,
      ),
    ).toThrow('工作区容量必须小于内存');
  });

  it('keeps plan keys such as __proto__ and constructor as own entries through a round trip', () => {
    const raw = '{"plans":{"__proto__":{"memoryMb":512},"constructor":{"cpus":1}}}';
    const parsed = parseSandboxPlanPolicies(raw);
    expect(Object.keys(parsed.plans).sort()).toEqual(['__proto__', 'constructor']);
    expect(Object.hasOwn(parsed.plans, 'toString')).toBe(false);
    const again = parseSandboxPlanPolicies(JSON.stringify(parsed));
    expect(again.plans['__proto__']).toEqual({ memoryMb: 512 });
    expect(again.plans['constructor']).toEqual({ cpus: 1 });
  });

  it('checks every tier against the instance limits', () => {
    expect(() => parseSandboxPlanPolicies({ default: { memoryMb: 16384 } }, limits)).toThrow(
      'SANDBOX_TOTAL_MEMORY_MB（8192 MB）',
    );
    expect(() => parseSandboxPlanPolicies({ default: { memoryMb: 1024 } }, limits)).toThrow(
      '工作区容量必须小于内存',
    );
    expect(() =>
      parseSandboxPlanPolicies({ plans: { pro: { workspaceMaxMb: 2048 } } }, limits),
    ).toThrow('工作区容量必须小于内存');
    expect(() =>
      parseSandboxPlanPolicies({ plans: { pro: { maxAccountSandboxes: 3 } } }, limits),
    ).toThrow('SANDBOX_MAX_ACCOUNT_ACTIVE（2）');
    // 只改超时的档位不受环境里内存 / 工作区组合的影响
    expect(
      parseSandboxPlanPolicies(
        { default: { execTimeoutSec: 60 } },
        { ...limits, workspaceMaxBytes: 4096 * 1024 * 1024 },
      ),
    ).toEqual({ default: { execTimeoutSec: 60 }, plans: {} });
  });

  it('maps a tier onto the kernel sandbox policy', () => {
    expect(
      toSandboxPolicyOverride({
        memoryMb: 1024,
        cpus: 2,
        execTimeoutSec: 300,
        workspaceMaxMb: 256,
        maxAccountSandboxes: 1,
      }),
    ).toEqual({
      memoryMb: 1024,
      cpus: 2,
      execTimeoutSec: 300,
      workspaceMaxBytes: 256 * 1024 * 1024,
      maxAccountSandboxes: 1,
    });
    expect(toSandboxPolicyOverride({})).toBeUndefined();
    expect(toSandboxPolicyOverride(undefined)).toBeUndefined();
  });
});

describe('commerce config section', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  function registry() {
    const value = new GlobalConfigRegistry();
    new CommerceConfigSection(value);
    return value;
  }

  it('stores normalized sandbox tiers and checks them against the environment policy', async () => {
    process.env.SANDBOX_TOTAL_MEMORY_MB = '4096';
    process.env.SANDBOX_MEMORY_MB = '2048';
    process.env.SANDBOX_WORKSPACE_MAX_MB = '1024';
    const item = {
      configKey: SANDBOX_PLAN_POLICIES_KEY,
      configVal: ' {"plans":{"pro":{"memoryMb":"3072","cpus":"1.5"}}} ',
    };
    await registry().validate(item);
    expect(JSON.parse(item.configVal)).toEqual({
      plans: { pro: { memoryMb: 3072, cpus: 1.5 } },
    });

    const tooLarge = {
      configKey: SANDBOX_PLAN_POLICIES_KEY,
      configVal: '{"default":{"memoryMb":8192}}',
    };
    await expect(registry().validate(tooLarge)).rejects.toMatchObject({ status: 400 });

    const cleared = { configKey: SANDBOX_PLAN_POLICIES_KEY, configVal: '  ' };
    await registry().validate(cleared);
    expect(cleared.configVal).toBe('');
  });

  it('leaves other commerce keys untouched', async () => {
    const item = { configKey: 'signInCredits', configVal: '{' };
    await registry().validate(item);
    expect(item.configVal).toBe('{');
  });
});
