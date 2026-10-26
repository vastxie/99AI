import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { AlipayService } from '../alipay/alipay.service';
import {
  PaymentMethod,
  PaymentProvider,
  PaymentDisplay,
  PaymentCreateResult,
  PaymentProviderAdapter,
  PaymentCreateContext,
  PaymentNotifyContext,
  PaymentNotifyResult,
  PaymentQueryContext,
  PaymentQueryResult,
} from '../payment.types';
import { buildPaymentReturnUrl, PaymentCallbackUrls } from '../payment-callback-url.helper';

export class AlipayOfficialProvider implements PaymentProviderAdapter {
  readonly provider = PaymentProvider.ALIPAY_OFFICIAL;

  constructor(
    private alipayService: AlipayService,
    private getPaymentUrls: () => Promise<PaymentCallbackUrls>,
  ) {}

  supports(method: PaymentMethod): boolean {
    return method === PaymentMethod.ALIPAY;
  }

  async createPayment(ctx: PaymentCreateContext): Promise<PaymentCreateResult> {
    const { orderId, order, goods, device } = ctx;
    const urls = await this.getPaymentUrls();
    const returnUrl = buildPaymentReturnUrl(urls.returnUrl, 'alipay', 'success');
    const payType =
      device === 'mobile' || device === 'wechat' || device === 'qq' || device === 'alipay'
        ? 'wap'
        : 'page';

    let display: PaymentDisplay;
    try {
      let paymentUrl: string;
      if (payType === 'wap') {
        paymentUrl = await this.alipayService.createWapPay(
          orderId,
          order.total,
          goods.name,
          returnUrl,
        );
      } else {
        paymentUrl = await this.alipayService.createPagePay(
          orderId,
          order.total,
          goods.name,
          returnUrl,
        );
      }
      display = { type: 'html_form', payload: { html: paymentUrl } };
    } catch (error) {
      Logger.error('支付宝支付创建失败', getErrorStack(error), 'AlipayOfficialProvider');
      throw new HttpException(error.message || '支付宝支付创建失败', HttpStatus.BAD_REQUEST);
    }

    return {
      orderId,
      method: ctx.method,
      provider: this.provider,
      amount: String(order.total),
      currency: 'CNY',
      display,
    };
  }

  async parseNotify(ctx: PaymentNotifyContext): Promise<PaymentNotifyResult> {
    const params = ctx.rawParams;
    // 验签与 app_id 核对用同一份配置快照（见 AlipayService.verifyNotify）
    const verdict = await this.alipayService.verifyNotify(params);
    if (verdict !== 'ok') {
      if (verdict === 'bad_sign') {
        Logger.error('支付宝支付通知签名验证失败', undefined, 'AlipayOfficialProvider');
      } else {
        Logger.error('支付宝支付通知 appId 不匹配', undefined, 'AlipayOfficialProvider');
      }
      return { success: false, orderId: '', amount: '', currency: '', responseText: 'failure' };
    }

    const tradeStatus = params['trade_status'];
    const isSuccess = tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED';
    const status = isSuccess ? 'paid' : tradeStatus === 'TRADE_CLOSED' ? 'closed' : 'pending';

    return {
      success: isSuccess,
      status,
      orderId: params['out_trade_no'],
      tradeId: params['trade_no'],
      amount: String(params['total_amount']),
      currency: 'CNY',
      responseText: 'success',
    };
  }

  /**
   * 查单（响应已验签，订单号必须是本单）：TRADE_SUCCESS / TRADE_FINISHED → paid；WAIT_BUYER_PAY 与
   * 40004 + ACQ.TRADE_NOT_EXIST → pending；TRADE_CLOSED → closed（也可能是全额退款，只记日志不改状态）；
   * 其他返回码、验签失败、订单号不符或异常 → unknown（以前一律报「未付」）
   */
  async queryOrder(ctx: PaymentQueryContext): Promise<PaymentQueryResult> {
    let result: any;
    try {
      result = await this.alipayService.queryOrder(ctx.orderId);
    } catch (error) {
      Logger.error('[支付宝查询] 查询失败', getErrorStack(error), 'AlipayOfficialProvider');
      return { state: 'unknown', orderId: ctx.orderId };
    }
    const code = String(result?.code ?? '');
    if (code === '40004') {
      return result?.subCode === 'ACQ.TRADE_NOT_EXIST'
        ? { state: 'pending', orderId: ctx.orderId }
        : { state: 'unknown', orderId: ctx.orderId };
    }
    if (code !== '10000' || result?.outTradeNo !== ctx.orderId) {
      Logger.warn('[支付宝查询] 查询返回异常状态', 'AlipayOfficialProvider');
      return { state: 'unknown', orderId: ctx.orderId };
    }
    switch (result.tradeStatus) {
      case 'TRADE_SUCCESS':
      case 'TRADE_FINISHED':
        return {
          state: 'paid',
          orderId: ctx.orderId,
          tradeId: typeof result.tradeNo === 'string' ? result.tradeNo : undefined,
          amount: result.totalAmount === undefined ? undefined : String(result.totalAmount),
          currency: 'CNY',
        };
      case 'WAIT_BUYER_PAY':
        return { state: 'pending', orderId: ctx.orderId };
      case 'TRADE_CLOSED':
        return { state: 'closed', orderId: ctx.orderId };
      default:
        return { state: 'unknown', orderId: ctx.orderId };
    }
  }
}
