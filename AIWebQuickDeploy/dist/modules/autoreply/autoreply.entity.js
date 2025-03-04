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
exports.AutoReplyEntity = void 0;
const baseEntity_1 = require("../../common/entity/baseEntity");
const typeorm_1 = require("typeorm");
let AutoReplyEntity = class AutoReplyEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '提问的问题', type: 'text' }),
    __metadata("design:type", String)
], AutoReplyEntity.prototype, "prompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '定义的答案', type: 'text' }),
    __metadata("design:type", String)
], AutoReplyEntity.prototype, "answer", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1, comment: '是否开启AI回复，0：关闭 1：启用' }),
    __metadata("design:type", Number)
], AutoReplyEntity.prototype, "isAIReplyEnabled", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1, comment: '启用当前自动回复状态， 0：关闭 1：启用' }),
    __metadata("design:type", Number)
], AutoReplyEntity.prototype, "status", void 0);
AutoReplyEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'auto_reply' })
], AutoReplyEntity);
exports.AutoReplyEntity = AutoReplyEntity;
