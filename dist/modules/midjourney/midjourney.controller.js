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
exports.MidjourneyController = void 0;
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const midjourney_service_1 = require("./midjourney.service");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const axios_1 = require("axios");
const getList_dto_1 = require("./dto/getList.dto");
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
let MidjourneyController = class MidjourneyController {
    constructor(midjourneyService) {
        this.midjourneyService = midjourneyService;
    }
    async getDrawList(req, params) {
        return await this.midjourneyService.getDrawList(req, params);
    }
    async getList(params) {
        return await this.midjourneyService.getList(params);
    }
    async getFullPrompt(id) {
        return await this.midjourneyService.getFullPrompt(id);
    }
    async getAdminDrawList(req, params) {
        return await this.midjourneyService.getAdminDrawList(req, params);
    }
    async recDraw(params) {
        return await this.midjourneyService.recDraw(params);
    }
    async download(url, res) {
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        res.set({ 'Content-Type': 'image/png' });
        res.send(buffer);
    }
    async deleteDraw(id, req) {
        return await this.midjourneyService.deleteDraw(id, req);
    }
    async delLog(req, body) {
        return await this.midjourneyService.delLog(req, body);
    }
    async setPrompt(req, body) {
        return await this.midjourneyService.setPrompt(req, body);
    }
    async delPrompt(req, body) {
        return await this.midjourneyService.delPrompt(req, body);
    }
    async queryPrompt() {
        return await this.midjourneyService.queryPrompt();
    }
    async proxyImg(params) {
        return await this.midjourneyService.proxyImg(params);
    }
};
__decorate([
    (0, common_1.Get)('drawList'),
    (0, swagger_1.ApiOperation)({ summary: '获取我的绘画列表' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "getDrawList", null);
__decorate([
    (0, common_1.Get)('getList'),
    (0, swagger_1.ApiOperation)({ summary: '获取绘画列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [getList_dto_1.GetListDto]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "getList", null);
__decorate([
    (0, common_1.Get)('getFullPrompt'),
    (0, swagger_1.ApiOperation)({ summary: '获取绘画列表' }),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "getFullPrompt", null);
__decorate([
    (0, common_1.Get)('adminDrawList'),
    (0, swagger_1.ApiOperation)({ summary: '管理端获取绘画列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, getList_dto_1.GetListDto]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "getAdminDrawList", null);
__decorate([
    (0, common_1.Post)('rec'),
    (0, swagger_1.ApiOperation)({ summary: '推荐图片' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "recDraw", null);
__decorate([
    (0, common_1.Post)('download'),
    (0, swagger_1.ApiOperation)({ summary: '下载绘画' }),
    __param(0, (0, common_1.Body)('url')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "download", null);
__decorate([
    (0, common_1.Post)('delete'),
    (0, swagger_1.ApiOperation)({ summary: '删除绘画' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "deleteDraw", null);
__decorate([
    (0, common_1.Post)('del'),
    (0, swagger_1.ApiOperation)({ summary: '删除log' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "delLog", null);
__decorate([
    (0, common_1.Post)('setPrompt'),
    (0, swagger_1.ApiOperation)({ summary: '添加修改prompt提示词' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "setPrompt", null);
__decorate([
    (0, common_1.Post)('delPrompt'),
    (0, swagger_1.ApiOperation)({ summary: '添加修改prompt提示词' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "delPrompt", null);
__decorate([
    (0, common_1.Get)('queryPrompts'),
    (0, swagger_1.ApiOperation)({ summary: '查询prompt列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "queryPrompt", null);
__decorate([
    (0, common_1.Get)('proxy'),
    (0, swagger_1.ApiOperation)({ summary: '代理图片' }),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MidjourneyController.prototype, "proxyImg", null);
MidjourneyController = __decorate([
    (0, common_1.Controller)('midjourney'),
    __metadata("design:paramtypes", [midjourney_service_1.MidjourneyService])
], MidjourneyController);
exports.MidjourneyController = MidjourneyController;
