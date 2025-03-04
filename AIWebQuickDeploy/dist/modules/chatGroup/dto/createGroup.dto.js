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
exports.CreateGroupDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateGroupDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '应用ID', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateGroupDto.prototype, "appId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '',
        description: '对话模型配置项序列化的字符串',
        required: false,
    }),
    __metadata("design:type", Object)
], CreateGroupDto.prototype, "modelConfig", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '',
        description: '对话组参数序列化的字符串',
        required: false,
    }),
    __metadata("design:type", String)
], CreateGroupDto.prototype, "params", void 0);
exports.CreateGroupDto = CreateGroupDto;
