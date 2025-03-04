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
exports.VerifyCodeDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class VerifyCodeDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1', description: '验证码下发id' }),
    (0, class_validator_1.IsNotEmpty)({ message: '缺少必要参数！' }),
    __metadata("design:type", Number)
], VerifyCodeDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '15366754', description: '验证码' }),
    (0, class_validator_1.IsNotEmpty)({ message: '验证码不能为空！' }),
    __metadata("design:type", Number)
], VerifyCodeDto.prototype, "code", void 0);
exports.VerifyCodeDto = VerifyCodeDto;
