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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtAuthGuard = void 0;
const globalConfig_service_1 = require("../../modules/globalConfig/globalConfig.service");
const redisCache_service_1 = require("../../modules/redisCache/redisCache.service");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const passport_1 = require("@nestjs/passport");
const jwt = require("jsonwebtoken");
const auth_service_1 = require("../../modules/auth/auth.service");
let JwtAuthGuard = class JwtAuthGuard extends (0, passport_1.AuthGuard)('jwt') {
    constructor(redisCacheService, moduleRef, globalConfigService, authService) {
        super();
        this.redisCacheService = redisCacheService;
        this.moduleRef = moduleRef;
        this.globalConfigService = globalConfigService;
        this.authService = authService;
    }
    async canActivate(context) {
        if (!this.redisCacheService) {
            this.redisCacheService = this.moduleRef.get(redisCache_service_1.RedisCacheService, {
                strict: false,
            });
        }
        const request = context.switchToHttp().getRequest();
        const domain = request.headers['x-website-domain'];
        const token = this.extractToken(request);
        request.user = await this.validateToken(token);
        await this.redisCacheService.checkTokenAuth(token, request);
        return true;
    }
    extractToken(request) {
        if (!request.headers.authorization) {
            if (request.headers.fingerprint) {
                let id = request.headers.fingerprint;
                if (id > 2147483647) {
                    id = id.toString().slice(-9);
                    id = Number(String(Number(id)));
                }
                const token = this.authService.createTokenFromFingerprint(id);
                return token;
            }
            return null;
        }
        const parts = request.headers.authorization.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }
        return parts[1];
    }
    async validateToken(token) {
        try {
            const secret = await this.redisCacheService.getJwtSecret();
            const decoded = await jwt.verify(token, secret);
            return decoded;
        }
        catch (error) {
            throw new common_1.HttpException('亲爱的用户,请登录后继续操作,我们正在等您的到来！', common_1.HttpStatus.UNAUTHORIZED);
        }
    }
    handleRequest(err, user, info) {
        if (err || !user) {
            console.log('err: ', err);
            throw err || new common_1.UnauthorizedException();
        }
        return user;
    }
};
JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redisCache_service_1.RedisCacheService,
        core_1.ModuleRef,
        globalConfig_service_1.GlobalConfigService,
        auth_service_1.AuthService])
], JwtAuthGuard);
exports.JwtAuthGuard = JwtAuthGuard;
