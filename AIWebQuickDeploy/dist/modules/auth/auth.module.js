"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const jwt_strategy_1 = require("../../common/auth/jwt.strategy");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const typeorm_1 = require("@nestjs/typeorm");
const chatGroup_entity_1 = require("../chatGroup/chatGroup.entity");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const cramiPackage_entity_1 = require("../crami/cramiPackage.entity");
const config_entity_1 = require("../globalConfig/config.entity");
const mailer_service_1 = require("../mailer/mailer.service");
const redisCache_module_1 = require("../redisCache/redisCache.module");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const user_entity_1 = require("../user/user.entity");
const user_module_1 = require("../user/user.module");
const accountLog_entity_1 = require("../userBalance/accountLog.entity");
const balance_entity_1 = require("../userBalance/balance.entity");
const fingerprint_entity_1 = require("../userBalance/fingerprint.entity");
const userBalance_entity_1 = require("../userBalance/userBalance.entity");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const verification_service_1 = require("./../verification/verification.service");
const verifycation_entity_1 = require("./../verification/verifycation.entity");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
let AuthModule = class AuthModule {
};
AuthModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            user_module_1.UserModule,
            redisCache_module_1.RedisCacheModule,
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            jwt_1.JwtModule.registerAsync({
                inject: [redisCache_service_1.RedisCacheService],
                useFactory: async (redisService) => ({
                    secret: await redisService.getJwtSecret(),
                    signOptions: { expiresIn: '7d' },
                }),
            }),
            typeorm_1.TypeOrmModule.forFeature([
                verifycation_entity_1.VerifycationEntity,
                balance_entity_1.BalanceEntity,
                accountLog_entity_1.AccountLogEntity,
                config_entity_1.ConfigEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                userBalance_entity_1.UserBalanceEntity,
                user_entity_1.UserEntity,
                fingerprint_entity_1.FingerprintLogEntity,
                chatLog_entity_1.ChatLogEntity,
                chatGroup_entity_1.ChatGroupEntity,
            ]),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_service_1.AuthService,
            jwt_strategy_1.JwtStrategy,
            jwtAuth_guard_1.JwtAuthGuard,
            mailer_service_1.MailerService,
            verification_service_1.VerificationService,
            userBalance_service_1.UserBalanceService,
            redisCache_service_1.RedisCacheService,
        ],
        exports: [auth_service_1.AuthService],
    })
], AuthModule);
exports.AuthModule = AuthModule;
