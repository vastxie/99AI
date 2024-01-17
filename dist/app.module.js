"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const nestjs_config_1 = require("nestjs-config");
const abort_interceptor_1 = require("./common/interceptors/abort.interceptor");
const database_module_1 = require("./modules/database/database.module");
const path_1 = require("path");
const user_module_1 = require("./modules/user/user.module");
const auth_module_1 = require("./modules/auth/auth.module");
const mailer_module_1 = require("./modules/mailer/mailer.module");
const verification_module_1 = require("./modules/verification/verification.module");
const chatgpt_module_1 = require("./modules/chatgpt/chatgpt.module");
const crami_module_1 = require("./modules/crami/crami.module");
const userBalance_module_1 = require("./modules/userBalance/userBalance.module");
const chatLog_module_1 = require("./modules/chatLog/chatLog.module");
const upload_module_1 = require("./modules/upload/upload.module");
const draw_module_1 = require("./modules/draw/draw.module");
const redisCache_module_1 = require("./modules/redisCache/redisCache.module");
const globalConfig_module_1 = require("./modules/globalConfig/globalConfig.module");
const statistic_module_1 = require("./modules/statistic/statistic.module");
const badwords_module_1 = require("./modules/badwords/badwords.module");
const autoreply_module_1 = require("./modules/autoreply/autoreply.module");
const app_module_1 = require("./modules/app/app.module");
const pay_module_1 = require("./modules/pay/pay.module");
const order_module_1 = require("./modules/order/order.module");
const fanyi_module_1 = require("./modules/fanyi/fanyi.module");
const official_module_1 = require("./modules/official/official.module");
const task_module_1 = require("./modules/task/task.module");
const queue_module_1 = require("./modules/queue/queue.module");
const midjourney_module_1 = require("./modules/midjourney/midjourney.module");
const chatGroup_module_1 = require("./modules/chatGroup/chatGroup.module");
const serve_static_1 = require("@nestjs/serve-static");
const fetch = require("isomorphic-fetch");
const path_2 = require("path");
global.fetch = fetch;
const core_1 = require("@nestjs/core");
const sales_module_1 = require("./modules/sales/sales.module");
const signin_module_1 = require("./modules/signin/signin.module");
const menu_module_1 = require("./modules/menu/menu.module");
const models_module_1 = require("./modules/models/models.module");
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
            mailer_module_1.MailerModule,
            verification_module_1.VerificationModule,
            chatgpt_module_1.ChatgptModule,
            crami_module_1.CramiModule,
            userBalance_module_1.UserBalanceModule,
            chatLog_module_1.ChatLogModule,
            upload_module_1.UploadModule,
            draw_module_1.DrawModule,
            redisCache_module_1.RedisCacheModule,
            globalConfig_module_1.GlobalConfigModule,
            statistic_module_1.StatisticModule,
            badwords_module_1.BadwordsModule,
            autoreply_module_1.AutoreplyModule,
            app_module_1.AppModule,
            pay_module_1.PayModule,
            order_module_1.OrderModule,
            fanyi_module_1.FanyiModule,
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
