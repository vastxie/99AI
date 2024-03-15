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
exports.UserRegisterDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class UserRegisterDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'cooper', description: '用户名称' }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户名不能为空！' }),
    (0, class_validator_1.MinLength)(2, { message: '用户名最低需要大于2位数！' }),
    (0, class_validator_1.MaxLength)(12, { message: '用户名不得超过12位！' }),
    __metadata("design:type", String)
], UserRegisterDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '123456', description: '用户密码' }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户密码不能为空' }),
    (0, class_validator_1.MinLength)(6, { message: '用户密码最低需要大于6位数！' }),
    (0, class_validator_1.MaxLength)(30, { message: '用户密码最长不能超过30位数！' }),
    __metadata("design:type", String)
], UserRegisterDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'J_longyan@163.com', description: '用户邮箱' }),
    (0, class_validator_1.IsEmail)({}, { message: '请填写正确格式的邮箱！' }),
    (0, class_validator_1.IsNotEmpty)({ message: '邮箱不能为空！' }),
    __metadata("design:type", String)
], UserRegisterDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '5k3n', description: '图形验证码' }),
    (0, class_validator_1.IsNotEmpty)({ message: '验证码为空！' }),
    __metadata("design:type", String)
], UserRegisterDto.prototype, "captchaCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2313ko423ko', description: '图形验证码KEY' }),
    (0, class_validator_1.IsNotEmpty)({ message: '验证ID不能为空！' }),
    __metadata("design:type", String)
], UserRegisterDto.prototype, "captchaId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'FRJDLJHFNV', description: '用户填写的别人邀请码', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UserRegisterDto.prototype, "invitedBy", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '',
        description: '用户头像',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UserRegisterDto.prototype, "avatar", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'default', description: '用户注册来源', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UserRegisterDto.prototype, "client", void 0);
exports.UserRegisterDto = UserRegisterDto;
