import { requireRegisteredUser } from '@/common/auth/request-user';
import { getClientIp } from '@/common/utils/getClientIp';
import { createOrderId } from '../shared/createOrderId';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { LessThan, Repository } from 'typeorm';
import { PackageEntity } from '../package/package.entity';
import { PayService } from '../pay/pay.service';
import { PaymentPollingService } from '../pay/payment-polling.service';
import { PaymentConfigService } from '../pay/payment-config.service';
import { PaymentProvider } from '../pay/payment.types';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { BuyDto } from './dto/buy.dto';
import { QueryAllOrderDto } from './dto/queryAllOrder.dto';
import { QueryByOrderIdDto } from './dto/queryByOrder.dto';
import { OrderEntity } from './order.entity';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderEntity: Repository<OrderEntity>,
    @InjectRepository(PackageEntity)
    private readonly packageEntity: Repository<PackageEntity>,
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceEntity: Repository<UserBalanceEntity>,
    private readonly payService: PayService,
    private readonly pollingService: PaymentPollingService,
    private readonly paymentConfigService: PaymentConfigService,
  ) {}

  private getPackageDisplayName(goods: PackageEntity) {
    return [goods.planName, goods.variantName].filter(Boolean).join(' ').trim() || goods.name;
  }

  private isActiveMembership(balance: Pick<UserBalanceEntity, 'packageId' | 'expirationTime'>) {
    if (!balance?.packageId || !balance.expirationTime) return false;
    return new Date(balance.expirationTime) > new Date();
  }

  private async assertCanBuyMembershipPackage(userId: number, goods: PackageEntity) {
    if (goods.planType !== 'membership' || Number(goods.days || 0) <= 0) {
      return;
    }

    const userBalance = await this.userBalanceEntity.findOne({
      where: { userId },
      select: { packageId: true, expirationTime: true },
    });
    if (!userBalance || !this.isActiveMembership(userBalance)) {
      return;
    }

    const currentPackage = await this.packageEntity.findOne({
      where: { id: userBalance.packageId },
      select: { id: true, weight: true },
    });
    if (currentPackage && Number(currentPackage.weight || 0) > Number(goods.weight || 0)) {
      throw new HttpException('当前会员等级更高，不能购买低等级会员套餐', HttpStatus.BAD_REQUEST);
    }
  }

  private normalizePurchaseCount(goods: PackageEntity, count?: number) {
    const actualCount = count ?? 1;
    if (goods.planType === 'membership' && actualCount !== 1) {
      throw new HttpException('会员套餐不支持批量购买，请单独购买', HttpStatus.BAD_REQUEST);
    }
    return actualCount;
  }

  async buy(params: BuyDto, req: Request) {
    try {
      const { goodsId, count = 1, method, device = 'pc' } = params;
      // 访客由路由上的 RegisteredUserAuthGuard 以 403 拦下，这里只会是注册用户的数字 id
      const { id: userId } = requireRegisteredUser(req);

      // 解析支付渠道
      const { provider } = await this.paymentConfigService.resolveProvider(method);

      // 创建订单
      const order = await this.createOrder(userId, goodsId, count, method, provider);

      let res: any;
      try {
        // 调用支付创建（传入预解析的 provider）
        res = await this.payService.createPayment(
          userId,
          order.orderId,
          method as any,
          device,
          provider,
          getClientIp(req),
        );
      } catch (error) {
        await this.payService.markOrderFailed(order.orderId, 2);
        throw error;
      }

      // 获取可用的支付方式列表
      const availableMethods = await this.paymentConfigService.getAvailablePaymentMethods();

      const result = {
        ...res,
        orderId: order.orderId,
        paymentMethod: method,
        total: order.total,
        availableMethods,
      };

      // 统一轮询策略判断
      const shouldPoll = await this.paymentConfigService.shouldEnablePolling(provider);
      if (shouldPoll) {
        Logger.log('启动订单轮询', 'OrderService');
        this.pollingService.startPolling(order.orderId);
      } else {
        Logger.log('跳过订单轮询', 'OrderService');
      }

      return result;
    } catch (error) {
      if (error.status) {
        throw new HttpException(error.message || '购买失败', error.status);
      }

      throw new HttpException(
        error.message || '购买失败，请稍后重试或联系客服',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 查询订单状态 */
  async queryByOrderId(req: Request, params: QueryByOrderIdDto) {
    const { id: userId } = requireRegisteredUser(req);
    const { orderId } = params;

    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) {
      throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    }

    return order;
  }

  /* 创建订单 */
  async createOrder(
    userId: number,
    goodsId: number,
    count: number,
    paymentMethod: string,
    provider: PaymentProvider,
  ) {
    const goods = await this.packageEntity.findOne({
      where: { id: goodsId, status: 1 },
    });
    if (!goods) throw new HttpException('套餐不存在或已下架!', HttpStatus.BAD_REQUEST);
    const actualCount = this.normalizePurchaseCount(goods, count);

    const unitPrice = Number(goods.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new HttpException('当前套餐暂不支持购买，请联系管理员处理', HttpStatus.BAD_REQUEST);
    }
    await this.assertCanBuyMembershipPackage(userId, goods);

    const total = Number((unitPrice * actualCount).toFixed(2));
    const orderData = {
      orderId: createOrderId(),
      userId,
      goodsId,
      price: unitPrice,
      count: actualCount,
      total,
      payCurrencySnapshot: 'CNY',
      payAmountSnapshot: total,
      payPlatform: provider,
      channel: paymentMethod,
      creditsSnapshot: goods.credits,
      daysSnapshot: goods.days,
      pkgNameSnapshot: this.getPackageDisplayName(goods),
      planKeySnapshot: goods.planKey || '',
      planNameSnapshot: goods.planName || '',
      variantNameSnapshot: goods.variantName || '',
      planTypeSnapshot: goods.planType || '',
      weightSnapshot: goods.weight || 0,
      billingCycleSnapshot: goods.billingCycle || '',
      billingCycleCountSnapshot: goods.billingCycleCount || 1,
      featureTextSnapshot: goods.featureText || '',
    };

    const order = await this.orderEntity.save(orderData);
    Logger.debug('订单已创建', 'OrderService');
    return order;
  }

  /* 查询所有订单 */
  async queryAllOrder(params: QueryAllOrderDto) {
    const { page, size, userId, platform, status } = params;
    const currentPage = Number(page) || 1;
    const pageSize = Number(size) || 15;

    let queryBuilder = this.orderEntity
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.package', 'goods')
      .orderBy('order.id', 'DESC')
      .skip((currentPage - 1) * pageSize)
      .take(pageSize);

    if (userId) {
      queryBuilder = queryBuilder.andWhere('order.userId = :userId', { userId });
    }
    if (platform) {
      queryBuilder = queryBuilder.andWhere('order.payPlatform = :platform', { platform });
    }
    if (status !== undefined && status !== null) {
      queryBuilder = queryBuilder.andWhere('order.status = :status', { status });
    }

    const [orders, count] = await queryBuilder.getManyAndCount();

    const rows = orders.map((item: any) => {
      const { user, package: goods, ...orderFields } = item;
      return {
        ...orderFields,
        userInfo: user
          ? {
              id: user.id,
              username: user.username,
              email: user.email,
            }
          : null,
        goodsInfo: goods
          ? {
              id: goods.id,
              name: goods.name,
              coverImg: goods.coverImg,
              des: goods.des,
            }
          : null,
      };
    });

    let totalPriceBuilder = this.orderEntity
      .createQueryBuilder('order')
      .where('order.status = :paidStatus', { paidStatus: 1 });

    if (userId) {
      totalPriceBuilder = totalPriceBuilder.andWhere('order.userId = :userId', { userId });
    }
    if (platform) {
      totalPriceBuilder = totalPriceBuilder.andWhere('order.payPlatform = :platform', { platform });
    }
    if (status !== undefined && status !== null) {
      totalPriceBuilder = totalPriceBuilder.andWhere('order.status = :status', { status });
    }

    const totalPrice = await totalPriceBuilder
      .select('SUM(order.total)', 'total_price')
      .getRawOne();

    return { rows, count, ...totalPrice };
  }

  /* 删除订单 */
  async deleteOrder(body: QueryByOrderIdDto) {
    const { orderId } = body;
    const o = await this.orderEntity.findOne({ where: { orderId } });
    if (!o) {
      throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    }
    if (o.status === 1) {
      throw new HttpException('已支付订单不能物理删除，请保留资金审计记录', HttpStatus.BAD_REQUEST);
    }
    return await this.orderEntity.delete({ orderId });
  }

  /* 删除未支付订单 */
  async deleteNotPay() {
    const expiredBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return await this.orderEntity.delete({ status: 0, createdAt: LessThan(expiredBefore) });
  }
}
