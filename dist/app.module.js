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
const common_1 = require("@nestjs/common");
const nestjs_config_1 = require("nestjs-config");
const path_1 = require("path");
const auth_module_1 = require("./modules/auth/auth.module");
const chat_module_1 = require("./modules/chat/chat.module");
const chatLog_module_1 = require("./modules/chatLog/chatLog.module");
const crami_module_1 = require("./modules/crami/crami.module");
const database_module_1 = require("./modules/database/database.module");
const upload_module_1 = require("./modules/upload/upload.module");
const user_module_1 = require("./modules/user/user.module");
const userBalance_module_1 = require("./modules/userBalance/userBalance.module");
const verification_module_1 = require("./modules/verification/verification.module");
const app_module_1 = require("./modules/app/app.module");
const autoreply_module_1 = require("./modules/autoreply/autoreply.module");
const badwords_module_1 = require("./modules/badwords/badwords.module");
const globalConfig_module_1 = require("./modules/globalConfig/globalConfig.module");
const redisCache_module_1 = require("./modules/redisCache/redisCache.module");
const statistic_module_1 = require("./modules/statistic/statistic.module");
const order_module_1 = require("./modules/order/order.module");
const pay_module_1 = require("./modules/pay/pay.module");
const core_1 = require("@nestjs/core");
const serve_static_1 = require("@nestjs/serve-static");
const fetch = require("isomorphic-fetch");
const path_2 = require("path");
const chatGroup_module_1 = require("./modules/chatGroup/chatGroup.module");
const menu_module_1 = require("./modules/menu/menu.module");
const midjourney_module_1 = require("./modules/midjourney/midjourney.module");
const models_module_1 = require("./modules/models/models.module");
const official_module_1 = require("./modules/official/official.module");
const queue_module_1 = require("./modules/queue/queue.module");
const sales_module_1 = require("./modules/sales/sales.module");
const signin_module_1 = require("./modules/signin/signin.module");
const task_module_1 = require("./modules/task/task.module");
global.fetch = fetch;
let AppModule = class AppModule {
};
AppModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_2.join)(__dirname, '..', 'public'),
            }),
            nestjs_config_1.ConfigModule.load((0, path_1.resolve)(__dirname, 'config', '**/!(*.d).{ts,js}')),
            database_module_1.DatabaseModule,
            user_module_1.UserModule,
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
            badwords_module_1.BadwordsModule,
            autoreply_module_1.AutoreplyModule,
            app_module_1.AppModule,
            pay_module_1.PayModule,
            order_module_1.OrderModule,
            official_module_1.OfficialModule,
            task_module_1.TaskModule,
            queue_module_1.QueueModule,
            midjourney_module_1.MidjourneyModule,
            chatGroup_module_1.ChatGroupModule,
            sales_module_1.SalesModule,
            signin_module_1.SigninModule,
            menu_module_1.MenuModule,
            models_module_1.ModelsModule,
        ],
        providers: [
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: abort_interceptor_1.AbortInterceptor,
            },
        ],
    })
], AppModule);
exports.AppModule = AppModule;
