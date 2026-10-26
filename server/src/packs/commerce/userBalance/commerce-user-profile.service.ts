import { RechargeType } from '../shared/balance.constant';
import { ChatLogEntity } from '@/modules/chatLog/chatLog.entity';
import {
  UserProfileEvent,
  UserProfileSectionRegistry,
} from '@/modules/user/user-profile-section.registry';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from '../order/order.entity';
import { PackageEntity } from '../package/package.entity';
import { CommerceSandboxMeter, SandboxUsageSummary } from '../sandbox/commerce-sandbox.meter';
import {
  CommerceSandboxPolicyResolver,
  SandboxTierMatch,
} from '../sandbox/commerce-sandbox-policy.resolver';
import type { SandboxPlanTier } from '../sandbox/sandbox-plan-policy';
import { AccountLogEntity } from './accountLog.entity';
import { UserBalanceEntity } from './userBalance.entity';

const DEDUCT_TYPES = [RechargeType.CHAT_DEDUCT, RechargeType.TOOL_DEDUCT];

export interface CommerceProfileSections {
  balance: { balance: Record<string, any>; entitlement: Record<string, any> };
  orders: Record<string, any>;
  /** 按天 / 模型汇总的积分消耗，供用量图表使用 */
  costRows: Array<{ time: string; model: string; cost: number | string }>;
  sandbox: CommerceSandboxProfile;
  recentEvents: UserProfileEvent[];
}

export interface CommerceSandboxProfile {
  /** unavailable：档位配置无效或读取失败，此时内核会拒绝该用户的沙箱操作 */
  source: SandboxTierMatch['source'] | 'unavailable';
  planKey: string | null;
  tier: SandboxPlanTier | null;
  last7Days: { execMs: number; count: number };
  last30Days: SandboxUsageSummary;
}

/**
 * 后台用户画像的计费片段（商业包）：余额与权益、订单汇总、积分消耗曲线、沙箱档位与用量、订单 / 账单动态。
 * 构造时向内核 UserProfileSectionRegistry 登记为 `commerce` 片段，管理端商业包按此渲染。
 */
@Injectable()
export class CommerceUserProfileService {
  constructor(
    registry: UserProfileSectionRegistry,
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceRepository: Repository<UserBalanceEntity>,
    @InjectRepository(PackageEntity)
    private readonly packageRepository: Repository<PackageEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
    @InjectRepository(AccountLogEntity)
    private readonly accountLogRepository: Repository<AccountLogEntity>,
    private readonly sandboxPolicyResolver: CommerceSandboxPolicyResolver,
    private readonly sandboxMeter: CommerceSandboxMeter,
  ) {
    registry.register({
      id: 'commerce',
      build: async input => {
        const result = await this.build(input);
        return {
          data: {
            balance: result.balance.balance,
            entitlement: result.balance.entitlement,
            orders: result.orders,
            costRows: result.costRows,
            sandbox: result.sandbox,
            links: {
              orders: `/payment/order-list?userId=${input.userId}`,
              accountLogs: `/user/account-log?userId=${input.userId}`,
            },
          },
          events: result.recentEvents,
        };
      },
    });
  }

  async build(input: {
    userId: number;
    rangeStart: Date | null;
    recentLimit: number;
  }): Promise<CommerceProfileSections> {
    const { userId, rangeStart, recentLimit } = input;
    const [balance, orders, costRows, sandbox, recentOrders, recentAccountLogs] = await Promise.all(
      [
        this.buildBalance(userId),
        this.buildOrders(userId, recentLimit),
        this.queryCostRows(userId, rangeStart),
        this.buildSandbox(userId),
        this.orderRepository.find({ where: { userId }, order: { id: 'DESC' }, take: recentLimit }),
        this.accountLogRepository.find({
          where: { userId },
          order: { id: 'DESC' },
          take: recentLimit,
        }),
      ],
    );

    return {
      balance,
      orders,
      costRows,
      sandbox,
      recentEvents: [
        ...recentOrders.map(order => ({
          type: 'order',
          title: order.status === 1 ? '订单支付成功' : '订单创建',
          summary: `${order.pkgNameSnapshot || order.planNameSnapshot || '套餐订单'} · ¥${this.toNumber(
            order.total,
          ).toFixed(2)}`,
          occurredAt: order.paydAt || order.createdAt,
          link: `/payment/order-list?userId=${order.userId}`,
        })),
        ...recentAccountLogs.map(log => ({
          type: 'accountLog',
          title: this.isDeductType(log.rechargeType) ? '额度消费' : '额度变更',
          summary: `${this.isDeductType(log.rechargeType) ? '消耗' : '变更'} ${this.toNumber(
            log.credits,
          )} 积分`,
          occurredAt: log.createdAt,
          link: `/user/account-log?userId=${log.userId}`,
        })),
      ],
    };
  }

  private async buildBalance(userId: number) {
    const balance = await this.userBalanceRepository.findOne({ where: { userId } });
    const packageId = Number(balance?.packageId || 0);
    const currentPackage = packageId
      ? await this.packageRepository.findOne({ where: { id: packageId } })
      : null;

    const credits = Number(balance?.credits || 0);
    const memberCredits = Number(balance?.memberCredits || 0);
    const usedCredits = Number(balance?.usedCredits || 0);
    const usedTokens = Number(balance?.usedTokens || 0);
    const isMember = this.isMembershipActive(balance?.expirationTime);

    const base = {
      packageId: packageId || null,
      packageName: currentPackage?.name || '',
      planKey: currentPackage?.planKey || '',
      planName: currentPackage?.planName || '',
      variantName: currentPackage?.variantName || '',
      expirationTime: balance?.expirationTime || null,
      isMember,
      credits,
      memberCredits,
      availableCredits: credits + (isMember ? memberCredits : 0),
      usedCredits,
      usedTokens,
    };

    return { balance: base, entitlement: base };
  }

  private async buildSandbox(userId: number): Promise<CommerceSandboxProfile> {
    const [resolved, usage] = await Promise.all([
      this.sandboxPolicyResolver
        .resolveTier(`user-${userId}`)
        .catch((): SandboxTierMatch | undefined => undefined),
      this.sandboxMeter.summary(userId, 30),
    ]);
    const recent = usage.days.slice(-7);
    return {
      source: resolved?.source ?? 'unavailable',
      planKey: resolved?.planKey ?? null,
      tier: resolved?.tier ?? null,
      last7Days: {
        execMs: recent.reduce((total, day) => total + day.execMs, 0),
        count: recent.reduce((total, day) => total + day.count, 0),
      },
      last30Days: usage,
    };
  }

  private async buildOrders(userId: number, recentLimit: number) {
    const [totalCount, paidCount, totalPaid, platformTop, recent] = await Promise.all([
      this.orderRepository.count({ where: { userId } }),
      this.orderRepository.count({ where: { userId, status: 1 } }),
      this.orderRepository
        .createQueryBuilder('order')
        .select('SUM(order.total)', 'amount')
        .addSelect('MAX(order.paydAt)', 'latestPaidAt')
        .where('order.userId = :userId', { userId })
        .andWhere('order.status = :status', { status: 1 })
        .getRawOne(),
      this.orderRepository
        .createQueryBuilder('order')
        .select('COALESCE(order.payPlatform, order.channel, "unknown")', 'platform')
        .addSelect('COUNT(order.id)', 'count')
        .addSelect('SUM(order.total)', 'amount')
        .where('order.userId = :userId', { userId })
        .andWhere('order.status = :status', { status: 1 })
        .groupBy('COALESCE(order.payPlatform, order.channel, "unknown")')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany(),
      this.orderRepository.find({ where: { userId }, order: { id: 'DESC' }, take: recentLimit }),
    ]);

    return {
      totalCount,
      paidCount,
      totalPaidAmount: this.toNumber(totalPaid?.amount),
      latestPaidAt: totalPaid?.latestPaidAt || null,
      platformTop: platformTop.map(item => ({
        platform: item.platform || 'unknown',
        count: this.toNumber(item.count),
        amount: this.toNumber(item.amount),
      })),
      recent: recent.map(item => this.formatOrder(item)),
    };
  }

  private queryCostRows(userId: number, rangeStart: Date | null) {
    const queryBuilder = this.accountLogRepository
      .createQueryBuilder('accountLog')
      .leftJoin(
        ChatLogEntity,
        'chat',
        'chat.id = accountLog.relatedId AND chat.userId = accountLog.userId',
      )
      .select('DATE_FORMAT(accountLog.createdAt, "%Y-%m-%d")', 'time')
      .addSelect('COALESCE(chat.model, "未关联模型")', 'model')
      .addSelect('SUM(COALESCE(accountLog.credits, 0))', 'cost')
      .where('accountLog.userId = :userId', { userId })
      .andWhere('accountLog.rechargeType IN (:...deductTypes)', { deductTypes: DEDUCT_TYPES });

    if (rangeStart) {
      queryBuilder.andWhere('accountLog.createdAt >= :rangeStart', { rangeStart });
    }

    return queryBuilder
      .groupBy('DATE_FORMAT(accountLog.createdAt, "%Y-%m-%d")')
      .addGroupBy('COALESCE(chat.model, "未关联模型")')
      .orderBy('time', 'ASC')
      .getRawMany();
  }

  private formatOrder(order: OrderEntity) {
    return {
      id: order.id,
      orderId: order.orderId,
      status: order.status,
      total: this.toNumber(order.total),
      payPlatform: order.payPlatform || order.channel || '',
      planName: order.planNameSnapshot || order.pkgNameSnapshot || '',
      variantName: order.variantNameSnapshot || '',
      createdAt: order.createdAt,
      paydAt: order.paydAt || null,
    };
  }

  private isMembershipActive(expirationTime?: Date | null) {
    if (!expirationTime) return false;
    return new Date(expirationTime).getTime() > Date.now();
  }

  private isDeductType(rechargeType: number) {
    return DEDUCT_TYPES.includes(Number(rechargeType));
  }

  private toNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
