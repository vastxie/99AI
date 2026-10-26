import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { Repository } from 'typeorm';
import { OrderEntity } from '../../order/order.entity';
import { PayPalService } from '../paypal/paypal.service';
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

export class PaypalOfficialProvider implements PaymentProviderAdapter {
  readonly provider = PaymentProvider.PAYPAL_OFFICIAL;

  constructor(
    private payPalService: PayPalService,
    private orderEntity: Repository<OrderEntity>,
  ) {}

  supports(method: PaymentMethod): boolean {
    return method === PaymentMethod.PAYPAL;
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
      Logger.log(`PayPal - 使用默认汇率转换`, 'PaypalOfficialProvider');
    } else {
      usdAmount = Number((usdAmount * order.count).toFixed(2));
      Logger.log(`PayPal - 使用套餐USD价格`, 'PaypalOfficialProvider');
    }
    return usdAmount.toFixed(2);
  }

  async createPayment(ctx: PaymentCreateContext): Promise<PaymentCreateResult> {
    const { orderId } = ctx;
    const usdAmount = this.getUsdAmount(ctx);

    try {
      const paypalOrder = await this.payPalService.createOrder(usdAmount, orderId, ctx.goods.name);
      const approvalLink = paypalOrder.links.find(link => link.rel === 'approve');
      if (!approvalLink) {
        throw new HttpException('无法获取PayPal支付链接', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      await this.orderEntity.update(
        { orderId },
        {
          tradeId: paypalOrder.id,
          status: 0,
          payCurrencySnapshot: 'USD',
          payAmountSnapshot: Number(usdAmount),
        },
      );

      return {
        orderId,
        method: ctx.method,
        provider: this.provider,
        amount: usdAmount,
        currency: 'USD',
        display: { type: 'redirect_url', payload: { url: approvalLink.href } },
      };
    } catch (error) {
      Logger.error('PayPal支付创建失败', getErrorStack(error), 'PaypalOfficialProvider');
      const errorMessage = error.message || 'PayPal支付创建失败';
      if (error.message?.includes('不支持') || error.message?.includes('货币')) {
        throw new HttpException('配置错误: ' + errorMessage, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(errorMessage, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  async parseNotify(ctx: PaymentNotifyContext): Promise<PaymentNotifyResult> {
    const { rawParams, headers, rawBody } = ctx;

    // 模式 1：capture（用户返回后主动捕获）
    if (rawParams.paypalOrderId) {
      return await this.parseCapture(rawParams.paypalOrderId);
    }

    // 模式 2：webhook（只按收到的原文验签与处理，解析后的对象只用来分辨模式）
    if (headers && rawParams.event_type) {
      return await this.parseWebhook(headers, rawBody);
    }

    return { success: false, orderId: '', amount: '', currency: '', responseText: 'failed' };
  }

  private async parseCapture(paypalOrderId: string): Promise<PaymentNotifyResult> {
    try {
      const capture = await this.payPalService.capturePayment(paypalOrderId);
      const purchaseUnit = capture.purchase_units?.[0];
      const referenceId = purchaseUnit?.reference_id || purchaseUnit?.invoice_id;
      if (!referenceId) {
        return { success: false, orderId: '', amount: '', currency: '', responseText: 'failed' };
      }

      if (capture.status !== 'COMPLETED') {
        return {
          success: false,
          status: ['VOIDED', 'DENIED'].includes(String(capture.status)) ? 'failed' : 'pending',
          orderId: referenceId,
          amount: '',
          currency: '',
          responseText: 'failed',
        };
      }

      const captureInfo = purchaseUnit?.payments?.captures?.[0];
      const paidAmount = captureInfo?.amount?.value;
      const currencyCode = captureInfo?.amount?.currency_code || 'USD';

      return {
        success: true,
        status: 'paid',
        orderId: referenceId,
        tradeId: paypalOrderId,
        amount: String(paidAmount),
        currency: currencyCode,
        responseText: 'success',
      };
    } catch (error) {
      Logger.error(`PayPal支付捕获失败`, getErrorStack(error), 'PaypalOfficialProvider');
      throw new HttpException(
        error.message || 'PayPal支付处理失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async parseWebhook(
    headers: Record<string, string>,
    rawBody: string | Buffer | undefined,
  ): Promise<PaymentNotifyResult> {
    try {
      const eventData = await this.payPalService.handleWebhook(headers, rawBody);
      if (!eventData?.orderId || eventData.status !== 'COMPLETED') {
        return {
          success: false,
          status: eventData?.status === 'DENIED' ? 'failed' : 'ignored',
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
        currency: eventData.currency || 'USD',
        responseText: 'success',
      };
    } catch (error) {
      Logger.error('PayPal Webhook处理失败', getErrorStack(error), 'PaypalOfficialProvider');
      throw error;
    }
  }

  /**
   * 补单查单（只读，不捕获、不作废）：按下单时保存的 PayPal 订单号取完整订单。custom_id 必须是本单；
   * 订单 COMPLETED 且唯一的 capture 是 COMPLETED → paid（金额、币种取 capture 自身，交易号沿用 PayPal 订单号，
   * 与回跳捕获入账一致）；capture PENDING、订单 CREATED / SAVED / APPROVED / PAYER_ACTION_REQUIRED → pending；
   * VOIDED → closed；退款、拒绝、字段不符或没有保存 PayPal 订单号 → unknown
   */
  async queryOrder(ctx: PaymentQueryContext): Promise<PaymentQueryResult> {
    const unknown: PaymentQueryResult = { state: 'unknown', orderId: ctx.orderId };
    const paypalOrderId = typeof ctx.tradeId === 'string' ? ctx.tradeId.trim() : '';
    if (!paypalOrderId) return unknown;
    const order = await this.payPalService.getOrder(paypalOrderId);
    const unit = Array.isArray(order?.purchase_units) ? order.purchase_units[0] : undefined;
    if (order?.id !== paypalOrderId || unit?.custom_id !== ctx.orderId) return unknown;
    switch (order.status) {
      case 'CREATED':
      case 'SAVED':
      case 'APPROVED':
      case 'PAYER_ACTION_REQUIRED':
        return { state: 'pending', orderId: ctx.orderId };
      case 'VOIDED':
        return { state: 'closed', orderId: ctx.orderId };
      case 'COMPLETED':
        break;
      default:
        return unknown;
    }
    const captures = unit?.payments?.captures;
    if (!Array.isArray(captures) || captures.length !== 1) return unknown;
    const capture = captures[0];
    if (capture?.status === 'PENDING') return { state: 'pending', orderId: ctx.orderId };
    if (capture?.status !== 'COMPLETED') return unknown;
    const value = capture.amount?.value;
    const currency = capture.amount?.currency_code;
    if (typeof value !== 'string' || typeof currency !== 'string') return unknown;
    return {
      state: 'paid',
      orderId: ctx.orderId,
      tradeId: paypalOrderId,
      amount: value,
      currency,
    };
  }
}
