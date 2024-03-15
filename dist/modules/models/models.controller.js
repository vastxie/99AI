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
exports.ModelsController = void 0;
const swagger_1 = require("@nestjs/swagger");
const models_service_1 = require("./models.service");
const common_1 = require("@nestjs/common");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const setModel_dto_1 = require("./dto/setModel.dto");
const queryModel_dto_1 = require("./dto/queryModel.dto");
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const setModelType_dto_1 = require("./dto/setModelType.dto");
const queryModelType_dto_1 = require("./dto/queryModelType.dto");
let ModelsController = class ModelsController {
    constructor(modelsService) {
        this.modelsService = modelsService;
    }
    setModel(params) {
        return this.modelsService.setModel(params);
    }
    delModel(params) {
        return this.modelsService.delModel(params);
    }
    queryModels(req, params) {
        return this.modelsService.queryModels(req, params);
    }
    modelsList() {
        return this.modelsService.modelsList();
    }
    getMjInfo() {
        return this.modelsService.getMjInfo();
    }
    baseConfig() {
        return this.modelsService.getBaseConfig();
    }
    queryModelType(params) {
        return this.modelsService.queryModelType(params);
    }
    setModelType(params) {
        return this.modelsService.setModelType(params);
    }
    delModelType(params) {
        return this.modelsService.delModelType(params);
    }
};
__decorate([
    (0, common_1.Post)('setModel'),
    (0, swagger_1.ApiOperation)({ summary: '设置模型' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [setModel_dto_1.SetModelDto]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "setModel", null);
__decorate([
    (0, common_1.Post)('delModel'),
    (0, swagger_1.ApiOperation)({ summary: '删除模型' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "delModel", null);
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '管理端查询模型列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Request, queryModel_dto_1.QueryModelDto]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "queryModels", null);
__decorate([
    (0, common_1.Get)('list'),
    (0, swagger_1.ApiOperation)({ summary: '客户端查询当前所有可以使用的模型' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "modelsList", null);
__decorate([
    (0, common_1.Get)('mjInfo'),
    (0, swagger_1.ApiOperation)({ summary: '客户端查询当前所有可以使用的模型' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "getMjInfo", null);
__decorate([
    (0, common_1.Get)('baseConfig'),
    (0, swagger_1.ApiOperation)({ summary: '客户端查询当前已经配置模型的基础配置' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "baseConfig", null);
__decorate([
    (0, common_1.Get)('queryModelType'),
    (0, swagger_1.ApiOperation)({ summary: '查询模型类型' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryModelType_dto_1.QueryModelTypeDto]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "queryModelType", null);
__decorate([
    (0, common_1.Post)('setModelType'),
    (0, swagger_1.ApiOperation)({ summary: '创建修改模型类型' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [setModelType_dto_1.SetModelTypeDto]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "setModelType", null);
__decorate([
    (0, common_1.Post)('delModelType'),
    (0, swagger_1.ApiOperation)({ summary: '删除模型类型' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "delModelType", null);
ModelsController = __decorate([
    (0, common_1.Controller)('models'),
    __metadata("design:paramtypes", [models_service_1.ModelsService])
], ModelsController);
exports.ModelsController = ModelsController;
