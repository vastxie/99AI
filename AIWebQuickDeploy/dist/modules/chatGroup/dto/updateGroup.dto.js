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
exports.UpdateGroupDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UpdateGroupDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '修改的对话ID', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateGroupDto.prototype, "groupId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '对话组title', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateGroupDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '对话组是否置顶', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UpdateGroupDto.prototype, "isSticky", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '', description: '对话组文件地址', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateGroupDto.prototype, "fileUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '',
        description: '对话模型配置项序列化的字符串',
        required: false,
    }),
    __metadata("design:type", String)
], UpdateGroupDto.prototype, "config", void 0);
exports.UpdateGroupDto = UpdateGroupDto;
