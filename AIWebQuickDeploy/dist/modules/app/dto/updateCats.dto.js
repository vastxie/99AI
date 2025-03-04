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
exports.UpdateCatsDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const createCats_dto_1 = require("./createCats.dto");
class UpdateCatsDto extends createCats_dto_1.CreateCatsDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要修改的分类Id', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: '分类ID必须是Number' }),
    __metadata("design:type", Number)
], UpdateCatsDto.prototype, "id", void 0);
exports.UpdateCatsDto = UpdateCatsDto;
