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
exports.SalesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const sales_service_1 = require("./sales.service");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const recordsQuery_dto_1 = require("./dto/recordsQuery.dto");
const appForMoney_dto_1 = require("./dto/appForMoney.dto");
const drawMoneyOrder_dto_1 = require("./dto/drawMoneyOrder.dto");
const salesOrder_dto_1 = require("./dto/salesOrder.dto");
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const auditOrder_dto_1 = require("./dto/auditOrder.dto");
const salesUserList_dto_1 = require("./dto/salesUserList.dto");
const updateUserSales_dto_1 = require("./dto/updateUserSales.dto");
let SalesController = class SalesController {
    constructor(salesService) {
        this.salesService = salesService;
    }
    async getMineAccount(req) {
        return this.salesService.getMineAccount(req);
    }
    async getMineRecords(req, query) {
        return this.salesService.getMineRecords(req, query);
    }
    async inviteRecords(req, query) {
        return this.salesService.inviteRecords(req, query);
    }
    async appForMoney(req, body) {
        return this.salesService.appForMoney(req, body);
    }
    async drawMoneyOrder(req, query) {
        return this.salesService.drawMoneyOrder(req, query);
    }
    async salesOrder(req, query) {
        return this.salesService.salesOrder(req, query);
    }
    async auditOrder(req, body) {
        return this.salesService.auditOrder(req, body);
    }
    async salesUserList(req, query) {
        return this.salesService.salesUserList(req, query);
    }
    async updateUserSales(req, body) {
        return this.salesService.updateUserSales(req, body);
    }
};
__decorate([
    (0, common_1.Get)('mineAccount'),
    (0, swagger_1.ApiOperation)({ summary: '获取个人分销账户' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SalesController.prototype, "getMineAccount", null);
__decorate([
    (0, common_1.Get)('mineRecords'),
    (0, swagger_1.ApiOperation)({ summary: '获取个人推介记录' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, recordsQuery_dto_1.RecordsQueryDto]),
    __metadata("design:returntype", Promise)
], SalesController.prototype, "getMineRecords", null);
__decorate([
    (0, common_1.Get)('inviteRecords'),
    (0, swagger_1.ApiOperation)({ summary: '管理端获取个人推介记录' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, recordsQuery_dto_1.RecordsQueryDto]),
    __metadata("design:returntype", Promise)
], SalesController.prototype, "inviteRecords", null);
__decorate([
    (0, common_1.Post)('appForMoney'),
    (0, swagger_1.ApiOperation)({ summary: '申请提现' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, appForMoney_dto_1.AppForMoneyDto]),
    __metadata("design:returntype", Promise)
], SalesController.prototype, "appForMoney", null);
__decorate([
    (0, common_1.Get)('drawMoneyOrder'),
    (0, swagger_1.ApiOperation)({ summary: '获取个人提款工单列表' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, drawMoneyOrder_dto_1.drawMoneyOrderDto]),
    __metadata("design:returntype", Promise)
], SalesController.prototype, "drawMoneyOrder", null);
__decorate([
    (0, common_1.Get)('salesOrder'),
    (0, swagger_1.ApiOperation)({ summary: '管理端获取工单列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, salesOrder_dto_1.salesOrderDto]),
    __metadata("design:returntype", Promise)
], SalesController.prototype, "salesOrder", null);
__decorate([
    (0, common_1.Post)('auditOrder'),
    (0, swagger_1.ApiOperation)({ summary: '审核工单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, auditOrder_dto_1.AuditOrderDto]),
    __metadata("design:returntype", Promise)
], SalesController.prototype, "auditOrder", null);
__decorate([
    (0, common_1.Get)('salesUserList'),
    (0, swagger_1.ApiOperation)({ summary: '查询用户佣金账户' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, salesUserList_dto_1.SalesUserListDto]),
    __metadata("design:returntype", Promise)
], SalesController.prototype, "salesUserList", null);
__decorate([
    (0, common_1.Post)('updateUserSales'),
    (0, swagger_1.ApiOperation)({ summary: '修改用户佣金账户' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, updateUserSales_dto_1.UpdateUserSalesDto]),
    __metadata("design:returntype", Promise)
], SalesController.prototype, "updateUserSales", null);
SalesController = __decorate([
    (0, swagger_1.ApiTags)('sales'),
    (0, common_1.Controller)('sales'),
    __metadata("design:paramtypes", [sales_service_1.SalesService])
], SalesController);
exports.SalesController = SalesController;
