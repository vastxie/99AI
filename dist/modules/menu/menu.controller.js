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
exports.MenuController = void 0;
const swagger_1 = require("@nestjs/swagger");
const menu_service_1 = require("./menu.service");
const common_1 = require("@nestjs/common");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const queryMenu_dto_1 = require("./dto/queryMenu.dto");
const setMenu_dto_1 = require("./dto/setMenu.dto");
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
let MenuController = class MenuController {
    constructor(menuService) {
        this.menuService = menuService;
    }
    queryMenu(query) {
        return this.menuService.queryMenu(query);
    }
    menuListFront(query) {
        return this.menuService.menuListFront(query);
    }
    visibleMenu(params) {
        return this.menuService.visibleMenu(params);
    }
    setMenu(params) {
        return this.menuService.setMenu(params);
    }
    delMenu(params) {
        return this.menuService.delMenu(params);
    }
    updateIcon(params) {
        return this.menuService.updateIcon(params);
    }
};
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '管理端查询菜单列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryMenu_dto_1.QueryMenuDto]),
    __metadata("design:returntype", void 0)
], MenuController.prototype, "queryMenu", null);
__decorate([
    (0, common_1.Get)('list'),
    (0, swagger_1.ApiOperation)({ summary: '用户端查询菜单列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryMenu_dto_1.QueryMenuDto]),
    __metadata("design:returntype", void 0)
], MenuController.prototype, "menuListFront", null);
__decorate([
    (0, common_1.Post)('visible'),
    (0, swagger_1.ApiOperation)({ summary: '显示或者隐藏菜单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MenuController.prototype, "visibleMenu", null);
__decorate([
    (0, common_1.Post)('setMenu'),
    (0, swagger_1.ApiOperation)({ summary: '设置修改菜单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [setMenu_dto_1.SetMenuDto]),
    __metadata("design:returntype", void 0)
], MenuController.prototype, "setMenu", null);
__decorate([
    (0, common_1.Post)('delete'),
    (0, swagger_1.ApiOperation)({ summary: '删除菜单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MenuController.prototype, "delMenu", null);
__decorate([
    (0, common_1.Post)('updateIcon'),
    (0, swagger_1.ApiOperation)({ summary: '修改菜单ICON' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MenuController.prototype, "updateIcon", null);
MenuController = __decorate([
    (0, common_1.Controller)('menu'),
    __metadata("design:paramtypes", [menu_service_1.MenuService])
], MenuController);
exports.MenuController = MenuController;
