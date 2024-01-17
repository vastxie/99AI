"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Dotenv = require("dotenv");
Dotenv.config({ path: '.env' });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const swagger_1 = require("./common/swagger");
const allExceptions_filter_1 = require("./common/filters/allExceptions.filter");
const typeOrmQueryFailed_filter_1 = require("./common/filters/typeOrmQueryFailed.filter");
const common_1 = require("@nestjs/common");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
const main_1 = require("./config/main");
const initDatabase_1 = require("./modules/database/initDatabase");
const compression = require("compression");
const xmlBodyParser = require("express-xml-bodyparser");
const path_1 = require("path");
async function bootstrap() {
    await (0, initDatabase_1.initDatabase)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.use(compression());
    const www = (0, path_1.resolve)(__dirname, './public');
    app.use(xmlBodyParser());
    app.enableCors();
    app.setGlobalPrefix(main_1.APIPREFIX);
    app.useGlobalInterceptors(new transform_interceptor_1.TransformInterceptor());
    app.useGlobalFilters(new typeOrmQueryFailed_filter_1.TypeOrmQueryFailedFilter());
    app.useGlobalFilters(new allExceptions_filter_1.AllExceptionsFilter());
    app.useGlobalPipes(new common_1.ValidationPipe());
    app.getHttpAdapter().getInstance().set('views', 'templates/pages');
    app.getHttpAdapter().getInstance().set('view engine', 'hbs');
    (0, swagger_1.createSwagger)(app);
    const server = await app.listen(main_1.PORT, () => {
        common_1.Logger.log(`服务启动成功: http://localhost:${main_1.PORT}/nineai/swagger/docs`, 'Main');
    });
    server.timeout = 5 * 60 * 1000;
}
bootstrap();
