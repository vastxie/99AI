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
exports.WhiteListEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let WhiteListEntity = class WhiteListEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: '用户ID' }),
    __metadata("design:type", Number)
], WhiteListEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用次数限制', default: 0 }),
    __metadata("design:type", Number)
], WhiteListEntity.prototype, "count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前用户状态', default: 1 }),
    __metadata("design:type", Number)
], WhiteListEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '已经使用的次数', default: 0 }),
    __metadata("design:type", Number)
], WhiteListEntity.prototype, "useCount", void 0);
WhiteListEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'white_list' })
], WhiteListEntity);
exports.WhiteListEntity = WhiteListEntity;
