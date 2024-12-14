import { AllExceptionsFilter } from '@/common/filters/allExceptions.filter';
import { TypeOrmQueryFailedFilter } from '@/common/filters/typeOrmQueryFailed.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
// import { createSwagger } from '@/common/swagger';
import { CustomLoggerService } from '@/common/logger/custom-logger.service';
import { initDatabase } from '@/modules/database/initDatabase';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as compression from 'compression';
import { randomBytes } from 'crypto';
import * as Dotenv from 'dotenv';
import * as xmlBodyParser from 'express-xml-bodyparser';
import Redis from 'ioredis';
import { AppModule } from './app.module';
Dotenv.config({ path: '.env' });

async function bootstrap() {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_DB || 0),
  });

  // 尝试获取现有的 JWT_SECRET
  const existingSecret = await redis.get('JWT_SECRET');

  if (!existingSecret) {
    // 如果不存在，生成新的 JWT_SECRET
    const jwtSecret = randomBytes(256).toString('base64');
    Logger.log('Generating and setting new JWT_SECRET');
    await redis.set('JWT_SECRET', jwtSecret);
  }

  const app = await NestFactory.create(AppModule);
  await initDatabase();

  // 根据环境变量设置全局 Logger
  app.useLogger(app.get(CustomLoggerService));

  app.use(compression());
  app.use(xmlBodyParser());

  // 启用并配置 CORS
  app.enableCors({
    origin: '*', // 或者配置允许的具体域名
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // app.enableCors();
  app.setGlobalPrefix('/api');
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new TypeOrmQueryFailedFilter());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe());
  app.getHttpAdapter().getInstance().set('views', 'templates/pages');
  app.getHttpAdapter().getInstance().set('view engine', 'hbs');

  const PORT = process.env.PORT || 3000;

  // createSwagger(app);
  const server = await app.listen(PORT, () => {
    // Logger.log(`服务启动成功: http://localhost:${PORT}/wagger/docs`, 'Main');
    Logger.log(`服务启动成功: http://localhost:${PORT}`, 'Main');
  });
  server.timeout = 5 * 60 * 1000;
}

bootstrap();
