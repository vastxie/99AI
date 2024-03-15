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
exports.ChatProcessDto = exports.Options = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
class Options {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], Options.prototype, "parentMessageId", void 0);
exports.Options = Options;
class ChatProcessDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'hello, Who are you', description: '对话信息' }),
    (0, class_validator_1.IsNotEmpty)({ message: '提问信息不能为空！' }),
    __metadata("design:type", String)
], ChatProcessDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://aiweb.com', description: '对话附带的链接', required: false }),
    __metadata("design:type", String)
], ChatProcessDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '{ parentMessageId: 0 }', description: '上次对话信息', required: false }),
    (0, class_transformer_1.Type)(() => Options),
    __metadata("design:type", Options)
], ChatProcessDto.prototype, "options", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: "You are ChatGPT, a large language model trained by OpenAI. Follow the user's instructions carefully. Respond using markdown.",
        description: '系统预设信息',
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ChatProcessDto.prototype, "systemMessage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '应用id', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], ChatProcessDto.prototype, "appId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: "gpt-3.5-turbo", description: '使用模型', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ChatProcessDto.prototype, "model", void 0);
exports.ChatProcessDto = ChatProcessDto;
