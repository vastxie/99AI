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
exports.ChatLogEntity = void 0;
const baseEntity_1 = require("../../common/entity/baseEntity");
const typeorm_1 = require("typeorm");
let ChatLogEntity = class ChatLogEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用的模型', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "model", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用类型1: 普通对话 2: 绘图 3: 拓展性对话', nullable: true, default: 1 }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '自定义的模型名称', nullable: true, default: 'AI' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "modelName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'Ip地址', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "curIp", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '询问的问题', type: 'text', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "prompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '附加参数', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "extraParam", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '插件参数', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "pluginParam", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '回答的答案', type: 'text', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "answer", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '提问的token', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "promptTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '回答的token', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "completionTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '总花费的token', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "totalTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'role system user assistant', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前绘制任务的进度', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "progress", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前绘制任务的耗时', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "durationSpent", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前绘制任务的状态', nullable: true, default: 3 }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'mj绘画的动作、绘图、放大、变换、图生图', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '对图片操作的按钮ID', type: 'text', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "customId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '绘画的ID每条不一样', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "drawId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '图片比例', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "drawRatio", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '对话或绘图附带的链接', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "fileInfo", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '对话转语音的链接', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "ttsUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否推荐0: 默认 1: 推荐', nullable: true, default: 0 }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "rec", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '分组ID', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "groupId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用的应用id', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "appId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否删除', default: false }),
    __metadata("design:type", Boolean)
], ChatLogEntity.prototype, "isDelete", void 0);
ChatLogEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'chatlog' })
], ChatLogEntity);
exports.ChatLogEntity = ChatLogEntity;
