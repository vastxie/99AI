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
exports.PayController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const pay_service_1 = require("./pay.service");
let PayController = class PayController {
    constructor(payService) {
        this.payService = payService;
    }
    notifyHupi(body) {
        console.log('hupi ->body: ', body);
        return this.payService.notify(body);
    }
    notifyLtzf(body) {
        console.log('ltzf ->body: ', body);
        return this.payService.notify(body);
    }
    notifyEpay(query) {
        console.log('epay ->query: ', query);
        return this.payService.notify(query);
    }
};
__decorate([
    (0, common_1.Post)('notify'),
    (0, swagger_1.ApiOperation)({ summary: 'hupi支付结果通知' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PayController.prototype, "notifyHupi", null);
__decorate([
    (0, common_1.Post)('notify'),
    (0, swagger_1.ApiOperation)({ summary: 'ltzf支付结果通知' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PayController.prototype, "notifyLtzf", null);
__decorate([
    (0, common_1.Get)('notify'),
    (0, swagger_1.ApiOperation)({ summary: 'Epay支付结果通知' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PayController.prototype, "notifyEpay", null);
PayController = __decorate([
    (0, common_1.Controller)('pay'),
    (0, swagger_1.ApiTags)('pay'),
    __metadata("design:paramtypes", [pay_service_1.PayService])
], PayController);
exports.PayController = PayController;
