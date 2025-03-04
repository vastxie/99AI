"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransformInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const result_1 = require("../result");
let TransformInterceptor = class TransformInterceptor {
    intercept(context, next) {
        return next.handle().pipe((0, operators_1.map)((data) => {
            const response = context.switchToHttp().getResponse();
            const request = context.switchToHttp().getRequest();
            response.statusCode = 200;
            if (request.path.includes('notify')) {
                return data;
            }
            const message = response.status < 400 ? null : response.statusText;
            return result_1.Result.success(data, message);
        }), (0, rxjs_1.catchError)((error) => {
            const statusCode = error.status || 500;
            const message = (error.response || 'Internal server error');
            return (0, rxjs_1.throwError)(new common_1.HttpException(message, statusCode));
        }));
    }
};
TransformInterceptor = __decorate([
    (0, common_1.Injectable)()
], TransformInterceptor);
exports.TransformInterceptor = TransformInterceptor;
