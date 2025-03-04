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
exports.SigninController = void 0;
const common_1 = require("@nestjs/common");
const signin_service_1 = require("./signin.service");
const swagger_1 = require("@nestjs/swagger");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
let SigninController = class SigninController {
    constructor(signinService) {
        this.signinService = signinService;
    }
    async sign(req) {
        return await this.signinService.sign(req);
    }
    async getSigninLog(req) {
        return await this.signinService.getSigninLog(req);
    }
};
__decorate([
    (0, common_1.Post)('sign'),
    (0, swagger_1.ApiOperation)({ summary: '用户签到' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SigninController.prototype, "sign", null);
__decorate([
    (0, common_1.Get)('signinLog'),
    (0, swagger_1.ApiOperation)({ summary: '获取用户签到信息' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SigninController.prototype, "getSigninLog", null);
SigninController = __decorate([
    (0, swagger_1.ApiTags)('signIn'),
    (0, common_1.Controller)('signin'),
    __metadata("design:paramtypes", [signin_service_1.SigninService])
], SigninController);
exports.SigninController = SigninController;
