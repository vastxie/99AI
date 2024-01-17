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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesUsersEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let SalesUsersEntity = class SalesUsersEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '分销人用户Id' }),
    __metadata("design:type", Number)
], SalesUsersEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '分销人的提成比例' }),
    __metadata("design:type", Number)
], SalesUsersEntity.prototype, "performanceRatio", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '分销人的自定义称号等级', nullable: true }),
    __metadata("design:type", String)
], SalesUsersEntity.prototype, "salesOutletName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '分销人账户总金额', type: 'decimal', scale: 2, precision: 10, default: 0 }),
    __metadata("design:type", Number)
], SalesUsersEntity.prototype, "totalAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '分销人账户已经提现金额', type: 'decimal', scale: 2, precision: 10, default: 0 }),
    __metadata("design:type", Number)
], SalesUsersEntity.prototype, "withdrawalAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '分销人账户可提现金额', type: 'decimal', scale: 2, precision: 10, default: 0 }),
    __metadata("design:type", Number)
], SalesUsersEntity.prototype, "distributionBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '分销人账户正在提现的金额', type: 'decimal', scale: 2, precision: 10, default: 0 }),
    __metadata("design:type", Number)
], SalesUsersEntity.prototype, "drawMoneyIn", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '累计成功提成的订单量', default: 0 }),
    __metadata("design:type", Number)
], SalesUsersEntity.prototype, "orderCount", void 0);
SalesUsersEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'sales_users' })
], SalesUsersEntity);
exports.SalesUsersEntity = SalesUsersEntity;
