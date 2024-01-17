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
exports.GptKeysEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let GptKeysEntity = class GptKeysEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: 'gpt key', length: 255 }),
    __metadata("design:type", String)
], GptKeysEntity.prototype, "key", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用的状态: 0:禁用 1：启用', default: 0 }),
    __metadata("design:type", Number)
], GptKeysEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '绑定的模型是？', default: 'gpt-3.5-turbo' }),
    __metadata("design:type", String)
], GptKeysEntity.prototype, "model", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key的余额', type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", String)
], GptKeysEntity.prototype, "balance", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key的余额类型', default: '', nullable: true }),
    __metadata("design:type", String)
], GptKeysEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key的状态: 1:有效 2:余额耗尽 -1:被封号', default: 1 }),
    __metadata("design:type", Number)
], GptKeysEntity.prototype, "keyStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key的到期时间', nullable: true }),
    __metadata("design:type", Date)
], GptKeysEntity.prototype, "expireTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key权重', default: 1 }),
    __metadata("design:type", Number)
], GptKeysEntity.prototype, "weight", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key的使用次数', default: 0 }),
    __metadata("design:type", Number)
], GptKeysEntity.prototype, "useCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型支持的最大Token', nullable: true }),
    __metadata("design:type", Number)
], GptKeysEntity.prototype, "maxModelTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型设置的最大回复Token', nullable: true }),
    __metadata("design:type", Number)
], GptKeysEntity.prototype, "maxResponseTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前模型的代理地址', nullable: true }),
    __metadata("design:type", String)
], GptKeysEntity.prototype, "openaiProxyUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前模型的超时时间单位ms', nullable: true }),
    __metadata("design:type", Number)
], GptKeysEntity.prototype, "openaiTimeoutMs", void 0);
GptKeysEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'gpt_keys' })
], GptKeysEntity);
exports.GptKeysEntity = GptKeysEntity;
