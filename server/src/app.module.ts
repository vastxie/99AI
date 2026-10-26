import { AbortInterceptor } from '@/common/interceptors/abort.interceptor';
import { CustomLoggerService } from '@/common/logger/custom-logger.service';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AgentModule } from './modules/agent/agent.module';
import { McpModule } from './modules/mcp/mcp.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChannelBindingModule } from './modules/channelBinding/channel-binding.module';
import { ChannelGatewayModule } from './modules/channelGateway/channel-gateway.module';
import { ContentFilterModule } from './modules/contentFilter/content-filter.module';
import { BillingModule } from './modules/billing/billing.module';
import { ChatModule } from './modules/chat/chat.module';
import { ChatGroupModule } from './modules/chatGroup/chatGroup.module';
import { ChatLogModule } from './modules/chatLog/chatLog.module';
import { DatabaseModule } from './modules/database/database.module';
import { GlobalConfigModule } from './modules/globalConfig/globalConfig.module';
import { FileAssetModule } from './modules/fileAsset/fileAsset.module';
import { ModelsModule } from './modules/models/models.module';
import { RedisCacheModule } from './modules/redisCache/redisCache.module';
import { UploadModule } from './modules/upload/upload.module';
import { UserModule } from './modules/user/user.module';
import { UserProfileModule } from './modules/userProfile/user-profile.module';
import { VerticalModule } from './modules/vertical/vertical.module';
import { loadEnabledPackModules } from './modules/packs/pack.loader';
import { frontendCacheControl } from './common/utils/frontend-cache.util';
import { configureDatabaseRoot } from './modules/database/database-entities';

@Global()
@Module({
  imports: [
    DatabaseModule,
    ServeStaticModule.forRoot(
      {
        rootPath: join(__dirname, '..', 'public/admin'),
        serveRoot: process.env.ADMIN_SERVE_ROOT || '/admin',
        serveStaticOptions: {
          // 带内容哈希的构建产物长期缓存，入口页每次协商
          setHeaders: (_res, _path) => {
            _res.set('Cache-Control', frontendCacheControl(_path));
          },
        },
      },
      {
        rootPath: join(__dirname, '..', 'public/file'),
        serveRoot: '/file',
        serveStaticOptions: {
          setHeaders: (_res, _path, _stat) => {
            _res.set('Access-Control-Allow-Origin', '*');
            // 禁止浏览器 MIME 嗅探，避免静态文件被推断成可执行类型
            _res.set('X-Content-Type-Options', 'nosniff');
            // 可在同源内执行脚本的危险类型强制下载，禁止直接当作页面打开执行
            const lowerPath = _path.toLowerCase();
            const dangerousExt = [
              '.html',
              '.htm',
              '.xhtml',
              '.shtml',
              '.xml',
              '.svg',
              '.svgz',
              '.mhtml',
            ];
            if (dangerousExt.some(ext => lowerPath.endsWith(ext))) {
              _res.set('Content-Disposition', 'attachment');
              _res.set('Content-Security-Policy', "default-src 'none'; sandbox");
            }
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
            // 带内容哈希的构建产物长期缓存，入口页每次协商
            _res.set('Cache-Control', frontendCacheControl(_path));
          },
        },
      },
    ),
    // 内核：账号 / 会话 / 模型 / Agent / 文件 / 沙箱
    UserModule,
    UserProfileModule,
    FileAssetModule,
    AuthModule,
    ChatModule,
    ChatGroupModule,
    ChatLogModule,
    UploadModule,
    RedisCacheModule,
    GlobalConfigModule,
    ContentFilterModule,
    ChannelBindingModule,
    ChannelGatewayModule,
    VerticalModule,
    BillingModule,
    ModelsModule,
    AgentModule,
    McpModule,
    // 扩展包：src/packs/*/pack.ts 自动发现，按各自 pack.json 里的开关装配；删掉目录即不再装载
    ...loadEnabledPackModules(),
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

configureDatabaseRoot(AppModule);
