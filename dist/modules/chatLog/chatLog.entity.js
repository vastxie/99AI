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
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let ChatLogEntity = class ChatLogEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用类型', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '询问的问题', type: 'text', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "prompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '回答的答案', type: 'text', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "answer", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '本次问题的token', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "promptTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '本次回答的token', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "completionTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '本次总花费的token', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "totalTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '本次使用的模型', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "model", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '本次访问的Ip地址', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "curIp", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否推荐0: 默认 1: 推荐', nullable: true, default: 0 }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "rec", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '扩展参数', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "extend", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'mj绘画列表携带的一级id用于图片变换或者放大', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "message_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '一组图片的第几张、放大或者变换的时候需要使用', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'mj绘画的动作、放大或者变换、或者全部重新绘制', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否是组图，这种图才可以指定放大', default: 0 }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "group", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '放大图片的Id记录', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "upscaleId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '变换图片的Id记录', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "variationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '图片信息的string', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "fileInfo", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'role system user assistant', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '对话分组ID', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "groupId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '序列化的本次会话参数', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "conversationOptions", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '序列化的本次提交参数', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "requestOptions", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否删除', default: false }),
    __metadata("design:type", Boolean)
], ChatLogEntity.prototype, "isDelete", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用的应用id', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "appId", void 0);
ChatLogEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'chatlog' })
], ChatLogEntity);
exports.ChatLogEntity = ChatLogEntity;
