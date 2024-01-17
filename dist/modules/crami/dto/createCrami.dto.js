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
exports.CreatCramiDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CreatCramiDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '套餐类型', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: '套餐类型必须是number' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatCramiDto.prototype, "packageId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '单次生成卡密数量' }),
    (0, class_validator_1.IsNumber)({}, { message: '创建卡密的张数数量' }),
    (0, class_validator_1.Max)(50, { message: '单次创建卡密的张数数量不能超过50张' }),
    (0, class_validator_1.Min)(1, { message: '单次创建卡密的张数数量不能少于1张' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatCramiDto.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: '卡密携带模型3额度' }),
    (0, class_validator_1.IsNumber)({}, { message: '卡密携带的余额必须是number' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatCramiDto.prototype, "model3Count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 100, description: '卡密携带模型4额度' }),
    (0, class_validator_1.IsNumber)({}, { message: '卡密携带额度类型必须是number' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatCramiDto.prototype, "model4Count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 3, description: '卡密携带MJ绘画额度' }),
    (0, class_validator_1.IsNumber)({}, { message: '卡密携带额度类型必须是number' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatCramiDto.prototype, "drawMjCount", void 0);
exports.CreatCramiDto = CreatCramiDto;
