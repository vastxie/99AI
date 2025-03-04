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
exports.UpdateUserStatusDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class UpdateUserStatusDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2, description: '用户状态', required: false }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户状态不能为空！' }),
    (0, class_validator_1.IsDefined)({ message: '用户状态是必传参数' }),
    (0, class_validator_1.IsIn)([0, 1, 2, 3], { message: '非法参数、用户状态非法！' }),
    __metadata("design:type", Number)
], UpdateUserStatusDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '修改的用户id', required: false }),
    (0, class_validator_1.IsDefined)({ message: '用户id是必传参数' }),
    __metadata("design:type", Number)
], UpdateUserStatusDto.prototype, "id", void 0);
exports.UpdateUserStatusDto = UpdateUserStatusDto;
