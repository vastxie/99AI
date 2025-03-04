"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatisticModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const config_entity_1 = require("../globalConfig/config.entity");
const order_entity_1 = require("../order/order.entity");
const user_entity_1 = require("../user/user.entity");
const statistic_controller_1 = require("./statistic.controller");
const statistic_service_1 = require("./statistic.service");
let StatisticModule = class StatisticModule {
};
StatisticModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                user_entity_1.UserEntity,
                chatLog_entity_1.ChatLogEntity,
                config_entity_1.ConfigEntity,
                order_entity_1.OrderEntity,
            ]),
        ],
        controllers: [statistic_controller_1.StatisticController],
        providers: [statistic_service_1.StatisticService],
    })
], StatisticModule);
exports.StatisticModule = StatisticModule;
