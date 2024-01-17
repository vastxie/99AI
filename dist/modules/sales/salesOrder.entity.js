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
exports.SalesOrderEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let SalesOrderEntity = class SalesOrderEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '申请提现人用户Id' }),
    __metadata("design:type", Number)
], SalesOrderEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '申请提现的金额' }),
    __metadata("design:type", Number)
], SalesOrderEntity.prototype, "withdrawalAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '工单状态' }),
    __metadata("design:type", Number)
], SalesOrderEntity.prototype, "orderStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '审核状态' }),
    __metadata("design:type", Number)
], SalesOrderEntity.prototype, "auditStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '审核人', nullable: true }),
    __metadata("design:type", Number)
], SalesOrderEntity.prototype, "auditUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '打款状态', nullable: true }),
    __metadata("design:type", Number)
], SalesOrderEntity.prototype, "paymentStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '提现渠道 1: 支付宝 2： 微信', nullable: true }),
    __metadata("design:type", Number)
], SalesOrderEntity.prototype, "withdrawalChannels", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '提现联系信息、备注即可', nullable: true }),
    __metadata("design:type", String)
], SalesOrderEntity.prototype, "contactInformation", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '提现备注留言', nullable: true }),
    __metadata("design:type", String)
], SalesOrderEntity.prototype, "remark", void 0);
SalesOrderEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'sales_order' })
], SalesOrderEntity);
exports.SalesOrderEntity = SalesOrderEntity;
