"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const jwtAuth_guard_1 = require("./jwtAuth.guard");
let AdminAuthGuard = class AdminAuthGuard extends jwtAuth_guard_1.JwtAuthGuard {
    async canActivate(context) {
        const isAuthorized = await super.canActivate(context);
        if (!isAuthorized) {
            return false;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (user && ['admin', 'super'].includes(user.role)) {
            return true;
        }
        else {
            throw new common_1.UnauthorizedException('非法操作、您的权限等级不足、无法执行当前请求！');
        }
    }
};
AdminAuthGuard = __decorate([
    (0, common_1.Injectable)()
], AdminAuthGuard);
exports.AdminAuthGuard = AdminAuthGuard;
