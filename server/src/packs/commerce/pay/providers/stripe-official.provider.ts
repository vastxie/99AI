import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { Repository } from 'typeorm';
import { OrderEntity } from '../../order/order.entity';
import { StripeService } from '../stripe/stripe.service';
import {
  PaymentMethod,
  PaymentProvider,
  PaymentCreateResult,
  PaymentProviderAdapter,
  PaymentCreateContext,
  PaymentNotifyContext,
  PaymentNotifyResult,
  PaymentQueryContext,
  PaymentQueryResult,
} from '../payment.types';

export class StripeOfficialProvider implements PaymentProviderAdapter {
  readonly provider = PaymentProvider.STRIPE_OFFICIAL;

  constructor(
    private stripeService: StripeService,
    private orderEntity: Repository<OrderEntity>,
  ) {}

  supports(method: PaymentMethod): boolean {
    return method === PaymentMethod.STRIPE;
  }

  private getUsdAmount(ctx: PaymentCreateContext): string {
    const { order, goods } = ctx;
    if (
      String((order as any).payCurrencySnapshot || '').toUpperCase() === 'USD' &&
      Number((order as any).payAmountSnapshot) > 0
    ) {
      return Number((order as any).payAmountSnapshot).toFixed(2);
    }

    let usdAmount = goods.priceUsd;
    if (!usdAmount || usdAmount <= 0) {
      usdAmount = Number((order.total / 7.3).toFixed(2));
    } else {
      usdAmount = Number((usdAmount * order.count).toFixed(2));
    }
    return usdAmount.toFixed(2);
  }

  async createPayment(ctx: PaymentCreateContext): Promise<PaymentCreateResult> {
    const { orderId } = ctx;
    const usdAmount = this.getUsdAmount(ctx);

    try {
      const stripeSession = await this.stripeService.createCheckoutSession(
        usdAmount,
        orderId,
        ctx.goods.name,
      );

      await this.orderEntity.update(
        { orderId },
        {
          tradeId: stripeSession.id,
          status: 0,
          payCurrencySnapshot: 'USD',
          payAmountSnapshot: Number(usdAmount),
        },
      );

      Logger.log('Stripe Session创建成功', 'StripeOfficialProvider');

      return {
        orderId,
        method: ctx.method,
        provider: this.provider,
        amount: usdAmount,
        currency: 'USD',
        display: { type: 'redirect_url', payload: { url: stripeSession.url } },
      };
    } catch (error) {
      Logger.error('Stripe支付创建失败', getErrorStack(error), 'StripeOfficialProvider');
      const errorMessage = error.message || 'Stripe支付创建失败';
      if (error.message?.includes('配置') || error.message?.includes('密钥')) {
        throw new HttpException('配置错误: ' + errorMessage, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(errorMessage, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  async parseNotify(ctx: PaymentNotifyContext): Promise<PaymentNotifyResult> {
    const { rawParams, headers, rawBody } = ctx;

    // 模式 1：session 验证（用户返回后主动验证）
    if (rawParams.sessionId) {
      return await this.parseSessionVerification(rawParams.sessionId);
    }

    // 模式 2：webhook
    if (headers?.['stripe-signature'] && !rawBody) {
      throw new HttpException('Stripe Webhook缺少原始报文', HttpStatus.UNAUTHORIZED);
    }

    if (headers && rawBody) {
      return await this.parseWebhook(headers['stripe-signature'] || '', rawBody);
    }

    return { success: false, orderId: '', amount: '', currency: '', responseText: 'failed' };
  }

  private async parseSessionVerification(sessionId: string): Promise<PaymentNotifyResult> {
    try {
      const paymentInfo = await this.stripeService.verifyPayment(sessionId);
      if (paymentInfo.status !== 'paid' || !paymentInfo.orderId) {
        return {
          success: false,
          status: 'pending',
          orderId: paymentInfo.orderId || '',
          amount: '',
          currency: paymentInfo.currency || '',
          responseText: 'failed',
        };
      }

      return {
        success: true,
        status: 'paid',
        orderId: paymentInfo.orderId,
        tradeId: sessionId,
        amount: String(paymentInfo.amount),
        currency: paymentInfo.currency || 'usd',
        responseText: 'success',
      };
    } catch (error) {
      Logger.error(`Stripe Session验证失败`, getErrorStack(error), 'StripeOfficialProvider');
      throw new HttpException(
        error.message || 'Stripe支付验证失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async parseWebhook(
    signature: string,
    rawBody: string | Buffer,
  ): Promise<PaymentNotifyResult> {
    try {
      const eventData = await this.stripeService.handleWebhook(signature, rawBody);
      if (!eventData?.orderId || eventData.status !== 'paid') {
        return {
          success: false,
          // 付款失败时 Checkout Session 仍可换卡重试：不当终态，等之后的成功或会话过期
          status: eventData?.status === 'failed' ? 'pending' : 'ignored',
          orderId: eventData?.orderId || '',
          amount: eventData?.amount ? String(eventData.amount) : '',
          currency: eventData?.currency || '',
          responseText: 'success',
        };
      }

      return {
        success: true,
        status: 'paid',
        orderId: eventData.orderId,
        tradeId: eventData.tradeId,
        amount: String(eventData.amount),
        currency: eventData.currency || 'usd',
        responseText: 'success',
      };
    } catch (error) {
      Logger.error('Stripe Webhook处理失败', getErrorStack(error), 'StripeOfficialProvider');
      throw error;
    }
  }

  /**
   * 补单查单（只读）：按下单时保存的 Session ID 取会话。metadata.orderId 必须是本单；会话 complete、
   * payment_status 为 paid，且展开的最新 charge 没有任何退款与争议 → paid（金额取 amount_total，交易号沿用
   * Session ID，与回跳 / Webhook 入账一致）；open、complete 但 unpaid → pending；expired → closed；
   * 有退款或争议、没有展开出 charge、no_payment_required 或没有保存 Session ID → unknown
   */
  async queryOrder(ctx: PaymentQueryContext): Promise<PaymentQueryResult> {
    const unknown: PaymentQueryResult = { state: 'unknown', orderId: ctx.orderId };
    const sessionId = typeof ctx.tradeId === 'string' ? ctx.tradeId.trim() : '';
    if (!sessionId) return unknown;
    const session = await this.stripeService.retrieveSessionForQuery(sessionId);
    if (session?.id !== sessionId || session.metadata?.orderId !== ctx.orderId) return unknown;
    if (session.status === 'expired') return { state: 'closed', orderId: ctx.orderId };
    if (session.status === 'open') return { state: 'pending', orderId: ctx.orderId };
    if (session.status !== 'complete') return unknown;
    if (session.payment_status === 'unpaid') return { state: 'pending', orderId: ctx.orderId };
    if (session.payment_status !== 'paid') return unknown;
    const intent = session.payment_intent;
    const charge =
      intent &&
      typeof intent === 'object' &&
      intent.latest_charge &&
      typeof intent.latest_charge === 'object'
        ? intent.latest_charge
        : null;
    if (
      !charge ||
      charge.amount_refunded !== 0 ||
      charge.refunded !== false ||
      charge.disputed !== false
    ) {
      return unknown;
    }
    if (typeof session.amount_total !== 'number' || !session.currency) return unknown;
    return {
      state: 'paid',
      orderId: ctx.orderId,
      tradeId: sessionId,
      amount: (session.amount_total / 100).toFixed(2),
      currency: session.currency,
    };
  }
}
