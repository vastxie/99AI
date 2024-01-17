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
exports.QueryViolationDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class QueryViolationDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryViolationDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryViolationDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '用户ID', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryViolationDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '百度云检测', description: '检测平台来源', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryViolationDto.prototype, "typeOriginCn", void 0);
exports.QueryViolationDto = QueryViolationDto;
