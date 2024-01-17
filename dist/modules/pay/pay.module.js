"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayModule = void 0;
const common_1 = require("@nestjs/common");
const pay_controller_1 = require("./pay.controller");
const pay_service_1 = require("./pay.service");
const order_entity_1 = require("../order/order.entity");
const cramiPackage_entity_1 = require("../crami/cramiPackage.entity");
const typeorm_1 = require("@nestjs/typeorm");
let PayModule = class PayModule {
};
PayModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([order_entity_1.OrderEntity, cramiPackage_entity_1.CramiPackageEntity])],
        controllers: [pay_controller_1.PayController],
        providers: [pay_service_1.PayService],
        exports: [pay_service_1.PayService],
    })
], PayModule);
exports.PayModule = PayModule;
