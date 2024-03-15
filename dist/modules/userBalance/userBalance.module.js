"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserBalanceModule = void 0;
const common_1 = require("@nestjs/common");
const userBalance_service_1 = require("./userBalance.service");
const typeorm_1 = require("@nestjs/typeorm");
const balance_entity_1 = require("./balance.entity");
const verification_service_1 = require("../verification/verification.service");
const verifycation_entity_1 = require("../verification/verifycation.entity");
const accountLog_entity_1 = require("./accountLog.entity");
const userBalance_controller_1 = require("./userBalance.controller");
const config_entity_1 = require("../globalConfig/config.entity");
const cramiPackage_entity_1 = require("../crami/cramiPackage.entity");
const userBalance_entity_1 = require("./userBalance.entity");
const user_entity_1 = require("../user/user.entity");
const salesUsers_entity_1 = require("../sales/salesUsers.entity");
const whiteList_entity_1 = require("../chat/whiteList.entity");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const fingerprint_entity_1 = require("./fingerprint.entity");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const chatGroup_entity_1 = require("../chatGroup/chatGroup.entity");
const midjourney_entity_1 = require("../midjourney/midjourney.entity");
let UserBalanceModule = class UserBalanceModule {
};
UserBalanceModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                balance_entity_1.BalanceEntity,
                userBalance_entity_1.UserBalanceEntity,
                verifycation_entity_1.VerifycationEntity,
                accountLog_entity_1.AccountLogEntity,
                config_entity_1.ConfigEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                user_entity_1.UserEntity,
                salesUsers_entity_1.SalesUsersEntity,
                whiteList_entity_1.WhiteListEntity,
                fingerprint_entity_1.FingerprintLogEntity,
                chatLog_entity_1.ChatLogEntity,
                chatGroup_entity_1.ChatGroupEntity,
                midjourney_entity_1.MidjourneyEntity
            ]),
        ],
        controllers: [userBalance_controller_1.UserBalanceController],
        providers: [userBalance_service_1.UserBalanceService, verification_service_1.VerificationService, redisCache_service_1.RedisCacheService],
        exports: [userBalance_service_1.UserBalanceService],
    })
], UserBalanceModule);
exports.UserBalanceModule = UserBalanceModule;
