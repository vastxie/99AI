"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const app_entity_1 = require("../app/app.entity");
const chatGroup_entity_1 = require("../chatGroup/chatGroup.entity");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const cramiPackage_entity_1 = require("../crami/cramiPackage.entity");
const config_entity_1 = require("../globalConfig/config.entity");
const mailer_service_1 = require("../mailer/mailer.service");
const midjourney_entity_1 = require("../midjourney/midjourney.entity");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const salesUsers_entity_1 = require("../sales/salesUsers.entity");
const user_entity_1 = require("../user/user.entity");
const user_service_1 = require("../user/user.service");
const accountLog_entity_1 = require("../userBalance/accountLog.entity");
const balance_entity_1 = require("../userBalance/balance.entity");
const fingerprint_entity_1 = require("../userBalance/fingerprint.entity");
const userBalance_entity_1 = require("../userBalance/userBalance.entity");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const verification_service_1 = require("../verification/verification.service");
const verifycation_entity_1 = require("../verification/verifycation.entity");
const apiDataService_service_1 = require("./apiDataService.service");
const chat_controller_1 = require("./chat.controller");
const chat_service_1 = require("./chat.service");
const chatBox_entity_1 = require("./chatBox.entity");
const chatBoxType_entity_1 = require("./chatBoxType.entity");
const chatPre_entity_1 = require("./chatPre.entity");
const chatPreType_entity_1 = require("./chatPreType.entity");
const whiteList_entity_1 = require("./whiteList.entity");
let ChatModule = class ChatModule {
};
ChatModule = __decorate([
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
                chatPre_entity_1.ChatPreEntity,
            ]),
        ],
        controllers: [chat_controller_1.ChatController],
        providers: [chat_service_1.ChatService, userBalance_service_1.UserBalanceService, user_service_1.UserService, verification_service_1.VerificationService, chatLog_service_1.ChatLogService, redisCache_service_1.RedisCacheService, apiDataService_service_1.ApiDataService, mailer_service_1.MailerService],
        exports: [chat_service_1.ChatService]
    })
], ChatModule);
exports.ChatModule = ChatModule;
