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
exports.CustomAppDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CustomAppDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: '前端助手', description: 'app名称', required: true }),
    __metadata("design:type", String)
], CustomAppDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: 'app分类Id', required: true }),
    __metadata("design:type", Number)
], CustomAppDto.prototype, "catId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '适用于编程编码、期望成为您的编程助手',
        description: 'app名称详情描述',
        required: false,
    }),
    (0, class_validator_1.IsDefined)({ message: 'app名称描述是必传参数' }),
    __metadata("design:type", String)
], CustomAppDto.prototype, "des", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '你现在是一个翻译官。接下来我说的所有话帮我翻译成中文', description: '预设的prompt', required: true }),
    __metadata("design:type", String)
], CustomAppDto.prototype, "preset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://xxxx.png', description: '套餐封面图片', required: false }),
    __metadata("design:type", String)
], CustomAppDto.prototype, "coverImg", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '这是一句示例数据', description: 'app示例数据', required: false }),
    __metadata("design:type", String)
], CustomAppDto.prototype, "demoData", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: '是否共享到所有人', required: false }),
    __metadata("design:type", Boolean)
], CustomAppDto.prototype, "public", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '应用ID', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CustomAppDto.prototype, "appId", void 0);
exports.CustomAppDto = CustomAppDto;
