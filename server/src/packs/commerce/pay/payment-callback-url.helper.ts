/**
 * 支付回调地址统一生成
 * 从 siteUrl 自动派生所有支付通道的回调地址，避免管理员逐个填写
 */

export interface PaymentCallbackUrls {
  baseUrl: string;
  notifyUrl: string;
  returnUrl: string;
  paypalSuccessUrl: string;
  paypalCancelUrl: string;
  paypalWebhookUrl: string;
  stripeSuccessUrl: string;
  stripeCancelUrl: string;
  stripeWebhookUrl: string;
  frontendSuccessUrl: string;
  frontendCancelUrl: string;
  frontendFailedUrl: string;
  /** 回跳不带可验证结果的渠道（易支付、支付宝）：到账以异步通知为准，用户端只说「正在确认」 */
  frontendReturnedUrl: string;
}

export function buildPaymentCallbackUrls(siteUrl: string): PaymentCallbackUrls {
  const base = siteUrl.trim().replace(/\/+$/, '');
  const apiBase = `${base}/api/pay`;
  const notifyUrl = `${apiBase}/notify`;
  const returnUrl = `${apiBase}/return`;

  return {
    baseUrl: base,
    notifyUrl,
    returnUrl,
    paypalSuccessUrl: buildPaymentReturnUrl(returnUrl, 'paypal', 'success'),
    paypalCancelUrl: buildPaymentReturnUrl(returnUrl, 'paypal', 'cancel'),
    paypalWebhookUrl: buildPaymentNotifyUrl(notifyUrl, 'paypal'),
    stripeSuccessUrl: buildPaymentReturnUrl(returnUrl, 'stripe', 'success'),
    stripeCancelUrl: buildPaymentReturnUrl(returnUrl, 'stripe', 'cancel'),
    stripeWebhookUrl: buildPaymentNotifyUrl(notifyUrl, 'stripe'),
    // 用户端是 history 路由：结果放在查询参数里，由商业包的启动钩子提示结果并清掉参数
    frontendSuccessUrl: `${base}/?payment=success`,
    frontendCancelUrl: `${base}/?payment=cancel`,
    frontendFailedUrl: `${base}/?payment=failed`,
    frontendReturnedUrl: `${base}/?payment=returned`,
  };
}

export function buildPaymentNotifyUrl(baseNotifyUrl: string, provider: string): string {
  return `${baseNotifyUrl}?provider=${encodeURIComponent(provider)}`;
}

export function buildPaymentReturnUrl(
  baseReturnUrl: string,
  provider: string,
  status: 'success' | 'cancel' | 'failed',
): string {
  return `${baseReturnUrl}?provider=${encodeURIComponent(provider)}&status=${encodeURIComponent(
    status,
  )}`;
}

export function escapeHtmlRedirectUrl(url: string): string {
  return url.replace(/'/g, "\\'");
}

export function validateSiteUrl(siteUrl: string | undefined | null): string | null {
  if (!siteUrl || typeof siteUrl !== 'string') {
    return '请先在系统管理 > 基础配置中配置正确的网站地址';
  }
  const trimmed = siteUrl.trim();
  if (/[\n\r'"<>]/.test(trimmed)) {
    return '网站地址包含非法字符';
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '网站地址必须使用 http 或 https 协议';
    }
    if (!parsed.hostname) {
      return '网站地址缺少有效的域名';
    }
  } catch {
    return '网站地址格式不合法';
  }
  return null;
}
