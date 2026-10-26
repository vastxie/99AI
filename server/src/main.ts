// 必须是第一个导入：先加载 .env，再求值任何模块装饰器（见 load-env.ts）
import './load-env';

// 抑制 punycode 弃用警告
process.removeAllListeners('warning');
process.on('warning', warning => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
    return; // 忽略 punycode 弃用警告
  }
  Logger.warn(`${warning.name}: ${warning.message}`, 'Process');
});

import { TypeOrmQueryFailedFilter } from '@/common/filters/typeOrmQueryFailed.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { CustomLoggerService } from '@/common/logger/custom-logger.service';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { REVALIDATE_CACHE_CONTROL } from './common/utils/frontend-cache.util';
import { randomBytes } from 'crypto';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from 'redis';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { runVerticalImportCli } from './modules/vertical/vertical-import.cli';
import { runRequestedDatabaseCommand } from './modules/database/database.cli';
import { AllExceptionsFilter } from './common/filters/allExceptions.filter';
import {
  createCorsOriginDelegate,
  resolveCorsAllowedOrigins,
} from './common/utils/cors-origin.util';
import { describeRuntimeEnvironmentWarning } from './common/utils/runtime-env.util';
import { ChatTurnPersistenceService } from './modules/chat/chat-turn-persistence.service';
import { ChatService } from './modules/chat/chat.service';
import { FileAssetCleanupScheduler } from './modules/fileAsset/fileAsset-cleanup.scheduler';
import { GlobalConfigService } from './modules/globalConfig/globalConfig.service';
import { initializeModelGatewaySessionSecret } from './modules/modelGateway/model-gateway-session';

function registerSpaFallback(expressApp: express.Express): void {
  const indexPath = path.join(process.cwd(), 'public/chat/index.html');
  const publicPath = path.resolve(process.cwd(), 'public/chat');
  const adminPath = process.env.ADMIN_SERVE_ROOT || '/admin';

  expressApp.get(/.*/, (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/file') ||
      req.path.startsWith(adminPath)
    ) {
      return next();
    }

    const requestedPath = path.resolve(publicPath, `.${req.path}`);
    const isInsidePublicPath =
      requestedPath === publicPath || requestedPath.startsWith(`${publicPath}${path.sep}`);

    if (
      isInsidePublicPath &&
      fs.existsSync(requestedPath) &&
      !fs.statSync(requestedPath).isDirectory()
    ) {
      return next();
    }

    if (path.extname(req.path)) {
      return next();
    }

    if (!fs.existsSync(indexPath)) {
      return res.status(500).send({ code: 500, message: 'SPA入口文件不存在', data: null });
    }

    // 入口页每次协商：发版后立即拿到引用新哈希文件的入口
    res.set('Cache-Control', REVALIDATE_CACHE_CONTROL);
    return res.sendFile(indexPath);
  });
}

async function bootstrap() {
  const databaseExitCode = await runRequestedDatabaseCommand(process.argv[2]);
  if (databaseExitCode !== undefined) {
    process.exitCode = databaseExitCode;
    return;
  }
  // 命令模式：node dist/main vertical:import <manifest.json> [--dry-run]（不监听端口）
  if (process.argv[2] === 'vertical:import') {
    process.exitCode = await runVerticalImportCli(process.argv.slice(3), async () => AppModule);
    return;
  }

  // 引导期一次性 Redis 客户端（与 RedisCacheModule 同用 redis 包）；
  // 连接失败按有限次数重试后抛错退出，不做无限重连，避免启动流程无声挂起。
  const redis = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      reconnectStrategy: retries =>
        retries >= 20 ? new Error('Redis 连接重试次数已用尽') : Math.min(retries * 50, 2000),
    },
    username: process.env.REDIS_USER,
    password: process.env.REDIS_PASSWORD,
    database: Number(process.env.REDIS_DB || 0),
    // node-redis 6 默认 RESP3；显式保持 RESP2，与 Redis 6 以下和部分代理兼容
    RESP: 2,
  });
  redis.on('error', error => {
    Logger.error('引导期 Redis 连接异常', error?.stack, 'Bootstrap');
  });
  await redis.connect();

  // JWT 密钥：优先使用 .env 的 JWT_SECRET（便于多实例共享与轮换）；
  // 未配置时只在 Redis 里不存在时原子地生成一次（SET NX），避免并发启动互相覆盖导致会话失效。
  const configuredJwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (configuredJwtSecret) {
    if (configuredJwtSecret.length < 32) {
      throw new Error('JWT_SECRET 至少 32 个字符');
    }
    await redis.set('JWT_SECRET', configuredJwtSecret);
  } else {
    const created = await redis.set('JWT_SECRET', randomBytes(256).toString('base64'), {
      NX: true,
    });
    if (created === 'OK') {
      Logger.log('已生成新的 JWT_SECRET 并写入 Redis', 'Bootstrap');
    }
  }
  const persistedServiceSecret = await redis.get('JWT_SECRET');
  initializeModelGatewaySessionSecret(persistedServiceSecret);
  await redis.close();

  // 数据库必须已显式初始化；连接工厂先校验当前结构基线，再实例化应用服务。
  // rawBody：需要验签的第三方回调（扩展包的支付通知等）可从 req.rawBody 读取原始报文
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    rawBody: true,
  });

  // 根据环境变量设置全局 Logger
  app.useLogger(app.get(CustomLoggerService));

  // 静默路由日志 - 始终禁用路由相关日志
  const customLogger = app.get(CustomLoggerService);
  const originalLog = customLogger.log.bind(customLogger);

  // 重写 log 方法来过滤不需要的日志；上下文是最后一个字符串参数，其余参数原样交给原方法
  customLogger.log = function (message: any, ...optionalParams: any[]) {
    // 过滤掉路由、模块加载和框架初始化相关的日志
    const context = optionalParams[optionalParams.length - 1];
    if (
      context === 'RoutesResolver' ||
      context === 'RouterExplorer' ||
      context === 'Router' ||
      context === 'InstanceLoader' ||
      context === 'NestFactory' ||
      context === 'RedisCacheModule' ||
      context === 'NestApplication'
    ) {
      return;
    }
    originalLog(message, ...optionalParams);
  };

  // 请求体大小限制（长文本输入）；其它报文格式（如 XML）由需要它的扩展包在自己的路由上挂中间件
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });

  app.use(
    // Re-enable compression
    compression({
      filter: (req, res) => {
        // 对流式响应路由禁用压缩
        if (req.path.includes('/api/chat/chat-process')) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );

  // 启用并配置 CORS：生产环境仅允许配置来源，开发环境额外允许 localhost/127.0.0.1
  const globalConfigService = app.get(GlobalConfigService);
  await globalConfigService.initGetAllConfig();
  const configuredSiteUrl = await globalConfigService.getConfigs(['siteUrl']);
  const corsAllowedOrigins = resolveCorsAllowedOrigins({
    siteUrl: typeof configuredSiteUrl === 'string' ? configuredSiteUrl : null,
  });
  Logger.log(`CORS 已启用白名单模式，配置来源数: ${corsAllowedOrigins.length}`, 'Bootstrap');
  const runtimeWarning = describeRuntimeEnvironmentWarning();
  if (runtimeWarning) {
    Logger.warn(runtimeWarning, 'Bootstrap');
  }
  app.enableCors({
    origin: createCorsOriginDelegate(corsAllowedOrigins),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Fingerprint',
      'Range',
      'X-Website-Domain',
      'X-Requested-With',
    ],
    exposedHeaders: ['Accept-Ranges', 'Content-Disposition', 'Content-Length', 'Content-Range'],
    credentials: false,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // 注册 WebSocket 适配器
  const { IoAdapter } = await import('@nestjs/platform-socket.io');
  app.useWebSocketAdapter(new IoAdapter(app));

  app.setGlobalPrefix('/api');
  registerSpaFallback(app.getHttpAdapter().getInstance());
  // 全局校验：让所有 DTO 上的 class-validator 装饰器真正生效（此前只有少数控制器局部挂了 pipe）。
  // 不开 whitelist：未声明装饰器的字段原样透传，避免误删仍在使用的字段；需要严格白名单的控制器保留各自的局部 pipe。
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  app.useGlobalInterceptors(new TransformInterceptor()); // Re-enable TransformInterceptor
  app.useGlobalFilters(new TypeOrmQueryFailedFilter());
  app.useGlobalFilters(new AllExceptionsFilter()); // Re-enable AllExceptionsFilter

  const PORT = process.env.PORT || 9520;
  const turnPersistence = app.get(ChatTurnPersistenceService);
  const chatService = app.get(ChatService);

  // 在监听端口前按顺序收口孤立 GENERATING 消息和 running Work 任务，
  // 避免 commit 后进程退出留下永久运行态。
  try {
    await turnPersistence.recoverOrphanedTurns();
  } catch (error) {
    Logger.error(`启动时恢复执行状态失败: ${error.message}`, error?.stack, 'Bootstrap');
    throw error;
  }

  const server = await app.listen(PORT, async () => {
    // 组装启动信息横幅，统一通过 Logger 输出，保留多行排版
    const startupLines: string[] = ['============================================='];
    // 显示版本号
    const packagePath = path.join(process.cwd(), 'package.json');
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      startupLines.push(`当前版本:         V${packageJson.version}`);
    } catch (error) {
      startupLines.push('当前版本: V未知');
    }

    startupLines.push(`用户端地址:       http://localhost:${PORT}`);
    startupLines.push(`管理端地址:       http://localhost:${PORT}/admin`);
    startupLines.push('=============================================');
    Logger.log(`\n${startupLines.join('\n')}`, 'Bootstrap');
  });

  // WebSocket transport 就绪后再启动持久 follow-up；方法只认领并异步派发，不阻塞监听。
  await chatService.recoverQueuedConversationTurns();

  // 启动瞬间仍由其他实例持有的 operation 不可抢占；租约到期后由轻量 durable 扫描收敛。
  const durableRecoveryTimer = setInterval(() => {
    void turnPersistence
      .recoverDurableOperations()
      .then(() => chatService.recoverQueuedConversationTurns())
      .catch(error => {
        Logger.error(
          '周期性恢复 Durable Agent operation/inbox 失败',
          error instanceof Error ? error.stack : undefined,
          'Bootstrap',
        );
      });
  }, 30_000);
  durableRecoveryTimer.unref?.();
  server.once('close', () => clearInterval(durableRecoveryTimer));

  // 过期文件自动清理只在服务监听之后启动：vertical:import 等 CLI 也会建应用上下文，不能在那里清理文件
  const fileAssetCleanup = app.get(FileAssetCleanupScheduler);
  fileAssetCleanup.start();
  server.once('close', () => fileAssetCleanup.stop());

  // 请求超时 10 分钟以容纳长时 AI 操作；请求头与 Keep-Alive 空闲超时保持 Node 默认量级，
  // 避免用 10 分钟的 headersTimeout 放大慢速头部（Slowloris）攻击面。
  const SERVER_TIMEOUT = 10 * 60 * 1000; // 10分钟

  server.timeout = SERVER_TIMEOUT; // 服务器超时：单个请求的空闲超时
  server.keepAliveTimeout = 65 * 1000; // Keep-Alive 空闲连接超时（大于常见反代的 60 秒）
  server.headersTimeout = 66 * 1000; // 等待完整请求头的时间（须大于 keepAliveTimeout）

  // 只在测试环境下启用Swagger（移到服务启动之后）
  if (process.env.ISDEV === 'true') {
    const config = new DocumentBuilder()
      .setTitle('99Agent API')
      .setDescription('99Agent 服务 API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    // 添加全局响应定义
    const responseSchema = {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        data: { type: 'object' },
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: '请求成功' },
      },
    };

    // 为每个路由添加标准响应格式
    Object.values(document.paths).forEach(path => {
      Object.values(path).forEach(method => {
        method.responses = {
          ...method.responses,
          '200': {
            description: '成功响应',
            content: {
              'application/json': {
                schema: responseSchema,
              },
            },
          },
        };
      });
    });

    SwaggerModule.setup('api-docs', app, document);
    Logger.debug('Swagger API文档已启用: http://localhost:' + PORT + '/api-docs', 'Main');
  }
}

bootstrap();
