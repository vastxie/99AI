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
exports.GlobalConfigController = void 0;
const swagger_1 = require("@nestjs/swagger");
const setConfig_dto_1 = require("./dto/setConfig.dto");
const globalConfig_service_1 = require("./globalConfig.service");
const common_1 = require("@nestjs/common");
const queryConfig_dto_1 = require("./dto/queryConfig.dto");
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
let GlobalConfigController = class GlobalConfigController {
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    queryAllConfig(req) {
        return this.globalConfigService.queryAllConfig(req);
    }
    queryFrontConfig(query, req) {
        return this.globalConfigService.queryFrontConfig(query, req);
    }
    queryGptKeys(req) {
        return this.globalConfigService.queryGptKeys(req);
    }
    setGptKeys(body) {
        return this.globalConfigService.setGptKeys(body);
    }
    queryConfig(body, req) {
        return this.globalConfigService.queryConfig(body, req);
    }
    setConfig(body) {
        return this.globalConfigService.setConfig(body);
    }
    queryNotice() {
        return this.globalConfigService.queryNotice();
    }
    getCopyright() {
        return this.globalConfigService.getCopyright();
    }
};
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '查询所有配置' }),
    (0, common_1.Get)('queryAll'),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "queryAllConfig", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '查询前端网站的所有配置' }),
    (0, common_1.Get)('queryFronet'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "queryFrontConfig", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '查询所有gpt的key' }),
    (0, common_1.Get)('queryGptKeys'),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "queryGptKeys", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '设置gpt的key' }),
    (0, common_1.Post)('setGptKeys'),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "setGptKeys", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '查询所有配置' }),
    (0, common_1.Post)('query'),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryConfig_dto_1.QueryConfigDto, Object]),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "queryConfig", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '设置配置信息' }),
    (0, common_1.Post)('set'),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [setConfig_dto_1.SetConfigDto]),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "setConfig", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '用户端查询公告信息' }),
    (0, common_1.Get)('notice'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "queryNotice", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '管理端查询版权信息' }),
    (0, common_1.Get)('copyright'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "getCopyright", null);
GlobalConfigController = __decorate([
    (0, swagger_1.ApiTags)('config'),
    (0, common_1.Controller)('config'),
    __metadata("design:paramtypes", [globalConfig_service_1.GlobalConfigService])
], GlobalConfigController);
exports.GlobalConfigController = GlobalConfigController;
