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
exports.CramiController = void 0;
const crami_service_1 = require("./crami.service");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const createPackage_dto_1 = require("./dto/createPackage.dto");
const updatePackage_dto_1 = require("./dto/updatePackage.dto");
const createCrami_dto_1 = require("./dto/createCrami.dto");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const useCrami_dto_1 = require("./dto/useCrami.dto");
const queryAllPackage_dto_1 = require("./dto/queryAllPackage.dto");
const deletePackage_dto_1 = require("./dto/deletePackage.dto");
const queryAllCrami_dto_1 = require("./dto/queryAllCrami.dto");
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const batchDelCrami_dto_1 = require("./dto/batchDelCrami.dto");
let CramiController = class CramiController {
    constructor(cramiService) {
        this.cramiService = cramiService;
    }
    async queryOnePackage(id) {
        return this.cramiService.queryOnePackage(id);
    }
    async queryAllPackage(query) {
        return this.cramiService.queryAllPackage(query);
    }
    async createPackage(body) {
        return this.cramiService.createPackage(body);
    }
    async updatePackage(body) {
        return this.cramiService.updatePackage(body);
    }
    async delPackage(body) {
        return this.cramiService.delPackage(body);
    }
    async createCrami(body) {
        return this.cramiService.createCrami(body);
    }
    async useCrami(req, body) {
        return this.cramiService.useCrami(req, body);
    }
    async queryAllCrami(params, req) {
        return this.cramiService.queryAllCrami(params, req);
    }
    async delCrami(id) {
        return this.cramiService.delCrami(id);
    }
    async batchDelCrami(body) {
        return this.cramiService.batchDelCrami(body);
    }
};
__decorate([
    (0, common_1.Get)('queryOnePackage'),
    (0, swagger_1.ApiOperation)({ summary: '查询单个套餐' }),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "queryOnePackage", null);
__decorate([
    (0, common_1.Get)('queryAllPackage'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有套餐' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryAllPackage_dto_1.QuerAllPackageDto]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "queryAllPackage", null);
__decorate([
    (0, common_1.Post)('createPackage'),
    (0, swagger_1.ApiOperation)({ summary: '创建套餐' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [createPackage_dto_1.CreatePackageDto]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "createPackage", null);
__decorate([
    (0, common_1.Post)('updatePackage'),
    (0, swagger_1.ApiOperation)({ summary: '更新套餐' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [updatePackage_dto_1.UpdatePackageDto]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "updatePackage", null);
__decorate([
    (0, common_1.Post)('delPackage'),
    (0, swagger_1.ApiOperation)({ summary: '删除套餐' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [deletePackage_dto_1.DeletePackageDto]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "delPackage", null);
__decorate([
    (0, common_1.Post)('createCrami'),
    (0, swagger_1.ApiOperation)({ summary: '生成卡密' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [createCrami_dto_1.CreatCramiDto]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "createCrami", null);
__decorate([
    (0, common_1.Post)('useCrami'),
    (0, swagger_1.ApiOperation)({ summary: '使用卡密' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, useCrami_dto_1.UseCramiDto]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "useCrami", null);
__decorate([
    (0, common_1.Get)('queryAllCrami'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有卡密' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryAllCrami_dto_1.QuerAllCramiDto, Object]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "queryAllCrami", null);
__decorate([
    (0, common_1.Post)('delCrami'),
    (0, swagger_1.ApiOperation)({ summary: '删除卡密' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "delCrami", null);
__decorate([
    (0, common_1.Post)('batchDelCrami'),
    (0, swagger_1.ApiOperation)({ summary: '批量删除卡密' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [batchDelCrami_dto_1.BatchDelCramiDto]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "batchDelCrami", null);
CramiController = __decorate([
    (0, swagger_1.ApiTags)('Crami'),
    (0, common_1.Controller)('crami'),
    __metadata("design:paramtypes", [crami_service_1.CramiService])
], CramiController);
exports.CramiController = CramiController;
