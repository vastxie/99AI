import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import type { SandboxPolicy, SandboxPolicyResolver } from '@/modules/sandbox/sandbox.service';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PackageEntity } from '../package/package.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import {
  parseSandboxPlanPolicies,
  SANDBOX_PLAN_POLICIES_KEY,
  SandboxPlanPolicies,
  SandboxPlanTier,
  toSandboxPolicyOverride,
} from './sandbox-plan-policy';

const LOG_CONTEXT = 'CommerceSandbox';
/** 购买或到期后最多延迟这么久按新档位建沙箱；档位配置本身改完立即生效 */
const PLAN_CACHE_TTL_MS = 30_000;
const PLAN_CACHE_MAX = 2000;

/** plan：套餐方案的档位；default：默认档；env：没有可用档位，沿用环境变量策略 */
export interface SandboxTierMatch {
  source: 'plan' | 'default' | 'env';
  planKey?: string;
  tier?: SandboxPlanTier;
}

export function sandboxAccountUserId(accountId: string): number | undefined {
  const match = /^user-([1-9][0-9]*)$/u.exec(accountId);
  return match ? Number(match[1]) : undefined;
}

/**
 * 按套餐分配沙箱资源：正式用户取有效会员套餐的方案标识（planKey）对应的档位，
 * 没有有效套餐的用户和访客用默认档；都未配置时沿用环境变量策略。
 * 查询失败或已存配置无效时抛错，内核随之拒绝本次沙箱操作（不回退到可能更宽的环境变量资源）。
 */
@Injectable()
export class CommerceSandboxPolicyResolver implements SandboxPolicyResolver {
  private readonly planKeys = new Map<string, { planKey?: string; expiresAt: number }>();
  private parsed?: { raw: unknown; policies: SandboxPlanPolicies };
  private reportedInvalid?: unknown;

  constructor(
    private readonly globalConfigService: GlobalConfigService,
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceRepository: Repository<UserBalanceEntity>,
    @InjectRepository(PackageEntity)
    private readonly packageRepository: Repository<PackageEntity>,
  ) {}

  async resolve(accountId: string): Promise<Partial<SandboxPolicy> | undefined> {
    return toSandboxPolicyOverride((await this.resolveTier(accountId)).tier);
  }

  /** 命中的档位及来源；后台用户画像也用它展示 */
  async resolveTier(accountId: string): Promise<SandboxTierMatch> {
    const policies = await this.readPolicies();
    if (!policies.default && !Object.keys(policies.plans).length) return { source: 'env' };
    const planKey = await this.activePlanKey(accountId);
    // 方案标识来自套餐表，可能是 constructor 之类的名字：只认档位表的自有键
    if (planKey && Object.hasOwn(policies.plans, planKey)) {
      return { source: 'plan', planKey, tier: policies.plans[planKey] };
    }
    return policies.default
      ? { source: 'default', planKey, tier: policies.default }
      : { source: 'env', planKey };
  }

  private async readPolicies(): Promise<SandboxPlanPolicies> {
    const raw = await this.globalConfigService.getConfigs([SANDBOX_PLAN_POLICIES_KEY]);
    if (this.parsed && this.parsed.raw === raw) return this.parsed.policies;
    let policies: SandboxPlanPolicies;
    try {
      policies = parseSandboxPlanPolicies(raw);
    } catch {
      if (this.reportedInvalid !== raw) {
        this.reportedInvalid = raw;
        Logger.warn('沙箱资源配置无效，已拒绝沙箱操作，请在后台重新保存沙箱资源', LOG_CONTEXT);
      }
      throw new Error('沙箱资源配置无效');
    }
    this.parsed = { raw, policies };
    return policies;
  }

  private async activePlanKey(accountId: string): Promise<string | undefined> {
    const userId = sandboxAccountUserId(accountId);
    if (!userId) return undefined;
    const cached = this.planKeys.get(accountId);
    if (cached && cached.expiresAt > Date.now()) return cached.planKey;

    const balance = await this.userBalanceRepository.findOne({
      where: { userId },
      select: { packageId: true, expirationTime: true },
    });
    const packageId = Number(balance?.packageId || 0);
    const active =
      packageId > 0 &&
      !!balance?.expirationTime &&
      new Date(balance.expirationTime).getTime() > Date.now();
    const planKey = active
      ? (
          await this.packageRepository.findOne({
            where: { id: packageId },
            select: { planKey: true },
          })
        )?.planKey || undefined
      : undefined;

    this.planKeys.delete(accountId);
    if (this.planKeys.size >= PLAN_CACHE_MAX) {
      this.planKeys.delete(this.planKeys.keys().next().value as string);
    }
    this.planKeys.set(accountId, { planKey, expiresAt: Date.now() + PLAN_CACHE_TTL_MS });
    return planKey;
  }
}
