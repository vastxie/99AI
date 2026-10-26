import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Subscription } from 'rxjs';
import { Repository } from 'typeorm';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { OrderEntity } from '../order/order.entity';
import { PayService } from './pay.service';
import { PaymentCallbackService } from './payment-callback.service';
import { PaymentProvider, PaymentQueryResult } from './payment.types';

/** 每 2 分钟一轮（上一轮没结束时这次触发跳过） */
export const PAYMENT_RECONCILE_INTERVAL_MS = 2 * 60 * 1000;
/** 创建后 5 分钟内留给下单后的短轮询 */
export const PAYMENT_RECONCILE_MIN_AGE_MS = 5 * 60 * 1000;
/** 只补查创建 24 小时内的订单；更早的不处理（迟到的合法通知照常入账） */
export const PAYMENT_RECONCILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** 每轮最多读 100 行待支付订单、最多查 20 笔 */
export const PAYMENT_RECONCILE_PAGE_SIZE = 100;
export const PAYMENT_RECONCILE_MAX_PER_ROUND = 20;
/** 每笔查单最多等 15 秒：只决定结果用不用，底层请求按各渠道自己的超时结束 */
export const PAYMENT_RECONCILE_QUERY_DEADLINE_MS = 15_000;
/** 整轮软预算 5 分钟：只在开始下一笔之前检查，不打断进行中的入账 */
export const PAYMENT_RECONCILE_ROUND_BUDGET_MS = 5 * 60 * 1000;
/** 同时在途的微信查单最多 3 个；名额只在底层请求结束时释放 */
export const PAYMENT_RECONCILE_WECHAT_IN_FLIGHT = 3;

export type PaymentReconcileRoundResult =
  'skipped' | 'completed' | 'limit_reached' | 'budget_reached' | 'stopped' | 'query_failed';

/**
 * 支付补单：通知丢失或服务重启后，把已经付款的待支付订单自动入账。
 * - 只在 HTTP 服务真正开始监听后启动（命令模式没有监听，不会启动）；`PAYMENT_RECONCILE_ENABLED=false` 关闭；
 *   多实例部署只在一个实例上开启（重复查询也不会重复入账：入账是事务内只认状态 0 的条件更新）。
 * - 每轮按主键游标读状态 0 的订单，只查创建于 5 分钟前到 24 小时前、渠道支持查单的；只有查到 paid 才入账，
 *   pending / closed / unknown 一律不改订单。游标停在最后检查过的那一行，读到末尾回绕，每笔都能轮到。
 * - 每笔分两段：查询段可以放弃（到期、停止或本轮失效时丢弃结果）；入账段一旦开始就跑完，stop() 会等它。
 *   进程被直接停止时不排空：入账是一个数据库事务，未提交的由 MySQL 回滚、订单仍为 0，之后重新补查。
 */
@Injectable()
export class PaymentReconcileService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private listenSubscription: Subscription | null = null;
  private started = false;
  /** 终态：置位后不再开始新的查询或入账，也不再启动 */
  private stopping = false;
  private running = false;
  private roundSeq = 0;
  /** 只有真正开始的一轮才分配编号；一轮结束或 stop() 时清空，旧编号随之失效 */
  private activeRound: number | null = null;
  /** 主键游标：停在最后检查过的那一行，读到末尾回到 0 */
  private cursor = 0;
  private posting: Promise<unknown> | null = null;
  private wechatInFlight = 0;

  constructor(
    private readonly payService: PayService,
    private readonly callbackService: PaymentCallbackService,
    @InjectRepository(OrderEntity)
    private readonly orderEntity: Repository<OrderEntity>,
    @Optional() private readonly adapterHost?: HttpAdapterHost,
  ) {}

  onModuleInit() {
    if (!this.adapterHost) return;
    this.listenSubscription = this.adapterHost.listen$.subscribe(() => this.start());
  }

  async onModuleDestroy() {
    this.listenSubscription?.unsubscribe();
    this.listenSubscription = null;
    await this.stop();
  }

  start(): void {
    if (this.started || this.stopping) return;
    if (
      String(process.env.PAYMENT_RECONCILE_ENABLED ?? '')
        .trim()
        .toLowerCase() === 'false'
    ) {
      Logger.log('支付补单已关闭（PAYMENT_RECONCILE_ENABLED=false）', 'PaymentReconcileService');
      return;
    }
    this.started = true;
    this.timer = setInterval(() => void this.runOnce(), PAYMENT_RECONCILE_INTERVAL_MS);
    this.timer.unref?.();
    const server = this.adapterHost?.httpAdapter?.getHttpServer?.();
    server?.once?.('close', () => void this.stop());
    Logger.log('支付补单已启动', 'PaymentReconcileService');
  }

  /** 置 stopping 后不再开始新的查询或入账；等进行中的入账段结束才返回（不设超时，数据库异常时可能一直等） */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.activeRound = null;
    const posting = this.posting;
    if (posting) await posting.catch((): undefined => undefined);
  }

  async runOnce(): Promise<PaymentReconcileRoundResult> {
    if (this.running || this.stopping) return 'skipped';
    this.running = true;
    const roundId = ++this.roundSeq;
    this.activeRound = roundId;
    const startedAt = Date.now();
    try {
      let rows: Array<{ order: OrderEntity; ageMs: number }>;
      try {
        rows = await this.readPage();
      } catch (error) {
        Logger.error(
          '支付补单：读取待支付订单失败',
          getErrorStack(error),
          'PaymentReconcileService',
        );
        return 'query_failed';
      }

      let queried = 0;
      let wechatSaturated = false;
      for (const { order, ageMs } of rows) {
        if (this.stopping || this.activeRound !== roundId) return 'stopped';
        if (queried >= PAYMENT_RECONCILE_MAX_PER_ROUND) return 'limit_reached';
        if (Date.now() - startedAt >= PAYMENT_RECONCILE_ROUND_BUDGET_MS) return 'budget_reached';
        if (this.isEligible(order, ageMs)) {
          if (
            order.payPlatform === PaymentProvider.WECHAT_OFFICIAL &&
            this.wechatInFlight >= PAYMENT_RECONCILE_WECHAT_IN_FLIGHT
          ) {
            // 在途已满：本轮跳过微信订单（游标照常前进，回绕后再查），其他渠道照常
            wechatSaturated = true;
          } else {
            queried += 1;
            await this.reconcileOne(order, roundId);
          }
        }
        this.cursor = order.id;
      }
      if (wechatSaturated) {
        Logger.warn('支付补单：微信查单在途已满，本轮跳过部分微信订单', 'PaymentReconcileService');
      }
      // 读到的行都检查完且不满一页：已到末尾，下一轮从头开始
      if (rows.length < PAYMENT_RECONCILE_PAGE_SIZE) this.cursor = 0;
      return 'completed';
    } finally {
      this.running = false;
      if (this.activeRound === roundId) this.activeRound = null;
    }
  }

  /**
   * 读一页状态 0 的订单（主键游标、升序、最多 100 行），同时让数据库按自己的时钟算出每笔的年龄：
   * createdAt 由数据库 CURRENT_TIMESTAMP 写入，用同一时钟相减就不受数据库会话时区与 Node 时区是否一致的影响
   */
  private async readPage(): Promise<Array<{ order: OrderEntity; ageMs: number }>> {
    const { entities, raw } = await this.orderEntity
      .createQueryBuilder('pending')
      .addSelect('TIMESTAMPDIFF(SECOND, pending.createdAt, NOW())', 'reconcile_age_seconds')
      .where('pending.status = :status', { status: 0 })
      .andWhere('pending.id > :cursor', { cursor: this.cursor })
      .orderBy('pending.id', 'ASC')
      .limit(PAYMENT_RECONCILE_PAGE_SIZE)
      .getRawAndEntities();
    return entities.map((order, index) => ({
      order,
      ageMs: Number(raw[index]?.reconcile_age_seconds) * 1000,
    }));
  }

  private isEligible(order: OrderEntity, ageMs: number): boolean {
    if (!Number.isFinite(ageMs)) return false;
    if (ageMs < PAYMENT_RECONCILE_MIN_AGE_MS || ageMs > PAYMENT_RECONCILE_MAX_AGE_MS) return false;
    const adapter = order.payPlatform
      ? this.payService.getProvider(order.payPlatform as PaymentProvider)
      : undefined;
    return typeof adapter?.queryOrder === 'function';
  }

  private async reconcileOne(order: OrderEntity, roundId: number): Promise<void> {
    const provider = order.payPlatform as PaymentProvider;
    const adapter = this.payService.getProvider(provider);
    if (!adapter?.queryOrder) return;

    // 查询段：可以放弃
    const deadline = Date.now() + PAYMENT_RECONCILE_QUERY_DEADLINE_MS;
    let query: Promise<PaymentQueryResult>;
    try {
      query = Promise.resolve(
        adapter.queryOrder({ orderId: order.orderId, tradeId: order.tradeId }),
      );
    } catch (error) {
      query = Promise.reject(error);
    }
    if (provider === PaymentProvider.WECHAT_OFFICIAL) {
      this.wechatInFlight += 1;
      // 名额随底层请求结束释放，不随下面的期限释放
      void query.then(
        () => this.releaseWechatSlot(),
        () => this.releaseWechatSlot(),
      );
    }
    let timer: NodeJS.Timeout | undefined;
    let result: PaymentQueryResult | 'timeout';
    try {
      result = await Promise.race([
        query,
        new Promise<'timeout'>(resolve => {
          timer = setTimeout(() => resolve('timeout'), PAYMENT_RECONCILE_QUERY_DEADLINE_MS);
          timer.unref?.();
        }),
      ]);
    } catch {
      // 渠道报错按无法确认处理（不记渠道返回的内容）
      Logger.warn('支付补单：查单失败，本轮跳过这笔订单', 'PaymentReconcileService');
      return;
    } finally {
      if (timer) clearTimeout(timer);
    }
    // 结果到达后、入账之前同步检查：期限已过、已停止或本轮已失效时丢弃结果
    if (
      result === 'timeout' ||
      Date.now() > deadline ||
      this.stopping ||
      this.activeRound !== roundId
    ) {
      Logger.warn('支付补单：查单超时或本轮已结束，丢弃这次结果', 'PaymentReconcileService');
      return;
    }
    if (result.state === 'closed') {
      Logger.log('支付补单：渠道显示已关闭，订单保持待支付', 'PaymentReconcileService');
      return;
    }
    if (result.state !== 'paid') return;

    // 入账段：一旦开始就跑完，stop() 会等它
    const posting = this.callbackService.processQueryResult(result, {
      requestedOrderId: order.orderId,
      provider,
    });
    this.posting = posting;
    try {
      if ((await posting) === 'posted') {
        Logger.log('支付补单：查到已付款，已入账', 'PaymentReconcileService');
      }
    } catch (error) {
      Logger.error('支付补单：入账失败', getErrorStack(error), 'PaymentReconcileService');
    } finally {
      if (this.posting === posting) this.posting = null;
    }
  }

  private releaseWechatSlot() {
    this.wechatInFlight = Math.max(0, this.wechatInFlight - 1);
  }
}
