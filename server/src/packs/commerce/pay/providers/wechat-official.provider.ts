import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { createVerify, X509Certificate } from 'crypto';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { AuthIdentityService } from '@/modules/auth/identity/auth-identity.service';
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
import { buildPaymentNotifyUrl, PaymentCallbackUrls } from '../payment-callback-url.helper';
import { WechatPayQueryHttp } from './wechat-pay-query-http';

type WechatVerifyMode = 'platform_certificate' | 'wechatpay_public_key' | 'auto_compat';
type ResolvedWechatVerificationMaterial = {
  mode: Exclude<WechatVerifyMode, 'auto_compat'>;
  publicKeyOrCertificate?: string;
  expectedSerial?: string | null;
};

export class WechatOfficialProvider implements PaymentProviderAdapter {
  readonly provider = PaymentProvider.WECHAT_OFFICIAL;
  private WxPay: any;

  constructor(
    private globalConfigService: GlobalConfigService,
    private authIdentityService: AuthIdentityService,
    private getPaymentUrls: () => Promise<PaymentCallbackUrls>,
    wxPayModule: any,
    /** 查单用的请求实现（带覆盖响应体的绝对期限）；用例可替换 */
    private readonly createQueryHttp: () => WechatPayQueryHttp = () => new WechatPayQueryHttp(),
  ) {
    this.WxPay = wxPayModule?.default ? wxPayModule.default : wxPayModule;
  }

  supports(method: PaymentMethod): boolean {
    return method === PaymentMethod.WECHAT;
  }

  async createPayment(ctx: PaymentCreateContext): Promise<PaymentCreateResult> {
    const { userId, orderId, order, goods, device } = ctx;
    const payType = device === 'wechat' ? 'jsapi' : 'native';

    const wechatConfig = await this.globalConfigService.getConfigs([
      'payWeChatAppId',
      'payWeChatMchId',
      'payWeChatVerifyMode',
      'payWeChatPublicKey',
      'payWeChatWechatpayPublicKey',
      'payWeChatPrivateKey',
    ]);
    const { payWeChatAppId, payWeChatMchId, payWeChatPrivateKey } = wechatConfig;
    const wechatpayPublicKey = this.resolveWechatpayPublicKeyForSdk(wechatConfig);

    const urls = await this.getPaymentUrls();
    const pay = new this.WxPay({
      appid: payWeChatAppId,
      mchid: payWeChatMchId,
      publicKey: wechatpayPublicKey,
      privateKey: payWeChatPrivateKey,
    });

    const params: any = {
      appid: payWeChatAppId,
      mchid: payWeChatMchId,
      description: goods.name,
      out_trade_no: orderId,
      notify_url: buildPaymentNotifyUrl(urls.notifyUrl, 'wechat'),
      amount: { total: Math.round(order.total * 100) },
    };

    const baseResult = {
      orderId,
      method: ctx.method,
      provider: this.provider,
      amount: String(order.total),
      currency: 'CNY' as const,
    };

    if (payType === 'jsapi') {
      const openid = await this.authIdentityService.getProviderUserId(userId, 'wechat_official');
      if (!openid) {
        throw new HttpException('当前账号未绑定微信，无法发起微信内支付', HttpStatus.BAD_REQUEST);
      }
      params['payer'] = { openid };
      try {
        const response = await pay.transactions_jsapi(params);
        const result = response.data ? response.data : response;
        return {
          ...baseResult,
          display: {
            type: 'wechat_jsapi',
            payload: {
              status: response.status || 'unknown',
              appId: result.appId || result.data?.appId,
              timeStamp: result.timeStamp || result.data?.timeStamp,
              nonceStr: result.nonceStr || result.data?.nonceStr,
              package: result.package || result.data?.package,
              signType: result.signType || result.data?.signType,
              paySign: result.paySign || result.data?.paySign,
            },
          },
        };
      } catch (error) {
        Logger.error('[WeChat JSAPI] 支付请求失败', getErrorStack(error), 'WechatOfficialProvider');
        throw new HttpException('JSAPI支付失败', HttpStatus.BAD_REQUEST);
      }
    }

    try {
      const res = await pay.transactions_native(params);
      const url_qrcode = res.code_url || res.data?.code_url;
      if (!url_qrcode) {
        Logger.error('微信Native支付未返回code_url', undefined, 'WechatOfficialProvider');
      }
      return {
        ...baseResult,
        display: { type: 'qr_content', payload: { content: url_qrcode } },
      };
    } catch (error) {
      Logger.error('微信Native支付失败', getErrorStack(error), 'WechatOfficialProvider');
      throw new HttpException('微信Native支付失败', HttpStatus.BAD_REQUEST);
    }
  }

  async parseNotify(ctx: PaymentNotifyContext): Promise<PaymentNotifyResult> {
    const params = ctx.rawParams;
    const {
      payWeChatAppId,
      payWeChatMchId,
      payWeChatSecret,
      payWeChatVerifyMode,
      payWeChatPublicKey,
      payWeChatPlatformSerialNo,
      payWeChatWechatpayPublicKeyId,
      payWeChatWechatpayPublicKey,
      payWeChatPrivateKey,
    } = await this.globalConfigService.getConfigs([
      'payWeChatAppId',
      'payWeChatMchId',
      'payWeChatSecret',
      'payWeChatVerifyMode',
      'payWeChatPublicKey',
      'payWeChatPlatformSerialNo',
      'payWeChatWechatpayPublicKeyId',
      'payWeChatWechatpayPublicKey',
      'payWeChatPrivateKey',
    ]);

    try {
      this.verifyWechatpaySignature(ctx.headers || {}, ctx.rawBody, {
        verifyMode: payWeChatVerifyMode,
        platformPublicKeyOrCertificate: payWeChatPublicKey,
        platformSerialNo: payWeChatPlatformSerialNo,
        wechatpayPublicKeyId: payWeChatWechatpayPublicKeyId,
        wechatpayPublicKey: payWeChatWechatpayPublicKey,
      });

      if (params['event_type'] !== 'TRANSACTION.SUCCESS') {
        return {
          success: false,
          status: 'ignored',
          orderId: '',
          amount: '',
          currency: '',
          responseText: 'success',
        };
      }

      const pay = new this.WxPay({
        appid: payWeChatAppId,
        mchid: payWeChatMchId,
        publicKey: this.resolveWechatpayPublicKeyForSdk({
          payWeChatVerifyMode,
          payWeChatPublicKey,
          payWeChatWechatpayPublicKey,
        }),
        privateKey: payWeChatPrivateKey,
      });
      const { ciphertext, associated_data, nonce } = params['resource'];
      const resource = pay.decipher_gcm(ciphertext, associated_data, nonce, payWeChatSecret);

      if (String(resource['mchid']) !== String(payWeChatMchId)) {
        return { success: false, orderId: '', amount: '', currency: '', responseText: 'failed' };
      }
      if (String(resource['appid']) !== String(payWeChatAppId)) {
        return { success: false, orderId: '', amount: '', currency: '', responseText: 'failed' };
      }

      const isSuccess = resource['trade_state'] === 'SUCCESS';
      const status = isSuccess
        ? 'paid'
        : ['CLOSED', 'REVOKED', 'PAYERROR'].includes(String(resource['trade_state']))
          ? 'failed'
          : 'pending';
      // 微信金额单位是分，转换为元
      const amountInYuan = String(Number(resource.amount.total) / 100);

      return {
        success: isSuccess,
        status,
        orderId: resource['out_trade_no'],
        tradeId: resource['transaction_id'],
        amount: amountInYuan,
        currency: 'CNY',
        responseText: 'success',
      };
    } catch (error) {
      Logger.error('微信支付通知处理失败', getErrorStack(error), 'WechatOfficialProvider');
      return {
        success: false,
        status: 'failed',
        orderId: '',
        amount: '',
        currency: '',
        responseText: 'failed',
      };
    }
  }

  private verifyWechatpaySignature(
    headers: Record<string, any>,
    rawBody: string | Buffer | undefined,
    options: {
      verifyMode?: string;
      platformPublicKeyOrCertificate?: string;
      platformSerialNo?: string;
      wechatpayPublicKeyId?: string;
      wechatpayPublicKey?: string;
    },
  ) {
    const normalizedHeaders = Object.entries(headers || {}).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        acc[String(key).toLowerCase()] = Array.isArray(value) ? String(value[0]) : String(value);
        return acc;
      },
      {},
    );
    const timestamp = normalizedHeaders['wechatpay-timestamp'];
    const nonce = normalizedHeaders['wechatpay-nonce'];
    const signature = normalizedHeaders['wechatpay-signature'];
    const serial = normalizedHeaders['wechatpay-serial'];

    if (!timestamp || !nonce || !signature || !serial) {
      throw new HttpException('微信支付回调缺少签名头', HttpStatus.UNAUTHORIZED);
    }
    if (!rawBody) {
      throw new HttpException('微信支付回调缺少原始报文', HttpStatus.UNAUTHORIZED);
    }

    const material = this.resolveWechatVerificationMaterial(serial, options);
    const publicKeyOrCertificate = material.publicKeyOrCertificate;
    const expectedSerial = material.expectedSerial;

    if (!publicKeyOrCertificate) {
      throw new HttpException(
        material.mode === 'wechatpay_public_key' ? '微信支付公钥未配置' : '微信支付平台公钥未配置',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!expectedSerial) {
      throw new HttpException(
        material.mode === 'wechatpay_public_key'
          ? '微信支付公钥ID未配置'
          : '微信支付平台证书序列号未配置',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (this.normalizeWechatpaySerial(expectedSerial) !== this.normalizeWechatpaySerial(serial)) {
      throw new HttpException(
        material.mode === 'wechatpay_public_key'
          ? '微信支付公钥ID不匹配'
          : '微信支付平台证书序列号不匹配',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const message = `${timestamp}\n${nonce}\n${bodyText}\n`;
    const verifier = createVerify('RSA-SHA256');
    verifier.update(message);
    verifier.end();

    const verified = verifier.verify(publicKeyOrCertificate, signature, 'base64');
    if (!verified) {
      throw new HttpException('微信支付回调签名验证失败', HttpStatus.UNAUTHORIZED);
    }
  }

  private getVerifyMode(mode?: string): WechatVerifyMode {
    if (mode === 'wechatpay_public_key') return 'wechatpay_public_key';
    if (mode === 'auto_compat') return 'auto_compat';
    return 'platform_certificate';
  }

  private resolveWechatVerificationMaterial(
    serial: string,
    options: {
      verifyMode?: string;
      platformPublicKeyOrCertificate?: string;
      platformSerialNo?: string;
      wechatpayPublicKeyId?: string;
      wechatpayPublicKey?: string;
    },
  ): ResolvedWechatVerificationMaterial {
    const verifyMode = this.getVerifyMode(options.verifyMode);
    const platformExpectedSerial =
      options.platformSerialNo ||
      this.tryGetCertificateSerial(options.platformPublicKeyOrCertificate || '');

    if (verifyMode === 'wechatpay_public_key') {
      return {
        mode: 'wechatpay_public_key',
        publicKeyOrCertificate: options.wechatpayPublicKey,
        expectedSerial: options.wechatpayPublicKeyId,
      };
    }

    if (verifyMode === 'platform_certificate') {
      return {
        mode: 'platform_certificate',
        publicKeyOrCertificate: options.platformPublicKeyOrCertificate,
        expectedSerial: platformExpectedSerial,
      };
    }

    const normalizedSerial = this.normalizeWechatpaySerial(serial);
    if (
      options.wechatpayPublicKeyId &&
      this.normalizeWechatpaySerial(options.wechatpayPublicKeyId) === normalizedSerial
    ) {
      return {
        mode: 'wechatpay_public_key',
        publicKeyOrCertificate: options.wechatpayPublicKey,
        expectedSerial: options.wechatpayPublicKeyId,
      };
    }

    if (
      platformExpectedSerial &&
      this.normalizeWechatpaySerial(platformExpectedSerial) === normalizedSerial
    ) {
      return {
        mode: 'platform_certificate',
        publicKeyOrCertificate: options.platformPublicKeyOrCertificate,
        expectedSerial: platformExpectedSerial,
      };
    }

    throw new HttpException(
      '微信支付回调 Wechatpay-Serial 未匹配已配置的证书或公钥',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private normalizeWechatpaySerial(serial: string): string {
    return String(serial || '')
      .replace(/:/g, '')
      .toUpperCase();
  }

  private resolveWechatpayPublicKeyForSdk(config: Record<string, any>): string | undefined {
    const mode = this.getVerifyMode(config.payWeChatVerifyMode);
    if (mode === 'wechatpay_public_key') {
      return config.payWeChatWechatpayPublicKey;
    }
    if (mode === 'auto_compat') {
      return config.payWeChatWechatpayPublicKey || config.payWeChatPublicKey;
    }
    return config.payWeChatPublicKey;
  }

  private tryGetCertificateSerial(publicKeyOrCertificate: string): string | null {
    try {
      if (!publicKeyOrCertificate.includes('BEGIN CERTIFICATE')) return null;
      return new X509Certificate(publicKeyOrCertificate).serialNumber;
    } catch {
      return null;
    }
  }

  /**
   * 查单：SUCCESS（字段核对通过）→ paid；NOTPAY、USERPAYING、ORDER_NOT_EXIST → pending；CLOSED、REVOKED → closed；
   * REFUND、PAYERROR → unknown；信封异常、订单号 / 商户号 / AppID 不符抛错（调用方按 unknown 处理）
   */
  async queryOrder(ctx: PaymentQueryContext): Promise<PaymentQueryResult> {
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);
    try {
      const config = await this.globalConfigService.getConfigs([
        'payWeChatAppId',
        'payWeChatMchId',
        'payWeChatVerifyMode',
        'payWeChatPublicKey',
        'payWeChatWechatpayPublicKey',
        'payWeChatPrivateKey',
      ]);
      const pay = new this.WxPay({
        appid: config.payWeChatAppId,
        mchid: config.payWeChatMchId,
        publicKey: this.resolveWechatpayPublicKeyForSdk(config),
        privateKey: config.payWeChatPrivateKey,
      });
      // 只给这个查单实例换上带绝对期限的请求实现
      pay.createHttp(this.createQueryHttp());
      const response: unknown = await pay.query({ out_trade_no: ctx.orderId });
      // SDK 2.x returns an HTTP envelope even when the request fails.
      if (isRecord(response) && response.status === 404 && typeof response.error === 'string') {
        const error: unknown = JSON.parse(response.error);
        if (isRecord(error) && error.code === 'ORDER_NOT_EXIST')
          return { state: 'pending', orderId: ctx.orderId };
      }
      if (
        !isRecord(response) ||
        response.status !== 200 ||
        response.error !== undefined ||
        !isRecord(response.data)
      )
        throw new Error();
      const result = response.data;
      if (
        typeof result.out_trade_no !== 'string' ||
        !result.out_trade_no ||
        result.out_trade_no !== ctx.orderId ||
        typeof result.mchid !== 'string' ||
        !result.mchid ||
        result.mchid !== config.payWeChatMchId ||
        typeof result.appid !== 'string' ||
        !result.appid ||
        result.appid !== config.payWeChatAppId ||
        typeof result.trade_state !== 'string' ||
        !['SUCCESS', 'NOTPAY', 'USERPAYING', 'CLOSED', 'REVOKED', 'PAYERROR', 'REFUND'].includes(
          result.trade_state,
        )
      )
        throw new Error();
      if (result.trade_state === 'NOTPAY' || result.trade_state === 'USERPAYING')
        return { state: 'pending', orderId: ctx.orderId };
      if (result.trade_state === 'CLOSED' || result.trade_state === 'REVOKED')
        return { state: 'closed', orderId: ctx.orderId };
      if (result.trade_state !== 'SUCCESS') return { state: 'unknown', orderId: ctx.orderId };
      const amount = result.amount;
      const tradeId = result.transaction_id;
      if (
        typeof tradeId !== 'string' ||
        !/^[^\s\x00-\x1f\x7f]{1,32}$/u.test(tradeId) ||
        !isRecord(amount) ||
        typeof amount.total !== 'number' ||
        !Number.isSafeInteger(amount.total) ||
        amount.total <= 0 ||
        amount.currency !== 'CNY' ||
        (amount.payer_currency !== undefined && amount.payer_currency !== 'CNY')
      )
        throw new Error();
      const cents = BigInt(amount.total);
      return {
        state: 'paid',
        orderId: ctx.orderId,
        tradeId,
        amount: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`,
        currency: 'CNY',
      };
    } catch {
      // Do not propagate SDK errors: they can contain credentials or full responses.
      throw new HttpException('微信支付查单失败', HttpStatus.BAD_GATEWAY);
    }
  }
}
