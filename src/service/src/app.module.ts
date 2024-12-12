import { AbortInterceptor } from '@/common/interceptors/abort.interceptor';
import { CustomLoggerService } from '@/common/logger/custom-logger.service';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as fetch from 'isomorphic-fetch';
import { join } from 'path';
import { AppModule as ApplicationModule } from './modules/app/app.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutoreplyModule } from './modules/autoreply/autoreply.module';
import { BadWordsModule } from './modules/badWords/badWords.module';
import { ChatModule } from './modules/chat/chat.module';
import { ChatGroupModule } from './modules/chatGroup/chatGroup.module';
import { ChatLogModule } from './modules/chatLog/chatLog.module';
import { CramiModule } from './modules/crami/crami.module';
import { DatabaseModule } from './modules/database/database.module';
import { GlobalConfigModule } from './modules/globalConfig/globalConfig.module';
import { ModelsModule } from './modules/models/models.module';
import { OfficialModule } from './modules/official/official.module';
import { OrderModule } from './modules/order/order.module';
import { PayModule } from './modules/pay/pay.module';
import { PluginModule } from './modules/plugin/plugin.module';
import { RedisCacheModule } from './modules/redisCache/redisCache.module';
import { SigninModule } from './modules/signin/signin.module';
import { StatisticModule } from './modules/statistic/statistic.module';
import { TaskModule } from './modules/task/task.module';
import { UploadModule } from './modules/upload/upload.module';
import { UserModule } from './modules/user/user.module';
import { UserBalanceModule } from './modules/userBalance/userBalance.module';
import { VerificationModule } from './modules/verification/verification.module';
global.fetch = fetch;

@Global()
@Module({
  imports: [
    DatabaseModule,
    ServeStaticModule.forRoot(
      {
        rootPath: join(__dirname, '..', 'public/admin'),
        serveRoot: process.env.ADMIN_SERVE_ROOT || '/admin',
      },
      {
        rootPath: join(__dirname, '..', 'public/file'),
        serveRoot: '/file',
        serveStaticOptions: {
          setHeaders: (res, path, stat) => {
            res.set('Access-Control-Allow-Origin', '*');
          },
        },
      },
      {
        rootPath: join(__dirname, '..', 'public/chat'),
        serveRoot: '/', // 再配置根路径 '/'
      }
    ),
    UserModule,
    PluginModule,
    AuthModule,
    VerificationModule,
    ChatModule,
    CramiModule,
    UserBalanceModule,
    ChatLogModule,
    UploadModule,
    RedisCacheModule,
    GlobalConfigModule,
    StatisticModule,
    BadWordsModule,
    AutoreplyModule,
    ApplicationModule,
    PayModule,
    OrderModule,
    OfficialModule,
    TaskModule,
    ChatGroupModule,
    SigninModule,
    ModelsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AbortInterceptor,
    },
    CustomLoggerService,
  ],
  exports: [CustomLoggerService],
})
export class AppModule {}
