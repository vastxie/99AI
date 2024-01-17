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
exports.AppForMoneyDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class AppForMoneyDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '提现金额', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: '提现金额必须为数字' }),
    (0, class_validator_1.Min)(0, { message: '提现金额必须大于0' }),
    __metadata("design:type", Number)
], AppForMoneyDto.prototype, "withdrawalAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '提现渠道', required: true }),
    (0, class_validator_1.IsIn)([1, 2], { message: '提现渠道非法' }),
    __metadata("design:type", Number)
], AppForMoneyDto.prototype, "withdrawalChannels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '提款联系方式', required: true }),
    __metadata("design:type", String)
], AppForMoneyDto.prototype, "contactInformation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '提款备注', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AppForMoneyDto.prototype, "remark", void 0);
exports.AppForMoneyDto = AppForMoneyDto;
