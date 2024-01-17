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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MjController = void 0;
const common_1 = require("@nestjs/common");
const mj_service_1 = require("./mj.service");
const swagger_1 = require("@nestjs/swagger");
const mjDraw_dto_1 = require("./dto/mjDraw.dto");
const mjEnlargeImg_dto_1 = require("./dto/mjEnlargeImg.dto");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const mjTransform_dto_1 = require("./dto/mjTransform.dto");
let MjController = class MjController {
    constructor(mjService) {
        this.mjService = mjService;
    }
    draw(body, req) {
        return this.mjService.draw(body, req);
    }
    upscaleSingleImg(body, req) {
        return this.mjService.upscaleSingleImg(body, req);
    }
    variationSingleImg(body, req) {
        return this.mjService.variationSingleImg(body, req);
    }
};
__decorate([
    (0, common_1.Post)('draw'),
    (0, swagger_1.ApiOperation)({ summary: '绘制mj图片' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mjDraw_dto_1.MjDrawDto, Object]),
    __metadata("design:returntype", void 0)
], MjController.prototype, "draw", null);
__decorate([
    (0, common_1.Post)('upscaleSingleImg'),
    (0, swagger_1.ApiOperation)({ summary: '放大单张图片' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mjEnlargeImg_dto_1.MjEnlargeImgDto, Object]),
    __metadata("design:returntype", void 0)
], MjController.prototype, "upscaleSingleImg", null);
__decorate([
    (0, common_1.Post)('variationSingleImg'),
    (0, swagger_1.ApiOperation)({ summary: '变体单张图片' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mjTransform_dto_1.MjTransformImgDto, Object]),
    __metadata("design:returntype", void 0)
], MjController.prototype, "variationSingleImg", null);
MjController = __decorate([
    (0, swagger_1.ApiTags)('mj'),
    (0, common_1.Controller)('mj'),
    __metadata("design:paramtypes", [mj_service_1.MjService])
], MjController);
exports.MjController = MjController;
