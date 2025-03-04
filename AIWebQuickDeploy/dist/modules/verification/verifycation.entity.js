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
exports.VerifycationEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let VerifycationEntity = class VerifycationEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '用户id' }),
    __metadata("design:type", Number)
], VerifycationEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: false, comment: '验证类型' }),
    __metadata("design:type", Number)
], VerifycationEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: false, comment: '验证码' }),
    __metadata("design:type", Number)
], VerifycationEntity.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '过期时间' }),
    __metadata("design:type", Date)
], VerifycationEntity.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, nullable: false, comment: '发送的邮箱' }),
    __metadata("design:type", String)
], VerifycationEntity.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, nullable: false, comment: '是否已经使用了' }),
    __metadata("design:type", Number)
], VerifycationEntity.prototype, "used", void 0);
VerifycationEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'verifycation' })
], VerifycationEntity);
exports.VerifycationEntity = VerifycationEntity;
