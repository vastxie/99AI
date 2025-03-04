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
exports.QuerAllChatLogDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class QuerAllChatLogDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllChatLogDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllChatLogDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 99, description: '对话的用户id', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllChatLogDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '您好', description: '用户询问的问题', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerAllChatLogDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'user', description: '身份', required: false }),
    __metadata("design:type", String)
], QuerAllChatLogDto.prototype, "role", void 0);
exports.QuerAllChatLogDto = QuerAllChatLogDto;
