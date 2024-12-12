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
exports.AuthController = void 0;
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("./auth.service");
const authLogin_dto_1 = require("./dto/authLogin.dto");
const authRegister_dto_1 = require("./dto/authRegister.dto");
const updatePassByOther_dto_1 = require("./dto/updatePassByOther.dto");
const updatePassword_dto_1 = require("./dto/updatePassword.dto");
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    async register(body, req) {
        return await this.authService.register(body, req);
    }
    async login(body, req) {
        return this.authService.login(body, req);
    }
    async loginWithCaptcha(body, req) {
        return this.authService.loginWithCaptcha(body, req);
    }
    async updatePassword(req, body) {
        return this.authService.updatePassword(req, body);
    }
    async updatePassByOther(req, body) {
        return this.authService.updatePassByOther(req, body);
    }
    async getInfo(req) {
        return this.authService.getInfo(req);
    }
    async sendCode(parmas) {
        return this.authService.sendCode(parmas);
    }
    async sendPhoneCode(parmas) {
        return this.authService.sendPhoneCode(parmas);
    }
    async verifyIdentity(req, body) {
        return this.authService.verifyIdentity(req, body);
    }
    async verifyPhoneIdentity(req, body) {
        return this.authService.verifyPhoneIdentity(req, body);
    }
};
__decorate([
    (0, common_1.Post)('register'),
    (0, swagger_1.ApiOperation)({ summary: '用户注册' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [authRegister_dto_1.UserRegisterDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, swagger_1.ApiOperation)({ summary: '用户登录' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [authLogin_dto_1.UserLoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('loginWithCaptcha'),
    (0, swagger_1.ApiOperation)({ summary: '用户使用验证码登录' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "loginWithCaptcha", null);
__decorate([
    (0, common_1.Post)('updatePassword'),
    (0, swagger_1.ApiOperation)({ summary: '用户更改密码' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, updatePassword_dto_1.UpdatePasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "updatePassword", null);
__decorate([
    (0, common_1.Post)('updatePassByOther'),
    (0, swagger_1.ApiOperation)({ summary: '用户更改密码' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, updatePassByOther_dto_1.UpdatePassByOtherDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "updatePassByOther", null);
__decorate([
    (0, common_1.Get)('getInfo'),
    (0, swagger_1.ApiOperation)({ summary: '获取用户个人信息' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getInfo", null);
__decorate([
    (0, common_1.Post)('sendCode'),
    (0, swagger_1.ApiOperation)({ summary: '发送验证码' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "sendCode", null);
__decorate([
    (0, common_1.Post)('sendPhoneCode'),
    (0, swagger_1.ApiOperation)({ summary: '发送手机验证码' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "sendPhoneCode", null);
__decorate([
    (0, common_1.Post)('verifyIdentity'),
    (0, swagger_1.ApiOperation)({ summary: '验证身份' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyIdentity", null);
__decorate([
    (0, common_1.Post)('verifyPhoneIdentity'),
    (0, swagger_1.ApiOperation)({ summary: '验证手机号' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyPhoneIdentity", null);
AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
exports.AuthController = AuthController;
