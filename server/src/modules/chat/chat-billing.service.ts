import { Inject, Injectable } from '@nestjs/common';
import { BILLING_PORT, BillingPort, BillingTurnSettlement } from '../billing/billing.port';

/**
 * 对话计费域服务：对话主链路访问计费能力的唯一入口，只依赖 BillingPort。
 * 计费包关闭时 Port 为 Noop，所有方法退化为空操作。
 */
@Injectable()
export class ChatBillingService {
  constructor(@Inject(BILLING_PORT) private readonly billing: BillingPort) {}

  /** 回合结算：金额由实现按模型定价与用量计算 */
  settleTurn(input: BillingTurnSettlement): Promise<{ charged: number }> {
    return this.billing.settleTurn(input);
  }

  refundTurn(relatedId: number): Promise<unknown> {
    return this.billing.refundTurn(relatedId, '对话失败或中断恢复退款');
  }

  /** 账户摘要，对内核不透明，原样下发给客户端 */
  getSummary(userId?: number | null): Promise<unknown> {
    return this.billing.getSummary(userId);
  }
}
