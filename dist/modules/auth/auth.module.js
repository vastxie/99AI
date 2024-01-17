"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const verifycation_entity_1 = require("./../verification/verifycation.entity");
const typeorm_1 = require("@nestjs/typeorm");
const verification_service_1 = require("./../verification/verification.service");
const mailer_service_1 = require("../mailer/mailer.service");
const nestjs_config_1 = require("nestjs-config");
const auth_controller_1 = require("./auth.controller");
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const user_module_1 = require("../user/user.module");
const passport_1 = require("@nestjs/passport");
const jwt_1 = require("@nestjs/jwt");
const jwt_strategy_1 = require("../../common/auth/jwt.strategy");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const balance_entity_1 = require("../userBalance/balance.entity");
const accountLog_entity_1 = require("../userBalance/accountLog.entity");
const config_entity_1 = require("../globalConfig/config.entity");
const cramiPackage_entity_1 = require("../crami/cramiPackage.entity");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const redisCache_module_1 = require("../redisCache/redisCache.module");
const userBalance_entity_1 = require("../userBalance/userBalance.entity");
const salesUsers_entity_1 = require("../sales/salesUsers.entity");
const user_entity_1 = require("../user/user.entity");
const whiteList_entity_1 = require("../chatgpt/whiteList.entity");
const fingerprint_entity_1 = require("../userBalance/fingerprint.entity");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const chatGroup_entity_1 = require("../chatGroup/chatGroup.entity");
const midjourney_entity_1 = require("../midjourney/midjourney.entity");
let AuthModule = class AuthModule {
};
AuthModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            user_module_1.UserModule,
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            jwt_1.JwtModule.registerAsync({
                useFactory: async (configService) => configService.get('jwt'),
                inject: [nestjs_config_1.ConfigService],
            }),
            typeorm_1.TypeOrmModule.forFeature([
                verifycation_entity_1.VerifycationEntity,
                balance_entity_1.BalanceEntity,
                accountLog_entity_1.AccountLogEntity,
                config_entity_1.ConfigEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                redisCache_module_1.RedisCacheModule,
                userBalance_entity_1.UserBalanceEntity,
                salesUsers_entity_1.SalesUsersEntity,
                user_entity_1.UserEntity,
                whiteList_entity_1.WhiteListEntity,
                fingerprint_entity_1.FingerprintLogEntity,
                chatLog_entity_1.ChatLogEntity,
                chatGroup_entity_1.ChatGroupEntity,
                midjourney_entity_1.MidjourneyEntity
            ]),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [auth_service_1.AuthService, jwt_strategy_1.JwtStrategy, jwtAuth_guard_1.JwtAuthGuard, mailer_service_1.MailerService, verification_service_1.VerificationService, userBalance_service_1.UserBalanceService, redisCache_service_1.RedisCacheService],
        exports: [auth_service_1.AuthService],
    })
], AuthModule);
exports.AuthModule = AuthModule;
