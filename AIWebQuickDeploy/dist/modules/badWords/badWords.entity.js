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
exports.BadWordsEntity = void 0;
const baseEntity_1 = require("../../common/entity/baseEntity");
const typeorm_1 = require("typeorm");
let BadWordsEntity = class BadWordsEntity extends baseEntity_1.BaseEntity {
};
__decorate([
    (0, typeorm_1.Column)({ length: 20, comment: '敏感词' }),
    __metadata("design:type", String)
], BadWordsEntity.prototype, "word", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1, comment: '敏感词开启状态' }),
    __metadata("design:type", Number)
], BadWordsEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, comment: '敏感词触发次数' }),
    __metadata("design:type", Number)
], BadWordsEntity.prototype, "count", void 0);
BadWordsEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'bad_words' })
], BadWordsEntity);
exports.BadWordsEntity = BadWordsEntity;
