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
exports.OrderController = void 0;
const superAuth_guard_1 = require("./../../common/auth/superAuth.guard");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const order_service_1 = require("./order.service");
const buy_dto_1 = require("./dto/buy.dto");
const queryByOrder_dto_1 = require("./dto/queryByOrder.dto");
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const queryAllOrder_dto_1 = require("./dto/queryAllOrder.dto");
let OrderController = class OrderController {
    constructor(orderService) {
        this.orderService = orderService;
    }
    async buy(body, req) {
        return this.orderService.buy(body, req);
    }
    async queryByOrderId(req, query) {
        const { id: userId } = req.user;
        return this.orderService.queryByOrderId(req, query);
    }
    async queryAllOrder(query) {
        return this.orderService.queryAllOrder(query);
    }
    async deleteOrder(body) {
        return this.orderService.deleteOrder(body);
    }
    async deleteNotPay() {
        return this.orderService.deleteNotPay();
    }
};
__decorate([
    (0, common_1.Post)('buy'),
    (0, swagger_1.ApiOperation)({ summary: '购买商品' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [buy_dto_1.BuyDto, Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "buy", null);
__decorate([
    (0, common_1.Get)('queryByOrderId'),
    (0, swagger_1.ApiOperation)({ summary: '查询订单' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, queryByOrder_dto_1.QueryByOrderIdDto]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "queryByOrderId", null);
__decorate([
    (0, common_1.Get)('queryAll'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有订单' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryAllOrder_dto_1.QuerAllOrderDto]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "queryAllOrder", null);
__decorate([
    (0, common_1.Post)('delete'),
    (0, swagger_1.ApiOperation)({ summary: '删除订单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryByOrder_dto_1.QueryByOrderIdDto]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "deleteOrder", null);
__decorate([
    (0, common_1.Post)('deleteNotPay'),
    (0, swagger_1.ApiOperation)({ summary: '删除未支付订单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "deleteNotPay", null);
OrderController = __decorate([
    (0, swagger_1.ApiTags)('Order'),
    (0, common_1.Controller)('order'),
    __metadata("design:paramtypes", [order_service_1.OrderService])
], OrderController);
exports.OrderController = OrderController;
