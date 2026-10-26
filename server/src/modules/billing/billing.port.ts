/**
 * BillingPort — 内核与计费实现之间的唯一接口。
 *
 * 内核只报告事实（谁、用哪个模型、用了多少 Token、工具报价多少），不计算金额、不解释余额：
 * 模型记录连同其定价字段原样交给实现，返回给客户端的账户摘要（summary）对内核是不透明对象。
 * 没有计费包时注入 NoopBillingService：预检放行、结算记 0、摘要为 null。
 */

export const BILLING_PORT = 'BILLING_PORT';
/** 由计费包提供的实现令牌；内核只做可选注入，不引用实现类型。 */
export const BILLING_IMPLEMENTATION = 'BILLING_IMPLEMENTATION';

export interface BillingActor {
  id: number | string;
  role?: string;
  [key: string]: any;
}

/** 内核交给计费实现的模型记录；定价字段由实现解释，内核不读 */
export type BillingModelRef = Record<string, any>;

export interface BillingTurnSettlement {
  user: BillingActor;
  /** 注册用户 id；访客为 null */
  userId: number | null;
  model: BillingModelRef;
  totalTokens: number;
  /** 工具调用的报价合计（由工具结果给出） */
  toolCost: number;
  /** 助手消息 id，作为退款与幂等的关联键 */
  relatedId: number;
  /** 只结算工具费（模型回复失败时基础对话费不收） */
  toolsOnly?: boolean;
}

export interface BillingPort {
  /** 回合前预检：不允许开始时抛 HttpException（通常 402）；空实现放行 */
  assertTurnAllowed(input: {
    user: BillingActor;
    model: BillingModelRef;
    /** Web 稳定提交摘要；供非事务型访客额度实现做原子幂等。 */
    idempotencyKey?: string;
  }): Promise<void>;
  /** 回合结算：返回本轮记账金额；空实现返回 0 */
  settleTurn(input: BillingTurnSettlement): Promise<{ charged: number }>;
  /** 按助手消息退还本轮已记账的费用 */
  refundTurn(relatedId: number, reason: string): Promise<unknown>;
  /** 启动 / 中断后收敛终态退款 */
  reconcileRefunds(reason: string): Promise<unknown>;
  /** 账户摘要（不透明，原样下发给客户端）；空实现返回 null */
  getSummary(userId?: number | null): Promise<unknown>;
  /** 批量账户摘要（后台用户列表）；空实现返回空数组 */
  getSummaries(ids: number[]): Promise<Array<{ userId: number; summary: unknown }>>;
  /** 新用户注册完成后的钩子（如赠送）；空实现为空操作 */
  onUserRegistered(userId: number): Promise<void>;
}

export class NoopBillingService implements BillingPort {
  async assertTurnAllowed(): Promise<void> {
    return undefined;
  }

  async settleTurn(): Promise<{ charged: number }> {
    return { charged: 0 };
  }

  async refundTurn(): Promise<unknown> {
    return [];
  }

  async reconcileRefunds(): Promise<unknown> {
    return undefined;
  }

  async getSummary(): Promise<unknown> {
    return null;
  }

  async getSummaries(): Promise<Array<{ userId: number; summary: unknown }>> {
    return [];
  }

  async onUserRegistered(): Promise<void> {
    return undefined;
  }
}
