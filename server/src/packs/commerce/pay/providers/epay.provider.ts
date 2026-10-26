import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { getErrorStack } from '@/common/utils/error-stack.util';
import axios from 'axios';
import { EpayPaymentHelper } from '../epay-payment.helper';
import { resolveEpayApiVersion } from '../payment-config.helper';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
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
import {
  buildPaymentNotifyUrl,
  buildPaymentReturnUrl,
  PaymentCallbackUrls,
} from '../payment-callback-url.helper';

export class EpayProvider implements PaymentProviderAdapter {
  readonly provider = PaymentProvider.EPAY;

  constructor(
    private globalConfigService: GlobalConfigService,
    private getPaymentUrls: () => Promise<PaymentCallbackUrls>,
  ) {}

  supports(method: PaymentMethod): boolean {
    return [PaymentMethod.WECHAT, PaymentMethod.ALIPAY, PaymentMethod.PAYPAL].includes(method);
  }

  async createPayment(ctx: PaymentCreateContext): Promise<PaymentCreateResult> {
    const { orderId, order, goods, device } = ctx;

    const epayConfig = await this.globalConfigService.getConfigs([
      'payEpayPid',
      'payEpayKey',
      'payEpayApiPayUrl',
      'payEpayApiVersion',
      'payEpayPrivateKey',
    ]);
    const urls = await this.getPaymentUrls();
    const pid = epayConfig.payEpayPid;
    const key = epayConfig.payEpayKey;
    const apiPayUrl = epayConfig.payEpayApiPayUrl;
    const apiVersion = resolveEpayApiVersion(epayConfig.payEpayApiVersion);
    const privateKey = epayConfig.payEpayPrivateKey;
    // 出站前按版本检查凭据：无效版本、v2 缺私钥、v1 缺密钥都不发请求（与配置检查、回调验签同一规则）
    if (apiVersion === null) {
      throw new HttpException(
        '易支付接口版本无效，请在支付参数里选择 v1 或 v2',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (apiVersion === 'v2' ? !privateKey : !key) {
      throw new HttpException('易支付配置不完整，请检查商户密钥', HttpStatus.BAD_REQUEST);
    }

    let payType: string;
    if (ctx.method === PaymentMethod.WECHAT) {
      payType = 'wxpay';
    } else if (ctx.method === PaymentMethod.ALIPAY) {
      payType = 'alipay';
    } else if (ctx.method === PaymentMethod.PAYPAL) {
      payType = 'paypal';
    } else {
      throw new HttpException('易支付不支持该支付方式', HttpStatus.BAD_REQUEST);
    }

    const baseParams = {
      pid: pid,
      type: payType,
      out_trade_no: orderId,
      name: goods.name,
      money: order.total,
      // 易支付 mapi 接口要求用户 IP：取下单请求的客户端地址，取不到时用回环地址
      clientip: ctx.clientIp || '127.0.0.1',
      device: device,
      notify_url: buildPaymentNotifyUrl(urls.notifyUrl, 'epay'),
      return_url: buildPaymentReturnUrl(urls.returnUrl, 'epay', 'success'),
      param: 'epay',
    };

    const params = EpayPaymentHelper.autoBuildParams(baseParams, {
      key: key,
      apiVersion: apiVersion,
      privateKey: privateKey,
    });

    let display: PaymentDisplay;

    if (apiPayUrl.includes('submit.php')) {
      const queryParams = new URLSearchParams(params).toString();
      display = { type: 'redirect_url', payload: { url: `${apiPayUrl}?${queryParams}` } };
    } else {
      const formData = new URLSearchParams();
      for (const k in params) {
        formData.append(k, String(params[k]));
      }

      try {
        const res = await axios.post(apiPayUrl, formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const raw = EpayPaymentHelper.processResponse(res.data, payType, { apiVersion });
        if (raw.isRedirect && raw.redirectUrl) {
          display = { type: 'redirect_url', payload: { url: raw.redirectUrl } };
        } else {
          display = { type: 'qr_content', payload: { content: raw.url_qrcode || raw.redirectUrl } };
        }
      } catch (error) {
        Logger.error('易支付下单请求失败', getErrorStack(error), 'EpayProvider');
        throw new HttpException(error.message || '支付请求失败', HttpStatus.BAD_REQUEST);
      }
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

    const { payEpayKey, payEpayApiVersion, payEpayPublicKey, payEpayPid } =
      await this.globalConfigService.getConfigs([
        'payEpayKey',
        'payEpayApiVersion',
        'payEpayPublicKey',
        'payEpayPid',
      ]);

    const isValidSign = EpayPaymentHelper.verifyCallback(params, {
      key: payEpayKey,
      publicKey: payEpayPublicKey,
      apiVersion: payEpayApiVersion,
    });

    if (!isValidSign) {
      Logger.warn(`[易支付回调] 签名验证失败`, 'EpayProvider');
      return { success: false, orderId: '', amount: '', currency: '', responseText: 'failed' };
    }

    if (String(params['pid']) !== String(payEpayPid)) {
      Logger.warn(`[易支付回调] pid 不匹配`, 'EpayProvider');
      return { success: false, orderId: '', amount: '', currency: '', responseText: 'failed' };
    }

    const tradeStatus = params['trade_status'];
    const isSuccess = tradeStatus === 'TRADE_SUCCESS';
    const status = isSuccess
      ? 'paid'
      : ['TRADE_CLOSED', 'TRADE_FAILED', 'CLOSED', 'FAILED'].includes(String(tradeStatus))
        ? 'failed'
        : 'pending';

    return {
      success: isSuccess,
      status,
      orderId: params['out_trade_no'],
      tradeId: params['trade_no'],
      amount: String(params['money']),
      currency: 'CNY',
      responseText: 'success',
    };
  }

  async queryOrder(ctx: PaymentQueryContext): Promise<PaymentQueryResult> {
    const { orderId } = ctx;
    const { payEpayPid, payEpayKey, payEpayApiQueryUrl, payEpayApiVersion, payEpayPrivateKey } =
      await this.globalConfigService.getConfigs([
        'payEpayPid',
        'payEpayKey',
        'payEpayApiQueryUrl',
        'payEpayApiVersion',
        'payEpayPrivateKey',
      ]);

    // 与下单同一规则：无效版本、v2 缺私钥、v1 缺密钥在发请求前拒绝，v2 缺私钥不转入 v1 查询
    const apiVersion = resolveEpayApiVersion(payEpayApiVersion);
    if (apiVersion === null) {
      throw new HttpException(
        '易支付接口版本无效，请在支付参数里选择 v1 或 v2',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (apiVersion === 'v2' ? !payEpayPrivateKey : !payEpayKey) {
      throw new HttpException('易支付配置不完整，请检查商户密钥', HttpStatus.BAD_REQUEST);
    }
    if (apiVersion === 'v2') {
      const queryParams: any = {
        pid: payEpayPid,
        out_trade_no: orderId,
        timestamp: Math.floor(Date.now() / 1000).toString(),
      };
      const sign = EpayPaymentHelper.signRSA(queryParams, payEpayPrivateKey);
      queryParams.sign = sign;
      queryParams.sign_type = 'RSA';

      const formData = new URLSearchParams();
      Object.keys(queryParams).forEach(key => {
        formData.append(key, queryParams[key]);
      });

      try {
        const { data } = await axios.post(payEpayApiQueryUrl, formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        });
        if (data.code !== 0 && data.code !== '0') {
          throw new HttpException(data.msg || '查询失败', HttpStatus.BAD_REQUEST);
        }
        return this.toQueryResult(data, orderId);
      } catch (error) {
        Logger.error('易支付 v2 查询失败', getErrorStack(error), 'EpayProvider');
        throw new HttpException(error.message || '查询订单失败', HttpStatus.BAD_REQUEST);
      }
    } else {
      const queryParams: any = {
        act: 'order',
        out_trade_no: orderId,
        pid: payEpayPid,
        key: payEpayKey,
      };
      try {
        const response = await axios.get(payEpayApiQueryUrl, {
          params: queryParams,
          timeout: 10000,
        });
        const { code, msg, ...orderInfo } = response.data;
        if (code != 1) throw new HttpException(msg, HttpStatus.BAD_REQUEST);
        return this.toQueryResult(orderInfo, orderId);
      } catch (error) {
        Logger.error('易支付 v1 查询失败', getErrorStack(error), 'EpayProvider');
        throw new HttpException(error.message || '查询订单失败', HttpStatus.BAD_REQUEST);
      }
    }
  }

  /**
   * 易支付查单结果：返回的订单号必须存在且是本单（否则 unknown）；status 为 1（字符串或数字）或
   * trade_status 为 TRADE_SUCCESS → paid，其余 → pending（易支付没有关闭语义）
   */
  private toQueryResult(info: Record<string, any>, orderId: string): PaymentQueryResult {
    if (typeof info?.out_trade_no !== 'string' || info.out_trade_no !== orderId) {
      return { state: 'unknown', orderId };
    }
    const paid = info.status === '1' || info.status === 1 || info.trade_status === 'TRADE_SUCCESS';
    if (!paid) return { state: 'pending', orderId };
    return {
      state: 'paid',
      orderId,
      tradeId: typeof info.trade_no === 'string' ? info.trade_no : undefined,
      amount: info.money === undefined || info.money === null ? undefined : String(info.money),
      currency: 'CNY',
    };
  }
}
