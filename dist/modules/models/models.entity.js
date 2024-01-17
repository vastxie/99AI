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
exports.ModelsEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let ModelsEntity = class ModelsEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: 'key模型类型 1: openai 2: 文心一言  3:清华智谱' }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "keyType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型名称' }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "modelName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型的key' }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "key", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型的secret', default: null }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "secret", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '部分模型的调用token', default: null }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "accessToken", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用的状态: 0:禁用 1：启用', default: 1 }),
    __metadata("design:type", Boolean)
], ModelsEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '绑定的模型是？' }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "model", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key的状态: 1:有效   -1:被封号 -2: 错误的秘钥 -3: 余额使用完了', default: 1 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "keyStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key权重', default: 1 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "keyWeight", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key的使用次数', default: 0 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "useCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key的已经使用的token数量', default: 0 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "useToken", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型支持的最大Token', default: 1000 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "maxModelTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型设置的最大回复Token', default: 4096 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "maxResponseTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前模型的代理地址', nullable: true }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "proxyUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前模型的超时时间单位s', default: 200 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "timeout", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '单词调用扣除的次数', default: 1 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "deduct", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '扣除余额类型 1： 普通模型 2：高级模型', default: 1 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "deductType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '备注信息', nullable: true }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "remark", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '限制用户上下文最大次数', nullable: true }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "maxRounds", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否是绘画key: 0:不是 1：是', default: 0 }),
    __metadata("design:type", Boolean)
], ModelsEntity.prototype, "isDraw", void 0);
ModelsEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'models' })
], ModelsEntity);
exports.ModelsEntity = ModelsEntity;
