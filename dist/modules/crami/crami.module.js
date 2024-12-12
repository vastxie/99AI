"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CramiModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const chatGroup_entity_1 = require("../chatGroup/chatGroup.entity");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const config_entity_1 = require("../globalConfig/config.entity");
const user_entity_1 = require("../user/user.entity");
const accountLog_entity_1 = require("../userBalance/accountLog.entity");
const balance_entity_1 = require("../userBalance/balance.entity");
const fingerprint_entity_1 = require("../userBalance/fingerprint.entity");
const userBalance_entity_1 = require("../userBalance/userBalance.entity");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const crami_controller_1 = require("./crami.controller");
const crami_entity_1 = require("./crami.entity");
const crami_service_1 = require("./crami.service");
const cramiPackage_entity_1 = require("./cramiPackage.entity");
let CramiModule = class CramiModule {
};
CramiModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                crami_entity_1.CramiEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                user_entity_1.UserEntity,
                balance_entity_1.BalanceEntity,
                accountLog_entity_1.AccountLogEntity,
                config_entity_1.ConfigEntity,
                userBalance_entity_1.UserBalanceEntity,
                fingerprint_entity_1.FingerprintLogEntity,
                chatLog_entity_1.ChatLogEntity,
                chatGroup_entity_1.ChatGroupEntity,
            ]),
        ],
        providers: [crami_service_1.CramiService, userBalance_service_1.UserBalanceService],
        controllers: [crami_controller_1.CramiController],
        exports: [crami_service_1.CramiService],
    })
], CramiModule);
exports.CramiModule = CramiModule;
