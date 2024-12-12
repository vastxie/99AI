import { UserEntity } from './../user/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { OrderEntity } from './order.entity';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { createOrderId } from '@/common/utils';
import { BuyDto } from './dto/buy.dto';
import { Request } from 'express';
import { PayService } from '../pay/pay.service';
import { QueryByOrderIdDto } from './dto/queryByOrder.dto';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { QuerAllOrderDto } from './dto/queryAllOrder.dto';
import { Query } from 'cos-nodejs-sdk-v5';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderEntity: Repository<OrderEntity>,
    @InjectRepository(CramiPackageEntity)
    private readonly cramiPackageEntity: Repository<CramiPackageEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly payService: PayService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /* 购买商品 */
  async buy(params: BuyDto, req: Request) {
    try {
      const { goodsId, count = 1, payType } = params;
      const { id: userId } = req.user;
      if(userId > 1000000){
        throw new HttpException('请先注册账号后购买商品！', HttpStatus.UNAUTHORIZED)
      }
      const order = await this.create(userId, goodsId, count, payType);
      const res = await this.payService.pay(userId, order.orderId, payType);
      return {
        ...res,
        orderId: order.orderId,
        platform: order.payPlatform,
        total: order.total,
      };
    } catch (error) {
      if( error.status === 401){
        throw new HttpException(error.message, HttpStatus.UNAUTHORIZED)
      }
      
      throw new HttpException(error.message || '购买失败!', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询订单状态 */
  async queryByOrderId(req: Request, params: QueryByOrderIdDto) {
    const { id: userId } = req.user;
    const { orderId } = params;
    const order = await this.orderEntity.findOne({ where: { userId, orderId } });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    return order;
  }

  /* 创建工单 */
  async create(userId: number, goodsId: number, count: number, payType: string) {
    const payPlatform = await this.globalConfigService.queryPayType();
    // query goods
    const goods = await this.cramiPackageEntity.findOne({ where: { id: goodsId } });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);
    // assemble order
    const doc = {};
    doc['orderId'] = createOrderId();
    doc['userId'] = userId;
    doc['goodsId'] = goodsId;
    doc['price'] = Number(goods.price);
    doc['count'] = count;
    doc['total'] = Number(goods.price) * count;
    doc['payPlatform'] = payPlatform;
    doc['channel'] = payType;
    // create order
    const order = await this.orderEntity.save(doc);
    console.log('order: ', order);
    return order;
  }

  async query(userId: number, page: number, size: number) {
    // query goods
    return await this.orderEntity.findAndCount({ where: { userId }, order: { id: 'DESC' }, skip: (page - 1) * size, take: size });
  }

  /* 查询所有订单 */
  async queryAllOrder(params: QuerAllOrderDto) {
    const { page, size, userId, platform, status } = params;
    const where = {};
    if (userId) where['userId'] = userId;
    if (platform) where['payPlatform'] = platform;
    if (status) where['status'] = status;
    const [rows, count] = await this.orderEntity.findAndCount({ order: { id: 'DESC' }, where, skip: (page - 1) * size, take: size });
    const userIds = rows.map((item) => item.userId);
    const goodsIds = rows.map((item) => item.goodsId);
    const userInfos = await this.userEntity.find({ where: { id: In(userIds) }, select: ['id', 'username', 'email'] });
    const goodsInfos = await this.cramiPackageEntity.find({ where: { id: In(goodsIds) }, select: ['id', 'name', 'coverImg', 'des'] });
    rows.forEach((item: any) => {
      item.userInfo = userInfos.find((user) => user.id === item.userId);
      item.goodsInfo = goodsInfos.find((goods) => goods.id === item.goodsId);
    });

    const totalPrice = await this.orderEntity
      .createQueryBuilder("order")
      .where("order.status = :status", { status: 1 })
      .select("SUM(order.price)", "total_price")
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
    return await this.orderEntity.delete({ orderId });
  }

  /* 删除未支付订单 */
  async deleteNotPay(){
    return await this.orderEntity.delete({ status: 0 });
  }
}
