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
exports.mjPromptEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let mjPromptEntity = class mjPromptEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '绘画描述词', type: 'text' }),
    __metadata("design:type", String)
], mjPromptEntity.prototype, "prompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '开启状态', default: true }),
    __metadata("design:type", Boolean)
], mjPromptEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否携带左边的参数', default: true }),
    __metadata("design:type", Boolean)
], mjPromptEntity.prototype, "isCarryParams", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '提示词名称', type: 'text' }),
    __metadata("design:type", String)
], mjPromptEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '排序id', default: 100 }),
    __metadata("design:type", Number)
], mjPromptEntity.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '图片比例' }),
    __metadata("design:type", String)
], mjPromptEntity.prototype, "aspect", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '描述', nullable: true }),
    __metadata("design:type", String)
], mjPromptEntity.prototype, "desc", void 0);
mjPromptEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'mj_prompt' })
], mjPromptEntity);
exports.mjPromptEntity = mjPromptEntity;
