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
exports.PluginEntity = void 0;
const baseEntity_1 = require("../../common/entity/baseEntity");
const typeorm_1 = require("typeorm");
let PluginEntity = class PluginEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: '插件名称' }),
    __metadata("design:type", String)
], PluginEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '插件封面', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], PluginEntity.prototype, "pluginImg", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '插件描述' }),
    __metadata("design:type", String)
], PluginEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '插件是否启用 0：禁用 1：启用', default: 1 }),
    __metadata("design:type", Number)
], PluginEntity.prototype, "isEnabled", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '调用参数', type: 'text' }),
    __metadata("design:type", String)
], PluginEntity.prototype, "parameters", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '排序值', default: 0 }),
    __metadata("design:type", Number)
], PluginEntity.prototype, "sortOrder", void 0);
PluginEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'plugin' })
], PluginEntity);
exports.PluginEntity = PluginEntity;
