import { createOrderId } from '../shared/createOrderId';
import { importDynamic } from '../shared/import-dynamic';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryDeepPartialEntity, Repository } from 'typeorm';
import { PackageEntity } from '../package/package.entity';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { OrderEntity } from '../order/order.entity';
import { AuthIdentityService } from '@/modules/auth/identity/auth-identity.service';
import { UserBalanceService } from '../userBalance/userBalance.service';
import {
  PaymentMethod,
  PaymentProvider,
  PaymentCreateResult,
  PaymentProviderAdapter,
  PaymentCreateContext,
} from './payment.types';
import { isMethodSupportedByChannel } from './payment-channel.config';
import { PaymentConfigService } from './payment-config.service';
import { PayPalService } from './paypal/paypal.service';
import { StripeService } from './stripe/stripe.service';
import { AlipayService } from './alipay/alipay.service';
import {
  buildPaymentCallbackUrls,
  validateSiteUrl,
  PaymentCallbackUrls,
} from './payment-callback-url.helper';
import { EpayProvider } from './providers/epay.provider';
import { AlipayOfficialProvider } from './providers/alipay-official.provider';
import { StripeOfficialProvider } from './providers/stripe-official.provider';
import { PaypalOfficialProvider } from './providers/paypal-official.provider';
import { WechatOfficialProvider } from './providers/wechat-official.provider';

/** 管理端支付连通性测试的返回形态 */
export interface PaymentTestResult {
  success: boolean;
  message: string;
  timestamp: string;
  verificationLevel?: string | null;
  channel?: string;
  thirdPartyCleaned?: boolean;
  detail?: string;
}

/** 订单状态更新值：tradeId 为可空列，实体属性未标 | null（联合类型会破坏 TypeORM 列元数据），写 null 时用本类型描述 */
type OrderWritePatch = Omit<Partial<OrderEntity>, 'tradeId'> & { tradeId?: string | null };

@Injectable()
export class PayService implements OnModuleInit {
  private providers = new Map<PaymentProvider, PaymentProviderAdapter>();

  constructor(
    @InjectRepository(PackageEntity)
    private readonly packageEntity: Repository<PackageEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderEntity: Repository<OrderEntity>,
    private readonly dataSource: DataSource,
    private readonly userBalanceService: UserBalanceService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly paymentConfigService: PaymentConfigService,
    private readonly authIdentityService: AuthIdentityService,
    public readonly payPalService: PayPalService,
    public readonly stripeService: StripeService,
    public readonly alipayService: AlipayService,
  ) {}

  private WxPay: unknown;

  private resolveModuleDefault(moduleValue: unknown): unknown {
    if (moduleValue && typeof moduleValue === 'object' && 'default' in moduleValue) {
      return moduleValue.default || moduleValue;
    }
    return moduleValue;
  }

  private async getPaymentUrls(): Promise<PaymentCallbackUrls> {
    const siteUrl = await this.globalConfigService.getConfigs(['siteUrl']);
    const url = siteUrl as string;
    const error = validateSiteUrl(url);
    if (error) {
      throw new HttpException(error, HttpStatus.BAD_REQUEST);
    }
    return buildPaymentCallbackUrls(url);
  }

  async onModuleInit() {
    const wpay = await importDynamic('wechatpay-node-v3');
    this.WxPay = this.resolveModuleDefault(wpay);

    // 注册所有 Provider
    const providerInstances: PaymentProviderAdapter[] = [
      new EpayProvider(this.globalConfigService, () => this.getPaymentUrls()),
      new AlipayOfficialProvider(this.alipayService, () => this.getPaymentUrls()),
      new StripeOfficialProvider(this.stripeService, this.orderEntity),
      new PaypalOfficialProvider(this.payPalService, this.orderEntity),
      new WechatOfficialProvider(
        this.globalConfigService,
        this.authIdentityService,
        () => this.getPaymentUrls(),
        this.WxPay,
      ),
    ];
    for (const p of providerInstances) {
      this.providers.set(p.provider, p);
    }
  }

  /** 获取 Provider 实例（供 PaymentCallbackService / PaymentPollingService 使用） */
  getProvider(provider: PaymentProvider): PaymentProviderAdapter | undefined {
    return this.providers.get(provider);
  }

  private getPackageDisplayName(pkg: PackageEntity) {
    return [pkg.planName, pkg.variantName].filter(Boolean).join(' ').trim() || pkg.name || '';
  }

  formatMoney(value: any): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return null;
    }
    return amount.toFixed(2);
  }

  getExpectedUsdAmount(order: OrderEntity, goods: PackageEntity): string {
    const snapshotAmount = this.getOrderPaymentSnapshotAmount(order, 'USD');
    if (snapshotAmount) {
      return snapshotAmount;
    }

    let usdAmount = goods.priceUsd;
    if (!usdAmount || usdAmount <= 0) {
      usdAmount = Number((order.total / 7.3).toFixed(2));
    } else {
      usdAmount = Number((usdAmount * order.count).toFixed(2));
    }
    return usdAmount.toFixed(2);
  }

  getOrderPaymentSnapshotAmount(order: OrderEntity, currency: string): string | null {
    const snapshotCurrency = String((order as any).payCurrencySnapshot || '').toUpperCase();
    if (snapshotCurrency !== currency.toUpperCase()) {
      return null;
    }

    return this.formatMoney((order as any).payAmountSnapshot);
  }

  getExpectedAmountForCurrency(
    order: OrderEntity,
    goods: PackageEntity | null,
    currency: string,
  ): string | null {
    const normalizedCurrency = String(currency || 'CNY').toUpperCase();
    const snapshotAmount = this.getOrderPaymentSnapshotAmount(order, normalizedCurrency);
    if (snapshotAmount) {
      return snapshotAmount;
    }

    if (normalizedCurrency === 'USD') {
      if (!goods) return null;
      return this.getExpectedUsdAmount(order, goods);
    }

    return this.formatMoney(order.total);
  }

  private async assertTradeIdAvailable(tradeId: string, orderId: string) {
    if (!tradeId) {
      return;
    }

    const duplicatedTradeOrder = await this.orderEntity.findOne({
      where: { tradeId },
    });

    if (duplicatedTradeOrder && duplicatedTradeOrder.orderId !== orderId) {
      throw new HttpException('支付交易号重复，疑似异常回调', HttpStatus.BAD_REQUEST);
    }
  }

  /** 只在回调带了交易号时才写 tradeId：不清空下单时保存的渠道单号（PayPal 订单号、Stripe Session ID） */
  async markOrderFailed(orderId: string, status = 2, tradeId?: string) {
    const patch: OrderWritePatch = { status, paydAt: new Date(), ...(tradeId ? { tradeId } : {}) };
    // 可空列写 null：实体属性未标 | null，在仓库边界收口
    await this.orderEntity.update(
      { orderId, status: 0 },
      patch as QueryDeepPartialEntity<OrderEntity>,
    );
  }

  async processSuccessfulOrder(
    orderId: string,
    options: { tradeId?: string; paidAt?: Date } = {},
  ): Promise<{ success: boolean; alreadyProcessed: boolean }> {
    const { tradeId, paidAt = new Date() } = options;

    if (tradeId) {
      await this.assertTradeIdAvailable(tradeId, orderId);
    }

    try {
      const result = await this.dataSource.transaction(async manager => {
        const orderRepository = manager.getRepository(OrderEntity);
        const order = await orderRepository.findOne({
          where: { orderId },
        });

        if (!order) {
          throw new HttpException('订单不存在', HttpStatus.BAD_REQUEST);
        }

        if (order.status === 1) {
          return { success: true, alreadyProcessed: true };
        }
        if (order.status !== 0) {
          throw new HttpException(
            `订单当前状态不允许自动发货: status=${order.status}`,
            HttpStatus.CONFLICT,
          );
        }

        const paidPatch: OrderWritePatch = {
          status: 1,
          tradeId: tradeId || order.tradeId || null,
          paydAt: paidAt,
        };
        // 可空列写 null：实体属性未标 | null，在仓库边界收口
        const updateResult = await orderRepository.update(
          { orderId, status: 0 },
          paidPatch as QueryDeepPartialEntity<OrderEntity>,
        );

        if (updateResult.affected !== 1) {
          // 加锁读（当前读）：可重复读隔离下普通读只能看到本事务开始时的快照（仍是 0），
          // 竞争失败方要读到对方已提交的状态 1 才能报「已处理」而不是冲突
          const latestOrder = await orderRepository.findOne({
            where: { orderId },
            lock: { mode: 'pessimistic_write' },
          });
          if (latestOrder?.status === 1) {
            return { success: true, alreadyProcessed: true };
          }
          throw new HttpException('订单状态已变化，未完成发货', HttpStatus.CONFLICT);
        }

        await this.userBalanceService.addBalanceToOrder(
          {
            ...order,
            tradeId: tradeId || order.tradeId,
            paydAt: paidAt,
            status: 1,
          },
          manager,
        );

        Logger.log('订单发货成功', 'PayService');

        return { success: true, alreadyProcessed: false };
      });

      if (result.alreadyProcessed) {
        Logger.debug('订单已处理，跳过重复发货', 'PayService');
      }

      return result;
    } catch (error) {
      Logger.error('订单发货失败', getErrorStack(error), 'PayService');
      throw error;
    }
  }

  /* 统一支付创建入口 */
  async createPayment(
    userId: number,
    orderId: string,
    method: PaymentMethod | string,
    device: string,
    channel: PaymentProvider,
    clientIp?: string,
  ): Promise<PaymentCreateResult> {
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);

    // 订单的商品 ID 列可空：没有时按套餐不存在处理，不拿空值查询
    const goods = order.goodsId
      ? await this.packageEntity.findOne({ where: { id: order.goodsId } })
      : null;
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);

    const normalizedMethod = typeof method === 'string' ? method.toLowerCase() : method;

    if (!isMethodSupportedByChannel(channel, normalizedMethod as PaymentMethod)) {
      throw new HttpException(
        `${channel} 渠道不支持 ${normalizedMethod} 支付方式!`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.orderEntity.update({ orderId }, { payPlatform: channel, channel: method });

    const adapter = this.providers.get(channel);
    if (!adapter) {
      throw new HttpException(`不支持的支付渠道: ${channel}`, HttpStatus.BAD_REQUEST);
    }

    const ctx: PaymentCreateContext = {
      userId,
      orderId,
      order,
      goods,
      method: normalizedMethod as PaymentMethod,
      device,
      clientIp,
    };

    try {
      return await adapter.createPayment(ctx);
    } catch (error) {
      Logger.error('支付请求失败', getErrorStack(error), 'PayService');
      throw new HttpException(error.message || '支付请求失败!', HttpStatus.BAD_REQUEST);
    }
  }

  /* 测试支付渠道配置 */
  async testPayment(userId: number, method: string, clientIp?: string): Promise<PaymentTestResult> {
    const timestamp = new Date().toISOString();

    // 1. 查找最便宜的已启用套餐（排除 0 元套餐，避免网关拒绝）
    const pkg = await this.packageEntity
      .createQueryBuilder('pkg')
      .where('pkg.status = :status', { status: 1 })
      .andWhere('pkg.price > 0')
      .orderBy('pkg.price', 'ASC')
      .getOne();
    if (!pkg) {
      return { success: false, message: '请先创建至少一个价格大于 0 的已启用套餐', timestamp };
    }

    // 2. 创建测试订单
    const testOrderId = `TEST-${createOrderId()}`;
    try {
      const order = this.orderEntity.create({
        orderId: testOrderId,
        userId,
        goodsId: pkg.id,
        count: 1,
        price: pkg.price,
        total: pkg.price,
        payCurrencySnapshot: 'CNY',
        payAmountSnapshot: pkg.price,
        status: 0,
        channel: method,
        creditsSnapshot: pkg.credits || 0,
        daysSnapshot: pkg.days || 0,
        pkgNameSnapshot: this.getPackageDisplayName(pkg),
        planKeySnapshot: pkg.planKey || '',
        planNameSnapshot: pkg.planName || '',
        variantNameSnapshot: pkg.variantName || '',
        planTypeSnapshot: pkg.planType || '',
        weightSnapshot: pkg.weight || 0,
        billingCycleSnapshot: pkg.billingCycle || '',
        billingCycleCountSnapshot: pkg.billingCycleCount || 1,
        featureTextSnapshot: pkg.featureText || '',
      });
      await this.orderEntity.save(order);
    } catch (error) {
      Logger.error('测试订单创建失败', getErrorStack(error), 'PayService');
      return { success: false, message: `测试订单创建失败: ${error.message}`, timestamp };
    }

    // 3. 调用真实支付创建
    let result: any;
    let channel: string | undefined;
    try {
      const resolved = await this.paymentConfigService.resolveProvider(method);
      channel = resolved.provider;
      result = await this.createPayment(
        userId,
        testOrderId,
        method,
        'pc',
        resolved.provider,
        clientIp,
      );
    } catch (error) {
      await this.cleanupTestOrder(testOrderId);
      return {
        success: false,
        message: error.message || '支付请求创建失败',
        verificationLevel: null,
        channel: channel || '未确定',
        detail: `渠道: ${channel || '未确定'}, 方式: ${method}`,
        timestamp,
      };
    }

    // 4. 清理第三方平台测试单（通过订单 tradeId，不依赖 display.payload）
    let thirdPartyCleaned = false;
    const cleanups: string[] = [];
    try {
      const updatedTestOrder = await this.orderEntity.findOne({ where: { orderId: testOrderId } });
      const tradeId = updatedTestOrder?.tradeId;
      if (channel === 'paypal_official' && tradeId) {
        await this.payPalService.voidOrder(tradeId);
        cleanups.push('PayPal 订单已作废');
        thirdPartyCleaned = true;
      }
      if (channel === 'stripe_official' && tradeId) {
        await this.stripeService.expireTestSession(tradeId);
        cleanups.push('Stripe Session 已过期');
        thirdPartyCleaned = true;
      }
    } catch (e) {
      cleanups.push(`第三方清理失败: ${e.message}`);
      Logger.warn('测试订单第三方清理失败', 'PayService');
    }

    // 5. 清理本地测试订单
    await this.cleanupTestOrder(testOrderId);

    const hasRedirect =
      result?.display?.type === 'redirect_url' || result?.display?.type === 'html_form';
    const hasQrCode = result?.display?.type === 'qr_content';
    const verificationLevel = hasRedirect || hasQrCode ? '网关请求通过' : 'URL 生成通过';

    return {
      success: true,
      message: '支付请求创建成功',
      verificationLevel,
      channel,
      thirdPartyCleaned,
      detail: [
        `渠道: ${channel}, 方式: ${method}`,
        `测试金额: ¥${Number(pkg.price).toFixed(2)}`,
        cleanups.length > 0 ? cleanups.join('; ') : null,
      ]
        .filter(Boolean)
        .join(' | '),
      timestamp,
    };
  }

  /* 清理测试订单 */
  private async cleanupTestOrder(orderId: string) {
    try {
      await this.orderEntity.delete({ orderId });
      Logger.log('已清理测试订单', 'PayService');
    } catch (e) {
      Logger.warn('清理测试订单失败', 'PayService');
    }
  }

  /* 完整支付测试 - 创建真实订单 */
  async createFullPaymentTest(
    userId: number,
    method: string,
    packageId?: number,
    clientIp?: string,
  ) {
    // 1. 校验支付方式并解析渠道
    const resolved = await this.paymentConfigService.resolveProvider(method);

    // 2. 查找套餐
    let pkg: PackageEntity | null;
    if (packageId) {
      pkg = await this.packageEntity.findOne({ where: { id: packageId, status: 1 } });
      if (!pkg) {
        throw new HttpException('指定套餐不存在或未启用', HttpStatus.BAD_REQUEST);
      }
      if (Number(pkg.price) <= 0) {
        throw new HttpException(
          '完整支付测试只能使用价格大于 0 的已启用套餐',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else {
      pkg = await this.packageEntity
        .createQueryBuilder('pkg')
        .where('pkg.status = :status', { status: 1 })
        .andWhere('pkg.price > 0')
        .orderBy('pkg.price', 'ASC')
        .getOne();
      if (!pkg) {
        throw new HttpException('没有可用的付费套餐', HttpStatus.BAD_REQUEST);
      }
    }

    // 3. 创建正常订单（非 TEST- 前缀）
    const orderId = createOrderId();
    const order = this.orderEntity.create({
      orderId,
      userId,
      goodsId: pkg.id,
      count: 1,
      price: pkg.price,
      total: pkg.price,
      payCurrencySnapshot: 'CNY',
      payAmountSnapshot: pkg.price,
      status: 0,
      channel: method,
      creditsSnapshot: pkg.credits || 0,
      daysSnapshot: pkg.days || 0,
      pkgNameSnapshot: this.getPackageDisplayName(pkg),
      planKeySnapshot: pkg.planKey || '',
      planNameSnapshot: pkg.planName || '',
      variantNameSnapshot: pkg.variantName || '',
      planTypeSnapshot: pkg.planType || '',
      weightSnapshot: pkg.weight || 0,
      billingCycleSnapshot: pkg.billingCycle || '',
      billingCycleCountSnapshot: pkg.billingCycleCount || 1,
      featureTextSnapshot: pkg.featureText || '',
    });
    await this.orderEntity.save(order);

    // 4. 调用真实支付创建
    let result: any;
    let channel = resolved.provider;
    try {
      result = await this.createPayment(userId, orderId, method, 'pc', resolved.provider, clientIp);
    } catch (error) {
      // 支付请求创建失败，将已保存的订单标记为失败，避免遗留未支付订单
      try {
        await this.orderEntity.update({ orderId }, { status: 2 });
      } catch {}
      throw new HttpException(`支付请求创建失败: ${error.message}`, HttpStatus.BAD_REQUEST);
    }

    return {
      orderId,
      packageId: pkg.id,
      packageName: pkg.name,
      price: Number(pkg.price),
      method,
      channel,
      paymentData: result,
    };
  }

  /* 完整支付测试 - 查询测试状态 */
  async queryFullPaymentTest(userId: number, orderId: string) {
    const order = await this.orderEntity.findOne({ where: { orderId, userId } });
    if (!order) {
      throw new HttpException('订单不存在或不属于当前用户', HttpStatus.BAD_REQUEST);
    }

    let step: string;
    let paid = false;
    let granted = false;
    let message: string;

    if (order.status === 0) {
      step = 'waiting_payment';
      message = '等待支付';
    } else if (order.status === 1) {
      paid = true;
      // processSuccessfulOrder 原子完成支付+发放，status=1 即已发放
      // 额外确认权益到账
      const userBalance = await this.userBalanceService.queryUserBalance(userId);
      if (userBalance && (userBalance.packageId === order.goodsId || order.daysSnapshot <= 0)) {
        granted = true;
        step = 'granted';
        message = '支付成功，权益已到账';
      } else {
        granted = true;
        step = 'granted';
        message = '支付成功，权益已发放';
      }
    } else if (order.status === 2) {
      step = 'failed';
      message = '支付失败';
    } else if (order.status === 3) {
      step = 'failed';
      message = '支付超时';
    } else {
      step = 'waiting_payment';
      message = '未知状态';
    }

    return { orderId, status: order.status, paid, granted, step, message };
  }
}
