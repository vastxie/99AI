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
exports.SigninEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let SigninEntity = class SigninEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], SigninEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '签到日期' }),
    __metadata("design:type", String)
], SigninEntity.prototype, "signInDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '签到时间' }),
    __metadata("design:type", Date)
], SigninEntity.prototype, "signInTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], SigninEntity.prototype, "isSigned", void 0);
SigninEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'signin' })
], SigninEntity);
exports.SigninEntity = SigninEntity;
