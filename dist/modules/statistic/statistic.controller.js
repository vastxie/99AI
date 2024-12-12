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
exports.StatisticController = void 0;
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const queryStatisticDto_dto_1 = require("./dto/queryStatisticDto.dto");
const statistic_service_1 = require("./statistic.service");
let StatisticController = class StatisticController {
    constructor(statisticService) {
        this.statisticService = statisticService;
    }
    getBaseStatistic() {
        return this.statisticService.getBaseStatistic();
    }
    getChatStatistic(params) {
        return this.statisticService.getChatStatistic(params);
    }
    getBaiduStatistics(params) {
        return this.statisticService.getBaiduVisit(params);
    }
};
__decorate([
    (0, common_1.Get)('base'),
    (0, swagger_1.ApiOperation)({ summary: '获取基础统计数据' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StatisticController.prototype, "getBaseStatistic", null);
__decorate([
    (0, common_1.Get)('chatStatistic'),
    (0, swagger_1.ApiOperation)({ summary: '获取聊天绘画统计数据' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryStatisticDto_dto_1.QueryStatisticDto]),
    __metadata("design:returntype", void 0)
], StatisticController.prototype, "getChatStatistic", null);
__decorate([
    (0, common_1.Get)('baiduVisit'),
    (0, swagger_1.ApiOperation)({ summary: '获取百度统计数据' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryStatisticDto_dto_1.QueryStatisticDto]),
    __metadata("design:returntype", void 0)
], StatisticController.prototype, "getBaiduStatistics", null);
StatisticController = __decorate([
    (0, swagger_1.ApiTags)('statistic'),
    (0, common_1.Controller)('statistic'),
    __metadata("design:paramtypes", [statistic_service_1.StatisticService])
], StatisticController);
exports.StatisticController = StatisticController;
