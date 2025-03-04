"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const allExceptions_filter_1 = require("./common/filters/allExceptions.filter");
const typeOrmQueryFailed_filter_1 = require("./common/filters/typeOrmQueryFailed.filter");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
const custom_logger_service_1 = require("./common/logger/custom-logger.service");
const initDatabase_1 = require("./modules/database/initDatabase");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const compression = require("compression");
const crypto_1 = require("crypto");
const Dotenv = require("dotenv");
const xmlBodyParser = require("express-xml-bodyparser");
const ioredis_1 = require("ioredis");
const app_module_1 = require("./app.module");
Dotenv.config({ path: '.env' });
async function bootstrap() {
    const redis = new ioredis_1.default({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        db: Number(process.env.REDIS_DB || 0),
    });
    const existingSecret = await redis.get('JWT_SECRET');
    if (!existingSecret) {
        const jwtSecret = (0, crypto_1.randomBytes)(256).toString('base64');
        common_1.Logger.log('Generating and setting new JWT_SECRET');
        await redis.set('JWT_SECRET', jwtSecret);
    }
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    await (0, initDatabase_1.initDatabase)();
    app.useLogger(app.get(custom_logger_service_1.CustomLoggerService));
    app.use(compression());
    app.use(xmlBodyParser());
    app.enableCors({
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        preflightContinue: false,
        optionsSuccessStatus: 204,
    });
    app.setGlobalPrefix('/api');
    app.useGlobalInterceptors(new transform_interceptor_1.TransformInterceptor());
    app.useGlobalFilters(new typeOrmQueryFailed_filter_1.TypeOrmQueryFailedFilter());
    app.useGlobalFilters(new allExceptions_filter_1.AllExceptionsFilter());
    app.useGlobalPipes(new common_1.ValidationPipe());
    app.getHttpAdapter().getInstance().set('views', 'templates/pages');
    app.getHttpAdapter().getInstance().set('view engine', 'hbs');
    const PORT = process.env.PORT || 3000;
    const server = await app.listen(PORT, () => {
        common_1.Logger.log(`服务启动成功: http://localhost:${PORT}`, 'Main');
    });
    server.timeout = 5 * 60 * 1000;
}
bootstrap();
