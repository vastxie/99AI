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
exports.AccountLogEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let AccountLogEntity = class AccountLogEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '会员套餐名称', nullable: true }),
    __metadata("design:type", String)
], AccountLogEntity.prototype, "pkgName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '推荐人ID、返佣用户ID', nullable: true }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "rebateUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '充值套餐ID', nullable: true }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "packageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '会员有效天数', nullable: true }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "memberDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '账户充值类型' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "rechargeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型3对话次数' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "model3Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型4对话次数' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "model4Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'MJ绘画次数' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "drawMjCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐有效期' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "days", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '随机订单uid' }),
    __metadata("design:type", String)
], AccountLogEntity.prototype, "uid", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '扩展字段', nullable: true }),
    __metadata("design:type", String)
], AccountLogEntity.prototype, "extent", void 0);
AccountLogEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'account_log' })
], AccountLogEntity);
exports.AccountLogEntity = AccountLogEntity;
