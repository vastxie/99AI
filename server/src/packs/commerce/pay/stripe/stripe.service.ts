import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { buildPaymentCallbackUrls, validateSiteUrl } from '../payment-callback-url.helper';
// stripe 22 的 CommonJS 入口是 module.exports = Stripe（没有 .default），不能用默认导入
import Stripe = require('stripe');

/** 与 Stripe.Checkout.Session 一致：url / amount_total / currency 在部分模式下为 null */
interface StripeSession {
  id: string;
  payment_status: string;
  url: string | null;
  amount_total: number | null;
  currency: string | null;
}

@Injectable()
export class StripeService {
  /** 只保留最近一份配置的客户端；Secret Key 换了（摘要不同）就重建，不再缓存到进程重启 */
  private client: { digest: string; stripe: Stripe } | null = null;

  constructor(private readonly globalConfigService: GlobalConfigService) {}

  /**
   * 获取Stripe客户端
   */
  private async getStripeClient(): Promise<Stripe> {
    const secretKey = String(
      (await this.globalConfigService.getConfigWithFallback('stripeSecretKey')) || '',
    ).trim();
    if (!secretKey) {
      throw new HttpException('Stripe配置信息不完整', HttpStatus.BAD_REQUEST);
    }
    // 摘要只在内存里比较，不输出
    const digest = createHash('sha256').update(secretKey).digest('hex');
    if (this.client?.digest === digest) return this.client.stripe;

    const apiVersion = '2024-12-18.acacia' as Stripe.LatestApiVersion;
    const stripe = new Stripe(secretKey, {
      apiVersion,
      typescript: true,
    });
    this.client = { digest, stripe };
    Logger.debug('Stripe客户端初始化成功', 'StripeService');
    return stripe;
  }

  /**
   * 创建Stripe Checkout Session
   */
  async createCheckoutSession(
    amount: number | string,
    orderId: string,
    description?: string,
  ): Promise<StripeSession> {
    // 容错处理：确保金额是数字类型
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(numericAmount) || numericAmount <= 0) {
      Logger.error(`无效的金额值`, undefined, 'StripeService');
      throw new HttpException('无效的支付金额', HttpStatus.BAD_REQUEST);
    }

    const stripe = await this.getStripeClient();

    const configs = await this.globalConfigService.getConfigs(['siteName', 'siteUrl']);

    const siteUrl = configs.siteUrl as string;
    const urlError = validateSiteUrl(siteUrl);
    if (urlError) {
      throw new HttpException(urlError, HttpStatus.BAD_REQUEST);
    }

    const urls = buildPaymentCallbackUrls(siteUrl);
    const successUrl = `${urls.stripeSuccessUrl}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = urls.stripeCancelUrl;

    // 添加日志记录URL
    Logger.log(`Stripe回调URL配置完成`, 'StripeService');

    // Stripe使用分为单位，所以需要乘以100
    const finalAmount = Math.round(numericAmount * 100);

    try {
      Logger.log(`创建Stripe订单`, 'StripeService');

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: description || `${configs.siteName || '99Agent'} - 订单 ${orderId}`,
                description: `订单号: ${orderId}`,
              },
              unit_amount: finalAmount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          orderId,
        },
        payment_intent_data: {
          metadata: {
            orderId,
          },
        },
      });

      Logger.log(`Stripe Session创建成功`, 'StripeService');
      return {
        id: session.id,
        payment_status: session.payment_status,
        url: session.url,
        amount_total: session.amount_total,
        currency: session.currency,
      };
    } catch (error) {
      const errorMessage = error.message || '创建Stripe订单失败';
      Logger.error('创建Stripe Session失败', getErrorStack(error), 'StripeService');

      // 处理特定错误
      if (error.type === 'StripeAuthenticationError') {
        throw new HttpException('Stripe密钥无效，请检查配置', HttpStatus.BAD_REQUEST);
      }

      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 补单用：取 Checkout Session 并展开 payment_intent.latest_charge（判断退款与争议）。
   * 超时与重试只设在这一次请求上（10 秒、不重试），共享客户端的下单、回跳验证、退款等请求不受影响；
   * 出错照常抛出（调用方按 unknown 处理）
   */
  async retrieveSessionForQuery(sessionId: string): Promise<Stripe.Checkout.Session> {
    const stripe = await this.getStripeClient();
    return stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ['payment_intent.latest_charge'] },
      { timeout: 10000, maxNetworkRetries: 0 },
    );
  }

  /**
   * 验证支付状态
   */
  async verifyPayment(sessionId: string): Promise<any> {
    const stripe = await this.getStripeClient();

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent', 'line_items'],
      });

      Logger.log('Stripe支付验证完成', 'StripeService');

      return {
        id: session.id,
        status: session.payment_status,
        orderId: session.metadata?.orderId,
        amount: (session.amount_total ?? 0) / 100, // 转回美元；Checkout Session 总带该字段，null 时 null / 100 本就为 0
        currency: session.currency,
        paymentIntent: session.payment_intent,
        customerEmail: session.customer_details?.email,
      };
    } catch (error) {
      Logger.error('验证Stripe支付失败', getErrorStack(error), 'StripeService');
      throw new HttpException('验证Stripe支付失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 处理Webhook通知
   */
  async handleWebhook(signature: string, payload: string | Buffer): Promise<any> {
    // 单键读取返回值本身（不是对象）：用 getConfigWithFallback 取字符串
    const webhookSecret = String(
      (await this.globalConfigService.getConfigWithFallback('stripeWebhookSecret')) || '',
    ).trim();
    if (!webhookSecret) {
      throw new HttpException('Stripe Webhook Secret未配置', HttpStatus.BAD_REQUEST);
    }

    const stripe = await this.getStripeClient();

    try {
      const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

      Logger.log('收到Stripe Webhook事件', 'StripeService');

      switch (event.type) {
        case 'checkout.session.completed':
          const session = event.data.object as Stripe.Checkout.Session;
          Logger.log('Stripe支付成功', 'StripeService');
          return {
            type: event.type,
            orderId: session.metadata?.orderId,
            tradeId: session.id,
            status: session.payment_status,
            amount: session.amount_total ? session.amount_total / 100 : null,
            currency: session.currency,
          };

        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          // Checkout orders are completed by checkout.session.completed because it carries metadata.orderId.
          // payment_intent.succeeded is kept for audit logging and is intentionally skipped upstream
          // when no local orderId is available.
          Logger.log(`付款成功`, 'StripeService');
          return {
            type: event.type,
            tradeId: paymentIntent.id,
            status: paymentIntent.status,
            amount: paymentIntent.amount ? paymentIntent.amount / 100 : null,
            currency: paymentIntent.currency,
          };

        case 'payment_intent.payment_failed':
          const failedPayment = event.data.object as Stripe.PaymentIntent;
          Logger.warn(`付款失败`, 'StripeService');
          return {
            type: event.type,
            orderId: failedPayment.metadata?.orderId,
            tradeId: failedPayment.id,
            status: 'failed',
            amount: failedPayment.amount ? failedPayment.amount / 100 : null,
            currency: failedPayment.currency,
          };

        default:
          Logger.log('未处理的Stripe事件类型', 'StripeService');
          return {
            type: event.type,
          };
      }
    } catch (error) {
      Logger.error('处理Stripe Webhook失败', getErrorStack(error), 'StripeService');
      throw new HttpException('Webhook签名验证失败', HttpStatus.UNAUTHORIZED);
    }
  }

  /**
   * 过期测试 Session（支付渠道测试专用）
   */
  async expireTestSession(sessionId: string): Promise<void> {
    const stripe = await this.getStripeClient();

    try {
      await stripe.checkout.sessions.expire(sessionId);
      Logger.log(`已过期 Stripe 测试 Session`, 'StripeService');
    } catch (error) {
      Logger.warn('过期 Stripe 测试 Session 失败', 'StripeService');
      throw error;
    }
  }
}
