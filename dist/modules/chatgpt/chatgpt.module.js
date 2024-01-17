"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatgptModule = void 0;
const common_1 = require("@nestjs/common");
const chatgpt_controller_1 = require("./chatgpt.controller");
const chatgpt_service_1 = require("./chatgpt.service");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const typeorm_1 = require("@nestjs/typeorm");
const balance_entity_1 = require("../userBalance/balance.entity");
const user_service_1 = require("../user/user.service");
const user_entity_1 = require("../user/user.entity");
const verification_service_1 = require("../verification/verification.service");
const verifycation_entity_1 = require("../verification/verifycation.entity");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const accountLog_entity_1 = require("../userBalance/accountLog.entity");
const config_entity_1 = require("../globalConfig/config.entity");
const gptkeys_entity_1 = require("./gptkeys.entity");
const whiteList_entity_1 = require("./whiteList.entity");
const cramiPackage_entity_1 = require("../crami/cramiPackage.entity");
const chatGroup_entity_1 = require("../chatGroup/chatGroup.entity");
const app_entity_1 = require("../app/app.entity");
const userBalance_entity_1 = require("../userBalance/userBalance.entity");
const salesUsers_entity_1 = require("../sales/salesUsers.entity");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const fingerprint_entity_1 = require("../userBalance/fingerprint.entity");
const midjourney_entity_1 = require("../midjourney/midjourney.entity");
const chatBoxType_entity_1 = require("./chatBoxType.entity");
const chatBox_entity_1 = require("./chatBox.entity");
const chatPreType_entity_1 = require("./chatPreType.entity");
const chatPre_entity_1 = require("./chatPre.entity");
let ChatgptModule = class ChatgptModule {
};
ChatgptModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                balance_entity_1.BalanceEntity,
                user_entity_1.UserEntity,
                verifycation_entity_1.VerifycationEntity,
                chatLog_entity_1.ChatLogEntity,
                accountLog_entity_1.AccountLogEntity,
                config_entity_1.ConfigEntity,
                gptkeys_entity_1.GptKeysEntity,
                whiteList_entity_1.WhiteListEntity,
                user_entity_1.UserEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                chatGroup_entity_1.ChatGroupEntity,
                app_entity_1.AppEntity,
                userBalance_entity_1.UserBalanceEntity,
                salesUsers_entity_1.SalesUsersEntity,
                fingerprint_entity_1.FingerprintLogEntity,
                midjourney_entity_1.MidjourneyEntity,
                chatBoxType_entity_1.ChatBoxTypeEntity,
                chatBox_entity_1.ChatBoxEntity,
                chatPreType_entity_1.ChatPreTypeEntity,
                chatPre_entity_1.ChatPreEntity
            ]),
        ],
        controllers: [chatgpt_controller_1.ChatgptController],
        providers: [chatgpt_service_1.ChatgptService, userBalance_service_1.UserBalanceService, user_service_1.UserService, verification_service_1.VerificationService, chatLog_service_1.ChatLogService, redisCache_service_1.RedisCacheService],
        exports: [chatgpt_service_1.ChatgptService]
    })
], ChatgptModule);
exports.ChatgptModule = ChatgptModule;
