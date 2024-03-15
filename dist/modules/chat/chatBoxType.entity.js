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
exports.ChatBoxTypeEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let ChatBoxTypeEntity = class ChatBoxTypeEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '分类名称' }),
    __metadata("design:type", String)
], ChatBoxTypeEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'icon图标' }),
    __metadata("design:type", String)
], ChatBoxTypeEntity.prototype, "icon", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '排序ID', default: 10 }),
    __metadata("design:type", Number)
], ChatBoxTypeEntity.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否打开', default: true }),
    __metadata("design:type", Boolean)
], ChatBoxTypeEntity.prototype, "status", void 0);
ChatBoxTypeEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'chat_box_type' })
], ChatBoxTypeEntity);
exports.ChatBoxTypeEntity = ChatBoxTypeEntity;
