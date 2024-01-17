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
exports.SalesRecordsEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let SalesRecordsEntity = class SalesRecordsEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '邀请人ID' }),
    __metadata("design:type", Number)
], SalesRecordsEntity.prototype, "inviterUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '被邀请人ID' }),
    __metadata("design:type", Number)
], SalesRecordsEntity.prototype, "inviteeUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '订单ID' }),
    __metadata("design:type", String)
], SalesRecordsEntity.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '订单价格', type: 'decimal', scale: 2, precision: 10 }),
    __metadata("design:type", Number)
], SalesRecordsEntity.prototype, "orderPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '佣金金额', type: 'decimal', scale: 2, precision: 10 }),
    __metadata("design:type", Number)
], SalesRecordsEntity.prototype, "commissionAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '佣金比例', type: 'decimal', scale: 2, precision: 10 }),
    __metadata("design:type", Number)
], SalesRecordsEntity.prototype, "commissionPercentage", void 0);
SalesRecordsEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'sales_records' })
], SalesRecordsEntity);
exports.SalesRecordsEntity = SalesRecordsEntity;
