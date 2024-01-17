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
exports.DrawController = void 0;
const draw_service_1 = require("./draw.service");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const chatDraw_dto_1 = require("./dto/chatDraw.dto");
let DrawController = class DrawController {
    constructor(drawService) {
        this.drawService = drawService;
    }
    getEngines() {
        return this.drawService.getEngines();
    }
    textToImage(body) {
        return this.drawService.drawTextToImage(body);
    }
};
__decorate([
    (0, common_1.Get)('engines'),
    (0, swagger_1.ApiOperation)({ summary: '获取stable Diffusion 模型' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DrawController.prototype, "getEngines", null);
__decorate([
    (0, common_1.Post)('drawTextToImage'),
    (0, swagger_1.ApiOperation)({ summary: 'stable Diffusion绘画' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chatDraw_dto_1.StableDrawDto]),
    __metadata("design:returntype", void 0)
], DrawController.prototype, "textToImage", null);
DrawController = __decorate([
    (0, swagger_1.ApiTags)('draw'),
    (0, common_1.Controller)('draw'),
    __metadata("design:paramtypes", [draw_service_1.DrawService])
], DrawController);
exports.DrawController = DrawController;
