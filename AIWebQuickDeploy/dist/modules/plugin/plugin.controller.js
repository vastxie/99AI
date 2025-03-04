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
exports.PluginController = void 0;
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const plugin_service_1 = require("./plugin.service");
let PluginController = class PluginController {
    constructor(pluginService) {
        this.pluginService = pluginService;
    }
    pluginList(req) {
        return this.pluginService.pluginList(req);
    }
    createPlugin(body) {
        return this.pluginService.createPlugin(body);
    }
    updatePlugin(body) {
        return this.pluginService.updatePlugin(body);
    }
    delPlugin(body) {
        return this.pluginService.delPlugin(body);
    }
};
__decorate([
    (0, common_1.Get)('pluginList'),
    (0, swagger_1.ApiOperation)({ summary: '获取Plugin' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "pluginList", null);
__decorate([
    (0, common_1.Post)('createPlugin'),
    (0, swagger_1.ApiOperation)({ summary: '创建Plugin' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "createPlugin", null);
__decorate([
    (0, common_1.Post)('updatePlugin'),
    (0, swagger_1.ApiOperation)({ summary: '修改插件' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "updatePlugin", null);
__decorate([
    (0, common_1.Post)('delPlugin'),
    (0, swagger_1.ApiOperation)({ summary: '删除插件' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "delPlugin", null);
PluginController = __decorate([
    (0, swagger_1.ApiTags)('Plugin'),
    (0, common_1.Controller)('plugin'),
    __metadata("design:paramtypes", [plugin_service_1.PluginService])
], PluginController);
exports.PluginController = PluginController;
