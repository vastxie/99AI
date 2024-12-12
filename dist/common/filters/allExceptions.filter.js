"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const result_1 = require("../result");
const common_1 = require("@nestjs/common");
let AllExceptionsFilter = class AllExceptionsFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const status = exception instanceof common_1.HttpException
            ? exception.getStatus()
            : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        if (exception instanceof common_1.HttpException) {
            const exceptionRes = exception.getResponse();
            message = (exceptionRes === null || exceptionRes === void 0 ? void 0 : exceptionRes.message)
                ? Array.isArray(exceptionRes.message)
                    ? exceptionRes.message[0]
                    : exceptionRes.message
                : exceptionRes;
        }
        else if (typeof exception.getResponse === 'function') {
            const exceptionRes = exception.getResponse();
            message = (exceptionRes === null || exceptionRes === void 0 ? void 0 : exceptionRes.message)
                ? Array.isArray(exceptionRes.message)
                    ? exceptionRes.message[0]
                    : exceptionRes.message
                : exceptionRes;
        }
        if (status === common_1.HttpStatus.NOT_FOUND) {
            response.redirect('/');
        }
        else {
            const statusCode = status || 400;
            response.status(statusCode);
            response.header('Content-Type', 'application/json; charset=utf-8');
            response.send(result_1.Result.fail(statusCode, Array.isArray(message) ? message[0] : message));
        }
    }
};
AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
exports.AllExceptionsFilter = AllExceptionsFilter;
