"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModule = void 0;
const verifycation_entity_1 = require("./../verification/verifycation.entity");
const verification_service_1 = require("./../verification/verification.service");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const user_controller_1 = require("./user.controller");
const user_service_1 = require("./user.service");
const user_entity_1 = require("./user.entity");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const balance_entity_1 = require("../userBalance/balance.entity");
const accountLog_entity_1 = require("../userBalance/accountLog.entity");
const config_entity_1 = require("../globalConfig/config.entity");
const cramiPackage_entity_1 = require("../crami/cramiPackage.entity");
const whiteList_entity_1 = require("../chatgpt/whiteList.entity");
const userBalance_entity_1 = require("../userBalance/userBalance.entity");
const salesUsers_entity_1 = require("../sales/salesUsers.entity");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const fingerprint_entity_1 = require("../userBalance/fingerprint.entity");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const chatGroup_entity_1 = require("../chatGroup/chatGroup.entity");
const midjourney_entity_1 = require("../midjourney/midjourney.entity");
let UserModule = class UserModule {
};
UserModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                user_entity_1.UserEntity,
                verifycation_entity_1.VerifycationEntity,
                balance_entity_1.BalanceEntity,
                accountLog_entity_1.AccountLogEntity,
                config_entity_1.ConfigEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                whiteList_entity_1.WhiteListEntity,
                userBalance_entity_1.UserBalanceEntity,
                salesUsers_entity_1.SalesUsersEntity,
                fingerprint_entity_1.FingerprintLogEntity,
                chatLog_entity_1.ChatLogEntity,
                chatGroup_entity_1.ChatGroupEntity,
                midjourney_entity_1.MidjourneyEntity
            ]),
        ],
        controllers: [user_controller_1.UserController],
        providers: [user_service_1.UserService, verification_service_1.VerificationService, userBalance_service_1.UserBalanceService, redisCache_service_1.RedisCacheService],
        exports: [user_service_1.UserService],
    })
], UserModule);
exports.UserModule = UserModule;
