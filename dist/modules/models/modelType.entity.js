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
exports.ModelsTypeEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let ModelsTypeEntity = class ModelsTypeEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: 'key模型类型 1: openai 2: 文心一言  3:清华智谱' }),
    __metadata("design:type", Number)
], ModelsTypeEntity.prototype, "keyType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型名称[给用户看的]' }),
    __metadata("design:type", String)
], ModelsTypeEntity.prototype, "modelName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否开放模型: 0:禁用 1：启用', default: 1 }),
    __metadata("design:type", Boolean)
], ModelsTypeEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '绑定使用的模型是？最终调用的' }),
    __metadata("design:type", String)
], ModelsTypeEntity.prototype, "model", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型温度0-2直接', default: 0.6 }),
    __metadata("design:type", Number)
], ModelsTypeEntity.prototype, "temperature", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型的使用次数', default: 0 }),
    __metadata("design:type", Number)
], ModelsTypeEntity.prototype, "useCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型总计使用的token数量', default: 0 }),
    __metadata("design:type", Number)
], ModelsTypeEntity.prototype, "useToken", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '单词调用扣除的次数', default: 1 }),
    __metadata("design:type", Number)
], ModelsTypeEntity.prototype, "deduct", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '扣除余额类型 1： 普通模型 2：高级模型', default: 1 }),
    __metadata("design:type", Number)
], ModelsTypeEntity.prototype, "deductType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型设置允许用户使用的最大回复Token', default: 2048 }),
    __metadata("design:type", Number)
], ModelsTypeEntity.prototype, "maxResponseTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '限制用户上下文可选最大轮次数', nullable: true }),
    __metadata("design:type", Number)
], ModelsTypeEntity.prototype, "maxRounds", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否为绘画模型Dall-E3', default: 0 }),
    __metadata("design:type", Boolean)
], ModelsTypeEntity.prototype, "isDallE3", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否为特殊模型、可以提供联想翻译、思维导图等特殊操作', default: 0 }),
    __metadata("design:type", Boolean)
], ModelsTypeEntity.prototype, "isUseTool", void 0);
ModelsTypeEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'models_type' })
], ModelsTypeEntity);
exports.ModelsTypeEntity = ModelsTypeEntity;
