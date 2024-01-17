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
exports.MjEnlargeImgDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class MjEnlargeImgDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1105361939590287360', description: '当前大图的message_id、四张的这种才存在有效的！', required: true }),
    (0, class_validator_1.IsDefined)({ message: '图片的message_id是必传的' }),
    __metadata("design:type", String)
], MjEnlargeImgDto.prototype, "message_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '图片的orderId是必传的 表示放大图片的第几张！', required: true }),
    (0, class_validator_1.IsDefined)({ message: '图片固体顺序id是必传的！' }),
    __metadata("design:type", Number)
], MjEnlargeImgDto.prototype, "orderId", void 0);
exports.MjEnlargeImgDto = MjEnlargeImgDto;
