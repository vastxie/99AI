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
exports.ChatBoxEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let ChatBoxEntity = class ChatBoxEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '分类ID' }),
    __metadata("design:type", Number)
], ChatBoxEntity.prototype, "typeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '应用ID', nullable: true }),
    __metadata("design:type", Number)
], ChatBoxEntity.prototype, "appId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '快速描述词', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatBoxEntity.prototype, "prompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '标题名称' }),
    __metadata("design:type", String)
], ChatBoxEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '排序ID', default: 100 }),
    __metadata("design:type", Number)
], ChatBoxEntity.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '开启状态', default: true }),
    __metadata("design:type", Boolean)
], ChatBoxEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '跳转地址' }),
    __metadata("design:type", String)
], ChatBoxEntity.prototype, "url", void 0);
ChatBoxEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'chat_box' })
], ChatBoxEntity);
exports.ChatBoxEntity = ChatBoxEntity;
