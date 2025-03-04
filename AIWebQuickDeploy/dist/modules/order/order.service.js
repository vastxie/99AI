"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const user_entity_1 = require("./../user/user.entity");
const typeorm_1 = require("@nestjs/typeorm");
const common_1 = require("@nestjs/common");
const typeorm_2 = require("typeorm");
const order_entity_1 = require("./order.entity");
const cramiPackage_entity_1 = require("../crami/cramiPackage.entity");
const utils_1 = require("../../common/utils");
const pay_service_1 = require("../pay/pay.service");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
let OrderService = class OrderService {
    constructor(orderEntity, cramiPackageEntity, userEntity, payService, globalConfigService) {
        this.orderEntity = orderEntity;
        this.cramiPackageEntity = cramiPackageEntity;
        this.userEntity = userEntity;
        this.payService = payService;
        this.globalConfigService = globalConfigService;
    }
    async buy(params, req) {
        try {
            const { goodsId, count = 1, payType } = params;
            const { id: userId } = req.user;
            if (userId > 1000000) {
                throw new common_1.HttpException('请先注册账号后购买商品！', common_1.HttpStatus.UNAUTHORIZED);
            }
            const order = await this.create(userId, goodsId, count, payType);
            const res = await this.payService.pay(userId, order.orderId, payType);
            return Object.assign(Object.assign({}, res), { orderId: order.orderId, platform: order.payPlatform, total: order.total });
        }
        catch (error) {
            if (error.status === 401) {
                throw new common_1.HttpException(error.message, common_1.HttpStatus.UNAUTHORIZED);
            }
            throw new common_1.HttpException(error.message || '购买失败!', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async queryByOrderId(req, params) {
        const { id: userId } = req.user;
        const { orderId } = params;
        const order = await this.orderEntity.findOne({ where: { userId, orderId } });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        return order;
    }
    async create(userId, goodsId, count, payType) {
        const payPlatform = await this.globalConfigService.queryPayType();
        const goods = await this.cramiPackageEntity.findOne({ where: { id: goodsId } });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const doc = {};
        doc['orderId'] = (0, utils_1.createOrderId)();
        doc['userId'] = userId;
        doc['goodsId'] = goodsId;
        doc['price'] = Number(goods.price);
        doc['count'] = count;
        doc['total'] = Number(goods.price) * count;
        doc['payPlatform'] = payPlatform;
        doc['channel'] = payType;
        const order = await this.orderEntity.save(doc);
        console.log('order: ', order);
        return order;
    }
    async query(userId, page, size) {
        return await this.orderEntity.findAndCount({ where: { userId }, order: { id: 'DESC' }, skip: (page - 1) * size, take: size });
    }
    async queryAllOrder(params) {
        const { page, size, userId, platform, status } = params;
        const where = {};
        if (userId)
            where['userId'] = userId;
        if (platform)
            where['payPlatform'] = platform;
        if (status)
            where['status'] = status;
        const [rows, count] = await this.orderEntity.findAndCount({ order: { id: 'DESC' }, where, skip: (page - 1) * size, take: size });
        const userIds = rows.map((item) => item.userId);
        const goodsIds = rows.map((item) => item.goodsId);
        const userInfos = await this.userEntity.find({ where: { id: (0, typeorm_2.In)(userIds) }, select: ['id', 'username', 'email'] });
        const goodsInfos = await this.cramiPackageEntity.find({ where: { id: (0, typeorm_2.In)(goodsIds) }, select: ['id', 'name', 'coverImg', 'des'] });
        rows.forEach((item) => {
            item.userInfo = userInfos.find((user) => user.id === item.userId);
            item.goodsInfo = goodsInfos.find((goods) => goods.id === item.goodsId);
        });
        const totalPrice = await this.orderEntity
            .createQueryBuilder("order")
            .where("order.status = :status", { status: 1 })
            .select("SUM(order.price)", "total_price")
            .getRawOne();
        return Object.assign({ rows, count }, totalPrice);
    }
    async deleteOrder(body) {
        const { orderId } = body;
        const o = await this.orderEntity.findOne({ where: { orderId } });
        if (!o) {
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.orderEntity.delete({ orderId });
    }
    async deleteNotPay() {
        return await this.orderEntity.delete({ status: 0 });
    }
};
OrderService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.OrderEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(cramiPackage_entity_1.CramiPackageEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        pay_service_1.PayService,
        globalConfig_service_1.GlobalConfigService])
], OrderService);
exports.OrderService = OrderService;
