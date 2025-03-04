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
exports.UserController = void 0;
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const queryAllUser_dto_1 = require("./dto/queryAllUser.dto");
const queryOne_dto_1 = require("./dto/queryOne.dto");
const resetUserPass_dto_1 = require("./dto/resetUserPass.dto");
const updateUser_dto_1 = require("./dto/updateUser.dto");
const updateUserStatus_dto_1 = require("./dto/updateUserStatus.dto");
const userRecharge_dto_1 = require("./dto/userRecharge.dto");
const user_service_1 = require("./user.service");
let UserController = class UserController {
    constructor(userService) {
        this.userService = userService;
    }
    async update(body, req) {
        return await this.userService.updateInfo(body, req);
    }
    async userRecharge(body) {
        return await this.userService.userRecharge(body);
    }
    async queryAll(query, req) {
        return await this.userService.queryAll(query, req);
    }
    async queryOne(params) {
        return await this.userService.queryOne(params);
    }
    async updateStatus(body) {
        return await this.userService.updateStatus(body);
    }
    async resetUserPass(body) {
        return await this.userService.resetUserPass(body);
    }
};
__decorate([
    (0, common_1.Post)('update'),
    (0, swagger_1.ApiOperation)({ summary: '更新用户信息' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [updateUser_dto_1.UpdateUserDto, Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('recharge'),
    (0, swagger_1.ApiOperation)({ summary: '用户充值' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [userRecharge_dto_1.UserRechargeDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "userRecharge", null);
__decorate([
    (0, common_1.Get)('queryAll'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有用户' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryAllUser_dto_1.QueryAllUserDto, Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "queryAll", null);
__decorate([
    (0, common_1.Get)('queryOne'),
    (0, swagger_1.ApiOperation)({ summary: '查询单个用户' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryOne_dto_1.QueryOneUserDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "queryOne", null);
__decorate([
    (0, common_1.Post)('updateStatus'),
    (0, swagger_1.ApiOperation)({ summary: '更新用户状态' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [updateUserStatus_dto_1.UpdateUserStatusDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)('resetUserPass'),
    (0, swagger_1.ApiOperation)({ summary: '重置用户密码' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [resetUserPass_dto_1.ResetUserPassDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "resetUserPass", null);
UserController = __decorate([
    (0, common_1.Controller)('user'),
    (0, swagger_1.ApiTags)('user'),
    __metadata("design:paramtypes", [user_service_1.UserService])
], UserController);
exports.UserController = UserController;
