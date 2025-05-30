import { AbortInterceptor } from '@/common/interceptors/abort.interceptor';
import { CustomLoggerService } from '@/common/logger/custom-logger.service';
// import { LicenseValidatorMiddleware } from '@/common/middleware/license-validator.middleware';
import { RateLimitModule } from '@/modules/rateLimit/rate-limit.module';
import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
// import * as fetch from 'isomorphic-fetch'; // Disable isomorphic-fetch polyfill
import { join } from 'path';
import { AppModule as ApplicationModule } from './modules/app/app.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutoReplyModule } from './modules/autoReply/autoReply.module';
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
import { ShareModule } from './modules/share/share.module';
import { SigninModule } from './modules/signin/signin.module';
import { SpaModule } from './modules/spa/spa.module';
import { StatisticModule } from './modules/statistic/statistic.module';
import { TaskModule } from './modules/task/task.module';
import { UploadModule } from './modules/upload/upload.module';
import { UserModule } from './modules/user/user.module';
import { UserBalanceModule } from './modules/userBalance/userBalance.module';
import { VerificationModule } from './modules/verification/verification.module';
// global.fetch = fetch; // Disable isomorphic-fetch polyfill

@Global()
@Module({
  imports: [
    DatabaseModule,
    RateLimitModule,
    ServeStaticModule.forRoot(
      {
        rootPath: join(__dirname, '..', 'public/admin'),
        serveRoot: process.env.ADMIN_SERVE_ROOT || '/admin',
      },
      {
        rootPath: join(__dirname, '..', 'public/file'),
        serveRoot: '/file',
        serveStaticOptions: {
          setHeaders: (_res, _path, _stat) => {
            _res.set('Access-Control-Allow-Origin', '*');
          },
        },
      },
      {
        rootPath: join(__dirname, '..', 'public/chat'),
        serveRoot: '/',
        serveStaticOptions: {
          index: false,
          fallthrough: true,
          redirect: false,
          extensions: ['html', 'htm'],
          setHeaders: (_res, _path, _stat) => {
            if (_path.endsWith('.js')) {
              _res.set('Content-Type', 'application/javascript');
            } else if (_path.endsWith('.css')) {
              _res.set('Content-Type', 'text/css');
            }
          },
        },
      },
    ),
    UserModule,
    PluginModule,
    AuthModule,
    VerificationModule,
    ChatModule,
    ApplicationModule,
    CramiModule,
    UserBalanceModule,
    ChatLogModule,
    UploadModule,
    RedisCacheModule,
    GlobalConfigModule,
    StatisticModule,
    BadWordsModule,
    AutoReplyModule,
    PayModule,
    OrderModule,
    OfficialModule,
    TaskModule,
    ChatGroupModule,
    SigninModule,
    ModelsModule,
    ShareModule,
    SpaModule,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer;
  }
}
