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
exports.ViolationLogEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let ViolationLogEntity = class ViolationLogEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '用户id' }),
    __metadata("design:type", Number)
], ViolationLogEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '违规内容', type: 'text' }),
    __metadata("design:type", String)
], ViolationLogEntity.prototype, "content", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '敏感词', type: 'text' }),
    __metadata("design:type", String)
], ViolationLogEntity.prototype, "words", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '违规类型' }),
    __metadata("design:type", String)
], ViolationLogEntity.prototype, "typeCn", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '违规检测失败于哪个平台' }),
    __metadata("design:type", String)
], ViolationLogEntity.prototype, "typeOriginCn", void 0);
ViolationLogEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'violation_log' })
], ViolationLogEntity);
exports.ViolationLogEntity = ViolationLogEntity;
