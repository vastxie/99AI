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
exports.ChatPreEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let ChatPreEntity = class ChatPreEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '分类ID' }),
    __metadata("design:type", Number)
], ChatPreEntity.prototype, "typeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '预设问题描述词', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatPreEntity.prototype, "prompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '标题名称' }),
    __metadata("design:type", String)
], ChatPreEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '排序ID', default: 100 }),
    __metadata("design:type", Number)
], ChatPreEntity.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '开启状态', default: true }),
    __metadata("design:type", Boolean)
], ChatPreEntity.prototype, "status", void 0);
ChatPreEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'chat_pre' })
], ChatPreEntity);
exports.ChatPreEntity = ChatPreEntity;
