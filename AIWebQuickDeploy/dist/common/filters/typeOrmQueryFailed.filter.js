"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeOrmQueryFailedFilter = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
let TypeOrmQueryFailedFilter = class TypeOrmQueryFailedFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        if (exception.code === 'ER_DUP_ENTRY') {
            throw new common_1.BadRequestException('该记录已经存在，请勿重复添加！');
        }
        else {
            console.log('other query error');
        }
        response.status(500).json({
            statusCode: 500,
            timestamp: new Date().toISOString(),
            path: request.url,
            message: `Database query failed: ${exception.message}`,
        });
    }
};
TypeOrmQueryFailedFilter = __decorate([
    (0, common_1.Catch)(typeorm_1.QueryFailedError)
], TypeOrmQueryFailedFilter);
exports.TypeOrmQueryFailedFilter = TypeOrmQueryFailedFilter;
