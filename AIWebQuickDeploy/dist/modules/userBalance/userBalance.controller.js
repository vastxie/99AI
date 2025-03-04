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
exports.UserBalanceController = void 0;
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const userBalance_service_1 = require("./userBalance.service");
let UserBalanceController = class UserBalanceController {
    constructor(userBalanceService) {
        this.userBalanceService = userBalanceService;
    }
    async getRechargeLog(req, params) {
        return this.userBalanceService.getRechargeLog(req, params);
    }
    async getAccountLog(req, params) {
        return this.userBalanceService.getAccountLog(req, params);
    }
    async getBalance(req) {
        return this.userBalanceService.queryUserBalance(req.user.id);
    }
    async inheritVisitorData(req) {
        return this.userBalanceService.inheritVisitorData(req);
    }
    async getVisitorCount(req) {
        return this.userBalanceService.getVisitorCount(req);
    }
};
__decorate([
    (0, common_1.Get)('rechargeLog'),
    (0, swagger_1.ApiOperation)({ summary: '获取个人充值记录' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UserBalanceController.prototype, "getRechargeLog", null);
__decorate([
    (0, common_1.Get)('accountLog'),
    (0, swagger_1.ApiOperation)({ summary: '获取所有人账户记录' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UserBalanceController.prototype, "getAccountLog", null);
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '获取个人余额信息' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserBalanceController.prototype, "getBalance", null);
__decorate([
    (0, common_1.Post)('inheritVisitorData'),
    (0, swagger_1.ApiOperation)({ summary: '继承当前设备数据' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserBalanceController.prototype, "inheritVisitorData", null);
__decorate([
    (0, common_1.Get)('getVisitorCount'),
    (0, swagger_1.ApiOperation)({ summary: '获取本机指纹数据' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserBalanceController.prototype, "getVisitorCount", null);
UserBalanceController = __decorate([
    (0, swagger_1.ApiTags)('balance'),
    (0, common_1.Controller)('balance'),
    __metadata("design:paramtypes", [userBalance_service_1.UserBalanceService])
], UserBalanceController);
exports.UserBalanceController = UserBalanceController;
