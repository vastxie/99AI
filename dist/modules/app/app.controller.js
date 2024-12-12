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
exports.AppController = void 0;
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const app_service_1 = require("./app.service");
const collectApp_dto_1 = require("./dto/collectApp.dto");
const createApp_dto_1 = require("./dto/createApp.dto");
const createCats_dto_1 = require("./dto/createCats.dto");
const deleteApp_dto_1 = require("./dto/deleteApp.dto");
const deleteCats_dto_1 = require("./dto/deleteCats.dto");
const queryApp_dto_1 = require("./dto/queryApp.dto");
const queryCats_dto_1 = require("./dto/queryCats.dto");
const updateApp_dto_1 = require("./dto/updateApp.dto");
const updateCats_dto_1 = require("./dto/updateCats.dto");
let AppController = class AppController {
    constructor(appService) {
        this.appService = appService;
    }
    appCatsList(query) {
        return this.appService.appCatsList(query);
    }
    catsList() {
        const params = { status: 1, page: 1, size: 1000, name: '' };
        return this.appService.appCatsList(params);
    }
    queryOneCats(query) {
        return this.appService.queryOneCat(query);
    }
    createAppCat(body) {
        return this.appService.createAppCat(body);
    }
    updateAppCats(body) {
        return this.appService.updateAppCats(body);
    }
    delAppCat(body) {
        return this.appService.delAppCat(body);
    }
    appList(req, query) {
        return this.appService.appList(req, query);
    }
    list(req, query) {
        return this.appService.frontAppList(req, query);
    }
    async searchList(body) {
        return this.appService.searchAppList(body);
    }
    createApp(body) {
        return this.appService.createApp(body);
    }
    updateApp(body) {
        return this.appService.updateApp(body);
    }
    delApp(body) {
        return this.appService.delApp(body);
    }
    collect(body, req) {
        return this.appService.collect(body, req);
    }
    mineApps(req) {
        return this.appService.mineApps(req);
    }
};
__decorate([
    (0, common_1.Get)('queryAppCats'),
    (0, swagger_1.ApiOperation)({ summary: '获取App分类列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryCats_dto_1.QuerCatsDto]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "appCatsList", null);
__decorate([
    (0, common_1.Get)('queryCats'),
    (0, swagger_1.ApiOperation)({ summary: '用户端获取App分类列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "catsList", null);
__decorate([
    (0, common_1.Get)('queryOneCat'),
    (0, swagger_1.ApiOperation)({ summary: '用户端获取App分类列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "queryOneCats", null);
__decorate([
    (0, common_1.Post)('createAppCats'),
    (0, swagger_1.ApiOperation)({ summary: '添加App分类' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [createCats_dto_1.CreateCatsDto]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "createAppCat", null);
__decorate([
    (0, common_1.Post)('updateAppCats'),
    (0, swagger_1.ApiOperation)({ summary: '修改App分类' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [updateCats_dto_1.UpdateCatsDto]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "updateAppCats", null);
__decorate([
    (0, common_1.Post)('delAppCats'),
    (0, swagger_1.ApiOperation)({ summary: '删除App分类' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [deleteCats_dto_1.DeleteCatsDto]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "delAppCat", null);
__decorate([
    (0, common_1.Get)('queryApp'),
    (0, swagger_1.ApiOperation)({ summary: '获取App列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, queryApp_dto_1.QuerAppDto]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "appList", null);
__decorate([
    (0, common_1.Get)('list'),
    (0, swagger_1.ApiOperation)({ summary: '客户端获取App' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, queryApp_dto_1.QuerAppDto]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('searchList'),
    (0, swagger_1.ApiOperation)({ summary: '客户端获取App' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "searchList", null);
__decorate([
    (0, common_1.Post)('createApp'),
    (0, swagger_1.ApiOperation)({ summary: '添加App' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [createApp_dto_1.CreateAppDto]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "createApp", null);
__decorate([
    (0, common_1.Post)('updateApp'),
    (0, swagger_1.ApiOperation)({ summary: '修改App' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [updateApp_dto_1.UpdateAppDto]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "updateApp", null);
__decorate([
    (0, common_1.Post)('delApp'),
    (0, swagger_1.ApiOperation)({ summary: '删除App' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [deleteApp_dto_1.OperateAppDto]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "delApp", null);
__decorate([
    (0, common_1.Post)('collect'),
    (0, swagger_1.ApiOperation)({ summary: '收藏/取消收藏App' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [collectApp_dto_1.CollectAppDto, Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "collect", null);
__decorate([
    (0, common_1.Get)('mineApps'),
    (0, swagger_1.ApiOperation)({ summary: '我的收藏' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "mineApps", null);
AppController = __decorate([
    (0, swagger_1.ApiTags)('App'),
    (0, common_1.Controller)('app'),
    __metadata("design:paramtypes", [app_service_1.AppService])
], AppController);
exports.AppController = AppController;
