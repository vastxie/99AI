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
exports.MenuEntity = void 0;
const typeorm_1 = require("typeorm");
const baseEntity_1 = require("../../common/entity/baseEntity");
let MenuEntity = class MenuEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ comment: '菜单名称', length: 64, default: null }),
    __metadata("design:type", String)
], MenuEntity.prototype, "menuName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '菜单路径、跳转的系统路径', length: 64 }),
    __metadata("design:type", String)
], MenuEntity.prototype, "menuPath", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '菜单图标 icon图标名称' }),
    __metadata("design:type", String)
], MenuEntity.prototype, "menuIcon", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '菜单文字提示信息' }),
    __metadata("design:type", String)
], MenuEntity.prototype, "menuTipText", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '菜单类型： 系统预设|自定义菜单', default: 1 }),
    __metadata("design:type", Number)
], MenuEntity.prototype, "menuType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '菜单平台： 0：移动端 1：pc端', default: 1 }),
    __metadata("design:type", Number)
], MenuEntity.prototype, "menuPlatform", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '菜单加载地址： 系统菜单|自定义菜单', default: null }),
    __metadata("design:type", String)
], MenuEntity.prototype, "menuIframeUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '排序ID', default: 100 }),
    __metadata("design:type", Number)
], MenuEntity.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否显示 1：是|0：不是', default: 1 }),
    __metadata("design:type", Boolean)
], MenuEntity.prototype, "isShow", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否跳转到新窗口 0不跳转 1跳转 仅设置为iframe窗口时候有效', default: 0 }),
    __metadata("design:type", Boolean)
], MenuEntity.prototype, "isJump", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否权限 登录才可以访问', default: 0 }),
    __metadata("design:type", Boolean)
], MenuEntity.prototype, "isNeedAuth", void 0);
MenuEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'menu' })
], MenuEntity);
exports.MenuEntity = MenuEntity;
