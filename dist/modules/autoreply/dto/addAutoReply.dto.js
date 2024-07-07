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
exports.AddAutoReplyDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class AddAutoReplyDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: '你是谁', description: '提问的问题', required: true }),
    __metadata("design:type", String)
], AddAutoReplyDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '我是AIWeb提供的Ai服务机器人',
        description: '回答的答案',
        required: true,
    }),
    __metadata("design:type", String)
], AddAutoReplyDto.prototype, "answer", void 0);
exports.AddAutoReplyDto = AddAutoReplyDto;
