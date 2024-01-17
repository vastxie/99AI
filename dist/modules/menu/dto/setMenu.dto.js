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
exports.SetMenuDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class SetMenuDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '菜单id', required: false }),
    __metadata("design:type", Number)
], SetMenuDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '测试菜单', description: '菜单文字提示', required: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SetMenuDto.prototype, "menuTipText", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https:baidu.com', description: '三方网页地址', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SetMenuDto.prototype, "menuIframeUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: '是否跳转', required: true }),
    __metadata("design:type", Boolean)
], SetMenuDto.prototype, "isJump", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: '是否打开菜单', required: true }),
    __metadata("design:type", Boolean)
], SetMenuDto.prototype, "isShow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ri:message-3-line', description: '菜单ICON图标代码', required: true }),
    __metadata("design:type", String)
], SetMenuDto.prototype, "menuIcon", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '/chat', description: '站内系统路径', required: true }),
    __metadata("design:type", String)
], SetMenuDto.prototype, "menuPath", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1000, description: '菜单排序id  数字越小越靠前', required: true }),
    __metadata("design:type", Number)
], SetMenuDto.prototype, "order", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: '是否系统预设', required: true }),
    __metadata("design:type", Boolean)
], SetMenuDto.prototype, "isSystem", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: '是否需要登录才可访问', required: true }),
    __metadata("design:type", Boolean)
], SetMenuDto.prototype, "isNeedAuth", void 0);
exports.SetMenuDto = SetMenuDto;
