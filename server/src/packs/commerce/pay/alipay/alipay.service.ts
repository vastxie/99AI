import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import {
  buildPaymentCallbackUrls,
  buildPaymentNotifyUrl,
  validateSiteUrl,
} from '../payment-callback-url.helper';
import { AlipaySdk } from 'alipay-sdk';

/** 一次操作用的支付宝配置：App ID 与密钥来自同一次读取 */
interface AlipayConfigSnapshot {
  appId: string;
  privateKey: string;
  publicKey: string;
  /** 三项配置的摘要：只在内存里比较，判断缓存的 SDK 是否属于这份配置 */
  digest: string;
}

@Injectable()
export class AlipayService {
  /** 只保留最近一份配置的 SDK；配置换了（摘要不同）就重建，不再缓存到进程重启 */
  private sdkCache: { digest: string; sdk: AlipaySdk } | null = null;

  constructor(private readonly globalConfigService: GlobalConfigService) {}

  private async readSnapshot(): Promise<AlipayConfigSnapshot> {
    const configs =
      (await this.globalConfigService.getConfigs([
        'alipayAppId',
        'alipayPrivateKey',
        'alipayPublicKey',
      ])) || {};
    const appId = String(configs.alipayAppId || '').trim();
    const privateKey = String(configs.alipayPrivateKey || '').trim();
    const publicKey = String(configs.alipayPublicKey || '').trim();
    if (!appId || !privateKey || !publicKey) {
      throw new HttpException('支付宝支付配置不完整', HttpStatus.BAD_REQUEST);
    }
    return {
      appId,
      privateKey,
      publicKey,
      digest: createHash('sha256').update(`${appId}\n${privateKey}\n${publicKey}`).digest('hex'),
    };
  }

  private sdkFor(snapshot: AlipayConfigSnapshot): AlipaySdk {
    if (this.sdkCache?.digest === snapshot.digest) return this.sdkCache.sdk;
    const sdk = new AlipaySdk({
      appId: snapshot.appId,
      privateKey: snapshot.privateKey,
      alipayPublicKey: snapshot.publicKey,
      signType: 'RSA2',
      gateway: 'https://openapi.alipay.com/gateway.do',
      // 每个请求最多 10 秒（SDK 默认 5 秒）
      timeout: 10000,
    });
    this.sdkCache = { digest: snapshot.digest, sdk };
    return sdk;
  }

  /**
   * 初始化支付宝SDK
   */
  private async getAlipaySdk(): Promise<AlipaySdk> {
    return this.sdkFor(await this.readSnapshot());
  }

  /**
   * 创建电脑网站支付
   * @param outTradeNo 商户订单号
   * @param totalAmount 订单金额
   * @param subject 订单标题
   * @param returnUrl 同步回调地址
   */
  async createPagePay(
    outTradeNo: string,
    totalAmount: number,
    subject: string,
    returnUrl: string,
  ): Promise<string> {
    try {
      const sdk = await this.getAlipaySdk();

      const siteUrl = (await this.globalConfigService.getConfigs(['siteUrl'])) as string;
      const urlError = validateSiteUrl(siteUrl);
      if (urlError) {
        throw new HttpException(urlError, HttpStatus.BAD_REQUEST);
      }

      const urls = buildPaymentCallbackUrls(siteUrl);
      const amount = Number(totalAmount).toFixed(2);

      const notifyUrl = buildPaymentNotifyUrl(urls.notifyUrl, 'alipay');
      // 支付宝的同步回跳不能证明已付款：没给结果页地址时回到用户端的「正在确认」，不说「支付成功」
      const finalReturnUrl = returnUrl || urls.frontendReturnedUrl;

      Logger.log(`支付宝电脑网站支付 - 回调配置完成`, 'AlipayService');

      const result = sdk.pageExec('alipay.trade.page.pay', {
        bizContent: {
          out_trade_no: outTradeNo,
          product_code: 'FAST_INSTANT_TRADE_PAY',
          total_amount: amount,
          subject: subject,
          qr_pay_mode: '4',
          qrcode_width: '200',
        },
        returnUrl: finalReturnUrl,
        notifyUrl: notifyUrl,
      });

      Logger.log(`支付宝电脑网站支付创建成功`, 'AlipayService');

      return result;
    } catch (error) {
      Logger.error('支付宝电脑网站支付创建失败', getErrorStack(error), 'AlipayService');
      throw new HttpException('支付宝支付创建失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 创建手机网站支付
   * @param outTradeNo 商户订单号
   * @param totalAmount 订单金额
   * @param subject 订单标题
   * @param returnUrl 同步回调地址
   */
  async createWapPay(
    outTradeNo: string,
    totalAmount: number,
    subject: string,
    returnUrl: string,
  ): Promise<string> {
    try {
      const sdk = await this.getAlipaySdk();

      const siteUrl = (await this.globalConfigService.getConfigs(['siteUrl'])) as string;
      const urlError = validateSiteUrl(siteUrl);
      if (urlError) {
        throw new HttpException(urlError, HttpStatus.BAD_REQUEST);
      }

      const urls = buildPaymentCallbackUrls(siteUrl);
      const amount = Number(totalAmount).toFixed(2);

      const notifyUrl = buildPaymentNotifyUrl(urls.notifyUrl, 'alipay');
      // 支付宝的同步回跳不能证明已付款：没给结果页地址时回到用户端的「正在确认」，不说「支付成功」
      const finalReturnUrl = returnUrl || urls.frontendReturnedUrl;

      Logger.log(`支付宝手机网站支付 - 回调配置完成`, 'AlipayService');

      const result = sdk.pageExec('alipay.trade.wap.pay', {
        bizContent: {
          out_trade_no: outTradeNo,
          product_code: 'QUICK_WAP_WAY',
          total_amount: amount,
          subject: subject,
          quit_url: finalReturnUrl,
        },
        returnUrl: finalReturnUrl,
        notifyUrl: notifyUrl,
      });

      Logger.log(`支付宝手机网站支付创建成功`, 'AlipayService');

      return result;
    } catch (error) {
      Logger.error('支付宝手机网站支付创建失败', getErrorStack(error), 'AlipayService');
      throw new HttpException('支付宝支付创建失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 校验一次异步通知：同一份配置快照既用来验签，也用来核对通知里的 app_id
   * （两步分开读配置时，中间换了配置会误拒合法通知或混用两份配置）
   */
  async verifyNotify(params: Record<string, any>): Promise<'ok' | 'bad_sign' | 'app_id_mismatch'> {
    let snapshot: AlipayConfigSnapshot;
    let signValid = false;
    try {
      snapshot = await this.readSnapshot();
      signValid = this.sdkFor(snapshot).checkNotifySign(params);
    } catch (error) {
      Logger.error('支付宝签名验证失败', getErrorStack(error), 'AlipayService');
      return 'bad_sign';
    }
    if (!signValid) return 'bad_sign';
    return String(params['app_id']) === snapshot.appId ? 'ok' : 'app_id_mismatch';
  }

  /**
   * 查询订单支付状态：响应按支付宝公钥验签（验签失败抛错）；字段按 SDK 的驼峰形式返回（outTradeNo、tradeStatus……）
   * @param outTradeNo 商户订单号
   */
  async queryOrder(outTradeNo: string): Promise<any> {
    try {
      const sdk = await this.getAlipaySdk();

      const result = await sdk.exec(
        'alipay.trade.query',
        {
          bizContent: {
            out_trade_no: outTradeNo,
          },
        },
        { validateSign: true },
      );

      return result;
    } catch (error) {
      // 验签失败等异常的消息里带签名与完整响应（订单、买家信息）：只记错误类型，不记原文与堆栈
      Logger.error(
        '支付宝订单查询失败',
        `type=${error?.name === 'AlipayRequestError' ? 'request' : 'other'}`,
        'AlipayService',
      );
      throw new HttpException('订单查询失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
