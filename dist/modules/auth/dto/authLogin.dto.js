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
exports.UserLoginDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UserLoginDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'super', description: '邮箱' }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户名不能为空！' }),
    (0, class_validator_1.MinLength)(2, { message: '用户名最短是两位数！' }),
    (0, class_validator_1.MaxLength)(30, { message: '用户名最长不得超过30位！' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UserLoginDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '用户ID' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UserLoginDto.prototype, "uid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '999999', description: '密码' }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户密码不能为空！' }),
    (0, class_validator_1.MinLength)(6, { message: '用户密码最低需要大于6位数！' }),
    (0, class_validator_1.MaxLength)(30, { message: '用户密码最长不能超过30位数！' }),
    __metadata("design:type", String)
], UserLoginDto.prototype, "password", void 0);
exports.UserLoginDto = UserLoginDto;
