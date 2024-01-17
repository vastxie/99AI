"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesModule = void 0;
const common_1 = require("@nestjs/common");
const sales_controller_1 = require("./sales.controller");
const sales_service_1 = require("./sales.service");
const typeorm_1 = require("@nestjs/typeorm");
const salesUsers_entity_1 = require("./salesUsers.entity");
const salesRecords_entity_1 = require("./salesRecords.entity");
const user_entity_1 = require("../user/user.entity");
const salesOrder_entity_1 = require("./salesOrder.entity");
let SalesModule = class SalesModule {
};
SalesModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([salesUsers_entity_1.SalesUsersEntity, salesRecords_entity_1.SalesRecordsEntity, user_entity_1.UserEntity, salesOrder_entity_1.SalesOrderEntity])],
        controllers: [sales_controller_1.SalesController],
        providers: [sales_service_1.SalesService],
        exports: [sales_service_1.SalesService],
    })
], SalesModule);
exports.SalesModule = SalesModule;
