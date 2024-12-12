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
exports.UserEntity = void 0;
const baseEntity_1 = require("../../common/entity/baseEntity");
const typeorm_1 = require("typeorm");
let UserEntity = class UserEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ length: 12, comment: '用户昵称' }),
    __metadata("design:type", String)
], UserEntity.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, comment: '用户密码', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "password", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, comment: '用户状态' }),
    __metadata("design:type", Number)
], UserEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1, comment: '用户性别' }),
    __metadata("design:type", Number)
], UserEntity.prototype, "sex", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, unique: true, comment: '用户邮箱' }),
    __metadata("design:type", String)
], UserEntity.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, nullable: true, comment: '用户手机号' }),
    __metadata("design:type", String)
], UserEntity.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({
        length: 300,
        nullable: true,
        default: '',
        comment: '用户头像',
    }),
    __metadata("design:type", String)
], UserEntity.prototype, "avatar", void 0);
__decorate([
    (0, typeorm_1.Column)({
        length: 300,
        nullable: true,
        default: '我是一台基于深度学习和自然语言处理技术的 AI 机器人，旨在为用户提供高效、精准、个性化的智能服务。',
        comment: '用户签名',
    }),
    __metadata("design:type", String)
], UserEntity.prototype, "sign", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, default: '', comment: '注册IP', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "registerIp", void 0);
__decorate([
    (0, typeorm_1.Column)({
        length: 64,
        default: '',
        comment: '最后一次登录IP',
        nullable: true,
    }),
    __metadata("design:type", String)
], UserEntity.prototype, "lastLoginIp", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 10, default: '', comment: '用户邀请码' }),
    __metadata("design:type", String)
], UserEntity.prototype, "inviteCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 10, default: '', comment: '用户填写的别人的邀请码' }),
    __metadata("design:type", String)
], UserEntity.prototype, "invitedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 10, default: 'viewer', comment: '用户角色' }),
    __metadata("design:type", String)
], UserEntity.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, default: '', comment: '微信openId', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "openId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, comment: '用户注册来源', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "client", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户邀请链接被点击次数', default: 0 }),
    __metadata("design:type", Number)
], UserEntity.prototype, "inviteLinkCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户连续签到天数', default: 0 }),
    __metadata("design:type", Number)
], UserEntity.prototype, "consecutiveDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户违规记录次数', default: 0 }),
    __metadata("design:type", Number)
], UserEntity.prototype, "violationCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '真实姓名', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "realName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '身份证号', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "idCard", void 0);
UserEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'users' })
], UserEntity);
exports.UserEntity = UserEntity;
