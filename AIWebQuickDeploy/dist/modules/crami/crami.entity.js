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
exports.CramiEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let CramiEntity = class CramiEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: '存储卡密CDK编码', length: 50 }),
    __metadata("design:type", String)
], CramiEntity.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密CDK类型：1： 普通 | 2： 单人可使用一次 ', default: 1 }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "cramiType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密CDK类型： 默认套餐类型 | 不填就是自定义类型', nullable: true }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "packageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密CDK状态，如已使用、未使用等', default: 0 }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密使用账户用户ID信息', nullable: true }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "useId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密有效期天数、从生成创建的时候开始计算，设为0则不限时间', default: 0 }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "days", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密模型3额度', nullable: true }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "model3Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密模型4额度', nullable: true }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "model4Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密MJ绘画额度', nullable: true }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "drawMjCount", void 0);
CramiEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'crami' })
], CramiEntity);
exports.CramiEntity = CramiEntity;
