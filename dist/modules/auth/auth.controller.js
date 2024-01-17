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
const verifyCode_dto_1 = require("./../verification/dto/verifyCode.dto");
const authLogin_dto_1 = require("./dto/authLogin.dto");
const common_1 = require("@nestjs/common");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const auth_service_1 = require("./auth.service");
const swagger_1 = require("@nestjs/swagger");
const authRegister_dto_1 = require("./dto/authRegister.dto");
const updatePassword_dto_1 = require("./dto/updatePassword.dto");
const updatePassByOther_dto_1 = require("./dto/updatePassByOther.dto");
const sendPhoneCode_dto_1 = require("./dto/sendPhoneCode.dto");
const userRegisterByPhone_dto_1 = require("./dto/userRegisterByPhone.dto");
const loginByPhone_dt_1 = require("./dto/loginByPhone.dt");
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    async register(body, req) {
        return await this.authService.register(body, req);
    }
    async registerByPhone(body, req) {
        return await this.authService.registerByPhone(body, req);
    }
    async login(body, req) {
        return this.authService.login(body, req);
    }
    async loginByPhone(body, req) {
        return this.authService.loginByPhone(body, req);
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
    async activateAccount(parmas, res) {
        return this.authService.activateAccount(parmas, res);
    }
    async registerSuccess(parmas) {
        const { username, id, email, teamName, registerSuccessEmailTitle, registerSuccessEmailTeamName, registerSuccessEmaileAppend } = parmas;
        return { username, id, email, teamName, registerSuccessEmailTitle, registerSuccessEmailTeamName, registerSuccessEmaileAppend };
    }
    async registerError(parmas) {
        const { message, teamName, registerFailEmailTitle, registerFailEmailTeamName } = parmas;
        return { message, teamName, registerFailEmailTitle, registerFailEmailTeamName };
    }
    async captcha(parmas) {
        return this.authService.captcha(parmas);
    }
    async sendPhoneCode(parmas) {
        return this.authService.sendPhoneCode(parmas);
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
    (0, common_1.Post)('registerByPhone'),
    (0, swagger_1.ApiOperation)({ summary: '用户通过手机号注册' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [userRegisterByPhone_dto_1.UserRegisterByPhoneDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "registerByPhone", null);
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
    (0, common_1.Post)('loginByPhone'),
    (0, swagger_1.ApiOperation)({ summary: '用户手机号登录' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [loginByPhone_dt_1.LoginByPhoneDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "loginByPhone", null);
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
    (0, common_1.Get)('activateAccount'),
    (0, swagger_1.ApiOperation)({ summary: '账户激活' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verifyCode_dto_1.VerifyCodeDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "activateAccount", null);
__decorate([
    (0, common_1.Get)('registerSuccess'),
    (0, swagger_1.ApiOperation)({ summary: '注册成功页面' }),
    (0, common_1.Render)('registerSuccess'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "registerSuccess", null);
__decorate([
    (0, common_1.Get)('registerError'),
    (0, swagger_1.ApiOperation)({ summary: '注册失败页面' }),
    (0, common_1.Render)('registerError'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "registerError", null);
__decorate([
    (0, common_1.Post)('captcha'),
    (0, swagger_1.ApiOperation)({ summary: '获取一个图形验证码' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "captcha", null);
__decorate([
    (0, common_1.Post)('sendPhoneCode'),
    (0, swagger_1.ApiOperation)({ summary: '发送手机验证码' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [sendPhoneCode_dto_1.SendPhoneCodeDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "sendPhoneCode", null);
AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
exports.AuthController = AuthController;
