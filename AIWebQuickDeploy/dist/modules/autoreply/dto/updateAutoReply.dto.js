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
exports.UpdateAutoReplyDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UpdateAutoReplyDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '自动回复id', required: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateAutoReplyDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '你可以干嘛', description: '问题', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateAutoReplyDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '我可以干很多事情.......',
        description: '答案',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateAutoReplyDto.prototype, "answer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: '状态', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateAutoReplyDto.prototype, "status", void 0);
exports.UpdateAutoReplyDto = UpdateAutoReplyDto;
