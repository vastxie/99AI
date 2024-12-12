"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const abort_interceptor_1 = require("./common/interceptors/abort.interceptor");
const custom_logger_service_1 = require("./common/logger/custom-logger.service");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const serve_static_1 = require("@nestjs/serve-static");
const fetch = require("isomorphic-fetch");
const path_1 = require("path");
const app_module_1 = require("./modules/app/app.module");
const auth_module_1 = require("./modules/auth/auth.module");
const autoreply_module_1 = require("./modules/autoreply/autoreply.module");
const badWords_module_1 = require("./modules/badWords/badWords.module");
const chat_module_1 = require("./modules/chat/chat.module");
const chatGroup_module_1 = require("./modules/chatGroup/chatGroup.module");
const chatLog_module_1 = require("./modules/chatLog/chatLog.module");
const crami_module_1 = require("./modules/crami/crami.module");
const database_module_1 = require("./modules/database/database.module");
const globalConfig_module_1 = require("./modules/globalConfig/globalConfig.module");
const models_module_1 = require("./modules/models/models.module");
const official_module_1 = require("./modules/official/official.module");
const order_module_1 = require("./modules/order/order.module");
const pay_module_1 = require("./modules/pay/pay.module");
const plugin_module_1 = require("./modules/plugin/plugin.module");
const redisCache_module_1 = require("./modules/redisCache/redisCache.module");
const signin_module_1 = require("./modules/signin/signin.module");
const statistic_module_1 = require("./modules/statistic/statistic.module");
const task_module_1 = require("./modules/task/task.module");
const upload_module_1 = require("./modules/upload/upload.module");
const user_module_1 = require("./modules/user/user.module");
const userBalance_module_1 = require("./modules/userBalance/userBalance.module");
const verification_module_1 = require("./modules/verification/verification.module");
global.fetch = fetch;
let AppModule = class AppModule {
};
AppModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, '..', 'public/admin'),
                serveRoot: process.env.ADMIN_SERVE_ROOT || '/admin',
            }, {
                rootPath: (0, path_1.join)(__dirname, '..', 'public/file'),
                serveRoot: '/file',
                serveStaticOptions: {
                    setHeaders: (res, path, stat) => {
                        res.set('Access-Control-Allow-Origin', '*');
                    },
                },
            }, {
                rootPath: (0, path_1.join)(__dirname, '..', 'public/chat'),
                serveRoot: '/',
            }),
            user_module_1.UserModule,
            plugin_module_1.PluginModule,
            auth_module_1.AuthModule,
            verification_module_1.VerificationModule,
            chat_module_1.ChatModule,
            crami_module_1.CramiModule,
            userBalance_module_1.UserBalanceModule,
            chatLog_module_1.ChatLogModule,
            upload_module_1.UploadModule,
            redisCache_module_1.RedisCacheModule,
            globalConfig_module_1.GlobalConfigModule,
            statistic_module_1.StatisticModule,
            badWords_module_1.BadWordsModule,
            autoreply_module_1.AutoreplyModule,
            app_module_1.AppModule,
            pay_module_1.PayModule,
            order_module_1.OrderModule,
            official_module_1.OfficialModule,
            task_module_1.TaskModule,
            chatGroup_module_1.ChatGroupModule,
            signin_module_1.SigninModule,
            models_module_1.ModelsModule,
        ],
        providers: [
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: abort_interceptor_1.AbortInterceptor,
            },
            custom_logger_service_1.CustomLoggerService,
        ],
        exports: [custom_logger_service_1.CustomLoggerService],
    })
], AppModule);
exports.AppModule = AppModule;
