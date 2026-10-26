import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { buildPaymentCallbackUrls, validateSiteUrl } from '../payment-callback-url.helper';
import axios from 'axios';

interface PayPalOrder {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

interface PayPalCapture {
  id: string;
  status: string;
  purchase_units: Array<{
    reference_id?: string;
    invoice_id?: string;
    payments?: {
      captures: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
}

/** 一次操作用的 PayPal 配置：API 地址、凭据与 Webhook ID 都来自同一次读取 */
interface PayPalConfigSnapshot {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookId: string;
  /** 模式、Client ID、Secret 的摘要：只在内存里比较，判断缓存的令牌是否属于这份配置 */
  digest: string;
}

/** 取令牌与补单查单的请求期限 */
const PAYPAL_QUERY_TIMEOUT_MS = 10000;

/** 校验 Webhook 时转发给 PayPal 的请求头字段 */
const PAYPAL_WEBHOOK_HEADER_FIELDS: Array<[string, string]> = [
  ['auth_algo', 'paypal-auth-algo'],
  ['cert_url', 'paypal-cert-url'],
  ['transmission_id', 'paypal-transmission-id'],
  ['transmission_sig', 'paypal-transmission-sig'],
  ['transmission_time', 'paypal-transmission-time'],
];

@Injectable()
export class PayPalService {
  /** 只保留最近一份配置的令牌；配置换了（模式、Client ID、Secret 任一）摘要不同，重新取 */
  private tokenCache: { digest: string; token: string; expiresAt: number } | null = null;

  constructor(private readonly globalConfigService: GlobalConfigService) {}

  private async readSnapshot(): Promise<PayPalConfigSnapshot> {
    const configs =
      (await this.globalConfigService.getConfigs([
        'payPalClientId',
        'payPalClientSecret',
        'payPalMode',
        'payPalWebhookId',
      ])) || {};
    const clientId = String(configs.payPalClientId || '').trim();
    const clientSecret = String(configs.payPalClientSecret || '').trim();
    if (!clientId || !clientSecret) {
      throw new HttpException('PayPal配置信息不完整', HttpStatus.BAD_REQUEST);
    }
    const mode = String(configs.payPalMode || '').trim() === 'live' ? 'live' : 'sandbox';
    return {
      baseUrl: mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
      clientId,
      clientSecret,
      webhookId: String(configs.payPalWebhookId || '').trim(),
      digest: createHash('sha256').update(`${mode}\n${clientId}\n${clientSecret}`).digest('hex'),
    };
  }

  /** 取这份配置的访问令牌：缓存属于同一份配置且未过期时复用 */
  private async accessTokenFor(snapshot: PayPalConfigSnapshot): Promise<string> {
    const cached = this.tokenCache;
    if (cached && cached.digest === snapshot.digest && cached.expiresAt > Date.now()) {
      return cached.token;
    }
    try {
      const auth = Buffer.from(`${snapshot.clientId}:${snapshot.clientSecret}`).toString('base64');
      const response = await axios.post(
        `${snapshot.baseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: PAYPAL_QUERY_TIMEOUT_MS,
        },
      );
      const token = String(response.data.access_token || '');
      // 令牌有效期通常是 9 小时，提前 1 小时视为过期
      const expiresAt = Date.now() + (Number(response.data.expires_in) - 3600) * 1000;
      this.tokenCache = { digest: snapshot.digest, token, expiresAt };
      Logger.debug('PayPal访问令牌获取成功', 'PayPalService');
      return token;
    } catch (error) {
      Logger.error('获取PayPal访问令牌失败', getErrorStack(error), 'PayPalService');
      throw new HttpException('获取PayPal访问令牌失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** 一次操作的配置与令牌：之后的请求都用这里的地址与令牌，期间配置换了也不会混用 */
  private async session(): Promise<{ snapshot: PayPalConfigSnapshot; token: string }> {
    const snapshot = await this.readSnapshot();
    const token = await this.accessTokenFor(snapshot);
    return { snapshot, token };
  }

  /**
   * 创建PayPal订单
   */
  async createOrder(
    amount: number | string,
    orderId: string,
    description?: string,
  ): Promise<PayPalOrder> {
    // 容错处理：确保金额是数字类型
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(numericAmount) || numericAmount <= 0) {
      Logger.error(`无效的金额值`, undefined, 'PayPalService');
      throw new HttpException('无效的支付金额', HttpStatus.BAD_REQUEST);
    }

    const {
      snapshot: { baseUrl },
      token: accessToken,
    } = await this.session();

    const configs = await this.globalConfigService.getConfigs(['siteName', 'siteUrl']);

    const siteUrl = configs.siteUrl as string;
    const urlError = validateSiteUrl(siteUrl);
    if (urlError) {
      throw new HttpException(urlError, HttpStatus.BAD_REQUEST);
    }

    const urls = buildPaymentCallbackUrls(siteUrl);
    const returnUrl = urls.paypalSuccessUrl;
    const cancelUrl = urls.paypalCancelUrl;

    // 添加日志记录URL
    Logger.log(`PayPal回调URL配置完成`, 'PayPalService');

    // PayPal固定使用USD货币
    const currencyCode = 'USD';
    const finalAmount = numericAmount.toFixed(2);

    try {
      Logger.log(`创建PayPal订单`, 'PayPalService');

      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: orderId,
            custom_id: orderId,
            invoice_id: orderId,
            description: description || `${configs.siteName || '99Agent'} - 订单 ${orderId}`,
            amount: {
              currency_code: currencyCode,
              value: finalAmount,
            },
          },
        ],
        application_context: {
          brand_name: configs.siteName || '99Agent',
          landing_page: 'LOGIN',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      };

      const response = await axios.post(`${baseUrl}/v2/checkout/orders`, orderData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': `${orderId}-${Date.now()}`, // 幂等性键
        },
      });

      Logger.log(`PayPal订单创建成功`, 'PayPalService');
      return response.data;
    } catch (error) {
      const errorData = error.response?.data;
      Logger.error('创建PayPal订单失败', getErrorStack(error), 'PayPalService');

      // 处理特定错误
      if (errorData?.details?.[0]?.issue === 'CURRENCY_NOT_SUPPORTED') {
        Logger.warn('PayPal不支持当前货币', 'PayPalService');
        throw new HttpException(
          `PayPal不支持${currencyCode}货币，请在管理后台切换为USD或其他支持的货币`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // 通用错误处理
      const userMessage = errorData?.message || '创建PayPal订单失败，请检查配置或稍后重试';
      throw new HttpException(userMessage, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 捕获支付（完成支付）
   */
  async capturePayment(paypalOrderId: string): Promise<PayPalCapture> {
    // 校验订单号格式（PayPal order ID 为大写字母数字），防止 URL 路径注入
    if (!/^[A-Z0-9]{6,40}$/.test(paypalOrderId)) {
      throw new HttpException('无效的 PayPal 订单号', HttpStatus.BAD_REQUEST);
    }
    const {
      snapshot: { baseUrl },
      token: accessToken,
    } = await this.session();

    try {
      const response = await axios.post(
        `${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation', // 返回完整响应
          },
        },
      );

      Logger.log(`PayPal支付捕获成功`, 'PayPalService');
      return response.data;
    } catch (error) {
      Logger.error('捕获PayPal支付失败', getErrorStack(error), 'PayPalService');

      // 处理特定错误
      if (error.response?.data?.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
        throw new HttpException('订单已经被捕获', HttpStatus.BAD_REQUEST);
      }

      throw new HttpException(
        error.response?.data?.message || '捕获PayPal支付失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 补单用：取完整的 PayPal 订单（含 purchase_units 的 custom_id 与 payments.captures），只读、10 秒期限；
   * 出错照常抛出（调用方按 unknown 处理）
   */
  async getOrder(paypalOrderId: string): Promise<Record<string, any>> {
    const {
      snapshot: { baseUrl },
      token: accessToken,
    } = await this.session();
    const response = await axios.get(
      `${baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: PAYPAL_QUERY_TIMEOUT_MS,
      },
    );
    return response.data;
  }

  /**
   * 查询订单状态
   */
  async queryOrder(paypalOrderId: string): Promise<any> {
    const {
      snapshot: { baseUrl },
      token: accessToken,
    } = await this.session();

    try {
      const response = await axios.get(`${baseUrl}/v2/checkout/orders/${paypalOrderId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        id: response.data.id,
        status: response.data.status,
        amount: response.data.purchase_units?.[0]?.amount,
        payer: response.data.payer,
        create_time: response.data.create_time,
        update_time: response.data.update_time,
      };
    } catch (error) {
      Logger.error('查询PayPal订单失败', getErrorStack(error), 'PayPalService');
      throw new HttpException(
        error.response?.data?.message || '查询PayPal订单失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 处理 Webhook：按收到的原始报文验签，验签通过后处理的是同一份原文解析出的事件。
   * 没有原文直接拒绝（重新序列化对象会改变报文，验签不可靠）。
   */
  async handleWebhook(
    headers: Record<string, any>,
    rawBody: string | Buffer | undefined,
  ): Promise<any> {
    const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new HttpException('PayPal Webhook缺少原始报文', HttpStatus.BAD_REQUEST);
    }
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new HttpException('PayPal Webhook报文格式错误', HttpStatus.BAD_REQUEST);
    }
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new HttpException('PayPal Webhook报文格式错误', HttpStatus.BAD_REQUEST);
    }

    const isValid = await this.verifyWebhookSignature(headers || {}, raw);
    if (!isValid) {
      throw new HttpException('Webhook签名验证失败', HttpStatus.UNAUTHORIZED);
    }

    const eventType = event.event_type;
    const resource = event.resource || {};

    Logger.log('收到PayPal Webhook事件', 'PayPalService');

    switch (eventType) {
      case 'CHECKOUT.ORDER.APPROVED':
        return {
          type: eventType,
          tradeId: resource.id,
          status: 'APPROVED',
        };

      case 'PAYMENT.CAPTURE.COMPLETED':
        return {
          type: eventType,
          tradeId: resource.supplementary_data?.related_ids?.order_id,
          orderId: resource.custom_id || resource.invoice_id,
          status: resource.status,
          amount: resource.amount?.value,
          currency: resource.amount?.currency_code,
          captureId: resource.id,
        };

      case 'PAYMENT.CAPTURE.DENIED':
        Logger.warn('PayPal支付被拒绝', 'PayPalService');
        return {
          type: eventType,
          tradeId: resource.supplementary_data?.related_ids?.order_id,
          orderId: resource.custom_id || resource.invoice_id,
          status: resource.status,
          captureId: resource.id,
        };

      default:
        return {
          type: eventType,
        };
    }
  }

  /**
   * 调 PayPal 校验 Webhook 签名：请求体按字符串拼接——外层字段各自 JSON 转义，
   * webhook_event 的位置原样嵌入收到的报文（不经过解析再序列化）
   */
  private async verifyWebhookSignature(
    headers: Record<string, any>,
    rawEvent: string,
  ): Promise<boolean> {
    const { snapshot, token } = await this.session();
    if (!snapshot.webhookId) {
      Logger.warn('PayPal Webhook ID未配置，拒绝处理Webhook', 'PayPalService');
      throw new HttpException('PayPal Webhook ID未配置', HttpStatus.BAD_REQUEST);
    }
    const headerValue = (name: string) => {
      const value = headers[name];
      return String(Array.isArray(value) ? value[0] : (value ?? ''));
    };
    const fields = [
      ...PAYPAL_WEBHOOK_HEADER_FIELDS.map(
        ([field, header]) => `${JSON.stringify(field)}:${JSON.stringify(headerValue(header))}`,
      ),
      `${JSON.stringify('webhook_id')}:${JSON.stringify(snapshot.webhookId)}`,
      `${JSON.stringify('webhook_event')}:${rawEvent}`,
    ];
    try {
      const response = await axios.post(
        `${snapshot.baseUrl}/v1/notifications/verify-webhook-signature`,
        `{${fields.join(',')}}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data?.verification_status === 'SUCCESS';
    } catch (error) {
      Logger.error('验证PayPal Webhook签名失败', getErrorStack(error), 'PayPalService');
      throw new HttpException('PayPal Webhook签名验证请求失败', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * 作废未支付的测试订单（支付渠道测试专用）
   */
  async voidOrder(paypalOrderId: string): Promise<void> {
    const {
      snapshot: { baseUrl },
      token: accessToken,
    } = await this.session();

    try {
      await axios.post(
        `${baseUrl}/v2/checkout/orders/${paypalOrderId}/void`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      Logger.log(`已作废 PayPal 测试订单`, 'PayPalService');
    } catch (error) {
      Logger.warn('作废 PayPal 测试订单失败', 'PayPalService');
      throw error;
    }
  }
}
