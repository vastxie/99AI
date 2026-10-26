import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from '../order/order.entity';
import { PackageEntity } from '../package/package.entity';
import { PayService } from './pay.service';
import {
  PaymentProvider,
  PaymentNotifyResult,
  PaymentNotifyStatus,
  PaymentQueryResult,
} from './payment.types';

/** 查单结果入账时的可信上下文：发起查询的本单与订单自己的渠道（不取自渠道响应） */
export interface PaymentQueryRequest {
  requestedOrderId: string;
  provider: PaymentProvider;
}

/**
 * 查单结果的处理结论：not_paid 不是已付；rejected 字段或订单不符（按无法确认）；not_pending 订单不在待支付；
 * already_paid 订单已经是已支付（含并发入账的竞争失败方）；posted 本次入账发货
 */
export type PaymentQueryPostingOutcome =
  'not_paid' | 'rejected' | 'not_pending' | 'already_paid' | 'posted';

export interface UnifiedPaymentNotifyContext {
  providerHint?: string;
  method?: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
  rawParams: Record<string, any>;
  headers?: Record<string, any>;
  rawBody?: string | Buffer;
}

@Injectable()
export class PaymentCallbackService {
  constructor(
    private readonly payService: PayService,
    @InjectRepository(OrderEntity)
    private readonly orderEntity: Repository<OrderEntity>,
    @InjectRepository(PackageEntity)
    private readonly packageEntity: Repository<PackageEntity>,
  ) {}

  /** 统一回调入口（/pay/notify GET/POST） */
  async handleNotify(rawInput: Record<string, any> | UnifiedPaymentNotifyContext): Promise<string> {
    const ctx = this.normalizeNotifyContext(rawInput);
    const provider = this.identifyNotifyProvider(ctx);
    if (!provider) return 'failed';

    const adapter = this.payService.getProvider(provider);
    if (!adapter?.parseNotify) return 'failed';

    const result = await adapter.parseNotify({
      rawParams: ctx.rawParams,
      headers: ctx.headers,
      rawBody: ctx.rawBody,
    });
    if (!result.orderId) return result.responseText;

    const order = await this.orderEntity.findOne({
      where: { orderId: result.orderId },
    });
    if (!order) {
      return 'failed';
    }

    if (result.success) {
      if (order.status === 1) return result.responseText;
      this.assertOrderCanAcceptSuccessfulPayment(order);
      await this.validateAndProcess(result, order, provider);
    } else if (this.isTerminalFailure(result.status) && order.status === 0) {
      if (!(await this.validateFailureCallbackOwnership(result, order, provider))) {
        return 'failed';
      }
      await this.payService.markOrderFailed(result.orderId, 2, result.tradeId);
    }

    return result.responseText;
  }

  async handleReturn(providerHint: string, status: string, query: Record<string, any>) {
    if (status === 'cancel') return { status: 'cancelled' };

    const provider = this.mapProviderHint(providerHint);
    if (provider === PaymentProvider.STRIPE_OFFICIAL) {
      if (!query.session_id) {
        throw new HttpException('缺少 Stripe Session ID', HttpStatus.BAD_REQUEST);
      }
      return await this.handleStripeReturn(query.session_id);
    }
    if (provider === PaymentProvider.PAYPAL_OFFICIAL) {
      const paypalOrderId = query.token || query.paypalOrderId;
      if (!paypalOrderId) {
        throw new HttpException('缺少 PayPal 订单号', HttpStatus.BAD_REQUEST);
      }
      return await this.handlePayPalCapture(paypalOrderId);
    }
    if (provider === PaymentProvider.EPAY || provider === PaymentProvider.ALIPAY_OFFICIAL) {
      return { status: 'returned' };
    }
    throw new HttpException('不支持的支付返回渠道', HttpStatus.BAD_REQUEST);
  }

  /** PayPal capture 入口 */
  async handlePayPalCapture(paypalOrderId: string) {
    const adapter = this.payService.getProvider(PaymentProvider.PAYPAL_OFFICIAL);
    if (!adapter?.parseNotify) {
      throw new HttpException('PayPal provider not available', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const result = await adapter.parseNotify({ rawParams: { paypalOrderId } });
    if (!result.success || !result.orderId) {
      throw new HttpException('PayPal支付捕获失败', HttpStatus.BAD_REQUEST);
    }

    const order = await this.orderEntity.findOne({ where: { orderId: result.orderId } });
    if (!order) throw new HttpException('订单不存在', HttpStatus.NOT_FOUND);
    if (order.status === 1) {
      return { success: true, message: '订单已支付', orderId: result.orderId };
    }
    this.assertOrderCanAcceptSuccessfulPayment(order);

    await this.validateAndProcess(result, order, PaymentProvider.PAYPAL_OFFICIAL);
    Logger.log('[PayPal] 支付成功', 'PaymentCallbackService');
    return { success: true, message: '支付成功', orderId: result.orderId };
  }

  /** Stripe 用户返回后验证入口 */
  async handleStripeReturn(sessionId: string): Promise<any> {
    const adapter = this.payService.getProvider(PaymentProvider.STRIPE_OFFICIAL);
    if (!adapter?.parseNotify) {
      throw new HttpException('Stripe provider not available', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const result = await adapter.parseNotify({ rawParams: { sessionId } });
    if (!result.success) {
      throw new HttpException('支付未完成', HttpStatus.BAD_REQUEST);
    }

    const order = await this.orderEntity.findOne({ where: { orderId: result.orderId } });
    if (!order) throw new HttpException('订单不存在', HttpStatus.BAD_REQUEST);
    if (order.status === 1) return result;
    this.assertOrderCanAcceptSuccessfulPayment(order);

    await this.validateAndProcess(result, order, PaymentProvider.STRIPE_OFFICIAL);
    return result;
  }

  /**
   * 统一处理查单结果（下单后的短轮询与补单任务共用）。只有 paid 会入账；入账前按可信的请求上下文做运行时校验：
   * 结果的订单号必须是请求的本单、交易号非空、金额是正数、币种非空；订单仍是状态 0、渠道是订单自己的渠道、
   * 币种等于订单的支付币种快照（没有时按 CNY）、金额等于快照金额（不回退现价或 order.total）、已有的交易号一致。
   * 任何一项不符都按「无法确认」处理（静态警告，不改订单）；入账本身仍是事务内只认状态 0 的条件更新
   */
  async processQueryResult(
    result: PaymentQueryResult,
    request: PaymentQueryRequest,
  ): Promise<PaymentQueryPostingOutcome> {
    if (result?.state !== 'paid') return 'not_paid';
    const amount = this.payService.formatMoney(result.amount);
    const currency =
      typeof result.currency === 'string' ? result.currency.trim().toUpperCase() : '';
    if (
      result.orderId !== request.requestedOrderId ||
      typeof result.tradeId !== 'string' ||
      !result.tradeId.trim() ||
      !amount ||
      Number(amount) <= 0 ||
      !currency
    ) {
      Logger.warn(
        '[查单入账] 已付结果字段不全或与请求不符，按无法确认处理',
        'PaymentCallbackService',
      );
      return 'rejected';
    }

    const order = await this.orderEntity.findOne({
      where: { orderId: request.requestedOrderId },
    });
    if (!order) return 'not_pending';
    if (order.status === 1) return 'already_paid';
    if (order.status !== 0) return 'not_pending';

    // 币种快照缺失时按 CNY；金额只取支付金额快照，不回退现价或 order.total
    const snapshotCurrency = String(order.payCurrencySnapshot || 'CNY').toUpperCase();
    const expectedAmount =
      currency === snapshotCurrency ? this.payService.formatMoney(order.payAmountSnapshot) : null;
    if (
      order.payPlatform !== request.provider ||
      !expectedAmount ||
      expectedAmount !== amount ||
      (order.tradeId && order.tradeId !== result.tradeId)
    ) {
      Logger.warn(
        '[查单入账] 渠道、币种、金额或交易号与订单不一致，按无法确认处理',
        'PaymentCallbackService',
      );
      return 'rejected';
    }

    const { alreadyProcessed } = await this.payService.processSuccessfulOrder(order.orderId, {
      tradeId: result.tradeId,
    });
    return alreadyProcessed ? 'already_paid' : 'posted';
  }

  /** 统一金额校验 + 完成订单 */
  private async validateAndProcess(
    result: PaymentNotifyResult,
    order: OrderEntity,
    provider?: PaymentProvider,
  ) {
    if (provider && order.payPlatform !== provider) {
      throw new HttpException(
        `支付渠道不匹配: order=${order.payPlatform}, callback=${provider}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const isUsd = result.currency.toUpperCase() === 'USD';
    let goods: PackageEntity | null = null;
    if (isUsd && !this.payService.getOrderPaymentSnapshotAmount(order, 'USD')) {
      // 订单的商品 ID 列可空：没有时按套餐不存在处理，不拿空值查询
      goods = order.goodsId
        ? await this.packageEntity.findOne({ where: { id: order.goodsId } })
        : null;
      if (!goods) throw new HttpException('套餐不存在', HttpStatus.BAD_REQUEST);
    }

    const expectedAmount = this.payService.getExpectedAmountForCurrency(
      order,
      goods,
      result.currency,
    );
    const actualAmount = this.payService.formatMoney(result.amount);

    if (!expectedAmount || !actualAmount || expectedAmount !== actualAmount) {
      throw new HttpException(
        `金额校验失败: expected=${expectedAmount}, actual=${actualAmount}, currency=${result.currency}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (result.tradeId && order.tradeId && order.tradeId !== result.tradeId) {
      throw new HttpException('交易号校验失败', HttpStatus.BAD_REQUEST);
    }

    await this.payService.processSuccessfulOrder(result.orderId, { tradeId: result.tradeId });
  }

  /**
   * 失败 / 关闭回调在标记订单失败前的归属校验（与 validateAndProcess 同口径，按失败回调字段可得性分层）：
   * - 渠道归属：必须与订单支付渠道一致；
   * - 交易号：仅在回调与订单都已有 tradeId 时校验一致性（多数渠道失败回调或下单前订单无 tradeId）；
   * - 金额：仅在回调携带可解析金额且本地能算出期望金额时校验（PayPal/Stripe 失败回调金额可能缺失）。
   * 校验不通过时记录告警并拒绝处理，不改订单状态。
   */
  private async validateFailureCallbackOwnership(
    result: PaymentNotifyResult,
    order: OrderEntity,
    provider: PaymentProvider,
  ): Promise<boolean> {
    let reason: string | null = null;

    if (order.payPlatform !== provider) {
      reason = 'provider_mismatch';
    } else if (result.tradeId && order.tradeId && order.tradeId !== result.tradeId) {
      reason = 'trade_id_mismatch';
    } else {
      const actualAmount = this.payService.formatMoney(result.amount);
      if (actualAmount) {
        const expectedAmount = await this.resolveExpectedAmountForFailureCallback(
          order,
          result.currency,
        );
        if (expectedAmount && expectedAmount !== actualAmount) {
          reason = 'amount_mismatch';
        }
      }
    }

    if (reason) {
      Logger.warn('[支付失败回调] 归属校验未通过，已拒绝标记失败', 'PaymentCallbackService');
      return false;
    }
    return true;
  }

  /** 失败回调金额校验的期望金额；无法可靠计算（如套餐已删除）时返回 null 表示跳过金额层校验 */
  private async resolveExpectedAmountForFailureCallback(
    order: OrderEntity,
    currency: string,
  ): Promise<string | null> {
    const isUsd = String(currency || '').toUpperCase() === 'USD';
    let goods: PackageEntity | null = null;
    if (isUsd && !this.payService.getOrderPaymentSnapshotAmount(order, 'USD')) {
      goods = order.goodsId
        ? await this.packageEntity.findOne({ where: { id: order.goodsId } })
        : null;
      if (!goods) return null;
    }
    return this.payService.getExpectedAmountForCurrency(order, goods, currency);
  }

  private isTerminalFailure(status?: PaymentNotifyStatus): boolean {
    return status === 'failed' || status === 'closed';
  }

  private assertOrderCanAcceptSuccessfulPayment(order: OrderEntity) {
    if (order.status !== 0) {
      throw new HttpException(
        `订单当前状态不允许自动发货: status=${order.status}`,
        HttpStatus.CONFLICT,
      );
    }
  }

  private normalizeNotifyContext(
    rawInput: Record<string, any> | UnifiedPaymentNotifyContext,
  ): UnifiedPaymentNotifyContext {
    if (
      rawInput &&
      ('rawParams' in rawInput || 'providerHint' in rawInput || 'headers' in rawInput)
    ) {
      const input = rawInput as UnifiedPaymentNotifyContext;
      return {
        ...input,
        rawParams: input.rawParams || input.body || input.query || {},
      };
    }
    return {
      rawParams: rawInput || {},
      body: rawInput || {},
    };
  }

  private mapProviderHint(providerHint?: string): PaymentProvider | null {
    switch (String(providerHint || '').toLowerCase()) {
      case 'wechat':
      case 'wechat_official':
        return PaymentProvider.WECHAT_OFFICIAL;
      case 'stripe':
      case 'stripe_official':
        return PaymentProvider.STRIPE_OFFICIAL;
      case 'paypal':
      case 'paypal_official':
        return PaymentProvider.PAYPAL_OFFICIAL;
      case 'alipay':
      case 'alipay_official':
        return PaymentProvider.ALIPAY_OFFICIAL;
      case 'epay':
        return PaymentProvider.EPAY;
      default:
        return null;
    }
  }

  /** 按 provider hint 或 params 形态识别回调来源渠道 */
  private identifyNotifyProvider(ctx: UnifiedPaymentNotifyContext): PaymentProvider | null {
    const hintedProvider = this.mapProviderHint(ctx.providerHint);
    if (hintedProvider) return hintedProvider;

    const params = ctx.rawParams || {};
    if (
      params['param'] === 'epay' ||
      (params['pid'] && params['trade_no'] && params['out_trade_no'])
    ) {
      return PaymentProvider.EPAY;
    }
    if (params['trade_status'] && params['app_id']) {
      return PaymentProvider.ALIPAY_OFFICIAL;
    }
    if (typeof params['resource'] === 'object') {
      return PaymentProvider.WECHAT_OFFICIAL;
    }
    return null;
  }
}
