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
exports.AppCatsEntity = void 0;
const baseEntity_1 = require("../../common/entity/baseEntity");
const typeorm_1 = require("typeorm");
let AppCatsEntity = class AppCatsEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: 'App分类名称' }),
    __metadata("design:type", String)
], AppCatsEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App分类排序、数字越大越靠前', default: 100 }),
    __metadata("design:type", Number)
], AppCatsEntity.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App分类是否启用中 0：禁用 1：启用', default: 1 }),
    __metadata("design:type", Number)
], AppCatsEntity.prototype, "status", void 0);
AppCatsEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'app_cats' })
], AppCatsEntity);
exports.AppCatsEntity = AppCatsEntity;
