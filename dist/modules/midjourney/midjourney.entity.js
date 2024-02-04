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
exports.MidjourneyEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let MidjourneyEntity = class MidjourneyEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], MidjourneyEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '任务ID', nullable: true }),
    __metadata("design:type", Number)
], MidjourneyEntity.prototype, "jobId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '额外参数', nullable: true }),
    __metadata("design:type", String)
], MidjourneyEntity.prototype, "extraParam", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '绘画描述词', type: 'text' }),
    __metadata("design:type", String)
], MidjourneyEntity.prototype, "prompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '垫图图片基础地址', nullable: true }),
    __metadata("design:type", String)
], MidjourneyEntity.prototype, "imgUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '垫图图片 + 绘画描述词 + 额外参数 = 完整的prompt', type: 'text' }),
    __metadata("design:type", String)
], MidjourneyEntity.prototype, "fullPrompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前绘制任务的进度', nullable: true }),
    __metadata("design:type", Number)
], MidjourneyEntity.prototype, "progress", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前绘制任务的耗时', nullable: true }),
    __metadata("design:type", Number)
], MidjourneyEntity.prototype, "durationSpent", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前绘制任务的状态' }),
    __metadata("design:type", Number)
], MidjourneyEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'mj绘画的动作、绘图、放大、变换、图生图' }),
    __metadata("design:type", String)
], MidjourneyEntity.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '一组图片的第几张、放大或者变换的时候需要使用', nullable: true }),
    __metadata("design:type", Number)
], MidjourneyEntity.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否推荐0: 默认不推荐 1: 推荐', nullable: true, default: 0 }),
    __metadata("design:type", Number)
], MidjourneyEntity.prototype, "rec", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '对图片操作的', nullable: true }),
    __metadata("design:type", String)
], MidjourneyEntity.prototype, "customId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '绘画的ID每条不一样', nullable: true }),
    __metadata("design:type", String)
], MidjourneyEntity.prototype, "drawId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '图片链接', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], MidjourneyEntity.prototype, "drawUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '图片比例', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], MidjourneyEntity.prototype, "drawRatio", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '扩展参数', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], MidjourneyEntity.prototype, "extend", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否删除 0: 未删除 1: 已删除', nullable: true, default: 0 }),
    __metadata("design:type", Number)
], MidjourneyEntity.prototype, "isDelete", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否存入了图片到配置的储存项 配置了则存储 不配置地址则是源地址', default: true }),
    __metadata("design:type", Boolean)
], MidjourneyEntity.prototype, "isSaveImg", void 0);
MidjourneyEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'midjourney' })
], MidjourneyEntity);
exports.MidjourneyEntity = MidjourneyEntity;
