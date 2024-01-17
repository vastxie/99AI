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
exports.BatchDelCramiDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class BatchDelCramiDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要删除的套餐Ids', required: true }),
    (0, class_validator_1.IsArray)({ message: '参数类型为数组' }),
    (0, class_validator_1.ArrayMinSize)(1, { message: '最短长度为1' }),
    __metadata("design:type", Array)
], BatchDelCramiDto.prototype, "ids", void 0);
exports.BatchDelCramiDto = BatchDelCramiDto;
