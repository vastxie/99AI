import type { SandboxPolicy } from '@/modules/sandbox/sandbox.service';

/** 后台配置键：按套餐方案（planKey）分配沙箱资源，另有 default 档给未购买 / 已过期用户与访客 */
export const SANDBOX_PLAN_POLICIES_KEY = 'sandboxPlanPolicies';

/**
 * 一档沙箱资源；未填写的字段沿用环境变量 SANDBOX_* 的默认策略。
 * 内存、CPU、临时工作区容量在创建容器时确定，档位变化在沙箱闲置回收、下次开机时生效。
 */
export interface SandboxPlanTier {
  memoryMb?: number;
  cpus?: number;
  execTimeoutSec?: number;
  /** 临时工作区（访客、未启用持久磁盘时）：tmpfs，占用计入内存 */
  workspaceMaxMb?: number;
  /** 登录用户持久磁盘容量：下次开机时扩容；调小不会缩小已分配的磁盘，只按新值拒绝写入文件 */
  diskMaxMb?: number;
  /** 只能在 SANDBOX_MAX_ACCOUNT_ACTIVE 以内收紧 */
  maxAccountSandboxes?: number;
}

export interface SandboxPlanPolicies {
  default?: SandboxPlanTier;
  /** 无原型对象：方案标识可能是 constructor、__proto__ 之类的名字，只按自有键查找 */
  plans: Record<string, SandboxPlanTier>;
}

/** 校验档位时参照的实例上限，取自环境变量策略 */
export interface SandboxInstanceLimits {
  memoryMb: number;
  workspaceMaxBytes: number;
  totalMemoryMb: number;
  maxAccountSandboxes: number;
}

const INTEGER_FIELDS: Array<[keyof SandboxPlanTier, string, number, number]> = [
  ['memoryMb', '内存（MB）', 128, 65536],
  ['execTimeoutSec', '单次执行超时（秒）', 5, 3600],
  ['workspaceMaxMb', '工作区容量（MB）', 16, 102400],
  ['diskMaxMb', '磁盘容量（MB）', 256, 1048576],
  ['maxAccountSandboxes', '每账号并发沙箱数', 1, 20],
];
const PLAN_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function normalizeTier(
  raw: unknown,
  label: string,
  limits: SandboxInstanceLimits | undefined,
): SandboxPlanTier {
  if (!isPlainObject(raw)) throw new Error(`${label}必须是对象`);
  const tier: SandboxPlanTier = {};
  for (const [field, name, min, max] of INTEGER_FIELDS) {
    if (isBlank(raw[field])) continue;
    const parsed = Number(raw[field]);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new Error(`${label}的${name}须为 ${min}–${max} 之间的整数`);
    }
    tier[field] = parsed;
  }
  if (!isBlank(raw.cpus)) {
    const cpus = Number(raw.cpus);
    const hundredths = Math.round(cpus * 100);
    if (
      !Number.isFinite(cpus) ||
      cpus < 0.25 ||
      cpus > 64 ||
      Math.abs(hundredths - cpus * 100) > 1e-6
    ) {
      throw new Error(`${label}的 CPU 须在 0.25–64 之间，最多两位小数`);
    }
    tier.cpus = hundredths / 100;
  }
  if (limits) {
    const memoryMb = tier.memoryMb ?? limits.memoryMb;
    const workspaceBytes =
      tier.workspaceMaxMb !== undefined
        ? tier.workspaceMaxMb * 1024 * 1024
        : limits.workspaceMaxBytes;
    if (
      tier.maxAccountSandboxes !== undefined &&
      tier.maxAccountSandboxes > limits.maxAccountSandboxes
    ) {
      throw new Error(
        `${label}的每账号并发不能超过 SANDBOX_MAX_ACCOUNT_ACTIVE（${limits.maxAccountSandboxes}）`,
      );
    }
    if (memoryMb > limits.totalMemoryMb) {
      throw new Error(
        `${label}的内存超过实例总内存 SANDBOX_TOTAL_MEMORY_MB（${limits.totalMemoryMb} MB）`,
      );
    }
    // 工作区是容器内存盘，占用计入内存上限；不小于内存时写满工作区会让命令被 OOM 终止
    if (
      (tier.memoryMb !== undefined || tier.workspaceMaxMb !== undefined) &&
      workspaceBytes >= memoryMb * 1024 * 1024
    ) {
      throw new Error(`${label}的工作区容量必须小于内存`);
    }
  }
  return tier;
}

/**
 * 校验并规范化后台保存的配置；空值表示不按套餐区分（全部沿用环境变量策略）。
 * 传入 limits 时额外检查档位能否在当前实例上创建。
 */
export function parseSandboxPlanPolicies(
  raw: unknown,
  limits?: SandboxInstanceLimits,
): SandboxPlanPolicies {
  if (isBlank(raw)) return { plans: Object.create(null) };
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('沙箱资源配置不是合法 JSON');
    }
  }
  if (!isPlainObject(value)) throw new Error('沙箱资源配置必须是对象');
  const result: SandboxPlanPolicies = { plans: Object.create(null) };
  if (!isBlank(value.default)) {
    result.default = normalizeTier(value.default, '默认档', limits);
  }
  if (!isBlank(value.plans)) {
    if (!isPlainObject(value.plans)) throw new Error('plans 必须是以方案标识为键的对象');
    for (const [planKey, tier] of Object.entries(value.plans)) {
      if (!PLAN_KEY_PATTERN.test(planKey)) throw new Error(`方案标识不合法：${planKey}`);
      result.plans[planKey] = normalizeTier(tier, `方案 ${planKey} `, limits);
    }
  }
  return result;
}

/** 转成内核沙箱策略的覆盖项；空档返回 undefined，表示沿用环境变量策略 */
export function toSandboxPolicyOverride(
  tier: SandboxPlanTier | undefined,
): Partial<SandboxPolicy> | undefined {
  if (!tier) return undefined;
  const override: Partial<SandboxPolicy> = {};
  if (tier.memoryMb !== undefined) override.memoryMb = tier.memoryMb;
  if (tier.cpus !== undefined) override.cpus = tier.cpus;
  if (tier.execTimeoutSec !== undefined) override.execTimeoutSec = tier.execTimeoutSec;
  if (tier.workspaceMaxMb !== undefined) {
    override.workspaceMaxBytes = tier.workspaceMaxMb * 1024 * 1024;
  }
  if (tier.diskMaxMb !== undefined) override.diskMaxBytes = tier.diskMaxMb * 1024 * 1024;
  if (tier.maxAccountSandboxes !== undefined) {
    override.maxAccountSandboxes = tier.maxAccountSandboxes;
  }
  return Object.keys(override).length ? override : undefined;
}
