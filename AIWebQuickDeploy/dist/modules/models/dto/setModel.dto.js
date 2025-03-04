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
exports.SetModelDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SetModelDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: 'key id', required: false }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '模型类型', required: true }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "keyType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '默认', description: '模型中文名称', required: true }),
    __metadata("design:type", String)
], SetModelDto.prototype, "modelName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'sk-', description: '模型key', required: false }),
    __metadata("design:type", Object)
], SetModelDto.prototype, "key", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否开启当前key对应的模型',
        required: true,
    }),
    __metadata("design:type", Boolean)
], SetModelDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'gpt-3.5',
        description: '当前key绑定的模型是多少 需要调用的模型',
        required: true,
    }),
    __metadata("design:type", String)
], SetModelDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '模型排序' }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "modelOrder", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://***.png', required: false }),
    __metadata("design:type", String)
], SetModelDto.prototype, "modelAvatar", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 4096,
        description: '模型支持的最大TOken数量',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "maxModelTokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '模型的代理地址',
        required: false,
    }),
    __metadata("design:type", String)
], SetModelDto.prototype, "proxyUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 300, description: '模型超时时间', required: false }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "timeout", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'key状态', required: false }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "keyStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '扣费类型 1： 普通 2： 高级余额',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "deductType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: '单次扣除金额', required: false }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "deduct", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '最大上下文轮次',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "maxRounds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否设置为绘画Key',
        required: false,
    }),
    __metadata("design:type", Boolean)
], SetModelDto.prototype, "isDraw", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否支持文件上传',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "isFileUpload", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否使用token计费',
        required: false,
    }),
    __metadata("design:type", Boolean)
], SetModelDto.prototype, "isTokenBased", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'token计费比例', required: false }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "tokenFeeRatio", void 0);
exports.SetModelDto = SetModelDto;
