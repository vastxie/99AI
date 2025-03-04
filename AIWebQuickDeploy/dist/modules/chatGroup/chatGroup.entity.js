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
exports.ChatGroupEntity = void 0;
const baseEntity_1 = require("../../common/entity/baseEntity");
const typeorm_1 = require("typeorm");
let ChatGroupEntity = class ChatGroupEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], ChatGroupEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否置顶聊天', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], ChatGroupEntity.prototype, "isSticky", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '分组名称', nullable: true }),
    __metadata("design:type", String)
], ChatGroupEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '应用ID', nullable: true }),
    __metadata("design:type", Number)
], ChatGroupEntity.prototype, "appId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否删除了', default: false }),
    __metadata("design:type", Boolean)
], ChatGroupEntity.prototype, "isDelete", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '配置', nullable: true, default: null, type: 'text' }),
    __metadata("design:type", String)
], ChatGroupEntity.prototype, "config", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '附加参数', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatGroupEntity.prototype, "params", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '文件链接', nullable: true, default: null, type: 'text' }),
    __metadata("design:type", String)
], ChatGroupEntity.prototype, "fileUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'PDF中的文字内容', nullable: true, type: 'mediumtext' }),
    __metadata("design:type", String)
], ChatGroupEntity.prototype, "pdfTextContent", void 0);
ChatGroupEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'chat_group' })
], ChatGroupEntity);
exports.ChatGroupEntity = ChatGroupEntity;
