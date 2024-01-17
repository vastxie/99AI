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
exports.CramiPackageEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let CramiPackageEntity = class CramiPackageEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: '套餐名称' }),
    __metadata("design:type", String)
], CramiPackageEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐介绍详细信息' }),
    __metadata("design:type", String)
], CramiPackageEntity.prototype, "des", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐封面图片', nullable: true }),
    __metadata("design:type", String)
], CramiPackageEntity.prototype, "coverImg", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐价格￥', type: 'decimal', scale: 2, precision: 10 }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐排序、数字越大越靠前', default: 100 }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐是否启用中 0：禁用 1：启用', default: 1 }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐权重、数字越大表示套餐等级越高越贵', unique: true }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "weight", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密有效期天数、从使用的时候开始计算，设为-1则不限时间', default: 0 }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "days", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐包含的模型3数量', default: 0, nullable: true }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "model3Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐包含的模型4数量', default: 0, nullable: true }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "model4Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐包含的MJ绘画数量', default: 0, nullable: true }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "drawMjCount", void 0);
CramiPackageEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'crami_package' })
], CramiPackageEntity);
exports.CramiPackageEntity = CramiPackageEntity;
