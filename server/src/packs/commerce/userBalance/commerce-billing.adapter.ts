import type {
  BillingActor,
  BillingModelRef,
  BillingPort,
  BillingTurnSettlement,
} from '@/modules/billing/billing.port';
import { Injectable } from '@nestjs/common';
import { UserBalanceService } from './userBalance.service';

/**
 * 商业包对内核 BillingPort 的实现：金额按模型记录上的定价字段计算，
 * 计费动作委托给 UserBalanceService。以 BILLING_IMPLEMENTATION 令牌注册。
 *
 * 定价字段：deduct（每次 / 每计费单位的积分）、isTokenBased（按 Token 计费）、tokenFeeRatio（每多少 Token 为一个计费单位）。
 * 访客在预检阶段就预扣基础对话费，结算时不再重复扣。
 */
/**
 * 对话结算在用量产生之后：余额不够也照实际用量扣（余额可为负），不能让整轮因扣费失败而退款免单；
 * 余额不足的下一次对话由预检拦下
 */
const SETTLEMENT_DEDUCT_OPTIONS = { allowOverdraft: true } as const;

@Injectable()
export class CommerceBillingAdapter implements BillingPort {
  constructor(private readonly balance: UserBalanceService) {}

  async assertTurnAllowed(input: {
    user: BillingActor;
    model: BillingModelRef;
    idempotencyKey?: string;
  }): Promise<void> {
    await this.balance.validateBalance(
      { user: input.user },
      1,
      this.baseFee(input.model),
      input.idempotencyKey,
    );
  }

  async settleTurn(input: BillingTurnSettlement): Promise<{ charged: number }> {
    const { user, userId, model, totalTokens, toolCost, relatedId, toolsOnly } = input;
    const isVisitor = user.role === 'visitor';
    let charged = 0;

    if (!toolsOnly) {
      const fee = this.turnFee(model, totalTokens);
      if (!isVisitor) {
        // BillingTurnSettlement 约定：非访客的 userId 非空
        await this.balance.deductFromBalance(
          userId!,
          1,
          fee,
          totalTokens,
          relatedId,
          1,
          'chat-base-v1',
          SETTLEMENT_DEDUCT_OPTIONS,
        );
      }
      charged += fee;
    }

    const tools = Math.max(0, Number(toolCost) || 0);
    if (tools > 0) {
      if (isVisitor) {
        await this.balance.validateBalance({ user }, 1, tools);
      } else {
        // 同上：非访客的 userId 非空
        await this.balance.deductFromBalance(
          userId!,
          2,
          tools,
          0,
          relatedId,
          2,
          'chat-tool-v1',
          SETTLEMENT_DEDUCT_OPTIONS,
        );
      }
      charged += tools;
    }
    return { charged };
  }

  refundTurn(relatedId: number, reason: string) {
    return this.balance.refundChatTurnCharges(relatedId, reason);
  }

  reconcileRefunds(reason: string) {
    return this.balance.reconcileTerminalChatTurnRefunds(reason);
  }

  getSummary(userId?: number | null) {
    return this.balance.queryUserBalance(userId);
  }

  async getSummaries(ids: number[]) {
    const rows = await this.balance.queryUserBalanceByIds(ids);
    return rows.map(row => ({ userId: row.userId, summary: row }));
  }

  async onUserRegistered(userId: number): Promise<void> {
    await this.balance.addBalanceToNewUser(userId);
  }

  /** 预检用的基础费（按次模型即 deduct；按 Token 模型先按一个计费单位预估） */
  private baseFee(model: BillingModelRef): number {
    return Math.max(0, Number(model?.deduct) || 0);
  }

  /** 回合费：按 Token 计费时 deduct × ⌈totalTokens / tokenFeeRatio⌉，否则每次 deduct */
  private turnFee(model: BillingModelRef, totalTokens: number): number {
    const deduct = this.baseFee(model);
    if (model?.isTokenBased !== true) return deduct;
    const ratio = Number(model?.tokenFeeRatio) || 0;
    if (ratio <= 0) return deduct;
    return deduct * Math.ceil(Math.max(0, Number(totalTokens) || 0) / ratio);
  }
}
