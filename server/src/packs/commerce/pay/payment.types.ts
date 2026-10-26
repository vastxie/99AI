/**
 * 支付领域类型定义
 * 本文件是支付相关类型的唯一来源，其他文件通过 import 引用，不允许重复定义
 */

import { OrderEntity } from '../order/order.entity';
import { PackageEntity } from '../package/package.entity';

/** 用户选择的支付方式 */
export enum PaymentMethod {
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
  PAYPAL = 'paypal',
  STRIPE = 'stripe',
}

/** 后端实际支付通道 */
export enum PaymentProvider {
  WECHAT_OFFICIAL = 'wechat_official',
  ALIPAY_OFFICIAL = 'alipay_official',
  PAYPAL_OFFICIAL = 'paypal_official',
  STRIPE_OFFICIAL = 'stripe_official',
  EPAY = 'epay',
}

/** 前端展示方式 */
export type PaymentDisplayType = 'qr_content' | 'redirect_url' | 'html_form' | 'wechat_jsapi';

/** 前端展示统一结构 */
export interface PaymentDisplay {
  type: PaymentDisplayType;
  payload: Record<string, any>;
}

/** 所有支付渠道统一返回结构 */
export interface PaymentCreateResult {
  orderId: string;
  method: PaymentMethod;
  provider: PaymentProvider;
  amount: string;
  currency: 'CNY' | 'USD';
  display: PaymentDisplay;
}

/** Provider 创建支付的上下文 */
export interface PaymentCreateContext {
  userId: number;
  orderId: string;
  order: OrderEntity;
  goods: PackageEntity;
  method: PaymentMethod;
  device: string;
  /** 下单请求的客户端 IP（可信来源解析后）；取不到时由各渠道自行兜底 */
  clientIp?: string;
}

/** Provider Adapter 接口 */
export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  supports(method: PaymentMethod): boolean;
  createPayment(ctx: PaymentCreateContext): Promise<PaymentCreateResult>;
  parseNotify?(ctx: PaymentNotifyContext): Promise<PaymentNotifyResult>;
  queryOrder?(ctx: PaymentQueryContext): Promise<PaymentQueryResult>;
}

/** Provider 回调解析的上下文 */
export interface PaymentNotifyContext {
  rawParams: Record<string, any>;
  headers?: Record<string, string>;
  rawBody?: string | Buffer;
}

export type PaymentNotifyStatus = 'paid' | 'pending' | 'failed' | 'closed' | 'ignored';

/** Provider 回调解析结果 */
export interface PaymentNotifyResult {
  success: boolean;
  status?: PaymentNotifyStatus;
  orderId: string;
  tradeId?: string;
  amount: string;
  currency: string;
  responseText: string;
}

/** Provider 查询的上下文 */
export interface PaymentQueryContext {
  orderId: string;
  /** 下单时保存在订单上的渠道单号（PayPal order id、Stripe Checkout Session id）；按它查询的渠道需要 */
  tradeId?: string | null;
}

/**
 * 查单的四种结论：只有 paid 会改变订单（按已付入账）；pending 仍在支付中、closed 渠道已关闭，都不改状态；
 * unknown 是无法确认（含字段不符、退款或争议、渠道报错），调用方把抛错也当作 unknown
 */
export type PaymentQueryState = 'paid' | 'pending' | 'closed' | 'unknown';

/** Provider 查询结果；paid 时必须带齐 orderId、tradeId、amount、currency（入账前另做运行时校验） */
export interface PaymentQueryResult {
  state: PaymentQueryState;
  orderId: string;
  tradeId?: string;
  amount?: string;
  currency?: string;
}
