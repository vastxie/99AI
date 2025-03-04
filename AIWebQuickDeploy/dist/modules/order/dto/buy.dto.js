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
exports.BuyDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class BuyDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要购买的套餐Id', required: true }),
    __metadata("design:type", Number)
], BuyDto.prototype, "goodsId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'wxpay', description: '付款方式', required: false }),
    __metadata("design:type", String)
], BuyDto.prototype, "payType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '购买数量', required: false }),
    __metadata("design:type", Number)
], BuyDto.prototype, "count", void 0);
exports.BuyDto = BuyDto;
